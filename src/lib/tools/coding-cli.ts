/**
 * Coding CLI Tool
 *
 * Execute coding tasks using Claude Code or Gemini CLI.
 * Provides a structured way for the AI agent to invoke coding assistants.
 */

import { spawn, execSync, ChildProcess } from 'child_process';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { getConfig } from '@/lib/config';
import { Tool } from './types';
import { runInteractiveCLI } from './cli-bridge';

// ============================================================================
// Types
// ============================================================================

export const CodingCliInputSchema = z.object({
  cli: z.enum(['claude', 'gemini']).default('claude').describe('Which CLI to use'),
  task: z.string().min(1).describe('The coding task to execute'),
  workingDirectory: z.string().optional().describe('Directory to work in (relative to workspace)'),
  timeout: z
    .number()
    .default(180000)
    .describe('Inactivity timeout in ms — kill if no output for this long (default 3 min)'),
  maxTimeout: z
    .number()
    .default(1800000)
    .describe('Hard max timeout in ms — safety cap regardless of activity (default 30 min)'),
  skipPermissions: z.boolean().default(true).describe('Skip permission prompts in CLI'),
  context: z.string().optional().describe('Additional context for the task'),
});

export type CodingCliInput = z.infer<typeof CodingCliInputSchema>;

export interface CodingCliResult {
  success: boolean;
  output: string;
  error?: string;
  workingDirectory: string;
  filesCreated?: string[];
  filesModified?: string[];
  exitCode: number | null;
  duration: number;
}

// ============================================================================
// CLI Detection
// ============================================================================

/**
 * Resolve the npm global prefix directory.
 * Checks NPM_CONFIG_PREFIX env var first, falls back to `npm config get prefix`.
 */
function getNpmGlobalPrefix(): string | null {
  if (process.env.NPM_CONFIG_PREFIX) return process.env.NPM_CONFIG_PREFIX;
  try {
    return execSync('npm config get prefix', { timeout: 5000, encoding: 'utf-8' }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Build an enhanced PATH that includes well-known CLI installation directories.
 * The Next.js server process often has a smaller PATH than the user's terminal,
 * so we augment it with directories where Claude Code and Gemini CLI are commonly installed.
 */
function getEnhancedPATH(): string {
  const existing = process.env.PATH || '';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const extra: string[] = [];

  if (!home) return existing;

  const npmPrefix = getNpmGlobalPrefix();

  if (process.platform === 'win32') {
    extra.push(
      path.join(home, '.local', 'bin'), // Claude Code installer
      path.join(home, 'AppData', 'Roaming', 'npm') // npm global default
    );
    // On Windows, npm prefix IS the bin dir (no /bin subdirectory)
    if (npmPrefix) extra.push(npmPrefix);
  } else {
    extra.push(
      path.join(home, '.local', 'bin'), // Claude Code installer
      path.join(home, '.npm-global', 'bin'), // npm global (custom prefix)
      '/usr/local/bin', // npm global (default)
      '/opt/homebrew/bin' // Homebrew on Apple Silicon
    );
    if (npmPrefix) extra.push(path.join(npmPrefix, 'bin'));
  }

  const sep = process.platform === 'win32' ? ';' : ':';
  const valid = extra.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  return [...valid, existing].join(sep);
}

/** Cached enhanced PATH (directories don't change at runtime) */
let _enhancedPATH: string | null = null;
export function enhancedPATH(): string {
  if (_enhancedPATH === null) _enhancedPATH = getEnhancedPATH();
  return _enhancedPATH;
}

/**
 * Check if a CLI is available on the system
 */
export async function isCLIAvailable(cli: 'claude' | 'gemini'): Promise<boolean> {
  const command = cli === 'claude' ? 'claude' : 'gemini';

  return new Promise((resolve) => {
    const proc = spawn(command, ['--version'], {
      shell: true,
      stdio: 'pipe',
      env: { ...process.env, PATH: enhancedPATH() },
    });

    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));

    // Timeout after 15 seconds (Gemini CLI cold start can take 5-10s)
    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 15000);
  });
}

