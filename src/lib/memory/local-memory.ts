/**
 * Local Memory Service
 *
 * Provides a local file-based memory system that works with any AI model.
 * Memory is stored in markdown files with a search index for efficient RAG.
 *
 * Flow:
 * 1. New memories are appended to a local "working memory" file
 * 2. A search index is maintained for fast keyword-based retrieval
 * 3. When file exceeds threshold, it's uploaded to Gemini store (if API key exists)
 * 4. A new working memory file is started
 *
 * Thresholds (dynamic based on Google API key):
 * - With Google API key: 500KB / 50 entries → smaller files, frequent Gemini uploads
 * - Without Google API key: 1MB / 100 entries → larger files for more local storage
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { uploadDocumentToStore, createGeminiStore, listGeminiStores } from '@/lib/ai/gemini-stores';

// Configuration
const MEMORY_BASE_DIR = process.env.MEMORY_DIR || path.join(process.cwd(), 'data', 'memory');
const WORKING_MEMORY_FILENAME = 'working_memory.md';
const SEARCH_INDEX_FILENAME = 'search_index.json';
const ARCHIVE_DIR = 'archive';
const PENDING_UPLOAD_DIR = 'pending_upload'; // For consolidating before Gemini upload

// Rolling window configuration
const ROLLING_WINDOW = {
  keepRecentEntries: 20, // Always keep last 20 conversations locally
  archiveAfterEntries: 50, // Start archiving when we have 50+ entries
};

// Gemini upload thresholds - larger files for better RAG
const GEMINI_UPLOAD = {
  minFileSize: 1024 * 1024, // 1MB minimum before uploading
  targetFileSize: 2 * 1024 * 1024, // 2MB target for good chunking
  maxPendingFiles: 5, // Max pending files before forced consolidation
};

// Dynamic thresholds for working memory
const THRESHOLDS = {
  withGemini: {
    maxSize: 2 * 1024 * 1024, // 2MB - larger for better context
    maxEntries: 100, // Archive older entries, keep recent
  },
  withoutGemini: {
    maxSize: 5 * 1024 * 1024, // 5MB - more local storage without Gemini
    maxEntries: 200,
  },
};

// Search index configuration
const MAX_KEYWORDS_PER_ENTRY = 30;
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'dare',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'and',
  'but',
  'if',
  'or',
  'because',
  'until',
  'while',
  'about',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'my',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'it',
  'its',
  'we',
  'us',
  'our',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'whom',
]);

export interface MemoryEntry {
  conversationId: string;
  title: string;
  timestamp: string;
  summary: string;
  topics: string[];
  keyFacts: string[];
}

export interface IndexEntry {
  id: string; // Unique ID for the entry
  conversationId: string;
  title: string;
  timestamp: string;
  keywords: string[]; // Extracted keywords for search
  byteOffset: number; // Position in the working memory file
  byteLength: number; // Length of the entry in bytes
}

export interface SearchIndex {
  version: number;
  lastUpdated: string;
  entries: IndexEntry[];
  // Inverted index: keyword -> entry IDs
  invertedIndex: Record<string, string[]>;
}

export interface LocalMemoryInfo {
  exists: boolean;
  size: number;
  entryCount: number;
  lastUpdated?: Date;
  archiveCount: number;
  pendingUploadCount: number;
  pendingUploadSize: number;
  hasGeminiKey: boolean;
  currentThreshold: {
    maxSize: number;
    maxEntries: number;
  };
  rollingWindow: {
    keepRecentEntries: number;
    archiveAfterEntries: number;
  };
  geminiUpload: {
    minFileSize: number;
    targetFileSize: number;
  };
}

// ============================================================================
// Path Utilities
// ============================================================================

function getUserMemoryDir(userId: string): string {
  return path.join(MEMORY_BASE_DIR, userId);
}

async function ensureMemoryDir(userId: string): Promise<string> {
  const memoryDir = getUserMemoryDir(userId);
  try {
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.mkdir(path.join(memoryDir, ARCHIVE_DIR), { recursive: true });
    await fs.mkdir(path.join(memoryDir, PENDING_UPLOAD_DIR), { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      console.error('[LocalMemory] Failed to create directory:', error);
    }
  }
  return memoryDir;
}

function getPendingUploadDir(userId: string): string {
  return path.join(getUserMemoryDir(userId), PENDING_UPLOAD_DIR);
}

function getWorkingMemoryPath(userId: string): string {
  return path.join(getUserMemoryDir(userId), WORKING_MEMORY_FILENAME);
}

function getSearchIndexPath(userId: string): string {
  return path.join(getUserMemoryDir(userId), SEARCH_INDEX_FILENAME);
}

// ============================================================================
// API Key Check
// ============================================================================

/**
 * Check if user has a Google API key configured
 */
