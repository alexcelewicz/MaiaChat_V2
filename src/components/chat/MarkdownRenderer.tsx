"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

// Import KaTeX CSS globally - it's small (~25KB gzipped) and needed for math rendering
import "katex/dist/katex.min.css";

// Dynamic imports for heavy components - saves ~200KB+ on initial load
const CodeBlock = dynamic(
    () => import("@/components/chat/CodeBlock").then(mod => ({ default: mod.CodeBlock })),
    {
        ssr: false,
        loading: () => <pre className="animate-pulse bg-muted h-20 rounded-lg my-3" />
    }
);

const MermaidDiagram = dynamic(
    () => import("@/components/chat/MermaidDiagram").then(mod => ({ default: mod.MermaidDiagram })),
    {
        ssr: false,
        loading: () => <div className="animate-pulse bg-muted h-32 rounded-lg my-4" />
    }
);

// Hoist static plugin arrays outside component to prevent recreation
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

// Hoist static components object outside to prevent recreation on each render
const markdownComponents: Components = {
    // Headings
    h1: ({ children }) => (
        <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b first:mt-0">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="text-xl font-bold mt-5 mb-3 pb-1 border-b first:mt-0">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="text-lg font-semibold mt-4 mb-2 first:mt-0">
            {children}
        </h3>
    ),
    h4: ({ children }) => (
        <h4 className="text-base font-semibold mt-3 mb-2 first:mt-0">
            {children}
        </h4>
    ),
    h5: ({ children }) => (
        <h5 className="text-sm font-semibold mt-3 mb-1 first:mt-0">
            {children}
        </h5>
    ),
    h6: ({ children }) => (
        <h6 className="text-sm font-medium mt-3 mb-1 text-muted-foreground first:mt-0">
            {children}
        </h6>
    ),

    // Paragraphs
    p: ({ children }) => (
        <p className="mb-3 last:mb-0 leading-7">{children}</p>
    ),

    // Lists
    ul: ({ children }) => (
        <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
    ),
    li: ({ children }) => (
        <li className="leading-7">{children}</li>
    ),

    // Blockquotes
    blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-primary/50 pl-4 py-1 my-3 italic bg-muted/30 rounded-r">
            {children}
        </blockquote>
    ),

    // Horizontal rule
    hr: () => <hr className="my-6 border-border" />,

    // Links
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
        >
            {children}
        </a>
    ),

    // Strong/Bold
    strong: ({ children }) => (
        <strong className="font-semibold">{children}</strong>
    ),

    // Emphasis/Italic
    em: ({ children }) => (
        <em className="italic">{children}</em>
    ),

    // Strikethrough
    del: ({ children }) => (
        <del className="line-through text-muted-foreground">{children}</del>
    ),

    // Tables
    table: ({ children }) => (
        <div className="my-4 overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
                {children}
            </table>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="bg-muted/50">{children}</thead>
    ),
    tbody: ({ children }) => (
        <tbody className="divide-y">{children}</tbody>
    ),
    tr: ({ children }) => (
        <tr className="border-b last:border-0">{children}</tr>
    ),
    th: ({ children }) => (
        <th className="px-4 py-2 text-left font-semibold border-r last:border-r-0">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="px-4 py-2 border-r last:border-r-0">{children}</td>
    ),

    // Images
    img: ({ src, alt }) => (
        <span className="block my-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={alt || "Image"}
                className="max-w-full h-auto rounded-lg border"
                loading="lazy"
            />
            {alt && (
                <span className="block text-center text-xs text-muted-foreground mt-2">
                    {alt}
                </span>
            )}
        </span>
    ),

    // Code blocks and inline code
    code(props) {
        const { className, children, ...rest } = props;
        const match = /language-(\w+)/.exec(className || "");
        const language = match?.[1] || "";
        const codeString = String(children).replace(/\n$/, "");

        // Check if it's a code block (has language) or inline code
        const isInline = !className && !codeString.includes("\n");

        if (isInline) {
            return (
                <code
                    className="bg-muted px-1.5 py-0.5 rounded text-[0.9em] font-mono text-primary"
                    {...rest}
                >
                    {children}
                </code>
            );
        }

        // Handle Mermaid diagrams
        if (language === "mermaid") {
            return <MermaidDiagram chart={codeString} />;
        }

        // Regular code block
        return <CodeBlock language={language} value={codeString} />;
    },

    // Pre element (wrapper for code blocks)
    pre: ({ children }) => <>{children}</>,

    // Task lists (checkbox items)
    input: ({ type, checked, disabled }) => {
        if (type === "checkbox") {
            return (
                <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    className="mr-2 rounded border-muted-foreground"
                    readOnly
                />
            );
        }
        return <input type={type} />;
    },
};

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
    return (
        <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
            <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
