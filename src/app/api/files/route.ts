/**
 * Files API
 *
 * Phase 7: File Access in Chat
 * - GET: Download a file or list workspace files
 * - POST: Get file preview/metadata
 *
 * @see UNIFIED_ROADMAP.md Phase 7
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import * as fs from "fs/promises";
import * as path from "path";

// ============================================================================
// Configuration
// ============================================================================

/** Maximum file size for preview (1 MB) */
const MAX_PREVIEW_SIZE = 1024 * 1024;

/** Maximum file size for download (50 MB) */
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024;

/** File extensions that can be previewed as text */
const TEXT_EXTENSIONS = new Set([
    ".txt", ".md", ".json", ".js", ".jsx", ".ts", ".tsx", ".css", ".scss",
    ".html", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
    ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
    ".py", ".rb", ".php", ".go", ".rs", ".java", ".kt", ".scala",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".m", ".mm",
    ".sql", ".graphql", ".prisma", ".env.example", ".gitignore",
    ".dockerfile", ".dockerignore", ".editorconfig", ".prettierrc",
    ".eslintrc", ".babelrc", "Makefile", "Dockerfile",
]);

/** Dangerous file patterns that should not be served */
const BLOCKED_PATTERNS = [
    /\.env$/i,
    /\.env\..+$/i,
    /credentials\.json$/i,
    /\.pem$/i,
    /\.key$/i,
    /id_rsa/i,
    /id_ed25519/i,
    /\.ssh/i,
];

// ============================================================================
// Utilities
// ============================================================================

function isBlockedFile(filePath: string): boolean {
    return BLOCKED_PATTERNS.some(pattern => pattern.test(filePath));
}

function isTextFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);
    return TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(basename);
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".json": "application/json",
        ".js": "text/javascript",
        ".jsx": "text/javascript",
        ".ts": "text/typescript",
        ".tsx": "text/typescript",
        ".css": "text/css",
        ".html": "text/html",
        ".xml": "application/xml",
        ".yaml": "text/yaml",
        ".yml": "text/yaml",
        ".py": "text/x-python",
        ".rb": "text/x-ruby",
        ".go": "text/x-go",
        ".rs": "text/x-rust",
        ".java": "text/x-java",
        ".c": "text/x-c",
        ".cpp": "text/x-c++",
        ".h": "text/x-c",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".zip": "application/zip",
        ".tar": "application/x-tar",
        ".gz": "application/gzip",
    };
    return mimeTypes[ext] || "application/octet-stream";
}

async function getWorkspacePath(): Promise<string> {
    const config = await getConfig();
    let workspaceRoot = config.cli.workspaceRoot;

    if (!path.isAbsolute(workspaceRoot)) {
        workspaceRoot = path.join(process.cwd(), workspaceRoot);
    }

    return workspaceRoot;
}

function isPathWithinWorkspace(filePath: string, workspacePath: string): boolean {
    const resolved = path.resolve(filePath);
    const resolvedWorkspace = path.resolve(workspacePath);
    return resolved.startsWith(resolvedWorkspace);
}

// ============================================================================
// GET: Download file or list files
// ============================================================================