/**
 * Get list of available CLIs
 */
export async function getAvailableCLIs(): Promise<Array<'claude' | 'gemini'>> {
  const [claudeAvailable, geminiAvailable] = await Promise.all([
    isCLIAvailable('claude'),
    isCLIAvailable('gemini'),
  ]);

  const available: Array<'claude' | 'gemini'> = [];
  if (claudeAvailable) available.push('claude');
  if (geminiAvailable) available.push('gemini');

  return available;
}

// ============================================================================
// Workspace Management
// ============================================================================

/**
 * Get or create workspace directory for a task
 */
export async function getWorkspaceDirectory(taskName?: string): Promise<string> {
  const config = await getConfig();
  let workspaceRoot = config.cli.workspaceRoot;

  // Handle relative paths
  if (!path.isAbsolute(workspaceRoot)) {
    workspaceRoot = path.join(process.cwd(), workspaceRoot);
  }

  // Ensure workspace root exists
  if (!fs.existsSync(workspaceRoot)) {
    fs.mkdirSync(workspaceRoot, { recursive: true });
  }

  // Organize by task if enabled
  if (config.cli.organizeByTask && taskName) {
    const date = new Date().toISOString().split('T')[0];
    const sanitizedName = taskName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 50);
    const taskDir = path.join(workspaceRoot, `${date}-${sanitizedName}`);

    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    return taskDir;
  }

  return workspaceRoot;
}

// ============================================================================
// CLI Execution
// ============================================================================

/**
 * Build CLI command arguments
 *
 * Note: For Claude Code, we don't include the task in args - it's passed via stdin
 * to avoid Windows shell escaping issues that truncate long prompts.
 */
function buildCLIArgs(
  cli: 'claude' | 'gemini',
  task: string,
  options: {
    skipPermissions?: boolean;
    context?: string;
  }
): string[] {
  const args: string[] = [];

  if (cli === 'claude') {
    // Claude Code CLI arguments
    // See: claude --help
    args.push('-p'); // Print mode (non-interactive)
    args.push('--verbose'); // Required for stream-json
    args.push('--output-format', 'stream-json'); // Stream JSON events for activity tracking
    if (options.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }
    if (options.context) {
      args.push('--system-prompt', options.context);
    }
    // NOTE: Task is NOT passed as argument for Claude Code
    // It will be passed via stdin to avoid Windows shell escaping issues
  } else {
    // Gemini CLI arguments
    // See: gemini --help
    if (options.skipPermissions) {
      args.push('-y'); // YOLO mode - auto-approve all actions
    }
    // Task is passed as positional argument (Gemini handles this fine)
    args.push(task);
  }

  return args;
}

/**
 * Extract the final result text from Claude Code stream-json output.
 * stream-json emits one JSON object per line. The result is in the
 * {"type":"result","result":"..."} event.
 */
function extractStreamJsonResult(raw: string): string {
  const lines = raw.split('\n').filter(Boolean);
  // Walk backwards — the result event is near the end
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]);
      if (event.type === 'result' && typeof event.result === 'string') {
        return event.result;
      }
    } catch {
      // Not valid JSON — skip
    }
  }
  // Fallback: no result event found, return raw stdout
  return raw;
}

/**
 * Execute a coding task using the specified CLI
 */
