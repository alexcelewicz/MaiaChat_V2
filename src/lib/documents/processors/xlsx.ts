import * as XLSX from "xlsx";
import type { DocumentProcessor, ProcessedDocument, ProcessorOptions, DocumentMetadata } from "./types";

/**
 * Excel (XLSX) Document Processor
 */
export class XlsxProcessor implements DocumentProcessor {
    supports(fileType: string): boolean {
        return fileType === "xlsx";
    }

    async process(
        buffer: Buffer,
        filename: string,
        options: ProcessorOptions = {}
    ): Promise<ProcessedDocument> {
        try {
            const workbook = XLSX.read(buffer, { type: "buffer" });
            const sheets: string[] = [];
            
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const sheetText = this.processSheet(sheetName, sheet, options);
                if (sheetText) {
                    sheets.push(sheetText);
                }
            }
            
            const text = sheets.join("\n\n---\n\n");
            
            const metadata: DocumentMetadata = {
                fileType: "xlsx",
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
            console.error("XLSX processing error:", error);
            throw new Error(`Failed to process XLSX: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    private processSheet(
        sheetName: string,
        sheet: XLSX.WorkSheet,
        options: ProcessorOptions
    ): string {
        // Convert to JSON to get data (header: 1 returns arrays)
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown as unknown[][];

        if (data.length === 0) {
            return "";
        }

        const rows = data;
        
        // Filter out empty rows
        const nonEmptyRows = rows.filter(row => 
            row.some(cell => cell !== null && cell !== undefined && cell !== "")
        );
        
        if (nonEmptyRows.length === 0) {
            return "";
        }

        let content: string;
        
        if (options.preserveFormatting) {
            // Keep as table format
            content = this.formatAsTable(nonEmptyRows);
        } else {
            // Convert to readable format
            // Assume first row is headers
            const headers = nonEmptyRows[0].map(String);
            const dataRows = nonEmptyRows.slice(1);
            content = this.formatAsReadable(headers, dataRows);
        }

        return `## Sheet: ${sheetName}\n\n${content}`;
    }

    private formatAsTable(rows: unknown[][]): string {
        if (rows.length === 0) return "";
        
        // Calculate column widths
        const colCount = Math.max(...rows.map(r => r.length));
        const widths: number[] = Array(colCount).fill(0);
        
        for (const row of rows) {
            for (let i = 0; i < row.length; i++) {
                const cellStr = String(row[i] ?? "");
                widths[i] = Math.max(widths[i], cellStr.length);
            }
        }
        
        // Format rows
        const formattedRows = rows.map(row => {
            const cells = [];
            for (let i = 0; i < colCount; i++) {
                const cellStr = String(row[i] ?? "");
                cells.push(cellStr.padEnd(widths[i]));
            }
            return cells.join(" | ");
        });
        
        // Add separator after header
        const separator = widths.map(w => "-".repeat(w)).join("-+-");
        formattedRows.splice(1, 0, separator);
        
        return formattedRows.join("\n");
    }

    private formatAsReadable(headers: string[], rows: unknown[][]): string {
        const records: string[] = [];
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const lines = [`Record ${i + 1}:`];
            
            for (let j = 0; j < headers.length; j++) {
                const value = row[j];
                if (value !== null && value !== undefined && value !== "") {
                    lines.push(`  ${headers[j]}: ${String(value)}`);
                }
            }
            
            if (lines.length > 1) {
                records.push(lines.join("\n"));
            }
        }
        
        return records.join("\n\n");
    }

    private countWords(text: string): number {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }
}

export const xlsxProcessor = new XlsxProcessor();
