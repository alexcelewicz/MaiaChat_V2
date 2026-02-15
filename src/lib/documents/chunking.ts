/**
 * Document chunking strategies for RAG
 */

export interface ChunkOptions {
    chunkSize?: number;      // Target chunk size in characters
    chunkOverlap?: number;   // Overlap between chunks in characters
    minChunkSize?: number;   // Minimum chunk size (don't create tiny chunks)
}

export interface DocumentChunk {
    content: string;
    index: number;
    startOffset: number;
    endOffset: number;
    metadata?: {
        pageNumber?: number;
        sectionTitle?: string;
    };
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
    chunkSize: 1000,
    chunkOverlap: 200,
    minChunkSize: 100,
};

// ============================================================================
// Fixed Size Chunking
// ============================================================================

/**
 * Split text into fixed-size chunks with overlap
 */
export function chunkByFixedSize(
    text: string,
    options: ChunkOptions = {}
): DocumentChunk[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const chunks: DocumentChunk[] = [];
    
    if (text.length === 0) {
        return chunks;
    }
    
    let startOffset = 0;
    let index = 0;
    
    while (startOffset < text.length) {
        let endOffset = Math.min(startOffset + opts.chunkSize, text.length);
        
        // Try to end at a sentence or paragraph boundary
        if (endOffset < text.length) {
            const searchStart = Math.max(startOffset + opts.minChunkSize, endOffset - 200);
            const searchText = text.slice(searchStart, endOffset);
            
            // Look for paragraph break
            const paragraphMatch = searchText.lastIndexOf("\n\n");
            if (paragraphMatch !== -1) {
                endOffset = searchStart + paragraphMatch + 2;
            } else {
                // Look for sentence end
                const sentenceMatch = searchText.match(/[.!?]\s+[A-Z]/g);
                if (sentenceMatch && sentenceMatch.length > 0) {
                    const lastMatch = sentenceMatch[sentenceMatch.length - 1];
                    if (lastMatch) {
                        const lastSentence = searchText.lastIndexOf(lastMatch);
                        if (lastSentence !== -1) {
                            endOffset = searchStart + lastSentence + 2;
                        }
                    }
                }
            }
        }
        
        const content = text.slice(startOffset, endOffset).trim();
        
        if (content.length >= opts.minChunkSize || chunks.length === 0) {
            chunks.push({
                content,
                index,
                startOffset,
                endOffset,
            });
            index++;
        }
        
        // Move to next chunk with overlap
        startOffset = endOffset - opts.chunkOverlap;
        if (startOffset >= text.length - opts.minChunkSize) {
            break;
        }
    }
    
    return chunks;
}

// ============================================================================
// Semantic Chunking (by sections/paragraphs)
// ============================================================================

/**
 * Split text by semantic boundaries (paragraphs, sections)
 */
export function chunkBySemantic(
    text: string,
    options: ChunkOptions = {}
): DocumentChunk[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const chunks: DocumentChunk[] = [];
    
    // Split by double newline (paragraphs)
    const paragraphs = text.split(/\n\n+/);
    
    let currentChunk = "";
    let currentStartOffset = 0;
    let index = 0;
    let offset = 0;
    
    for (const paragraph of paragraphs) {
        const trimmedParagraph = paragraph.trim();
        if (!trimmedParagraph) {
            offset += paragraph.length + 2; // Account for the split
            continue;
        }
        
        // Check if adding this paragraph would exceed chunk size
        if (currentChunk && (currentChunk.length + trimmedParagraph.length + 2) > opts.chunkSize) {
            // Save current chunk
            if (currentChunk.length >= opts.minChunkSize) {
                chunks.push({
                    content: currentChunk.trim(),
                    index,
                    startOffset: currentStartOffset,
                    endOffset: offset,
                });
                index++;
            }
            
            // Start new chunk, optionally with overlap
            if (opts.chunkOverlap > 0) {
                // Include last part of previous chunk
                const overlapText = currentChunk.slice(-opts.chunkOverlap);
                currentChunk = overlapText + "\n\n" + trimmedParagraph;
            } else {
                currentChunk = trimmedParagraph;
            }
            currentStartOffset = offset;
        } else {
            // Add to current chunk
            currentChunk = currentChunk ? currentChunk + "\n\n" + trimmedParagraph : trimmedParagraph;
        }
        
        offset += paragraph.length + 2;
    }
    
    // Don't forget the last chunk
    if (currentChunk && currentChunk.length >= opts.minChunkSize) {
        chunks.push({
            content: currentChunk.trim(),
            index,
            startOffset: currentStartOffset,
            endOffset: text.length,
        });
    }
    
    return chunks;
}

