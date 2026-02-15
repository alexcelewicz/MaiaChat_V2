import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import type { Tool, ToolResult, ToolContext } from "./types";
import { uploadFile, getDownloadUrl } from "@/lib/storage/s3";
import { checkQuota, invalidateUsageCache } from "./workspace-quota";

const execAsync = promisify(exec);

// ============================================================================
// API Key → Environment Variable Mapping
// ============================================================================

/** Map MaiaChat provider IDs to standard environment variable names */
const PROVIDER_ENV_MAP: Record<string, string[]> = {
    openai:    ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google:    ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    xai:       ["XAI_API_KEY"],
    openrouter:["OPENROUTER_API_KEY"],
    deepgram:  ["DEEPGRAM_API_KEY"],
};

/** Convert context.apiKeys to env vars for subprocess injection */
function buildApiKeyEnv(apiKeys?: Record<string, string>): Record<string, string> {
    if (!apiKeys) return {};
    const env: Record<string, string> = {};
    for (const [provider, key] of Object.entries(apiKeys)) {
        const envNames = PROVIDER_ENV_MAP[provider];
        if (envNames && key) {
            for (const envName of envNames) {
                env[envName] = key;
            }
        }
    }
    return env;
}

// ============================================================================
// Image Detection & S3 Upload
// ============================================================================

/** Image extensions we recognise */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** Extension → MIME type */
const EXT_TO_MIME: Record<string, string> = {
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".webp": "image/webp",
};

/** Max image file size we'll upload (20 MB) */
const MAX_IMAGE_UPLOAD_SIZE = 20 * 1024 * 1024;

/**
 * Scan stdout for `MEDIA: <filepath>` lines — the convention used by
 * skill scripts to signal that a file should be surfaced in chat.
 * Returns deduplicated absolute paths that exist and are image files.
 */
function detectMediaPaths(stdout: string): string[] {
    const paths: string[] = [];
    const seen = new Set<string>();

    for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/^MEDIA:\s*(.+)$/i);
        if (!match) continue;

        const raw = match[1].trim();
        if (!raw) continue;

        const ext = path.extname(raw).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;

        // Only accept absolute paths (MEDIA: convention uses resolved paths)
        if (!path.isAbsolute(raw)) continue;

        if (seen.has(raw)) continue;
        seen.add(raw);

        try {
            const stat = fs.statSync(raw);
            if (stat.isFile() && stat.size > 0 && stat.size <= MAX_IMAGE_UPLOAD_SIZE) {
                paths.push(raw);
            }
        } catch {
            // File doesn't exist or not accessible — skip
        }
    }

    return paths;
}

interface UploadedImage {
    url: string;
    s3Key: string;
    mediaType: string;
    filename: string;
}

/**
 * Upload detected image files to S3 and return presigned URLs.
 * Non-critical — failures are logged but don't break the tool result.
 */
async function uploadDetectedImages(
    filePaths: string[],
    userId: string | undefined,
): Promise<UploadedImage[]> {
    const results: UploadedImage[] = [];
    const owner = userId || "system";

    for (const filePath of filePaths) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            const mediaType = EXT_TO_MIME[ext] || "image/png";
            const filename = path.basename(filePath);
            const imageId = randomUUID();
            const s3Key = `users/${owner}/generated/${imageId}${ext}`;

            const buffer = fs.readFileSync(filePath);
            await uploadFile(s3Key, buffer, { contentType: mediaType });
            const url = await getDownloadUrl(s3Key, 24 * 60 * 60); // 24h presigned URL

            results.push({ url, s3Key, mediaType, filename });
            console.log(`[shell_exec] Uploaded image to S3: ${filename} → ${s3Key}`);
        } catch (err) {
            console.error(`[shell_exec] Failed to upload image ${filePath}:`, err);
        }
    }

    return results;
}

// ============================================================================
// Security Configuration
// ============================================================================

