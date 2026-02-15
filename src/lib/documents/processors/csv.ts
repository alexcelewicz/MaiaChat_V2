import type { DocumentProcessor, ProcessedDocument, ProcessorOptions, DocumentMetadata } from "./types";

/**
 * CSV Document Processor
 */
export class CsvProcessor implements DocumentProcessor {
    supports(fileType: string): boolean {
        return fileType === "csv";
    }

    async process(
        buffer: Buffer,
        filename: string,
        options: ProcessorOptions = {}
    ): Promise<ProcessedDocument> {
        const content = buffer.toString("utf-8");
        const rows = this.parseCSV(content);
        
        if (rows.length === 0) {
            return {
                text: "",
                metadata: {
                    fileType: "csv",
                    originalFilename: filename,
                    fileSize: buffer.length,
                    wordCount: 0,
                    characterCount: 0,
                },
            };
        }

        // Assume first row is headers
        const headers = rows[0] ?? [];
        const dataRows = rows.slice(1);

        // Convert to text format
        let text: string;

        if (options.preserveFormatting) {
            // Keep as table format
            text = this.formatAsTable(headers, dataRows);
        } else {
            // Convert to readable format
            text = this.formatAsReadable(headers, dataRows);
        }

        const metadata: DocumentMetadata = {
            fileType: "csv",
            originalFilename: filename,
            fileSize: buffer.length,
            wordCount: this.countWords(text),
            characterCount: text.length,
        };

        return {
            text,
            metadata,
        };
    }

    private parseCSV(content: string): string[][] {
        const rows: string[][] = [];
        const lines = content.split(/\r?\n/);
        
        for (const line of lines) {
            if (line.trim() === "") continue;
            
            const row: string[] = [];
            let cell = "";
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1];
                
                if (char === '"') {
                    if (inQuotes && nextChar === '"') {
                        cell += '"';
                        i++; // Skip next quote
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === "," && !inQuotes) {
                    row.push(cell.trim());
                    cell = "";
                } else {
                    cell += char;
                }
            }
            
            row.push(cell.trim());
            rows.push(row);
        }
        
        return rows;
    }

    private formatAsTable(headers: string[], rows: string[][]): string {
        // Calculate column widths
        const widths = headers.map((h, i) => {
            const maxDataWidth = Math.max(...rows.map(r => (r[i] ?? "").length), 0);
            return Math.max(h.length, maxDataWidth);
        });

        // Format header
        const headerLine = headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join(" | ");
        const separator = widths.map(w => "-".repeat(w)).join("-+-");

        // Format rows
        const dataLines = rows.map(row =>
            headers.map((_, i) => (row[i] ?? "").padEnd(widths[i] ?? 0)).join(" | ")
        );

        return [headerLine, separator, ...dataLines].join("\n");
    }

    private formatAsReadable(headers: string[], rows: string[][]): string {
        const records: string[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            const lines = [`Record ${i + 1}:`];

            for (let j = 0; j < headers.length; j++) {
                const header = headers[j] ?? "";
                const value = row[j] ?? "";
                if (value) {
                    lines.push(`  ${header}: ${value}`);
                }
            }

            records.push(lines.join("\n"));
        }

        return records.join("\n\n");
    }

    private countWords(text: string): number {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }
}

export const csvProcessor = new CsvProcessor();
