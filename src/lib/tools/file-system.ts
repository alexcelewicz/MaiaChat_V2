import { z } from "zod";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import type { Tool, ToolResult, ToolContext } from "./types";
import { checkQuota, invalidateUsageCache } from "./workspace-quota";

// ============================================================================
// Security Utilities
// ============================================================================

/** Dangerous file patterns that should never be read/written */
const BLOCKED_FILE_PATTERNS = [
    /\.env$/i,
    /\.env\..+$/i,
    /credentials\.json$/i,
    /\.pem$/i,
    /\.key$/i,
    /id_rsa/i,
    /id_ed25519/i,
    /\.ssh\/config$/i,
    /shadow$/,
    /passwd$/,
];

/** Maximum file size for read operations (10 MB) */
const MAX_READ_SIZE = 10 * 1024 * 1024;

/** Maximum file size for write operations (50 MB) */
const MAX_WRITE_SIZE = 50 * 1024 * 1024;

function isBlockedFile(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    return BLOCKED_FILE_PATTERNS.some(pattern => pattern.test(normalized));
}

function resolveAndValidatePath(inputPath: string, baseDir?: string): string {
    const resolved = path.resolve(inputPath);

    // If a base directory is set, ensure the path is within it
    if (baseDir) {
        const resolvedBase = path.resolve(baseDir);

        // First check the logical path
        if (!resolved.startsWith(resolvedBase)) {
            throw new Error(`Access denied: path '${inputPath}' is outside the allowed directory`);
        }

        // Symlink hardening: resolve the real path to prevent symlink escapes.
        // Only check if the path already exists (new files haven't been created yet).
        try {
            const realPath = fsSync.realpathSync(resolved);
            if (!realPath.startsWith(resolvedBase)) {
                throw new Error(`Access denied: path resolves outside the allowed directory (symlink escape blocked)`);
            }
            return realPath;
        } catch (err) {
            // ENOENT = file doesn't exist yet, which is fine for write/create operations
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                return resolved;
            }
            // Re-throw our own access denied errors
            if (err instanceof Error && err.message.includes("Access denied")) {
                throw err;
            }
            // Other errors (e.g. permission) — fall through to return resolved
            return resolved;
        }
    }

    return resolved;
}

function checkLocalAccess(context?: ToolContext): void {
    if (!context?.localFileAccessEnabled) {
        throw new Error(
            "File system access is disabled. An administrator must enable 'Local File Access' in the admin panel to use file operations."
        );
    }
}

// ============================================================================
// File Read Tool
// ============================================================================

const fileReadSchema = z.object({
    path: z.string().min(1).describe("Absolute or relative file path to read"),
    encoding: z.enum(["utf-8", "ascii", "base64", "hex", "latin1"]).default("utf-8").describe("File encoding"),
    maxLines: z.number().min(1).max(10000).optional().describe("Maximum number of lines to return"),
});

async function fileReadExecute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        checkLocalAccess(context);
        const params = fileReadSchema.parse(rawParams);
        const resolvedPath = resolveAndValidatePath(params.path, context?.fileAccessBaseDir);

        if (isBlockedFile(resolvedPath)) {
            return { success: false, error: "Access denied: this file type is blocked for security reasons" };
        }

        // Check file size
        const stats = await fs.stat(resolvedPath);
        if (stats.size > MAX_READ_SIZE) {
            return { success: false, error: `File too large: ${(stats.size / 1024 / 1024).toFixed(1)} MB exceeds ${MAX_READ_SIZE / 1024 / 1024} MB limit` };
        }

        let content = await fs.readFile(resolvedPath, { encoding: params.encoding as BufferEncoding });

        // Trim to maxLines if specified
        if (params.maxLines) {
            const lines = content.split("\n");
            if (lines.length > params.maxLines) {
                content = lines.slice(0, params.maxLines).join("\n");
                content += `\n... (truncated, showing ${params.maxLines} of ${lines.length} lines)`;
            }
        }

        return {
            success: true,
            data: {
                path: resolvedPath,
                content,
                size: stats.size,
                lastModified: stats.mtime.toISOString(),
            },
            metadata: { executionTime: Date.now() - startTime, source: "filesystem" },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to read file",
            metadata: { executionTime: Date.now() - startTime },
        };
    }
}

export const fileReadTool: Tool = {
    id: "file_read",
    name: "File Read",
    description: "Read the contents of a file from the local file system. Supports text files with configurable encoding.",
    category: "filesystem",
    icon: "FileText",
    schema: fileReadSchema,
    execute: fileReadExecute,
    requiresLocalAccess: true,
};

