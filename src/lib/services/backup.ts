import { db } from "@/lib/db";
import { uploadFile, listFiles, downloadFile, deleteFile } from "@/lib/storage/s3";
import {
    users,
    conversations,
    messages,
    agents,
    profiles,
    crmContacts,
    crmInteractions,
    workflows,
    scheduledTasks,
} from "@/lib/db/schema";
import { gzipSync, gunzipSync } from "zlib";

// ============================================================================
// Types
// ============================================================================

export interface BackupResult {
    success: boolean;
    backupId: string;
    tables: string[];
    rowCounts: Record<string, number>;
    sizeBytes: number;
    target: string;
    createdAt: Date;
}

export interface BackupInfo {
    id: string;
    key: string;
    date: Date;
    sizeBytes: number;
    target: string;
}

export interface RestoreResult {
    success: boolean;
    tablesRestored: string[];
    rowCounts: Record<string, number>;
    warnings: string[];
}

// ============================================================================
// Table Registry
// ============================================================================

const BACKUP_TABLES = {
    users,
    conversations,
    messages,
    agents,
    profiles,
    crmContacts,
    crmInteractions,
    workflows,
    scheduledTasks,
} as const;

type BackupTableName = keyof typeof BACKUP_TABLES;

// ============================================================================
// Backup Functions
// ============================================================================

/**
 * Create a full backup of key database tables.
 * Exports data as gzipped JSON to S3 or local storage.
 */
export async function createBackup(
    target: "s3" | "local" = "s3"
): Promise<BackupResult> {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const backupId = `backup-${timestamp}`;
    const key = `backups/${dateStr}/${timestamp}.json.gz`;

    const data: Record<string, unknown[]> = {};
    const rowCounts: Record<string, number> = {};
    const tableNames = Object.keys(BACKUP_TABLES) as BackupTableName[];

    // Export each table
    for (const tableName of tableNames) {
        const table = BACKUP_TABLES[tableName];
        const rows = await db.select().from(table);
        data[tableName] = rows;
        rowCounts[tableName] = rows.length;
    }

    // Serialize and compress
    const jsonStr = JSON.stringify({
        backupId,
        createdAt: now.toISOString(),
        tables: tableNames,
        data,
    });
    const compressed = gzipSync(Buffer.from(jsonStr, "utf-8"));

    if (target === "s3") {
        await uploadFile(key, compressed, {
            contentType: "application/gzip",
            metadata: { backupId, tables: tableNames.join(",") },
        });
    } else {
        // Local target: still upload to S3 under a "local/" prefix for consistency
        // In a real deployment this would write to disk; here we keep S3 as storage backend
        await uploadFile(`local/${key}`, compressed, {
            contentType: "application/gzip",
            metadata: { backupId, tables: tableNames.join(","), target: "local" },
        });
    }

    return {
        success: true,
        backupId,
        tables: tableNames,
        rowCounts,
        sizeBytes: compressed.length,
        target,
        createdAt: now,
    };
}

/**
 * List available backups from S3.
 */
export async function listBackups(): Promise<BackupInfo[]> {
    const files = await listFiles("backups/", 1000);

    return files
        .filter((f) => f.key.endsWith(".json.gz"))
        .map((f) => ({
            id: f.key.replace("backups/", "").replace(".json.gz", ""),
            key: f.key,
            date: f.lastModified ?? new Date(),
            sizeBytes: f.size ?? 0,
            target: "s3",
        }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Download a backup file by its ID (the S3 key minus prefix/suffix).
 */
export async function downloadBackup(backupId: string): Promise<Buffer> {
    // Find the matching key from listing
    const backups = await listBackups();
    const backup = backups.find((b) => b.id === backupId || b.key.includes(backupId));

    if (!backup) {
        throw new Error(`Backup not found: ${backupId}`);
    }

    return downloadFile(backup.key);
}

/**
 * Restore data from a backup. This is a DESTRUCTIVE operation --
 * it inserts rows into the database, potentially overwriting existing data.
 *
 * WARNING: Use with extreme caution. This will insert data into production tables.
 * Consider taking a fresh backup before restoring.
 */
export async function restoreBackup(
    backupId: string,
    tables?: string[]
): Promise<RestoreResult> {
    const warnings: string[] = [
        "WARNING: Restore is a destructive operation. Existing data may be overwritten by ON CONFLICT behavior.",
    ];

    // Download and decompress
    const compressed = await downloadBackup(backupId);
    const jsonStr = gunzipSync(compressed).toString("utf-8");
    const payload = JSON.parse(jsonStr) as {
        backupId: string;
        createdAt: string;
        tables: string[];
        data: Record<string, unknown[]>;
    };

    const tablesToRestore = tables ?? payload.tables;
    const rowCounts: Record<string, number> = {};
    const tablesRestored: string[] = [];

    for (const tableName of tablesToRestore) {
        const rows = payload.data[tableName];
        if (!rows || rows.length === 0) {
            warnings.push(`Table "${tableName}" has no data in backup, skipping.`);
            continue;
        }

        const table = BACKUP_TABLES[tableName as BackupTableName];
        if (!table) {
            warnings.push(`Table "${tableName}" is not a recognized backup table, skipping.`);
            continue;
        }

        try {
            // Insert rows in batches of 100 to avoid query size limits
            const batchSize = 100;
            let inserted = 0;
            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);
                // Using onConflictDoNothing to avoid duplicate key errors
                await db
                    .insert(table)
                    .values(batch as Record<string, unknown>[])
                    .onConflictDoNothing();
                inserted += batch.length;
            }

            rowCounts[tableName] = inserted;
            tablesRestored.push(tableName);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            warnings.push(`Failed to restore table "${tableName}": ${msg}`);
        }
    }

    return {
        success: tablesRestored.length > 0,
        tablesRestored,
        rowCounts,
        warnings,
    };
}

/**
 * Keep only the last N backups, delete older ones.
 * Returns the number of backups deleted.
 */
export async function cleanupOldBackups(retentionCount: number): Promise<number> {
    const backups = await listBackups();

    if (backups.length <= retentionCount) {
        return 0;
    }

    // backups are sorted newest-first, so delete everything after retentionCount
    const toDelete = backups.slice(retentionCount);
    let deleted = 0;

    for (const backup of toDelete) {
        try {
            await deleteFile(backup.key);
            deleted++;
        } catch (error) {
            console.error(`[Backup] Failed to delete ${backup.key}:`, error);
        }
    }

    return deleted;
}

/**
 * Get current backup status: last backup time, count, total size.
 */
export async function getBackupStatus(): Promise<{
    lastBackupAt: Date | null;
    backupCount: number;
    totalSizeBytes: number;
}> {
    const backups = await listBackups();

    return {
        lastBackupAt: backups.length > 0 ? backups[0].date : null,
        backupCount: backups.length,
        totalSizeBytes: backups.reduce((sum, b) => sum + b.sizeBytes, 0),
    };
}
