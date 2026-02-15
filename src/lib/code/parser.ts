/**
 * Multi-file code response parser
 * Extracts multiple files from LLM responses
 */

export interface ParsedFile {
    path: string;
    filename: string;
    content: string;
    language: string;
}

export interface ParsedProject {
    files: ParsedFile[];
    rootPath?: string;
}

// Common patterns for file markers in LLM responses
const FILE_PATTERNS = [
    // Pattern 1: ```language:filepath
    /```(\w+)?:([^\n]+)\n([\s\S]*?)```/g,
    // Pattern 2: // File: filepath
    /(?:\/\/|#)\s*(?:File|file|FILE):\s*([^\n]+)\n```(\w+)?\n([\s\S]*?)```/g,
    // Pattern 3: <!-- filepath -->
    /<!--\s*([^\n]+)\s*-->\n```(\w+)?\n([\s\S]*?)```/g,
    // Pattern 4: **filepath**
    /\*\*([^*]+\.[\w]+)\*\*\n```(\w+)?\n([\s\S]*?)```/g,
];

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    h: "c",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    dockerfile: "dockerfile",
    xml: "xml",
    svg: "xml",
    gitignore: "plaintext",
    env: "plaintext",
};

/**
 * Parse a multi-file code response from an LLM
 */
export function parseMultiFileResponse(response: string): ParsedProject {
    const files: ParsedFile[] = [];
    const seen = new Set<string>();

    // Try pattern 1: ```language:filepath
    const pattern1 = /```(\w+)?:([^\n]+)\n([\s\S]*?)```/g;
    let match;
    while ((match = pattern1.exec(response)) !== null) {
        const [, language, filepath, content] = match;
        if (!filepath || !content) continue;
        const path = filepath.trim();
        if (!seen.has(path)) {
            seen.add(path);
            files.push({
                path,
                filename: getFilename(path),
                content: content.trimEnd(),
                language: language || detectLanguageFromPath(path),
            });
        }
    }

    // Try pattern 2: // File: filepath followed by code block
    const pattern2 = /(?:\/\/|#)\s*(?:File|file|FILE):\s*([^\n]+)\n```(\w+)?\n([\s\S]*?)```/g;
    while ((match = pattern2.exec(response)) !== null) {
        const [, filepath, language, content] = match;
        if (!filepath || !content) continue;
        const path = filepath.trim();
        if (!seen.has(path)) {
            seen.add(path);
            files.push({
                path,
                filename: getFilename(path),
                content: content.trimEnd(),
                language: language || detectLanguageFromPath(path),
            });
        }
    }

    // Try pattern 3: **filepath** followed by code block
    const pattern3 = /\*\*([^*]+\.[\w]+)\*\*\s*\n```(\w+)?\n([\s\S]*?)```/g;
    while ((match = pattern3.exec(response)) !== null) {
        const [, filepath, language, content] = match;
        if (!filepath || !content) continue;
        const path = filepath.trim();
        if (!seen.has(path)) {
            seen.add(path);
            files.push({
                path,
                filename: getFilename(path),
                content: content.trimEnd(),
                language: language || detectLanguageFromPath(path),
            });
        }
    }

    // If no files found with patterns, try to extract single code blocks with filenames in comments
    if (files.length === 0) {
        const singlePattern = /```(\w+)\n([\s\S]*?)```/g;
        let index = 0;
        while ((match = singlePattern.exec(response)) !== null) {
            const [, language, content] = match;
            if (!content) continue;

            // Check if first line is a filename comment
            const lines = content.split("\n");
            const firstLine = lines[0] ?? "";
            const fileMatch = firstLine.match(/^(?:\/\/|#|\/\*)\s*([^\s*]+\.[\w]+)/);
            
            if (fileMatch && fileMatch[1]) {
                const path = fileMatch[1];
                if (!seen.has(path)) {
                    seen.add(path);
                    files.push({
                        path,
                        filename: getFilename(path),
                        content: lines.slice(1).join("\n").trimEnd(),
                        language: language || detectLanguageFromPath(path),
                    });
                }
            } else {
                // Create a generic filename
                const ext = getExtensionFromLanguage(language ?? "plaintext");
                const path = `file${index + 1}.${ext}`;
                if (!seen.has(path)) {
                    seen.add(path);
                    files.push({
                        path,
                        filename: path,
                        content: content.trimEnd(),
                        language: language ?? "plaintext",
                    });
                }
                index++;
            }
        }
    }

    // Determine root path
    const rootPath = findCommonPath(files.map(f => f.path));

    return {
        files,
        rootPath,
    };
}

/**
 * Build a file tree structure from parsed files
 */
export interface FileTreeNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: FileTreeNode[];
    file?: ParsedFile;
}

export function buildFileTree(project: ParsedProject): FileTreeNode {
    const root: FileTreeNode = {
        name: project.rootPath || "project",
        path: "",
        type: "directory",
        children: [],
    };

    for (const file of project.files) {
        const parts = file.path.split("/").filter(Boolean);
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;
            const isLast = i === parts.length - 1;
            const currentPath = parts.slice(0, i + 1).join("/");

            if (isLast) {
                // Add file
                current.children = current.children || [];
                current.children.push({
                    name: part,
                    path: file.path,
                    type: "file",
                    file,
                });
            } else {
                // Find or create directory
                current.children = current.children || [];
                let dir = current.children.find(
                    c => c.name === part && c.type === "directory"
                );

                if (!dir) {
                    dir = {
                        name: part,
                        path: currentPath,
                        type: "directory",
                        children: [],
                    };
                    current.children.push(dir);
                }

                current = dir;
            }
        }
    }

    // Sort children: directories first, then files, alphabetically
    sortTree(root);

    return root;
}

function sortTree(node: FileTreeNode): void {
    if (node.children) {
        node.children.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === "directory" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortTree);
    }
}

function getFilename(path: string): string {
    return path.split("/").pop() || path;
}

function detectLanguageFromPath(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    return ext ? (EXTENSION_TO_LANGUAGE[ext] || "plaintext") : "plaintext";
}

function getExtensionFromLanguage(language: string): string {
    const map: Record<string, string> = {
        typescript: "ts",
        javascript: "js",
        python: "py",
        rust: "rs",
        go: "go",
        java: "java",
        cpp: "cpp",
        html: "html",
        css: "css",
        json: "json",
        yaml: "yaml",
        markdown: "md",
        sql: "sql",
        bash: "sh",
        shell: "sh",
    };
    return map[language] || "txt";
}

function findCommonPath(paths: string[]): string | undefined {
    if (paths.length === 0) return undefined;
    const firstPath = paths[0];
    if (!firstPath) return undefined;
    if (paths.length === 1) {
        const parts = firstPath.split("/");
        return parts.length > 1 ? parts[0] : undefined;
    }

    const splitPaths = paths.map(p => p.split("/").filter(Boolean));
    const minLength = Math.min(...splitPaths.map(p => p.length));
    const firstSplitPath = splitPaths[0];
    if (!firstSplitPath) return undefined;

    const commonParts: string[] = [];
    for (let i = 0; i < minLength - 1; i++) {
        const part = firstSplitPath[i];
        if (part && splitPaths.every(p => p[i] === part)) {
            commonParts.push(part);
        } else {
            break;
        }
    }

    return commonParts.length > 0 ? commonParts.join("/") : undefined;
}