// ============================================================================
// File Write Tool
// ============================================================================

const fileWriteSchema = z.object({
    path: z.string().min(1).describe("Absolute or relative file path to write"),
    content: z.string().describe("Content to write to the file"),
    mode: z.enum(["overwrite", "append", "create"]).default("overwrite").describe("Write mode: overwrite, append, or create (fails if exists)"),
    encoding: z.enum(["utf-8", "ascii", "base64", "hex", "latin1"]).default("utf-8").describe("File encoding"),
    createDirectories: z.boolean().default(true).describe("Create parent directories if they don't exist"),
});

async function fileWriteExecute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        checkLocalAccess(context);
        const params = fileWriteSchema.parse(rawParams);
        const resolvedPath = resolveAndValidatePath(params.path, context?.fileAccessBaseDir);

        if (isBlockedFile(resolvedPath)) {
            return { success: false, error: "Access denied: this file type is blocked for security reasons" };
        }

        const contentBuffer = Buffer.from(params.content, params.encoding as BufferEncoding);
        if (contentBuffer.length > MAX_WRITE_SIZE) {
            return { success: false, error: `Content too large: ${(contentBuffer.length / 1024 / 1024).toFixed(1)} MB exceeds ${MAX_WRITE_SIZE / 1024 / 1024} MB limit` };
        }

        // Quota check for hosted sandbox mode
        if (context?.hostedSandbox && context.fileAccessBaseDir && context.userId) {
            const workspaceRoot = path.dirname(context.fileAccessBaseDir); // /app/workspaces
            const quotaError = await checkQuota(
                workspaceRoot,
                context.userId,
                context.workspaceQuotaMb ?? 100,
                contentBuffer.length
            );
            if (quotaError) {
                return { success: false, error: quotaError, metadata: { executionTime: Date.now() - startTime } };
            }
        }

        // Create parent directories if needed (skip if parent already exists, e.g. drive roots like E:\)
        if (params.createDirectories) {
            const parentDir = path.dirname(resolvedPath);
            try {
                await fs.access(parentDir);
            } catch {
                await fs.mkdir(parentDir, { recursive: true });
            }
        }

        if (params.mode === "create") {
            // Fail if file exists
            try {
                await fs.access(resolvedPath);
                return { success: false, error: `File already exists: ${resolvedPath}` };
            } catch {
                // File doesn't exist, proceed
            }
        }

        const flag = params.mode === "append" ? "a" : "w";
        await fs.writeFile(resolvedPath, params.content, { encoding: params.encoding as BufferEncoding, flag });

        // Invalidate quota cache after successful write
        if (context?.hostedSandbox && context.userId) {
            invalidateUsageCache(context.userId);
        }

        const stats = await fs.stat(resolvedPath);

        return {
            success: true,
            data: {
                path: resolvedPath,
                size: stats.size,
                mode: params.mode,
            },
            metadata: { executionTime: Date.now() - startTime, source: "filesystem" },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to write file",
            metadata: { executionTime: Date.now() - startTime },
        };
    }
}

export const fileWriteTool: Tool = {
    id: "file_write",
    name: "File Write",
    description: "Write content to a file on the local file system. Supports overwrite, append, and create-only modes.",
    category: "filesystem",
    icon: "FilePen",
    schema: fileWriteSchema,
    execute: fileWriteExecute,
    requiresLocalAccess: true,
};

// ============================================================================
// File List Tool
// ============================================================================

const fileListSchema = z.object({
    path: z.string().min(1).describe("Directory path to list"),
    recursive: z.boolean().default(false).describe("List files recursively"),
    maxDepth: z.number().min(1).max(10).default(3).describe("Maximum recursion depth"),
    pattern: z.string().optional().describe("Glob-like filter pattern (e.g., '*.txt', '*.{js,ts}')"),
    includeHidden: z.boolean().default(false).describe("Include hidden files (starting with .)"),
    sortBy: z.enum(["name", "size", "modified"]).default("name").describe("Sort results by"),
});

interface FileEntry {
    name: string;
    path: string;
    type: "file" | "directory" | "symlink";
    size: number;
    lastModified: string;
}