export async function GET(request: NextRequest) {
    const session = await getServerSession();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const filePath = searchParams.get("path");
        const action = searchParams.get("action") || "download";
        const workspacePath = await getWorkspacePath();

        // List workspace files
        if (action === "list") {
            const subdir = searchParams.get("subdir") || "";
            const listPath = path.join(workspacePath, subdir);

            if (!isPathWithinWorkspace(listPath, workspacePath)) {
                return NextResponse.json(
                    { error: "Access denied: path outside workspace" },
                    { status: 403 }
                );
            }

            try {
                await fs.access(listPath);
            } catch {
                return NextResponse.json({
                    files: [],
                    directories: [],
                    path: subdir || "/",
                });
            }

            const entries = await fs.readdir(listPath, { withFileTypes: true });
            const files: Array<{
                name: string;
                path: string;
                size: number;
                modified: string;
                isText: boolean;
            }> = [];
            const directories: Array<{ name: string; path: string }> = [];

            for (const entry of entries) {
                if (entry.name.startsWith(".")) continue;

                const entryPath = path.join(listPath, entry.name);
                const relativePath = path.relative(workspacePath, entryPath);

                if (entry.isDirectory()) {
                    directories.push({
                        name: entry.name,
                        path: relativePath,
                    });
                } else if (entry.isFile()) {
                    const stats = await fs.stat(entryPath);
                    files.push({
                        name: entry.name,
                        path: relativePath,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        isText: isTextFile(entry.name),
                    });
                }
            }

            return NextResponse.json({
                files: files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()),
                directories: directories.sort((a, b) => a.name.localeCompare(b.name)),
                path: subdir || "/",
                workspacePath,
            });
        }

        // Download or preview a specific file
        if (!filePath) {
            return NextResponse.json(
                { error: "File path is required" },
                { status: 400 }
            );
        }

        const fullPath = path.join(workspacePath, filePath);

        if (!isPathWithinWorkspace(fullPath, workspacePath)) {
            return NextResponse.json(
                { error: "Access denied: path outside workspace" },
                { status: 403 }
            );
        }

        if (isBlockedFile(fullPath)) {
            return NextResponse.json(
                { error: "Access denied: blocked file type" },
                { status: 403 }
            );
        }

        try {
            await fs.access(fullPath);
        } catch {
            return NextResponse.json(
                { error: "File not found" },
                { status: 404 }
            );
        }

        const stats = await fs.stat(fullPath);

        if (!stats.isFile()) {
            return NextResponse.json(
                { error: "Not a file" },
                { status: 400 }
            );
        }

        if (stats.size > MAX_DOWNLOAD_SIZE) {
            return NextResponse.json(
                { error: `File too large: ${(stats.size / 1024 / 1024).toFixed(1)} MB exceeds limit` },
                { status: 400 }
            );
        }

        // Preview action - return metadata and content for text files
        if (action === "preview") {
            const response: {
                name: string;
                path: string;
                size: number;
                modified: string;
                mimeType: string;
                isText: boolean;
                content?: string;
                truncated?: boolean;
            } = {
                name: path.basename(fullPath),
                path: filePath,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                mimeType: getMimeType(fullPath),
                isText: isTextFile(fullPath),
            };

            if (response.isText && stats.size <= MAX_PREVIEW_SIZE) {
                const content = await fs.readFile(fullPath, "utf-8");
                response.content = content;
            } else if (response.isText) {
                // Truncate large text files
                const buffer = Buffer.alloc(MAX_PREVIEW_SIZE);
                const fd = await fs.open(fullPath, "r");
                await fd.read(buffer, 0, MAX_PREVIEW_SIZE, 0);
                await fd.close();
                response.content = buffer.toString("utf-8");
                response.truncated = true;
            }

            return NextResponse.json(response);
        }

        // Download action - serve the file
        const fileBuffer = await fs.readFile(fullPath);
        const mimeType = getMimeType(fullPath);
        const fileName = path.basename(fullPath);

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type": mimeType,
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Content-Length": stats.size.toString(),
                "Cache-Control": "private, max-age=3600",
            },
        });
    } catch (error) {
        console.error("[Files API] Error:", error);
        return NextResponse.json(
            { error: "Failed to process file request" },
            { status: 500 }
        );
    }
}

// ============================================================================
// POST: Get file info or create directory
// ============================================================================

export async function POST(request: NextRequest) {
    const session = await getServerSession();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, path: filePath, paths } = body;
        const workspacePath = await getWorkspacePath();

        switch (action) {
            case "info": {
                // Get info for multiple files
                if (!Array.isArray(paths) || paths.length === 0) {
                    return NextResponse.json(
                        { error: "paths array is required" },
                        { status: 400 }
                    );
                }

                const results = await Promise.all(
                    paths.map(async (p: string) => {
                        const fullPath = path.join(workspacePath, p);

                        if (!isPathWithinWorkspace(fullPath, workspacePath)) {
                            return { path: p, error: "Outside workspace" };
                        }

                        try {
                            const stats = await fs.stat(fullPath);
                            return {
                                path: p,
                                name: path.basename(p),
                                size: stats.size,
                                modified: stats.mtime.toISOString(),
                                isText: isTextFile(p),
                                mimeType: getMimeType(p),
                            };
                        } catch {
                            return { path: p, error: "Not found" };
                        }
                    })
                );

                return NextResponse.json({ files: results });
            }

            case "exists": {
                if (!filePath) {
                    return NextResponse.json(
                        { error: "path is required" },
                        { status: 400 }
                    );
                }

                const fullPath = path.join(workspacePath, filePath);

                if (!isPathWithinWorkspace(fullPath, workspacePath)) {
                    return NextResponse.json({ exists: false });
                }

                try {
                    await fs.access(fullPath);
                    return NextResponse.json({ exists: true });
                } catch {
                    return NextResponse.json({ exists: false });
                }
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: ${action}` },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error("[Files API] Error:", error);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}
