import type { DocumentProcessor, ProcessedDocument, ProcessorOptions, SupportedFileType } from "./types";
import { pdfProcessor } from "./pdf";
import { docxProcessor } from "./docx";
import { textProcessor } from "./text";
import { csvProcessor } from "./csv";
import { jsonProcessor } from "./json";
import { xlsxProcessor } from "./xlsx";
import { getFileType } from "./types";

export * from "./types";

// ============================================================================
// Processor Registry
// ============================================================================

const processors: DocumentProcessor[] = [
    pdfProcessor,
    docxProcessor,
    textProcessor,
    csvProcessor,
    jsonProcessor,
    xlsxProcessor,
];

/**
 * Get the appropriate processor for a file type
 */
export function getProcessor(fileType: SupportedFileType): DocumentProcessor | null {
    return processors.find(p => p.supports(fileType)) || null;
}

/**
 * Process a document with automatic processor selection
 */
export async function processDocument(
    buffer: Buffer,
    filename: string,
    mimeType?: string,
    options: ProcessorOptions = {}
): Promise<ProcessedDocument> {
    const fileType = getFileType(filename, mimeType);
    
    if (!fileType) {
        throw new Error(`Unsupported file type: ${filename}`);
    }
    
    const processor = getProcessor(fileType);
    
    if (!processor) {
        throw new Error(`No processor available for file type: ${fileType}`);
    }
    
    return processor.process(buffer, filename, options);
}

/**
 * Check if a file type is supported
 */
export function isSupportedFileType(filename: string, mimeType?: string): boolean {
    return getFileType(filename, mimeType) !== null;
}