export async function executeCodingCLI(input: CodingCliInput): Promise<CodingCliResult> {
  const startTime = Date.now();
  const config = await getConfig();

  if (!config.cli.enabled) {
    const workspaceRoot = path.isAbsolute(config.cli.workspaceRoot)
      ? config.cli.workspaceRoot
      : path.join(process.cwd(), config.cli.workspaceRoot);

    return {
      success: false,
      output: '',
      error: 'Coding CLI is disabled in configuration',
      workingDirectory: workspaceRoot,
      exitCode: null,
      duration: Date.now() - startTime,
    };
  }

  // Get working directory
  // Handle absolute paths directly, otherwise join with workspace
  let workDir: string;
  if (input.workingDirectory) {
    if (path.isAbsolute(input.workingDirectory)) {
      workDir = input.workingDirectory;
    } else {
      workDir = path.join(await getWorkspaceDirectory(), input.workingDirectory);
    }
  } else {
    workDir = await getWorkspaceDirectory(input.task);
  }

  // Ensure working directory exists
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }

  // Check if CLI is available
  const isAvailable = await isCLIAvailable(input.cli);
  if (!isAvailable) {
    return {
      success: false,
      output: '',
      error: `${input.cli} CLI is not installed or not available in PATH`,
      workingDirectory: workDir,
      exitCode: null,
      duration: Date.now() - startTime,
    };
  }

  const skipPermissions = input.skipPermissions ?? config.cli.skipPermissions;
  const useInteractive = skipPermissions === false;

  if (useInteractive) {
    const result = await runInteractiveCLI(input.cli, input.task, {
      workingDirectory: workDir,
      timeout: input.timeout,
    });

    return {
      success: result.success,
      output: result.output,
      error: result.error,
      workingDirectory: result.workingDirectory,
      exitCode: null,
      duration: Date.now() - startTime,
    };
  }

  // Build command
  const command = input.cli === 'claude' ? 'claude' : 'gemini';
  const args = buildCLIArgs(input.cli, input.task, {
    skipPermissions,
    context: input.context,
  });

  // Track files before execution
  const filesBefore = new Set(
    fs.existsSync(workDir) ? fs.readdirSync(workDir, { recursive: true }).map(String) : []
  );

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const proc: ChildProcess = spawn(command, args, {
      cwd: workDir,
      shell: true,
      stdio: 'pipe',
      env: {
        ...process.env,
        PATH: enhancedPATH(),
        // Disable color for cleaner output parsing
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });

    // For Claude Code, pass the task via stdin to avoid Windows shell escaping issues
    // This ensures long prompts are not truncated
    if (input.cli === 'claude' && proc.stdin) {
      proc.stdin.write(input.task);
      proc.stdin.end();
    }

    // Activity-based timeout tracking
    const inactivityLimit = input.timeout; // default 3 min of silence
    const hardMaxLimit = input.maxTimeout; // default 30 min absolute cap
    let lastActivityTime = Date.now();
    let timeoutReason = '';

    const markActivity = () => {
      lastActivityTime = Date.now();
    };

    // Collect output and track activity
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
      markActivity();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
      markActivity();
    });

    // Inactivity check — runs every 15s, kills if no output for `inactivityLimit`
    const inactivityCheck = setInterval(() => {
      const silentFor = Date.now() - lastActivityTime;
      if (silentFor >= inactivityLimit) {
        timedOut = true;
        timeoutReason = `No output for ${Math.round(silentFor / 1000)}s (inactivity limit: ${Math.round(inactivityLimit / 1000)}s)`;
        proc.kill('SIGTERM');
        setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            /* already dead */
          }
        }, 5000);
      }
    }, 15000);

    // Hard max timeout — absolute safety cap
    const hardMaxTimer = setTimeout(() => {
      if (!timedOut) {
        timedOut = true;
        timeoutReason = `Hard max timeout reached (${Math.round(hardMaxLimit / 1000)}s)`;
        proc.kill('SIGTERM');
        setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            /* already dead */
          }
        }, 5000);
      }
    }, hardMaxLimit);

    const cleanup = () => {
      clearInterval(inactivityCheck);
      clearTimeout(hardMaxTimer);
    };

    // Handle completion
    proc.on('close', (code) => {
      cleanup();
      const duration = Date.now() - startTime;

      // Detect created/modified files
      const filesAfter = new Set(
        fs.existsSync(workDir) ? fs.readdirSync(workDir, { recursive: true }).map(String) : []
      );

      const filesCreated = Array.from(filesAfter).filter((f) => !filesBefore.has(f));
      const filesModified: string[] = []; // Would need more sophisticated tracking

      // For Claude stream-json output, extract the clean result text
      let output = stdout;
      if (input.cli === 'claude') {
        output = extractStreamJsonResult(stdout);
      }

      // If we attempted a timeout kill but the process exited with code 0,
      // it means the kill failed (common on Windows with shell: true) and the
      // process completed naturally. Treat this as success.
      const killFailed = timedOut && code === 0;

      if (timedOut && !killFailed) {
        resolve({
          success: false,
          output,
          error: `CLI timed out: ${timeoutReason}. Total runtime: ${Math.round(duration / 1000)}s`,
          workingDirectory: workDir,
          filesCreated,
          filesModified,
          exitCode: null,
          duration,
        });
        return;
      }

      resolve({
        success: code === 0,
        output,
        error: killFailed
          ? `Completed successfully (kill signal was ignored). ${timeoutReason}`
          : stderr || undefined,
        workingDirectory: workDir,
        filesCreated,
        filesModified,
        exitCode: code,
        duration,
      });
    });

    // Handle errors
    proc.on('error', (error) => {
      cleanup();
      resolve({
        success: false,
        output: stdout,
        error: error.message,
        workingDirectory: workDir,
        exitCode: null,
        duration: Date.now() - startTime,
      });
    });
  });
}