/** Commands that are blocked outright for safety */
const BLOCKED_COMMANDS = [
    // Destructive system commands
    "mkfs", "fdisk", "dd", "format",
    // Network attack tools
    "nmap", "hydra", "sqlmap",
    // Privilege escalation
    "passwd", "chpasswd", "visudo",
    // Service management (prevent stopping critical services)
    "systemctl stop", "systemctl disable",
    "service stop",
    // Registry manipulation (Windows)
    "reg delete", "reg add",
];

/** Patterns that should be blocked */
const BLOCKED_PATTERNS = [
    /rm\s+(-rf?|--recursive)\s+\//i,   // rm -rf / (root deletion)
    /:(){ :\|:& };:/,                     // Fork bomb
    />\s*\/dev\/sd/i,                     // Writing to disk devices
    /mkfs/i,                              // Formatting drives
    /chmod\s+777\s+\//i,                  // Chmod 777 on root
    /curl\s+.*\|\s*(ba)?sh/i,            // Piping curl to shell
    /wget\s+.*\|\s*(ba)?sh/i,            // Piping wget to shell
];

/** Maximum output size (1 MB) */
const MAX_OUTPUT_SIZE = 1024 * 1024;

/** Default timeout (30 seconds) */
const DEFAULT_TIMEOUT = 30_000;

/** Maximum timeout (5 minutes) */
const MAX_TIMEOUT = 300_000;

function isCommandBlocked(command: string): string | null {
    const normalized = command.trim().toLowerCase();

    // Check blocked commands
    for (const blocked of BLOCKED_COMMANDS) {
        if (normalized.includes(blocked.toLowerCase())) {
            return `Command blocked: contains '${blocked}' which is not allowed for security reasons`;
        }
    }

    // Check blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
            return `Command blocked: matches a blocked pattern for security reasons`;
        }
    }

    return null;
}

// ============================================================================
// Hosted Sandbox Security
// ============================================================================

/** Commands that are additionally blocked in hosted sandbox mode */
const SANDBOX_BLOCKED_COMMANDS = [
    "chroot", "mount", "umount", "nsenter", "unshare",
    "docker", "podman", "kubectl",
    "ln -s", "symlink",  // prevent symlink creation to escape sandbox
];

