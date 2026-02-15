/**
 * Document processing types and interfaces
 */

export type SupportedFileType = 
    | "pdf"
    | "docx"
    | "txt"
    | "md"
    | "csv"
    | "json"
    | "xlsx";

export interface ProcessedDocument {
    text: string;
    metadata: DocumentMetadata;
    sections?: DocumentSection[];
}

export interface DocumentMetadata {
    title?: string;
    author?: string;
    createdDate?: Date;
    modifiedDate?: Date;
    pageCount?: number;
    wordCount?: number;
    characterCount?: number;
    language?: string;
    fileType: SupportedFileType;
    originalFilename: string;
    fileSize: number;
}

export interface DocumentSection {
    title?: string;
    content: string;
    pageNumber?: number;
    level?: number; // Heading level
}

export interface ProcessorOptions {
    extractTables?: boolean;
    preserveFormatting?: boolean;
    language?: string;
}

export interface DocumentProcessor {
    /**
     * Process a document and extract its text content
     */
    process(buffer: Buffer, filename: string, options?: ProcessorOptions): Promise<ProcessedDocument>;
    
    /**
     * Check if this processor supports the given file type
     */
    supports(fileType: string): boolean;
}

// MIME type mappings
export const MIME_TYPE_MAP: Record<string, SupportedFileType> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/csv": "csv",
    "application/json": "json",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// Extension mappings
export const EXTENSION_MAP: Record<string, SupportedFileType> = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".txt": "txt",
    ".md": "md",
    ".markdown": "md",
    ".csv": "csv",
    ".json": "json",
    ".xlsx": "xlsx",
};

/**
 * Get file type from filename or MIME type
 */
export function getFileType(filename: string, mimeType?: string): SupportedFileType | null {
    // Try extension first
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
    if (ext in EXTENSION_MAP) {
        return EXTENSION_MAP[ext];
    }
    
    // Try MIME type
    if (mimeType && mimeType in MIME_TYPE_MAP) {
        return MIME_TYPE_MAP[mimeType];
    }
    
    return null;
}

/**
 * Validate file size
 */
export function validateFileSize(size: number, maxSize: number = 50 * 1024 * 1024): boolean {
    return size <= maxSize;
}

/**
 * Validate file type
 */
export function validateFileType(filename: string, mimeType?: string): boolean {
    return getFileType(filename, mimeType) !== null;
}