async function listDirectory(
    dirPath: string,
    recursive: boolean,
    maxDepth: number,
    depth: number,
    includeHidden: boolean,
    pattern?: string
): Promise<FileEntry[]> {
    const entries: FileEntry[] = [];

    const dirEntries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of dirEntries) {
        // Skip hidden files unless requested
        if (!includeHidden && entry.name.startsWith(".")) continue;

        // Pattern matching
        if (pattern) {
            const regex = globToRegex(pattern);
            if (!regex.test(entry.name)) {
                // If directory and recursive, still descend
                if (!entry.isDirectory() || !recursive) continue;
            }
        }

        const fullPath = path.join(dirPath, entry.name);

        try {
            const stats = await fs.stat(fullPath);
            const type = entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "file";

            // Only add files that match pattern (directories always shown for structure)
            if (!pattern || type === "directory" || globToRegex(pattern).test(entry.name)) {
                entries.push({
                    name: entry.name,
                    path: fullPath,
                    type,
                    size: stats.size,
                    lastModified: stats.mtime.toISOString(),
                });
            }

            // Recurse into directories
            if (entry.isDirectory() && recursive && depth < maxDepth) {
                const subEntries = await listDirectory(fullPath, true, maxDepth, depth + 1, includeHidden, pattern);
                entries.push(...subEntries);
            }
        } catch {
            // Skip files we can't stat (permission errors, etc.)
        }
    }

    return entries;
}

function globToRegex(glob: string): RegExp {
    let regex = glob
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")
        .replace(/\{([^}]+)\}/g, (_, group: string) => `(${group.split(",").join("|")})`);
    return new RegExp(`^${regex}$`, "i");
}

async function fileListExecute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        checkLocalAccess(context);
        const params = fileListSchema.parse(rawParams);
        const resolvedPath = resolveAndValidatePath(params.path, context?.fileAccessBaseDir);

        const entries = await listDirectory(
            resolvedPath,
            params.recursive,
            params.maxDepth,
            0,
            params.includeHidden,
            params.pattern
        );

        // Sort
        entries.sort((a, b) => {
            if (params.sortBy === "size") return b.size - a.size;
            if (params.sortBy === "modified") return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
            return a.name.localeCompare(b.name);
        });

        return {
            success: true,
            data: {
                path: resolvedPath,
                entries,
                totalEntries: entries.length,
                totalFiles: entries.filter(e => e.type === "file").length,
                totalDirectories: entries.filter(e => e.type === "directory").length,
            },
            metadata: { executionTime: Date.now() - startTime, source: "filesystem" },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to list directory",
            metadata: { executionTime: Date.now() - startTime },
        };
    }
}

export const fileListTool: Tool = {
    id: "file_list",
    name: "File List",
    description: "List files and directories at a given path. Supports recursive listing, filtering by pattern, and sorting.",
    category: "filesystem",
    icon: "FolderOpen",
    schema: fileListSchema,
    execute: fileListExecute,
    requiresLocalAccess: true,
};

// ============================================================================
// File Search Tool
// ============================================================================

const fileSearchSchema = z.object({
    directory: z.string().min(1).describe("Directory to search in"),
    query: z.string().min(1).describe("Text to search for in file contents"),
    filePattern: z.string().optional().describe("Filter files by pattern (e.g., '*.ts', '*.{js,py}')"),
    caseSensitive: z.boolean().default(false).describe("Case-sensitive search"),
    maxResults: z.number().min(1).max(100).default(20).describe("Maximum number of results"),
    maxDepth: z.number().min(1).max(10).default(5).describe("Maximum directory depth"),
});

interface SearchResult {
    file: string;
    line: number;
    content: string;
    match: string;
}

async function searchFiles(
    dirPath: string,
    query: string,
    caseSensitive: boolean,
    filePattern: string | undefined,
    maxResults: number,
    maxDepth: number,
    depth: number,
    results: SearchResult[]
): Promise<void> {
    if (results.length >= maxResults || depth > maxDepth) return;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (entry.name.startsWith(".")) continue;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            await searchFiles(fullPath, query, caseSensitive, filePattern, maxResults, maxDepth, depth + 1, results);
        } else if (entry.isFile()) {
            // Check pattern
            if (filePattern && !globToRegex(filePattern).test(entry.name)) continue;

            try {
                const stats = await fs.stat(fullPath);
                // Skip large files and binary files
                if (stats.size > 1024 * 1024) continue; // 1MB limit for search

                const content = await fs.readFile(fullPath, "utf-8");
                const lines = content.split("\n");

                const searchQuery = caseSensitive ? query : query.toLowerCase();

                for (let i = 0; i < lines.length; i++) {
                    if (results.length >= maxResults) break;

                    const line = lines[i];
                    const searchLine = caseSensitive ? line : line.toLowerCase();

                    if (searchLine.includes(searchQuery)) {
                        results.push({
                            file: fullPath,
                            line: i + 1,
                            content: line.trim().substring(0, 200),
                            match: query,
                        });
                    }
                }
            } catch {
                // Skip files that can't be read (binary, permission errors)
            }
        }
    }
}