/** Patterns that reference paths outside the workspace in hosted sandbox */
function validateSandboxCommand(command: string, workspaceDir: string): string | null {
    const normalized = command.trim().toLowerCase();

    // Block sandbox escape commands
    for (const blocked of SANDBOX_BLOCKED_COMMANDS) {
        if (normalized.includes(blocked.toLowerCase())) {
            return `Command blocked in hosted mode: '${blocked}' is not allowed`;
        }
    }

    // Block absolute paths outside the workspace
    // Match patterns like /etc/, /app/src/, /var/, /home/, etc.
    const absolutePathRegex = /(?:^|\s|=|"|')(\/(etc|var|tmp|root|home|proc|sys|dev|boot|opt|usr|srv|app\/src|app\/node_modules|app\/\.next|app\/\.env)[\/\s"'|;])/i;
    if (absolutePathRegex.test(command)) {
        return `Command blocked in hosted mode: references paths outside your workspace. Use relative paths within your workspace.`;
    }

    // Block cd to absolute paths outside workspace
    const cdRegex = /\bcd\s+(\/[^\s;|&]+)/i;
    const cdMatch = command.match(cdRegex);
    if (cdMatch) {
        const targetPath = cdMatch[1];
        if (!targetPath.startsWith(workspaceDir)) {
            return `Command blocked in hosted mode: 'cd ${targetPath}' is outside your workspace`;
        }
    }

    return null;
}

/** Build a sanitized environment for sandbox mode — strip sensitive vars */
function buildSandboxEnv(workspaceDir: string, apiKeys?: Record<string, string>): Record<string, string | undefined> {
    const env: Record<string, string> = {
        PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
        HOME: workspaceDir,
        TERM: process.env.TERM || "xterm",
        LANG: process.env.LANG || "en_US.UTF-8",
        DEBIAN_FRONTEND: "noninteractive",
    };

    // Inject user API keys only
    if (apiKeys) {
        const PROVIDER_ENV_MAP_LOCAL: Record<string, string[]> = {
            openai: ["OPENAI_API_KEY"],
            anthropic: ["ANTHROPIC_API_KEY"],
            google: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
            xai: ["XAI_API_KEY"],
            openrouter: ["OPENROUTER_API_KEY"],
            deepgram: ["DEEPGRAM_API_KEY"],
        };
        for (const [provider, key] of Object.entries(apiKeys)) {
            const envNames = PROVIDER_ENV_MAP_LOCAL[provider];
            if (envNames && key) {
                for (const envName of envNames) {
                    env[envName] = key;
                }
            }
        }
    }

    return env;
}

// ============================================================================
// Shell Execution Tool
// ============================================================================

const shellExecSchema = z.object({
    command: z.string().min(1).max(2000).describe("Shell command to execute"),
    cwd: z.string().optional().describe("Working directory for the command (defaults to home directory)"),
    timeout: z.number().min(1000).max(MAX_TIMEOUT).default(DEFAULT_TIMEOUT).describe("Timeout in milliseconds"),
    shell: z.enum(["auto", "bash", "sh", "powershell", "cmd"]).default("auto").describe("Shell to use for execution"),
});

async function shellExecExecute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        // Check permission
        if (!context?.commandExecutionEnabled) {
            return {
                success: false,
                error: "Command execution is disabled. An administrator must enable 'Command Execution' in the admin panel to run shell commands.",
                metadata: { executionTime: Date.now() - startTime },
            };
        }

        const params = shellExecSchema.parse(rawParams);
        const isSandbox = context?.hostedSandbox === true;

        // Security check
        const blocked = isCommandBlocked(params.command);
        if (blocked) {
            return { success: false, error: blocked, metadata: { executionTime: Date.now() - startTime } };
        }

        // Additional sandbox security checks for hosted mode
        if (isSandbox && context?.fileAccessBaseDir) {
            const sandboxBlocked = validateSandboxCommand(params.command, context.fileAccessBaseDir);
            if (sandboxBlocked) {
                return { success: false, error: sandboxBlocked, metadata: { executionTime: Date.now() - startTime } };
            }

            // Quota pre-check before execution
            if (context.userId) {
                const workspaceRoot = path.dirname(context.fileAccessBaseDir);
                const quotaError = await checkQuota(
                    workspaceRoot,
                    context.userId,
                    context.workspaceQuotaMb ?? 100
                );
                if (quotaError) {
                    return { success: false, error: quotaError, metadata: { executionTime: Date.now() - startTime } };
                }
            }
        }

        // Determine shell
        let shell: string | boolean;
        const platform = os.platform();
        const isWindows = platform === "win32";

        switch (params.shell) {
            case "bash":
                shell = isWindows ? "bash.exe" : "/bin/bash";
                break;
            case "sh":
                shell = isWindows ? "sh.exe" : "/bin/sh";
                break;
            case "powershell":
                // Block PowerShell in sandbox mode (Linux containers don't have it)
                if (isSandbox) {
                    return { success: false, error: "PowerShell is not available in hosted mode", metadata: { executionTime: Date.now() - startTime } };
                }
                shell = isWindows ? "powershell.exe" : "pwsh";
                break;
            case "cmd":
                if (isSandbox) {
                    return { success: false, error: "cmd is not available in hosted mode", metadata: { executionTime: Date.now() - startTime } };
                }
                shell = "cmd.exe";
                break;
            case "auto":
            default:
                shell = isSandbox ? "/bin/sh" : true;
                break;
        }

        // Determine working directory — in sandbox mode, force to user's workspace
        const cwd = isSandbox
            ? context!.fileAccessBaseDir!  // Always force to workspace in sandbox
            : (params.cwd || context?.fileAccessBaseDir || os.homedir());

        // Build environment — in sandbox mode, strip sensitive vars
        const execEnv = isSandbox
            ? buildSandboxEnv(context!.fileAccessBaseDir!, context?.apiKeys)
            : {
                ...process.env,
                ...buildApiKeyEnv(context?.apiKeys),
                DEBIAN_FRONTEND: "noninteractive",
            };

        // Execute
        const { stdout, stderr } = await execAsync(params.command, {
            cwd,
            timeout: params.timeout,
            maxBuffer: MAX_OUTPUT_SIZE,
            shell: shell as string,
            env: execEnv as NodeJS.ProcessEnv,
        });

        const truncatedStdout = stdout.length > MAX_OUTPUT_SIZE
            ? stdout.substring(0, MAX_OUTPUT_SIZE) + "\n... (output truncated)"
            : stdout;

        const truncatedStderr = stderr.length > MAX_OUTPUT_SIZE
            ? stderr.substring(0, MAX_OUTPUT_SIZE) + "\n... (output truncated)"
            : stderr;

        // Detect and upload any image files referenced via MEDIA: convention
        let generatedImages: UploadedImage[] | undefined;
        const mediaPaths = detectMediaPaths(stdout);
        if (mediaPaths.length > 0) {
            generatedImages = await uploadDetectedImages(mediaPaths, context?.userId);
        }

        // Invalidate quota cache after execution (command may have written files)
        if (isSandbox && context?.userId) {
            invalidateUsageCache(context.userId);
        }

        return {
            success: true,
            data: {
                command: params.command,
                cwd,
                stdout: truncatedStdout,
                stderr: truncatedStderr,
                exitCode: 0,
                platform,
                ...(generatedImages?.length && {
                    generatedImages,
                    imageMarkdown: generatedImages
                        .map(img => `![${img.filename}](${img.url})`)
                        .join("\n"),
                }),
            },
            metadata: {
                executionTime: Date.now() - startTime,
                source: "shell",
            },
        };
    } catch (error) {
        // Handle exec errors (non-zero exit codes, timeouts, etc.)
        const execError = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean; signal?: string };

        if (execError.killed) {
            return {
                success: false,
                error: `Command timed out after ${(Date.now() - startTime) / 1000}s and was killed`,
                data: {
                    stdout: execError.stdout?.substring(0, MAX_OUTPUT_SIZE) || "",
                    stderr: execError.stderr?.substring(0, MAX_OUTPUT_SIZE) || "",
                    exitCode: execError.code,
                    signal: execError.signal,
                },
                metadata: { executionTime: Date.now() - startTime, source: "shell" },
            };
        }

        // Non-zero exit code is still a result, not necessarily an error
        if (execError.stdout !== undefined || execError.stderr !== undefined) {
            return {
                success: false,
                error: `Command exited with code ${execError.code || "unknown"}`,
                data: {
                    command: rawParams.command,
                    stdout: execError.stdout?.substring(0, MAX_OUTPUT_SIZE) || "",
                    stderr: execError.stderr?.substring(0, MAX_OUTPUT_SIZE) || "",
                    exitCode: execError.code,
                },
                metadata: { executionTime: Date.now() - startTime, source: "shell" },
            };
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : "Command execution failed",
            metadata: { executionTime: Date.now() - startTime },
        };
    }
}

export const shellExecTool: Tool = {
    id: "shell_exec",
    name: "Shell Execute",
    description: "Execute a shell command on the local system. Returns stdout, stderr, and exit code. Supports bash, sh, PowerShell, and cmd. If the command outputs MEDIA: lines with image file paths, those images are auto-uploaded to S3 and returned as generatedImages with presigned URLs. Include the imageMarkdown value in your response to display them inline.",
    category: "system",
    icon: "Terminal",
    schema: shellExecSchema,
    execute: shellExecExecute,
    requiresLocalAccess: true,
};
