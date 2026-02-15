import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Database optimization utilities
 */

/**
 * Analyze query performance
 */
export async function analyzeQuery(query: string): Promise<{
  plan: string;
  executionTime: number;
}> {
  const start = Date.now();
  const result = await db.execute(sql.raw(`EXPLAIN ANALYZE ${query}`));
  const executionTime = Date.now() - start;
  
  return {
    plan: JSON.stringify(result, null, 2),
    executionTime,
  };
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  tableStats: Array<{
    tableName: string;
    rowCount: number;
    totalSize: string;
    indexSize: string;
  }>;
  connectionStats: {
    active: number;
    idle: number;
    waiting: number;
  };
}> {
  // Table statistics
  const tableStatsQuery = sql`
    SELECT 
      relname as table_name,
      n_live_tup as row_count,
      pg_size_pretty(pg_total_relation_size(relid)) as total_size,
      pg_size_pretty(pg_indexes_size(relid)) as index_size
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC
  `;
  
  const tableStatsResult = await db.execute(tableStatsQuery);
  
  // Connection statistics
  const connStatsQuery = sql`
    SELECT 
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle,
      count(*) FILTER (WHERE wait_event IS NOT NULL) as waiting
    FROM pg_stat_activity
    WHERE datname = current_database()
  `;
  
  const connStatsResult = await db.execute(connStatsQuery);
  
  return {
    tableStats: (tableStatsResult as unknown as Array<{
      table_name: string;
      row_count: number;
      total_size: string;
      index_size: string;
    }>).map((row) => ({
      tableName: row.table_name,
      rowCount: Number(row.row_count),
      totalSize: row.total_size,
      indexSize: row.index_size,
    })),
    connectionStats: {
      active: Number((connStatsResult as unknown as Array<{ active: number }>)[0]?.active || 0),
      idle: Number((connStatsResult as unknown as Array<{ idle: number }>)[0]?.idle || 0),
      waiting: Number((connStatsResult as unknown as Array<{ waiting: number }>)[0]?.waiting || 0),
    },
  };
}

/**
 * Get slow queries from pg_stat_statements
 */
export async function getSlowQueries(
  limit: number = 10,
  minDuration: number = 100 // milliseconds
): Promise<Array<{
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  rows: number;
}>> {
  try {
    const result = await db.execute(sql`
      SELECT 
        query,
        calls,
        total_exec_time as total_time,
        mean_exec_time as mean_time,
        rows
      FROM pg_stat_statements
      WHERE mean_exec_time > ${minDuration}
      ORDER BY mean_exec_time DESC
      LIMIT ${limit}
    `);
    
    return (result as unknown as Array<{
      query: string;
      calls: number;
      total_time: number;
      mean_time: number;
      rows: number;
    }>).map((row) => ({
      query: row.query,
      calls: Number(row.calls),
      totalTime: Number(row.total_time),
      meanTime: Number(row.mean_time),
      rows: Number(row.rows),
    }));
  } catch {
    // pg_stat_statements might not be enabled
    console.warn("pg_stat_statements not available");
    return [];
  }
}

/**
 * Get index usage statistics
 */
export async function getIndexUsage(): Promise<Array<{
  tableName: string;
  indexName: string;
  indexScans: number;
  indexSize: string;
  isUnused: boolean;
}>> {
  const result = await db.execute(sql`
    SELECT 
      schemaname || '.' || relname as table_name,
      indexrelname as index_name,
      idx_scan as index_scans,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
      idx_scan = 0 as is_unused
    FROM pg_stat_user_indexes
    ORDER BY idx_scan ASC
  `);
  
  return (result as unknown as Array<{
    table_name: string;
    index_name: string;
    index_scans: number;
    index_size: string;
    is_unused: boolean;
  }>).map((row) => ({
    tableName: row.table_name,
    indexName: row.index_name,
    indexScans: Number(row.index_scans),
    indexSize: row.index_size,
    isUnused: row.is_unused,
  }));
}