// ============================================================================
// Tool Definition
// ============================================================================

export const codingCliTool: Tool = {
  id: 'coding_cli',
  name: 'Coding CLI',
  description: `Execute coding tasks using Claude Code or Gemini CLI.
This tool allows you to:
- Create new projects and files
- Write and refactor code
- Debug and fix issues
- Generate documentation

Use this when you need to write substantial code or work on coding projects.

VERIFICATION: After the CLI completes, always review its output for errors or incomplete work. If the output indicates failures, call this tool again with a follow-up prompt to fix the issues. Iterate until the task is fully complete.`,
  category: 'system',
  icon: 'Terminal',
  requiresLocalAccess: true,
  schema: CodingCliInputSchema,

  async execute(params: Record<string, unknown>, context?: import('./types').ToolContext) {
    const input = params as CodingCliInput;

    // In hosted sandbox mode, force working directory to user's workspace
    if (context?.hostedSandbox && context.fileAccessBaseDir) {
      input.workingDirectory = context.fileAccessBaseDir;

      // Defense-in-depth: verify the resolved path is within /app/workspaces/
      if (process.env.MAIACHAT_HOSTED === 'true') {
        const resolved = path.resolve(input.workingDirectory);
        if (!resolved.startsWith('/app/workspaces/')) {
          return {
            success: false,
            error: 'Access denied: CLI workspace must be within /app/workspaces/ in hosted mode',
          };
        }
      }
    }

    const result = await executeCodingCLI(input);

    if (result.success) {
      let output = result.output;

      if (result.filesCreated && result.filesCreated.length > 0) {
        output += `\n\nFiles created:\n${result.filesCreated.map((f) => `- ${f}`).join('\n')}`;
      }

      output += `\n\nWorking directory: ${result.workingDirectory}`;

      return {
        success: true,
        output,
        data: result,
      };
    }

    return {
      success: false,
      error: result.error || 'CLI execution failed',
      output: result.output,
      data: result,
    };
  },
};

// ============================================================================
// Helper: Check CLI Status
// ============================================================================

export async function getCLIStatus(): Promise<{
  available: Array<'claude' | 'gemini'>;
  default: 'claude' | 'gemini' | null;
  workspaceRoot: string;
}> {
  const config = await getConfig();
  const available = await getAvailableCLIs();

  return {
    available,
    default:
      available.length > 0
        ? available.includes(config.cli.defaultCli as 'claude' | 'gemini')
          ? (config.cli.defaultCli as 'claude' | 'gemini')
          : available[0]
        : null,
    workspaceRoot: config.cli.workspaceRoot,
  };
}