export async function hasGoogleApiKey(userId: string): Promise<boolean> {
  try {
    const key = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.userId, userId), eq(apiKeys.provider, 'google')),
    });
    return !!key;
  } catch {
    return false;
  }
}

/**
 * Get the user's Google API key (decrypted)
 */
async function getGoogleApiKey(userId: string): Promise<string | null> {
  try {
    const { getUserApiKey } = await import('@/lib/ai/get-user-keys');
    return await getUserApiKey(userId, 'google');
  } catch (error) {
    console.error('[LocalMemory] Failed to get Google API key:', error);
    return null;
  }
}

/**
 * Get thresholds based on whether user has Google API key
 */
export async function getThresholds(userId: string): Promise<typeof THRESHOLDS.withGemini> {
  const hasKey = await hasGoogleApiKey(userId);
  return hasKey ? THRESHOLDS.withGemini : THRESHOLDS.withoutGemini;
}

// ============================================================================
// Search Index Operations
// ============================================================================

/**
 * Extract keywords from text for indexing
 */
function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Count word frequencies
  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  // Sort by frequency and take top keywords
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KEYWORDS_PER_ENTRY)
    .map(([word]) => word);
}

/**
 * Load the search index
 */
async function loadSearchIndex(userId: string): Promise<SearchIndex> {
  try {
    const indexPath = getSearchIndexPath(userId);
    const content = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      entries: [],
      invertedIndex: {},
    };
  }
}

/**
 * Save the search index
 */
async function saveSearchIndex(userId: string, index: SearchIndex): Promise<void> {
  await ensureMemoryDir(userId);
  const indexPath = getSearchIndexPath(userId);
  index.lastUpdated = new Date().toISOString();
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Add an entry to the search index
 */
async function addToSearchIndex(
  userId: string,
  entry: MemoryEntry,
  byteOffset: number,
  byteLength: number
): Promise<void> {
  const index = await loadSearchIndex(userId);

  // Generate unique ID
  const id = `${entry.conversationId}-${Date.now()}`;

  // Extract keywords from all text content
  const allText = [entry.title, entry.summary, ...entry.topics, ...entry.keyFacts].join(' ');

  const keywords = extractKeywords(allText);

  // Create index entry
  const indexEntry: IndexEntry = {
    id,
    conversationId: entry.conversationId,
    title: entry.title,
    timestamp: entry.timestamp,
    keywords,
    byteOffset,
    byteLength,
  };

  index.entries.push(indexEntry);

  // Update inverted index
  for (const keyword of keywords) {
    if (!index.invertedIndex[keyword]) {
      index.invertedIndex[keyword] = [];
    }
    index.invertedIndex[keyword].push(id);
  }

  await saveSearchIndex(userId, index);
}

/**
 * Clear the search index (after archiving)
 */
async function clearSearchIndex(userId: string): Promise<void> {
  const emptyIndex: SearchIndex = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    entries: [],
    invertedIndex: {},
  };
  await saveSearchIndex(userId, emptyIndex);
}

// ============================================================================
// Memory File Operations
// ============================================================================

/**
 * Read the current working memory
 */
export async function readWorkingMemory(userId: string): Promise<string> {
  try {
    const memoryPath = getWorkingMemoryPath(userId);
    const content = await fs.readFile(memoryPath, 'utf-8');
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    console.error('[LocalMemory] Failed to read working memory:', error);
    return '';
  }
}

/**
 * Get memory entries as a list for UI display
 */
