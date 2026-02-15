import type { DocumentProcessor, ProcessedDocument, ProcessorOptions, DocumentMetadata } from "./types";

/**
 * JSON Document Processor
 */
export class JsonProcessor implements DocumentProcessor {
    supports(fileType: string): boolean {
        return fileType === "json";
    }

    async process(
        buffer: Buffer,
        filename: string,
        options: ProcessorOptions = {}
    ): Promise<ProcessedDocument> {
        const content = buffer.toString("utf-8");
        
        try {
            const data = JSON.parse(content);
            
            // Convert JSON to readable text
            const text = options.preserveFormatting
                ? JSON.stringify(data, null, 2)
                : this.jsonToText(data);
            
            const metadata: DocumentMetadata = {
                fileType: "json",
                originalFilename: filename,
                fileSize: buffer.length,
                wordCount: this.countWords(text),
                characterCount: text.length,
            };

            return {
                text,
                metadata,
            };
        } catch (error) {
            console.error("JSON processing error:", error);
            throw new Error(`Failed to process JSON: ${error instanceof Error ? error.message : "Invalid JSON"}`);
        }
    }

    private jsonToText(data: unknown, prefix: string = ""): string {
        const lines: string[] = [];
        
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                const itemPrefix = prefix ? `${prefix}[${index}]` : `Item ${index + 1}`;
                
                if (typeof item === "object" && item !== null) {
                    lines.push(`${itemPrefix}:`);
                    lines.push(this.jsonToText(item, "  "));
                } else {
                    lines.push(`${itemPrefix}: ${this.formatValue(item)}`);
                }
            });
        } else if (typeof data === "object" && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                const keyStr = this.formatKey(key);
                
                if (typeof value === "object" && value !== null) {
                    if (Array.isArray(value) && value.length === 0) {
                        lines.push(`${prefix}${keyStr}: (empty list)`);
                    } else if (!Array.isArray(value) && Object.keys(value).length === 0) {
                        lines.push(`${prefix}${keyStr}: (empty object)`);
                    } else {
                        lines.push(`${prefix}${keyStr}:`);
                        lines.push(this.jsonToText(value, prefix + "  "));
                    }
                } else {
                    lines.push(`${prefix}${keyStr}: ${this.formatValue(value)}`);
                }
            }
        } else {
            lines.push(`${prefix}${this.formatValue(data)}`);
        }
        
        return lines.join("\n");
    }

    private formatKey(key: string): string {
        // Convert camelCase or snake_case to readable format
        return key
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/_/g, " ")
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    private formatValue(value: unknown): string {
        if (value === null) return "(none)";
        if (value === undefined) return "(undefined)";
        if (typeof value === "string") return value || "(empty)";
        if (typeof value === "boolean") return value ? "Yes" : "No";
        if (typeof value === "number") return value.toString();
        return String(value);
    }

    private countWords(text: string): number {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }
}

export const jsonProcessor = new JsonProcessor();