// ============================================================================
// Recursive Chunking
// ============================================================================

const SEPARATORS = [
    "\n\n",      // Paragraphs
    "\n",        // Lines
    ". ",        // Sentences
    ", ",        // Clauses
    " ",         // Words
];

/**
 * Recursively split text using increasingly smaller separators
 */
export function chunkByRecursive(
    text: string,
    options: ChunkOptions = {}
): DocumentChunk[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    const splitRecursive = (
        text: string,
        separators: string[],
        startOffset: number
    ): DocumentChunk[] => {
        const chunks: DocumentChunk[] = [];
        
        if (text.length <= opts.chunkSize) {
            if (text.trim().length >= opts.minChunkSize) {
                chunks.push({
                    content: text.trim(),
                    index: 0, // Will be reindexed later
                    startOffset,
                    endOffset: startOffset + text.length,
                });
            }
            return chunks;
        }
        
        // Find the best separator
        const separator = separators[0];
        const nextSeparators = separators.slice(1);
        
        if (!separator) {
            // No more separators, force split
            return chunkByFixedSize(text, opts).map(c => ({
                ...c,
                startOffset: startOffset + c.startOffset,
                endOffset: startOffset + c.endOffset,
            }));
        }
        
        const parts = text.split(separator);
        let currentChunk = "";
        let chunkStartOffset = startOffset;
        let offset = startOffset;
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i] ?? "";
            const partWithSep = i < parts.length - 1 ? part + separator : part;
            
            if (currentChunk.length + partWithSep.length > opts.chunkSize) {
                // Current chunk is full
                if (currentChunk.length >= opts.minChunkSize) {
                    // If current part is too big, recursively split it
                    if (part.length > opts.chunkSize && nextSeparators.length > 0) {
                        // First, save current chunk
                        if (currentChunk.trim()) {
                            chunks.push({
                                content: currentChunk.trim(),
                                index: 0,
                                startOffset: chunkStartOffset,
                                endOffset: offset,
                            });
                        }
                        // Then recursively split the large part
                        const subChunks = splitRecursive(part, nextSeparators, offset);
                        chunks.push(...subChunks);
                        currentChunk = "";
                        chunkStartOffset = offset + part.length + separator.length;
                    } else {
                        chunks.push({
                            content: currentChunk.trim(),
                            index: 0,
                            startOffset: chunkStartOffset,
                            endOffset: offset,
                        });
                        currentChunk = partWithSep;
                        chunkStartOffset = offset;
                    }
                } else {
                    // Chunk too small, recursively split current + new
                    currentChunk += partWithSep;
                }
            } else {
                currentChunk += partWithSep;
            }
            
            offset += partWithSep.length;
        }
        
        // Handle remaining
        if (currentChunk.trim().length >= opts.minChunkSize) {
            chunks.push({
                content: currentChunk.trim(),
                index: 0,
                startOffset: chunkStartOffset,
                endOffset: startOffset + text.length,
            });
        }
        
        return chunks;
    };
    
    const chunks = splitRecursive(text, SEPARATORS, 0);
    
    // Reindex chunks
    return chunks.map((chunk, index) => ({
        ...chunk,
        index,
    }));
}

// ============================================================================
// Chunking Strategy Factory
// ============================================================================

export type ChunkingStrategy = "fixed" | "semantic" | "recursive";

/**
 * Chunk a document using the specified strategy
 */
export function chunkDocument(
    text: string,
    strategy: ChunkingStrategy = "recursive",
    options: ChunkOptions = {}
): DocumentChunk[] {
    switch (strategy) {
        case "fixed":
            return chunkByFixedSize(text, options);
        case "semantic":
            return chunkBySemantic(text, options);
        case "recursive":
        default:
            return chunkByRecursive(text, options);
    }
}

/**
 * Estimate token count (rough approximation)
 * Most models use ~4 characters per token on average
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}