export async function getMemoryEntries(userId: string): Promise<{
  entries: Array<{
    id: string;
    conversationId: string;
    title: string;
    timestamp: string;
    summary: string;
  }>;
  totalSize: number;
  entryCount: number;
}> {
  try {
    const index = await loadSearchIndex(userId);
    const workingPath = getWorkingMemoryPath(userId);

    let totalSize = 0;
    try {
      const stats = await fs.stat(workingPath);
      totalSize = stats.size;
    } catch {
      // File doesn't exist
    }

    // Read and parse entries for display
    const entries: Array<{
      id: string;
      conversationId: string;
      title: string;
      timestamp: string;
      summary: string;
    }> = [];

    for (const indexEntry of index.entries.slice(-50)) {
      // Last 50 entries
      try {
        const content = await readEntryByOffset(
          userId,
          indexEntry.byteOffset,
          indexEntry.byteLength
        );

        // Extract summary from the markdown content
        const summaryMatch = content.match(/## Summary\n([\s\S]*?)(?=\n## |$)/);
        const summary = summaryMatch ? summaryMatch[1].trim().slice(0, 200) : '';

        entries.push({
          id: indexEntry.id,
          conversationId: indexEntry.conversationId,
          title: indexEntry.title,
          timestamp: indexEntry.timestamp,
          summary,
        });
      } catch {
        // Skip invalid entries
      }
    }

    // Return in reverse chronological order
    return {
      entries: entries.reverse(),
      totalSize,
      entryCount: index.entries.length,
    };
  } catch (error) {
    console.error('[LocalMemory] Failed to get memory entries:', error);
    return { entries: [], totalSize: 0, entryCount: 0 };
  }
}

/**
 * Read a specific entry from the working memory by byte offset
 */
async function readEntryByOffset(
  userId: string,
  byteOffset: number,
  byteLength: number
): Promise<string> {
  try {
    const memoryPath = getWorkingMemoryPath(userId);
    const handle = await fs.open(memoryPath, 'r');
    const buffer = Buffer.alloc(byteLength);
    await handle.read(buffer, 0, byteLength, byteOffset);
    await handle.close();
    return buffer.toString('utf-8');
  } catch (error) {
    console.error('[LocalMemory] Failed to read entry by offset:', error);
    return '';
  }
}

/**
 * Get info about local memory
 */
export async function getLocalMemoryInfo(userId: string): Promise<LocalMemoryInfo> {
  try {
    const memoryDir = getUserMemoryDir(userId);
    const workingPath = getWorkingMemoryPath(userId);
    const hasGeminiKey = await hasGoogleApiKey(userId);
    const currentThreshold = hasGeminiKey ? THRESHOLDS.withGemini : THRESHOLDS.withoutGemini;

    let exists = false;
    let size = 0;
    let entryCount = 0;
    let lastUpdated: Date | undefined;

    try {
      const stats = await fs.stat(workingPath);
      exists = true;
      size = stats.size;
      lastUpdated = stats.mtime;

      // Get entry count from index (faster than parsing file)
      const index = await loadSearchIndex(userId);
      entryCount = index.entries.length;
    } catch {
      // File doesn't exist
    }

    // Count archive files
    let archiveCount = 0;
    try {
      const archiveDir = path.join(memoryDir, ARCHIVE_DIR);
      const files = await fs.readdir(archiveDir);
      archiveCount = files.filter((f) => f.endsWith('.md')).length;
    } catch {
      // Archive doesn't exist
    }

    // Count pending upload files and size
    let pendingUploadCount = 0;
    let pendingUploadSize = 0;
    try {
      const pendingDir = getPendingUploadDir(userId);
      const files = await fs.readdir(pendingDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));
      pendingUploadCount = mdFiles.length;

      for (const file of mdFiles) {
        const stats = await fs.stat(path.join(pendingDir, file));
        pendingUploadSize += stats.size;
      }
    } catch {
      // Pending directory doesn't exist
    }

    return {
      exists,
      size,
      entryCount,
      lastUpdated,
      archiveCount,
      pendingUploadCount,
      pendingUploadSize,
      hasGeminiKey,
      currentThreshold,
      rollingWindow: ROLLING_WINDOW,
      geminiUpload: {
        minFileSize: GEMINI_UPLOAD.minFileSize,
        targetFileSize: GEMINI_UPLOAD.targetFileSize,
      },
    };
  } catch (error) {
    console.error('[LocalMemory] Failed to get memory info:', error);
    return {
      exists: false,
      size: 0,
      entryCount: 0,
      archiveCount: 0,
      pendingUploadCount: 0,
      pendingUploadSize: 0,
      hasGeminiKey: false,
      currentThreshold: THRESHOLDS.withoutGemini,
      rollingWindow: ROLLING_WINDOW,
      geminiUpload: {
        minFileSize: GEMINI_UPLOAD.minFileSize,
        targetFileSize: GEMINI_UPLOAD.targetFileSize,
      },
    };
  }
}

/**
 * Format a memory entry as markdown
 */
