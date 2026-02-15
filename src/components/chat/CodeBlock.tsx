"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createHighlighter, Highlighter } from "shiki";
import { useTheme } from "next-themes";
import { Check, Copy, Play, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

let highlighterPromise: Promise<Highlighter> | null = null;

interface CodeBlockProps {
    language: string;
    value: string;
}

// Language display names mapping
const languageNames: Record<string, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    python: "Python",
    html: "HTML",
    css: "CSS",
    json: "JSON",
    bash: "Bash",
    sh: "Shell",
    sql: "SQL",
    markdown: "Markdown",
    md: "Markdown",
    tsx: "TSX",
    jsx: "JSX",
    yaml: "YAML",
    yml: "YAML",
    go: "Go",
    rust: "Rust",
    java: "Java",
    c: "C",
    cpp: "C++",
    csharp: "C#",
    php: "PHP",
    ruby: "Ruby",
    swift: "Swift",
    kotlin: "Kotlin",
    text: "Plain Text",
};

// Languages that can be previewed in browser
const PREVIEWABLE_LANGUAGES = ["html", "javascript", "js", "css"];

export function CodeBlock({ language, value }: CodeBlockProps) {
    const [html, setHtml] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const { theme, systemTheme } = useTheme();

    // Track previous value length for streaming detection
    const prevValueLengthRef = useRef(value.length);
    const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isStreamingRef = useRef(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy code:", err);
        }
    }, [value]);

    // Check if this language can be previewed
    const canPreview = useMemo(() => {
        const lang = language.toLowerCase();
        return PREVIEWABLE_LANGUAGES.includes(lang);
    }, [language]);

    // Handle preview - opens code in a new window or dialog
    const handlePreview = useCallback(() => {
        setIsPreviewOpen(true);
    }, []);

    // Open in new tab
    const handleOpenInNewTab = useCallback(() => {
        const lang = language.toLowerCase();
        let htmlContent = value;

        // Wrap non-HTML content appropriately
        if (lang === "javascript" || lang === "js") {
            htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JavaScript Preview</title>
    <style>
        body { font-family: system-ui, sans-serif; padding: 20px; }
        #output { white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px; }
    </style>
</head>
<body>
    <h3>JavaScript Output:</h3>
    <div id="output"></div>
    <script>
        // Capture console.log output
        const output = document.getElementById('output');
        const originalLog = console.log;
        console.log = function(...args) {
            output.textContent += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : a).join(' ') + '\\n';
            originalLog.apply(console, args);
        };
        try {
            ${value}
        } catch(e) {
            output.textContent += 'Error: ' + e.message;
        }
    </script>
</body>
</html>`;
        } else if (lang === "css") {
            htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSS Preview</title>
    <style>${value}</style>
</head>
<body>
    <h1>CSS Preview</h1>
    <p>This is a paragraph to demonstrate the CSS styles.</p>
    <div class="container">
        <div class="box">Box 1</div>
        <div class="box">Box 2</div>
        <div class="box">Box 3</div>
    </div>
    <button>Sample Button</button>
    <a href="#">Sample Link</a>
</body>
</html>`;
        }

        const blob = new Blob([htmlContent], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        // Clean up after a delay
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, [language, value]);

    // Debounced syntax highlighting - only highlight when content stops changing
    useEffect(() => {
        const currentLength = value.length;
        const prevLength = prevValueLengthRef.current;
        prevValueLengthRef.current = currentLength;

        // Detect if we're streaming (content is growing)
        const isGrowing = currentLength > prevLength;

        if (isGrowing) {
            isStreamingRef.current = true;
            // Clear any pending highlight
            if (highlightTimeoutRef.current) {
                clearTimeout(highlightTimeoutRef.current);
            }
            // Schedule highlight for later (500ms after streaming stops)
            highlightTimeoutRef.current = setTimeout(() => {
                isStreamingRef.current = false;
                doHighlight();
            }, 500);
            return;
        }

        // Content not growing - do immediate highlight if not already done
        if (!isStreamingRef.current) {
            doHighlight();
        }

        function doHighlight() {
            // Determine effective theme
            const currentTheme = theme === "system" ? systemTheme : theme;
            const shikiTheme = currentTheme === "dark" ? "github-dark" : "github-light";

            if (!highlighterPromise) {
                highlighterPromise = createHighlighter({
                    themes: ["github-dark", "github-light"],
                    langs: [
                        "javascript",
                        "typescript",
                        "python",
                        "html",
                        "css",
                        "json",
                        "bash",
                        "sql",
                        "markdown",
                        "tsx",
                        "jsx",
                        "yaml",
                        "go",
                        "rust",
                        "java",
                        "c",
                        "cpp",
                    ],
                });
            }

            highlighterPromise.then((h) => {
                try {
                    const loadedLangs = h.getLoadedLanguages();
                    const langToUse = loadedLangs.includes(language) ? language : "text";

                    const out = h.codeToHtml(value, {
                        lang: langToUse,
                        theme: shikiTheme || "github-dark",
                    });
                    setHtml(out);
                } catch (e) {
                    console.warn("Shiki highlight error:", e);
                    setHtml(null);
                }
            });
        }

        return () => {
            if (highlightTimeoutRef.current) {
                clearTimeout(highlightTimeoutRef.current);
            }
        };
    }, [value, language, theme, systemTheme]);

    const displayLanguage = languageNames[language.toLowerCase()] || language.toUpperCase();
    const lines = value.split("\n");
    const lineCount = lines.length;

    // During streaming, show plain text for performance
    const isStreaming = isStreamingRef.current;

    return (
        <>
            <div className="relative group rounded-lg overflow-hidden border my-3 bg-muted/30">
                {/* Header with language label and buttons */}
                <div className="flex items-center justify-between px-4 py-2 bg-muted/80 border-b">
                    <span className="text-xs font-medium text-muted-foreground">
                        {displayLanguage}
                        {isStreaming && (
                            <span className="ml-2 text-primary animate-pulse">streaming...</span>
                        )}
                    </span>
                    <div className="flex items-center gap-1">
                        {/* Preview/Run button for supported languages */}
                        {canPreview && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={handlePreview}
                                    title="Preview in dialog"
                                >
                                    <Play className="h-3 w-3 mr-1" />
                                    Preview
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={handleOpenInNewTab}
                                    title="Open in new tab"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                </Button>
                            </>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={handleCopy}
                        >
                            {copied ? (
                                <>
                                    <Check className="h-3 w-3 mr-1 text-green-500" />
                                    <span className="text-green-500">Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copy
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Code content with line numbers */}
                <div className="flex overflow-x-auto">
                    {/* Line numbers column */}
                    <div className="flex-shrink-0 py-4 bg-muted/50 border-r border-muted/50 select-none">
                        {Array.from({ length: lineCount }, (_, i) => (
                            <div
                                key={i}
                                className="px-3 text-right text-xs font-mono text-muted-foreground/60 leading-6"
                            >
                                {i + 1}
                            </div>
                        ))}
                    </div>

                    {/* Code content */}
                    <div className="flex-1 overflow-x-auto">
                        {html && !isStreaming ? (
                            <div
                                dangerouslySetInnerHTML={{ __html: html }}
                                className="
                                    [&_pre]:!bg-transparent
                                    [&_pre]:!p-4
                                    [&_pre]:!m-0
                                    [&_code]:!bg-transparent
                                    [&_code]:text-sm
                                    [&_.line]:leading-6
                                    [&_pre]:overflow-visible
                                "
                            />
                        ) : (
                            <pre className="p-4 font-mono text-sm">
                                <code>
                                    {lines.map((line, i) => (
                                        <div key={i} className="leading-6">
                                            {line || " "}
                                        </div>
                                    ))}
                                </code>
                            </pre>
                        )}
                    </div>
                </div>
            </div>

            {/* Preview Dialog */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-4xl h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>Code Preview - {displayLanguage}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden rounded border">
                        <iframe
                            srcDoc={
                                language.toLowerCase() === "html"
                                    ? value
                                    : language.toLowerCase() === "javascript" || language.toLowerCase() === "js"
                                    ? `<!DOCTYPE html>
<html>
<head>
    <style>body { font-family: system-ui, sans-serif; padding: 20px; } #output { white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px; }</style>
</head>
<body>
    <h3>Output:</h3>
    <div id="output"></div>
    <script>
        const output = document.getElementById('output');
        const originalLog = console.log;
        console.log = function(...args) {
            output.textContent += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : a).join(' ') + '\\n';
            originalLog.apply(console, args);
        };
        try { ${value} } catch(e) { output.textContent += 'Error: ' + e.message; }
    </script>
</body>
</html>`
                                    : `<!DOCTYPE html><html><head><style>${value}</style></head><body><h1>CSS Preview</h1><p>Sample paragraph</p><div class="container"><div class="box">Box 1</div><div class="box">Box 2</div></div><button>Button</button></body></html>`
                            }
                            className="w-full h-full border-0 bg-white"
                            sandbox="allow-scripts"
                            title="Code Preview"
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