async function fileSearchExecute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        checkLocalAccess(context);
        const params = fileSearchSchema.parse(rawParams);
        const resolvedPath = resolveAndValidatePath(params.directory, context?.fileAccessBaseDir);

        const results: SearchResult[] = [];
        await searchFiles(
            resolvedPath,
            params.query,
            params.caseSensitive,
            params.filePattern,
            params.maxResults,
            params.maxDepth,
            0,
            results
        );

        return {
            success: true,
            data: {
                directory: resolvedPath,
                query: params.query,
                results,
                totalResults: results.length,
            },
            metadata: { executionTime: Date.now() - startTime, source: "filesystem" },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to search files",
            metadata: { executionTime: Date.now() - startTime },
        };
    }
}

export const fileSearchTool: Tool = {
    id: "file_search",
    name: "File Search",
    description: "Search for text content within files in a directory. Supports pattern filtering and case sensitivity.",
    category: "filesystem",
    icon: "FileSearch",
    schema: fileSearchSchema,
    execute: fileSearchExecute,
    requiresLocalAccess: true,
};

// ============================================================================
// File Delete Tool
// ============================================================================

const fileDeleteSchema = z.object({
    path: z.string().min(1).describe("Path to the file or directory to delete"),
    recursive: z.boolean().default(false).describe("Delete directories recursively (required for non-empty directories)"),
});

async function fileDeleteExecute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        checkLocalAccess(context);
        const params = fileDeleteSchema.parse(rawParams);
        const resolvedPath = resolveAndValidatePath(params.path, context?.fileAccessBaseDir);

        if (isBlockedFile(resolvedPath)) {
            return { success: false, error: "Access denied: this file type is blocked for security reasons" };
        }

        const stats = await fs.stat(resolvedPath);
        const isDir = stats.isDirectory();

        if (isDir) {
            await fs.rm(resolvedPath, { recursive: params.recursive, force: false });
        } else {
            await fs.unlink(resolvedPath);
        }

        return {
            success: true,
            data: {
                path: resolvedPath,
                type: isDir ? "directory" : "file",
                deleted: true,
            },
            metadata: { executionTime: Date.now() - startTime, source: "filesystem" },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete file",
            metadata: { executionTime: Date.now() - startTime },
        };
    }
}

export const fileDeleteTool: Tool = {
    id: "file_delete",
    name: "File Delete",
    description: "Delete a file or directory from the local file system. Use recursive option for non-empty directories.",
    category: "filesystem",
    icon: "Trash2",
    schema: fileDeleteSchema,
    execute: fileDeleteExecute,
    requiresLocalAccess: true,
};

// ============================================================================
// File Move/Rename Tool
// ============================================================================

const fileMoveSchema = z.object({
    source: z.string().min(1).describe("Source file or directory path"),
    destination: z.string().min(1).describe("Destination file or directory path"),
    overwrite: z.boolean().default(false).describe("Overwrite destination if it exists"),
});

async function fileMoveExecute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        checkLocalAccess(context);
        const params = fileMoveSchema.parse(rawParams);
        const resolvedSource = resolveAndValidatePath(params.source, context?.fileAccessBaseDir);
        const resolvedDest = resolveAndValidatePath(params.destination, context?.fileAccessBaseDir);

        if (isBlockedFile(resolvedSource) || isBlockedFile(resolvedDest)) {
            return { success: false, error: "Access denied: this file type is blocked for security reasons" };
        }

        // Check if destination exists
        if (!params.overwrite) {
            try {
                await fs.access(resolvedDest);
                return { success: false, error: `Destination already exists: ${resolvedDest}. Set overwrite=true to replace.` };
            } catch {
                // Doesn't exist, proceed
            }
        }

        // Create destination directory if needed (skip if parent already exists, e.g. drive roots)
        const destParent = path.dirname(resolvedDest);
        try {
            await fs.access(destParent);
        } catch {
            await fs.mkdir(destParent, { recursive: true });
        }

        await fs.rename(resolvedSource, resolvedDest);

        return {
            success: true,
            data: {
                source: resolvedSource,
                destination: resolvedDest,
                moved: true,
            },
            metadata: { executionTime: Date.now() - startTime, source: "filesystem" },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to move file",
            metadata: { executionTime: Date.now() - startTime },
        };
    }
}

export const fileMoveTool: Tool = {
    id: "file_move",
    name: "File Move/Rename",
    description: "Move or rename a file or directory. Can also be used to organize files into different directories.",
    category: "filesystem",
    icon: "FolderInput",
    schema: fileMoveSchema,
    execute: fileMoveExecute,
    requiresLocalAccess: true,
};
