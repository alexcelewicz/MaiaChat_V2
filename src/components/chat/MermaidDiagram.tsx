"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, AlertCircle, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface MermaidDiagramProps {
    chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const { theme, systemTheme } = useTheme();

    useEffect(() => {
        const renderDiagram = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Dynamically import mermaid to avoid SSR issues
                const mermaid = (await import("mermaid")).default;

                const currentTheme = theme === "system" ? systemTheme : theme;
                const mermaidTheme = currentTheme === "dark" ? "dark" : "default";

                mermaid.initialize({
                    startOnLoad: false,
                    theme: mermaidTheme,
                    securityLevel: "loose",
                    fontFamily: "inherit",
                });

                // Generate a unique ID for this diagram
                const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;

                const { svg: renderedSvg } = await mermaid.render(id, chart);
                setSvg(renderedSvg);
            } catch (err) {
                console.error("Mermaid rendering error:", err);
                setError(err instanceof Error ? err.message : "Failed to render diagram");
            } finally {
                setIsLoading(false);
            }
        };

        renderDiagram();
    }, [chart, theme, systemTheme]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(chart);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            console.error("Failed to copy");
        }
    };

    if (isLoading) {
        return (
            <div className="my-4 p-8 rounded-lg border bg-muted/30 flex items-center justify-center">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Rendering diagram...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="my-4 rounded-lg border border-destructive/50 bg-destructive/10 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-destructive/20 border-b border-destructive/30">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">Diagram Error</span>
                </div>
                <div className="p-4">
                    <p className="text-sm text-destructive/80 mb-3">{error}</p>
                    <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Show source code
                        </summary>
                        <pre className="mt-2 p-3 rounded bg-muted overflow-x-auto font-mono">
                            {chart}
                        </pre>
                    </details>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="my-4 rounded-lg border bg-background overflow-hidden group">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
                    <span className="text-xs font-medium text-muted-foreground">
                        Mermaid Diagram
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
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
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setIsExpanded(true)}
                        >
                            <Maximize2 className="h-3 w-3 mr-1" />
                            Expand
                        </Button>
                    </div>
                </div>

                {/* Diagram */}
                <div
                    ref={containerRef}
                    className={cn(
                        "p-4 overflow-auto flex items-center justify-center",
                        "[&_svg]:max-w-full [&_svg]:h-auto"
                    )}
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            </div>

            {/* Expanded view dialog */}
            <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
                <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            <span>Mermaid Diagram</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsExpanded(false)}
                            >
                                <Minimize2 className="h-4 w-4" />
                            </Button>
                        </DialogTitle>
                    </DialogHeader>
                    <div
                        className="p-4 flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto"
                        dangerouslySetInnerHTML={{ __html: svg }}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}
