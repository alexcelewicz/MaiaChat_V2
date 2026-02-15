import type { DocumentProcessor, ProcessedDocument, ProcessorOptions, DocumentMetadata, DocumentSection } from "./types";

/**
 * Plain Text and Markdown Processor
 */
export class TextProcessor implements DocumentProcessor {
    supports(fileType: string): boolean {
        return fileType === "txt" || fileType === "md";
    }

    async process(
        buffer: Buffer,
        filename: string,
        options: ProcessorOptions = {}
    ): Promise<ProcessedDocument> {
        const text = buffer.toString("utf-8");
        const fileType = filename.toLowerCase().endsWith(".md") ? "md" : "txt";
        
        const metadata: DocumentMetadata = {
            fileType: fileType as "txt" | "md",
            originalFilename: filename,
            fileSize: buffer.length,
            wordCount: this.countWords(text),
            characterCount: text.length,
        };

        // Extract sections for markdown files
        let sections: DocumentSection[] | undefined;
        if (fileType === "md") {
            sections = this.extractMarkdownSections(text);
        }

        return {
            text: options.preserveFormatting ? text : this.normalizeText(text),
            metadata,
            sections,
        };
    }

    private countWords(text: string): number {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }

    private normalizeText(text: string): string {
        return text
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    private extractMarkdownSections(text: string): DocumentSection[] {
        const sections: DocumentSection[] = [];
        const lines = text.split("\n");
        
        let currentSection: DocumentSection | null = null;
        let contentLines: string[] = [];

        for (const line of lines) {
            // Check for heading
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            
            if (headingMatch) {
                // Save previous section
                if (currentSection) {
                    currentSection.content = contentLines.join("\n").trim();
                    sections.push(currentSection);
                }
                
                currentSection = {
                    title: headingMatch[2],
                    content: "",
                    level: headingMatch[1].length,
                };
                contentLines = [];
            } else if (currentSection) {
                contentLines.push(line);
            } else {
                // Content before first heading
                contentLines.push(line);
            }
        }

        // Handle remaining content
        if (currentSection) {
            currentSection.content = contentLines.join("\n").trim();
            sections.push(currentSection);
        } else if (contentLines.length > 0) {
            // No headings found, create a single section
            sections.push({
                content: contentLines.join("\n").trim(),
            });
        }

        return sections;
    }
}

export const textProcessor = new TextProcessor();
