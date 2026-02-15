"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, Check, Download, FileCode, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { codeToHtml, type BundledLanguage } from "shiki";
import { toast } from "sonner";

interface CodeViewerProps {
    code: string;
    language?: string;
    filename?: string;
    showLineNumbers?: boolean;
    maxHeight?: number;
    className?: string;
}

// Language detection patterns
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
    typescript: [/import\s+.*from\s+['"]/, /export\s+(const|function|class|interface|type)/, /:\s*(string|number|boolean|void)\b/],
    javascript: [/const\s+\w+\s*=/, /function\s+\w+\s*\(/, /=>\s*{/],
    python: [/def\s+\w+\s*\(/, /import\s+\w+/, /from\s+\w+\s+import/, /class\s+\w+.*:/],
    rust: [/fn\s+\w+\s*\(/, /let\s+mut\s+/, /impl\s+\w+/, /pub\s+(fn|struct|enum)/],
    go: [/func\s+\w+\s*\(/, /package\s+\w+/, /import\s*\(/, /type\s+\w+\s+struct/],
    java: [/public\s+class\s+/, /private\s+\w+\s+\w+;/, /void\s+\w+\s*\(/],
    cpp: [/#include\s*</, /std::/, /int\s+main\s*\(/],
    html: [/<(!DOCTYPE|html|head|body|div|span)/, /<!DOCTYPE\s+html>/i],
    css: [/\.\w+\s*{/, /@media\s+/, /margin:|padding:|display:/],
    json: [/^\s*{/, /"[\w-]+":\s*[{\[\d"]/],
    yaml: [/^\s*\w+:\s*$/, /^\s+-\s+\w+/],
    markdown: [/^#+\s+/, /\[.*\]\(.*\)/, /^\*\*.*\*\*/],
    sql: [/SELECT\s+.*FROM/i, /INSERT\s+INTO/i, /CREATE\s+TABLE/i],
    bash: [/^#!/, /echo\s+/, /export\s+\w+=/],
};

// File extension to language mapping
const EXTENSION_MAP: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    dockerfile: "dockerfile",
    xml: "xml",
    svg: "xml",
};

function detectLanguage(code: string, filename?: string): string {
    // Try filename first
    if (filename) {
        const ext = filename.split(".").pop()?.toLowerCase();
        if (ext && EXTENSION_MAP[ext]) {
            return EXTENSION_MAP[ext];
        }
    }

    // Try pattern matching
    for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(code)) {
                return lang;
            }
        }
    }

    return "plaintext";
}

export function CodeViewer({
    code,
    language,
    filename,
    showLineNumbers = true,
    maxHeight = 400,
    className,
}: CodeViewerProps) {
    const [copied, setCopied] = useState(false);
    const [highlighted, setHighlighted] = useState<string>("");
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const detectedLanguage = language || detectLanguage(code, filename);

    useEffect(() => {
        async function highlight() {
            setIsLoading(true);
            try {
                const html = await codeToHtml(code, {
                    lang: detectedLanguage as BundledLanguage,
                    theme: "github-dark",
                });
                setHighlighted(html);
            } catch {
                // Fallback to plain text
                setHighlighted(`<pre><code>${escapeHtml(code)}</code></pre>`);
            }
            setIsLoading(false);
        }
        highlight();
    }, [code, detectedLanguage]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            toast.success("Code copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy code");
        }
    };

    const handleDownload = () => {
        const blob = new Blob([code], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || `code.${getExtension(detectedLanguage)}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("File downloaded");
    };

    const lineCount = code.split("\n").length;

    return (
        <div
            className={cn(
                "rounded-lg border bg-[#0d1117] overflow-hidden",
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
                <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-gray-400" />
                    {filename && (
                        <span className="text-sm font-mono text-gray-300">
                            {filename}
                        </span>
                    )}
                    <Badge variant="secondary" className="text-xs bg-[#21262d] text-gray-400">
                        {detectedLanguage}
                    </Badge>
                    <span className="text-xs text-gray-500">
                        {lineCount} lines
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-gray-400 hover:text-white hover:bg-[#21262d]"
                                    onClick={() => setIsExpanded(!isExpanded)}
                                >
                                    {isExpanded ? (
                                        <Minimize2 className="h-4 w-4" />
                                    ) : (
                                        <Maximize2 className="h-4 w-4" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isExpanded ? "Collapse" : "Expand"}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-gray-400 hover:text-white hover:bg-[#21262d]"
                                    onClick={handleDownload}
                                >
                                    <Download className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-gray-400 hover:text-white hover:bg-[#21262d]"
                                    onClick={handleCopy}
                                >
                                    {copied ? (
                                        <Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {copied ? "Copied!" : "Copy"}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {/* Code content */}
            <div
                className={cn(
                    "overflow-auto transition-all",
                    showLineNumbers && "relative"
                )}
                style={{ maxHeight: isExpanded ? "none" : maxHeight }}
            >
                {isLoading ? (
                    <div className="p-4">
                        <div className="animate-pulse space-y-2">
                            {[...Array(Math.min(10, lineCount))].map((_, i) => (
                                <div
                                    key={i}
                                    className="h-4 bg-[#21262d] rounded"
                                    style={{ width: `${Math.random() * 50 + 30}%` }}
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex">
                        {showLineNumbers && (
                            <div className="flex-shrink-0 select-none px-4 py-4 text-right text-xs font-mono text-gray-500 bg-[#0d1117] border-r border-[#21262d]">
                                {code.split("\n").map((_, i) => (
                                    <div key={i} className="leading-6">
                                        {i + 1}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div
                            className="flex-1 overflow-x-auto p-4 text-sm [&>pre]:!bg-transparent [&>pre]:!m-0 [&>pre]:!p-0 [&_code]:!leading-6"
                            dangerouslySetInnerHTML={{ __html: highlighted }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getExtension(language: string): string {
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
        plaintext: "txt",
    };
    return map[language] || "txt";
}