function formatMemoryEntry(entry: MemoryEntry): string {
  const date = new Date(entry.timestamp);
  const formattedDate = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let markdown = `## ${entry.title}\n`;
  markdown += `*${formattedDate}* | ID: ${entry.conversationId.slice(0, 8)}\n\n`;

  if (entry.summary) {
    markdown += `${entry.summary}\n\n`;
  }

  if (entry.topics && entry.topics.length > 0) {
    markdown += `**Topics:** ${entry.topics.join(', ')}\n\n`;
  }

  if (entry.keyFacts && entry.keyFacts.length > 0) {
    markdown += `**Key Facts:**\n`;
    for (const fact of entry.keyFacts) {
      markdown += `- ${fact}\n`;
    }
    markdown += '\n';
  }

  return markdown;
}

/**
 * Archive older entries while keeping recent ones in working memory (rolling window)
 * This ensures recent conversations are always locally available for quick retrieval
 */
async function archiveOlderEntries(userId: string): Promise<{
  archivedCount: number;
  pendingPath?: string;
}> {
  const index = await loadSearchIndex(userId);
  const workingPath = getWorkingMemoryPath(userId);

  if (index.entries.length <= ROLLING_WINDOW.keepRecentEntries) {
    return { archivedCount: 0 };
  }

  // Sort entries by timestamp (oldest first)
  const sortedEntries = [...index.entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Determine how many to archive (keep the most recent ones)
  const entriesToArchive = sortedEntries.slice(
    0,
    sortedEntries.length - ROLLING_WINDOW.keepRecentEntries
  );
  const entriesToKeep = sortedEntries.slice(
    sortedEntries.length - ROLLING_WINDOW.keepRecentEntries
  );

  if (entriesToArchive.length === 0) {
    return { archivedCount: 0 };
  }

  console.log(
    `[LocalMemory] Archiving ${entriesToArchive.length} older entries, keeping ${entriesToKeep.length} recent`
  );

  // Read the archived entries content
  const archivedContent: string[] = [];
  for (const entry of entriesToArchive) {
    const content = await readEntryByOffset(userId, entry.byteOffset, entry.byteLength);
    if (content) {
      archivedContent.push(content.trim());
    }
  }

  // Write archived entries to pending upload directory
  await ensureMemoryDir(userId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const pendingPath = path.join(getPendingUploadDir(userId), `batch_${timestamp}.md`);

  const archiveHeader = `# MaiaChat Memory Archive\n\nArchived: ${new Date().toISOString()}\nEntries: ${entriesToArchive.length}\n\n---\n\n`;
  const archiveContent = archiveHeader + archivedContent.join('\n\n---\n\n') + '\n';
  await fs.writeFile(pendingPath, archiveContent, 'utf-8');

  // Rebuild working memory with only the entries to keep
  const keptContent: string[] = [];
  for (const entry of entriesToKeep) {
    const content = await readEntryByOffset(userId, entry.byteOffset, entry.byteLength);
    if (content) {
      keptContent.push(content.trim());
    }
  }

  // Write new working memory
  const newWorkingContent =
    `# MaiaChat Memory Log\n\nThis file contains conversation summaries and important information.\n\n---\n\n` +
    keptContent.join('\n\n---\n\n') +
    (keptContent.length > 0 ? '\n\n---\n\n' : '');
  await fs.writeFile(workingPath, newWorkingContent, 'utf-8');

  // Rebuild the search index with only kept entries
  const newIndex: SearchIndex = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    entries: [],
    invertedIndex: {},
  };

  // Recalculate byte offsets for kept entries
  let currentOffset = Buffer.byteLength(
    `# MaiaChat Memory Log\n\nThis file contains conversation summaries and important information.\n\n---\n\n`,
    'utf-8'
  );

  for (let i = 0; i < entriesToKeep.length; i++) {
    const oldEntry = entriesToKeep[i];
    const content = keptContent[i];
    const byteLength = Buffer.byteLength(content, 'utf-8');

    const newEntry: IndexEntry = {
      ...oldEntry,
      byteOffset: currentOffset,
      byteLength,
    };
    newIndex.entries.push(newEntry);

    // Update inverted index
    for (const keyword of oldEntry.keywords) {
      if (!newIndex.invertedIndex[keyword]) {
        newIndex.invertedIndex[keyword] = [];
      }
      newIndex.invertedIndex[keyword].push(oldEntry.id);
    }

    currentOffset += byteLength + Buffer.byteLength('\n\n---\n\n', 'utf-8');
  }

  await saveSearchIndex(userId, newIndex);

  console.log(`[LocalMemory] Archived ${entriesToArchive.length} entries to ${pendingPath}`);

  return { archivedCount: entriesToArchive.length, pendingPath };
}

/**
 * Consolidate pending archives and upload to Gemini when large enough
 */
async function consolidateAndUploadToGemini(userId: string): Promise<{
  uploadedToGemini: boolean;
  geminiDocumentName?: string;
  filesConsolidated: number;
  cleanedUpLocally: boolean;
}> {
  const pendingDir = getPendingUploadDir(userId);
  const archiveDir = path.join(getUserMemoryDir(userId), ARCHIVE_DIR);

  let files: string[] = [];
  try {
    files = (await fs.readdir(pendingDir)).filter((f) => f.endsWith('.md')).sort();
  } catch {
    return { uploadedToGemini: false, filesConsolidated: 0, cleanedUpLocally: false };
  }

  if (files.length === 0) {
    return { uploadedToGemini: false, filesConsolidated: 0, cleanedUpLocally: false };
  }

  // Calculate total size of pending files
  let totalSize = 0;
  const fileContents: { name: string; content: string; path: string }[] = [];

  for (const file of files) {
    const filePath = path.join(pendingDir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const size = Buffer.byteLength(content, 'utf-8');
    totalSize += size;
    fileContents.push({ name: file, content, path: filePath });
  }

  console.log(
    `[LocalMemory] Pending files: ${files.length}, total size: ${(totalSize / 1024).toFixed(1)}KB`
  );

  // Check if we should upload (either enough size or too many files)
  const shouldUpload =
    totalSize >= GEMINI_UPLOAD.minFileSize || files.length >= GEMINI_UPLOAD.maxPendingFiles;

  if (!shouldUpload) {
    console.log(
      `[LocalMemory] Not enough content for upload yet (need ${(GEMINI_UPLOAD.minFileSize / 1024).toFixed(0)}KB or ${GEMINI_UPLOAD.maxPendingFiles} files)`
    );
    return { uploadedToGemini: false, filesConsolidated: 0, cleanedUpLocally: false };
  }

  // Check for Google API key
  const googleApiKey = await getGoogleApiKey(userId);
  if (!googleApiKey) {
    console.log(`[LocalMemory] No Google API key - moving pending to local archive`);
    // Move to local archive instead
    for (const file of fileContents) {
      const archivePath = path.join(archiveDir, file.name);
      await fs.rename(file.path, archivePath);
    }
    return { uploadedToGemini: false, filesConsolidated: files.length, cleanedUpLocally: false };
  }

  // Consolidate all pending files into one
  const consolidatedContent = fileContents
    .map((f) => f.content)
    .join('\n\n' + '='.repeat(80) + '\n\n');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const consolidatedFilename = `consolidated_memory_${timestamp}.md`;

  console.log(
    `[LocalMemory] Consolidating ${files.length} files (${(totalSize / 1024).toFixed(1)}KB) for Gemini upload`
  );

  try {
    // Get or create user's memory store
    let storeName = await getUserMemoryStoreName(userId, googleApiKey);
    if (!storeName) {
      const store = await createGeminiStore(`MaiaChat-Memory-${userId.slice(0, 8)}`, googleApiKey);
      storeName = store.name;
      console.log(`[LocalMemory] Created new Gemini store: ${storeName}`);
    }

    // Upload the consolidated file
    const buffer = Buffer.from(consolidatedContent, 'utf-8');
    const doc = await uploadDocumentToStore(
      storeName,
      buffer,
      consolidatedFilename,
      'text/markdown',
      googleApiKey
    );

    if (doc) {
      console.log(`[LocalMemory] Successfully uploaded to Gemini: ${doc.name}`);

      // Delete all pending files after successful upload
      for (const file of fileContents) {
        try {
          await fs.unlink(file.path);
        } catch (err) {
          console.error(`[LocalMemory] Failed to delete ${file.path}:`, err);
        }
      }

      // Also clean up old local archives that were already uploaded
      await cleanupOldArchives(userId);

      return {
        uploadedToGemini: true,
        geminiDocumentName: doc.name,
        filesConsolidated: files.length,
        cleanedUpLocally: true,
      };
    }
  } catch (error) {
    console.error('[LocalMemory] Gemini upload failed:', error);
    // Move to local archive as fallback
    for (const file of fileContents) {
      const archivePath = path.join(archiveDir, file.name);
      await fs.rename(file.path, archivePath);
    }
  }

  return { uploadedToGemini: false, filesConsolidated: files.length, cleanedUpLocally: false };
}

/**
 * Clean up old local archives (keep only recent ones if Gemini upload succeeded)
 */
async function cleanupOldArchives(userId: string, keepCount: number = 3): Promise<number> {
  const archiveDir = path.join(getUserMemoryDir(userId), ARCHIVE_DIR);

  try {
    const files = await fs.readdir(archiveDir);
    const mdFiles = files
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse(); // Most recent first

    if (mdFiles.length <= keepCount) {
      return 0;
    }

    // Delete older files
    const filesToDelete = mdFiles.slice(keepCount);
    let deletedCount = 0;

    for (const file of filesToDelete) {
      try {
        await fs.unlink(path.join(archiveDir, file));
        deletedCount++;
      } catch (err) {
        console.error(`[LocalMemory] Failed to delete archive ${file}:`, err);
      }
    }

    if (deletedCount > 0) {
      console.log(`[LocalMemory] Cleaned up ${deletedCount} old local archives`);
    }

    return deletedCount;
  } catch {
    return 0;
  }
}

/**
 * Legacy function for compatibility - now uses rolling window approach
 */
async function archiveWorkingMemory(userId: string): Promise<{
  archivePath: string;
  uploadedToGemini: boolean;
  geminiDocumentName?: string;
}> {
  // Use new rolling window approach
  const archiveResult = await archiveOlderEntries(userId);

  let uploadedToGemini = false;
  let geminiDocumentName: string | undefined;

  if (archiveResult.pendingPath) {
    const uploadResult = await consolidateAndUploadToGemini(userId);
    uploadedToGemini = uploadResult.uploadedToGemini;
    geminiDocumentName = uploadResult.geminiDocumentName;
  }

  return {
    archivePath: archiveResult.pendingPath || '',
    uploadedToGemini,
    geminiDocumentName,
  };
}

/**
 * Get the user's Gemini memory store name
 */
async function getUserMemoryStoreName(userId: string, apiKey: string): Promise<string | null> {
  try {
    const response = await listGeminiStores(apiKey);
    const stores = response.fileSearchStores || [];
    const userStore = stores.find((s) =>
      s.displayName?.includes(`MaiaChat-Memory-${userId.slice(0, 8)}`)
    );
    return userStore?.name || null;
  } catch {
    return null;
  }
}

/**
 * Append a memory entry to the working memory file
 * Uses rolling window: keeps recent entries local, archives older ones
 */
export async function appendToWorkingMemory(
  userId: string,
  entry: MemoryEntry
): Promise<{
  archived: boolean;
  archivePath?: string;
  uploadedToGemini?: boolean;
  archivedCount?: number;
}> {
  await ensureMemoryDir(userId);
  const workingPath = getWorkingMemoryPath(userId);

  // Format the entry as markdown
  const markdown = formatMemoryEntry(entry);
  const entryBytes = Buffer.byteLength(markdown, 'utf-8');

  // Append to working memory first
  let existingContent = '';
  let byteOffset = 0;

  try {
    existingContent = await fs.readFile(workingPath, 'utf-8');
    byteOffset = Buffer.byteLength(existingContent, 'utf-8');
  } catch {
    // File doesn't exist, create with header
    existingContent = `# MaiaChat Memory Log\n\nThis file contains conversation summaries and important information.\n\n---\n\n`;
    byteOffset = Buffer.byteLength(existingContent, 'utf-8');
  }

  const newContent = existingContent + markdown + '\n---\n\n';
  await fs.writeFile(workingPath, newContent, 'utf-8');

  // Update search index
  await addToSearchIndex(userId, entry, byteOffset, entryBytes);

  console.log(`[LocalMemory] Appended memory for conversation ${entry.conversationId.slice(0, 8)}`);

  // Check if we should archive older entries (rolling window)
  const index = await loadSearchIndex(userId);
  let archived = false;
  let archivePath: string | undefined;
  let uploadedToGemini = false;
  let archivedCount = 0;

  if (index.entries.length > ROLLING_WINDOW.archiveAfterEntries) {
    console.log(
      `[LocalMemory] Entry count (${index.entries.length}) exceeds threshold (${ROLLING_WINDOW.archiveAfterEntries}), archiving older entries`
    );

    // Archive older entries while keeping recent ones
    const archiveResult = await archiveOlderEntries(userId);
    archivedCount = archiveResult.archivedCount;
    archivePath = archiveResult.pendingPath;
    archived = archivedCount > 0;

    // Try to consolidate and upload to Gemini
    if (archived) {
      const uploadResult = await consolidateAndUploadToGemini(userId);
      uploadedToGemini = uploadResult.uploadedToGemini;

      if (uploadResult.uploadedToGemini) {
        console.log(`[LocalMemory] Successfully uploaded consolidated memory to Gemini`);
      }
    }
  }

  return { archived, archivePath, uploadedToGemini, archivedCount };
}

// ============================================================================
// Search Operations (Local RAG)
// ============================================================================

/**
 * Search local memory using the index (efficient - doesn't load entire file)
 * Uses BM25-like scoring for relevance
 */
export async function searchLocalMemory(
  userId: string,
  query: string,
  maxResults: number = 5
): Promise<string[]> {
  try {
    const index = await loadSearchIndex(userId);
    if (index.entries.length === 0) return [];

    // Extract query keywords
    const queryKeywords = extractKeywords(query);
    if (queryKeywords.length === 0) return [];

    // Score each entry using inverted index
    const scores: Record<string, number> = {};

    for (const keyword of queryKeywords) {
      const matchingEntryIds = index.invertedIndex[keyword] || [];
      for (const entryId of matchingEntryIds) {
        // BM25-like scoring: IDF * TF
        const idf = Math.log(
          (index.entries.length - matchingEntryIds.length + 0.5) / (matchingEntryIds.length + 0.5) +
            1
        );
        scores[entryId] = (scores[entryId] || 0) + idf;
      }
    }

    // Sort by score and get top results
    const sortedEntries = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults);

    // Retrieve the actual content for matching entries
    const results: string[] = [];
    for (const [entryId] of sortedEntries) {
      const entry = index.entries.find((e) => e.id === entryId);
      if (entry) {
        const content = await readEntryByOffset(userId, entry.byteOffset, entry.byteLength);
        if (content) {
          results.push(content.trim());
        }
      }
    }

    return results;
  } catch (error) {
    console.error('[LocalMemory] Search failed:', error);
    return [];
  }
}

/**
 * Search across all archives as well (for comprehensive search)
 */
export async function searchAllLocalMemory(
  userId: string,
  query: string,
  maxResults: number = 10
): Promise<string[]> {
  const results: string[] = [];

  // First search current working memory
  const workingResults = await searchLocalMemory(userId, query, maxResults);
  results.push(...workingResults);

  // Then search archives if we need more results
  if (results.length < maxResults) {
    try {
      const archiveDir = path.join(getUserMemoryDir(userId), ARCHIVE_DIR);
      const files = await fs.readdir(archiveDir);
      const mdFiles = files
        .filter((f) => f.endsWith('.md'))
        .sort()
        .reverse(); // Most recent first

      const queryKeywords = extractKeywords(query);

      for (const file of mdFiles) {
        if (results.length >= maxResults) break;

        const filePath = path.join(archiveDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const entries = content.split(/^---$/m).filter((e) => e.trim());

        for (const entry of entries) {
          if (results.length >= maxResults) break;

          const entryLower = entry.toLowerCase();
          const matchCount = queryKeywords.filter((kw) => entryLower.includes(kw)).length;

          if (matchCount > 0) {
            results.push(entry.trim());
          }
        }
      }
    } catch {
      // No archives or error reading them
    }
  }

  return results.slice(0, maxResults);
}

/**
 * Get recent memory context using search instead of reading entire file
 * This is the recommended method for getting context - uses RAG approach
 */
export async function getLocalMemoryContext(
  userId: string,
  query: string = '',
  maxChars: number = 4000
): Promise<string> {
  try {
    const index = await loadSearchIndex(userId);

    if (index.entries.length === 0) {
      return '';
    }

    let entries: string[] = [];

    if (query) {
      // If query provided, search for relevant entries
      entries = await searchLocalMemory(userId, query, 10);
    } else {
      // If no query, get most recent entries
      const recentEntries = index.entries
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);

      for (const entry of recentEntries) {
        const content = await readEntryByOffset(userId, entry.byteOffset, entry.byteLength);
        if (content) {
          entries.push(content.trim());
        }
      }
    }

    // Build context within character limit
    let context = '';
    for (const entry of entries) {
      if (context.length + entry.length + 10 > maxChars) {
        break;
      }
      context += entry + '\n---\n';
    }

    return context.trim();
  } catch (error) {
    console.error('[LocalMemory] Failed to get memory context:', error);
    return '';
  }
}

/**
 * Clear all local memory for a user
 */
export async function clearLocalMemory(userId: string): Promise<void> {
  try {
    const memoryDir = getUserMemoryDir(userId);
    await fs.rm(memoryDir, { recursive: true, force: true });
    console.log(`[LocalMemory] Cleared memory for user ${userId.slice(0, 8)}`);
  } catch (error) {
    console.error('[LocalMemory] Failed to clear memory:', error);
    throw error;
  }
}

/**
 * Get all archived memory files for a user
 */
export async function listArchivedMemories(
  userId: string
): Promise<{ filename: string; size: number; created: Date; uploadedToGemini?: boolean }[]> {
  try {
    const archiveDir = path.join(getUserMemoryDir(userId), ARCHIVE_DIR);
    const files = await fs.readdir(archiveDir);

    const results = await Promise.all(
      files
        .filter((f) => f.endsWith('.md'))
        .map(async (filename) => {
          const filePath = path.join(archiveDir, filename);
          const stats = await fs.stat(filePath);
          return {
            filename,
            size: stats.size,
            created: stats.birthtime,
          };
        })
    );

    return results.sort((a, b) => b.created.getTime() - a.created.getTime());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.error('[LocalMemory] Failed to list archives:', error);
    return [];
  }
}

/**
 * Force upload current working memory to Gemini (manual trigger)
 * Also consolidates any pending uploads
 */
export async function forceUploadToGemini(userId: string): Promise<{
  success: boolean;
  message: string;
  documentName?: string;
  archivedCount?: number;
}> {
  const googleApiKey = await getGoogleApiKey(userId);
  if (!googleApiKey) {
    return { success: false, message: 'No Google API key configured' };
  }

  try {
    // First, archive older entries from working memory to pending
    const index = await loadSearchIndex(userId);
    let archivedCount = 0;

    if (index.entries.length > ROLLING_WINDOW.keepRecentEntries) {
      const archiveResult = await archiveOlderEntries(userId);
      archivedCount = archiveResult.archivedCount;
    }

    // Check pending uploads
    const pendingDir = getPendingUploadDir(userId);
    let pendingFiles: string[] = [];
    try {
      pendingFiles = (await fs.readdir(pendingDir)).filter((f) => f.endsWith('.md'));
    } catch {
      // No pending directory
    }

    // If no pending files but we have working memory content, add it to pending
    if (pendingFiles.length === 0 && archivedCount === 0) {
      const workingPath = getWorkingMemoryPath(userId);
      try {
        const content = await fs.readFile(workingPath, 'utf-8');
        if (content && content.length > 100) {
          // Copy working memory to pending (don't move - keep local copy)
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const pendingPath = path.join(pendingDir, `manual_${timestamp}.md`);
          await ensureMemoryDir(userId);
          await fs.writeFile(pendingPath, content, 'utf-8');
          pendingFiles = [path.basename(pendingPath)];
        } else {
          return { success: false, message: 'Not enough content to upload' };
        }
      } catch {
        return { success: false, message: 'No memory content to upload' };
      }
    }

    // Force consolidation and upload (ignore size thresholds)
    let totalContent = '';
    const filesToDelete: string[] = [];

    for (const file of pendingFiles) {
      const filePath = path.join(pendingDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      totalContent += content + '\n\n' + '='.repeat(80) + '\n\n';
      filesToDelete.push(filePath);
    }

    if (!totalContent.trim()) {
      return { success: false, message: 'No content to upload' };
    }

    // Get or create store
    let storeName = await getUserMemoryStoreName(userId, googleApiKey);
    if (!storeName) {
      const store = await createGeminiStore(`MaiaChat-Memory-${userId.slice(0, 8)}`, googleApiKey);
      storeName = store.name;
    }

    // Upload
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const buffer = Buffer.from(totalContent, 'utf-8');
    const doc = await uploadDocumentToStore(
      storeName,
      buffer,
      `memory_manual_${timestamp}.md`,
      'text/markdown',
      googleApiKey
    );

    if (doc) {
      // Clean up pending files
      for (const filePath of filesToDelete) {
        try {
          await fs.unlink(filePath);
        } catch {
          // Ignore cleanup errors
        }
      }

      // Clean up old archives
      await cleanupOldArchives(userId);

      return {
        success: true,
        message: `Memory uploaded to Gemini successfully (${pendingFiles.length} files consolidated, ${(Buffer.byteLength(totalContent) / 1024).toFixed(1)}KB)`,
        documentName: doc.name,
        archivedCount,
      };
    }

    return { success: false, message: 'Upload completed but no document returned' };
  } catch (error) {
    console.error('[LocalMemory] Force upload failed:', error);
    return { success: false, message: `Upload failed: ${error}` };
  }
}
