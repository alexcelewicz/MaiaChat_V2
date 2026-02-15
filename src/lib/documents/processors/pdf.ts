import type { DocumentProcessor, ProcessedDocument, ProcessorOptions, DocumentMetadata } from "./types";

/**
 * PDF Document Processor
 */
export class PdfProcessor implements DocumentProcessor {
    supports(fileType: string): boolean {
        return fileType === "pdf";
    }

    async process(
        buffer: Buffer,
        filename: string,
        options: ProcessorOptions = {}
    ): Promise<ProcessedDocument> {
        // Dynamic import to avoid issues with server/client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParseModule = await import("pdf-parse") as any;
        const pdfParse = pdfParseModule.default || pdfParseModule;

        try {
            const data = await pdfParse(buffer);
            
            const metadata: DocumentMetadata = {
                fileType: "pdf",
                originalFilename: filename,
                fileSize: buffer.length,
                pageCount: data.numpages,
                wordCount: this.countWords(data.text),
                characterCount: data.text.length,
                title: data.info?.Title || undefined,
                author: data.info?.Author || undefined,
                createdDate: data.info?.CreationDate ? this.parsePdfDate(data.info.CreationDate) : undefined,
                modifiedDate: data.info?.ModDate ? this.parsePdfDate(data.info.ModDate) : undefined,
            };

            // Clean up the text
            let text = data.text;
            
            if (!options.preserveFormatting) {
                // Normalize whitespace
                text = text
                    .replace(/\r\n/g, "\n")
                    .replace(/\r/g, "\n")
                    .replace(/\n{3,}/g, "\n\n")
                    .replace(/[ \t]+/g, " ")
                    .trim();
            }

            return {
                text,
                metadata,
            };
        } catch (error) {
            console.error("PDF processing error:", error);
            throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    private countWords(text: string): number {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }

    private parsePdfDate(dateStr: string): Date | undefined {
        // PDF dates are in format D:YYYYMMDDHHmmSS
        try {
            const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
            if (match) {
                const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
                return new Date(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day),
                    parseInt(hour),
                    parseInt(minute),
                    parseInt(second)
                );
            }
        } catch {
            // Ignore parsing errors
        }
        return undefined;
    }
}

export const pdfProcessor = new PdfProcessor();
