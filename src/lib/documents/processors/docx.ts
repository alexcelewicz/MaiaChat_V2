import mammoth from "mammoth";
import type { DocumentProcessor, ProcessedDocument, ProcessorOptions, DocumentMetadata, DocumentSection } from "./types";

/**
 * DOCX Document Processor
 */
export class DocxProcessor implements DocumentProcessor {
    supports(fileType: string): boolean {
        return fileType === "docx";
    }

    async process(
        buffer: Buffer,
        filename: string,
        options: ProcessorOptions = {}
    ): Promise<ProcessedDocument> {
        try {
            // Extract as plain text
            const textResult = await mammoth.extractRawText({ buffer });
            
            // Also extract as HTML to preserve some structure
            const htmlResult = await mammoth.convertToHtml({ buffer });
            
            const text = textResult.value;
            
            // Extract sections from HTML
            const sections = this.extractSections(htmlResult.value);
            
            const metadata: DocumentMetadata = {
                fileType: "docx",
                originalFilename: filename,
                fileSize: buffer.length,
                wordCount: this.countWords(text),
                characterCount: text.length,
            };

            // Log any warnings
            if (textResult.messages.length > 0) {
                console.warn("DOCX processing warnings:", textResult.messages);
            }

            return {
                text: options.preserveFormatting ? this.formatText(htmlResult.value) : text,
                metadata,
                sections: sections.length > 0 ? sections : undefined,
            };
        } catch (error) {
            console.error("DOCX processing error:", error);
            throw new Error(`Failed to process DOCX: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    private countWords(text: string): number {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }

    private extractSections(html: string): DocumentSection[] {
        const sections: DocumentSection[] = [];
        
        // Simple regex-based section extraction from HTML headings
        const headingRegex = /<h([1-6])>(.*?)<\/h[1-6]>/gi;
        const contentRegex = /<p>(.*?)<\/p>/gi;
        
        let match;
        let currentSection: DocumentSection | null = null;
        let lastIndex = 0;

        while ((match = headingRegex.exec(html)) !== null) {
            const levelStr = match[1];
            const titleHtml = match[2];
            if (!levelStr || !titleHtml) continue;

            const level = parseInt(levelStr);
            const title = this.stripHtml(titleHtml);

            // Save previous section
            if (currentSection) {
                const contentBetween = html.slice(lastIndex, match.index);
                currentSection.content = this.extractParagraphs(contentBetween);
                sections.push(currentSection);
            }

            currentSection = {
                title,
                content: "",
                level,
            };

            lastIndex = match.index + match[0].length;
        }

        // Handle remaining content
        if (currentSection) {
            const remainingContent = html.slice(lastIndex);
            currentSection.content = this.extractParagraphs(remainingContent);
            sections.push(currentSection);
        }

        return sections;
    }

    private extractParagraphs(html: string): string {
        const paragraphs: string[] = [];
        const regex = /<p>(.*?)<\/p>/gi;
        let match;

        while ((match = regex.exec(html)) !== null) {
            const matchContent = match[1];
            if (!matchContent) continue;
            const text = this.stripHtml(matchContent).trim();
            if (text) {
                paragraphs.push(text);
            }
        }

        return paragraphs.join("\n\n");
    }

    private stripHtml(html: string): string {
        return html
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .trim();
    }

    private formatText(html: string): string {
        // Convert HTML to markdown-like format
        return html
            .replace(/<h1>(.*?)<\/h1>/gi, "# $1\n\n")
            .replace(/<h2>(.*?)<\/h2>/gi, "## $1\n\n")
            .replace(/<h3>(.*?)<\/h3>/gi, "### $1\n\n")
            .replace(/<h4>(.*?)<\/h4>/gi, "#### $1\n\n")
            .replace(/<h5>(.*?)<\/h5>/gi, "##### $1\n\n")
            .replace(/<h6>(.*?)<\/h6>/gi, "###### $1\n\n")
            .replace(/<p>(.*?)<\/p>/gi, "$1\n\n")
            .replace(/<li>(.*?)<\/li>/gi, "- $1\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]*>/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }
}

export const docxProcessor = new DocxProcessor();