/**
 * Vacuum and analyze tables
 */
export async function optimizeTables(
  tables?: string[]
): Promise<void> {
  if (tables && tables.length > 0) {
    for (const table of tables) {
      // Sanitize table name to prevent SQL injection
      const safeName = table.replace(/[^a-zA-Z0-9_]/g, "");
      await db.execute(sql.raw(`VACUUM ANALYZE ${safeName}`));
    }
  } else {
    await db.execute(sql`VACUUM ANALYZE`);
  }
}

/**
 * Check for missing indexes based on sequential scans
 */
export async function getMissingIndexSuggestions(): Promise<Array<{
  tableName: string;
  sequentialScans: number;
  sequentialRows: number;
  indexScans: number;
  suggestion: string;
}>> {
  const result = await db.execute(sql`
    SELECT 
      relname as table_name,
      seq_scan as sequential_scans,
      seq_tup_read as sequential_rows,
      idx_scan as index_scans,
      CASE 
        WHEN seq_scan > 0 AND (idx_scan IS NULL OR idx_scan = 0) 
        THEN 'Consider adding an index - table has ' || seq_scan || ' sequential scans'
        WHEN seq_scan > idx_scan * 10 
        THEN 'Review indexes - sequential scans (' || seq_scan || ') >> index scans (' || COALESCE(idx_scan, 0) || ')'
        ELSE 'Indexes appear adequate'
      END as suggestion
    FROM pg_stat_user_tables
    WHERE seq_scan > 100  -- Only tables with significant sequential scans
    ORDER BY seq_scan DESC
    LIMIT 20
  `);
  
  return (result as unknown as Array<{
    table_name: string;
    sequential_scans: number;
    sequential_rows: number;
    index_scans: number;
    suggestion: string;
  }>).map((row) => ({
    tableName: row.table_name,
    sequentialScans: Number(row.sequential_scans),
    sequentialRows: Number(row.sequential_rows),
    indexScans: Number(row.index_scans || 0),
    suggestion: row.suggestion,
  }));
}

/**
 * Get cache hit ratio
 */
export async function getCacheHitRatio(): Promise<{
  heapRead: number;
  heapHit: number;
  ratio: number;
  status: "excellent" | "good" | "needs_attention";
}> {
  const result = await db.execute(sql`
    SELECT 
      sum(heap_blks_read) as heap_read,
      sum(heap_blks_hit) as heap_hit,
      CASE 
        WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 0
        ELSE sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))::float
      END as ratio
    FROM pg_statio_user_tables
  `);
  
  const row = (result as unknown as Array<{
    heap_read: number;
    heap_hit: number;
    ratio: number;
  }>)[0];
  
  const ratio = Number(row?.ratio || 0);
  
  return {
    heapRead: Number(row?.heap_read || 0),
    heapHit: Number(row?.heap_hit || 0),
    ratio,
    status: ratio >= 0.99 ? "excellent" : ratio >= 0.95 ? "good" : "needs_attention",
  };
}

/**
 * Get database size
 */
export async function getDatabaseSize(): Promise<{
  totalSize: string;
  tablesSize: string;
  indexesSize: string;
}> {
  const result = await db.execute(sql`
    SELECT 
      pg_size_pretty(pg_database_size(current_database())) as total_size,
      pg_size_pretty(sum(pg_table_size(pg_class.oid))) as tables_size,
      pg_size_pretty(sum(pg_indexes_size(pg_class.oid))) as indexes_size
    FROM pg_class
    WHERE relkind = 'r' AND relnamespace = (
      SELECT oid FROM pg_namespace WHERE nspname = 'public'
    )
  `);
  
  const row = (result as unknown as Array<{
    total_size: string;
    tables_size: string;
    indexes_size: string;
  }>)[0];
  
  return {
    totalSize: row?.total_size || "0 bytes",
    tablesSize: row?.tables_size || "0 bytes",
    indexesSize: row?.indexes_size || "0 bytes",
  };
}
