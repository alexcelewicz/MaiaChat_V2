#!/usr/bin/env node
/**
 * Robust migration runner that executes SQL files in order
 * - Splits migrations on --> statement-breakpoint markers
 * - Handles "already exists" errors gracefully for idempotency
 * - Cleans up orphaned migration records for deleted files
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load dotenv only if available (not needed in Docker where env vars are set by container)
try {
    const dotenv = require('dotenv');
    const envLocalPath = path.join(process.cwd(), '.env.local');
    const envPath = path.join(process.cwd(), '.env');
    dotenv.config({ path: envLocalPath });
    dotenv.config({ path: envPath });
} catch (e) {
    // dotenv not available - assuming environment variables are already set
}

// Errors that indicate something already exists (safe to ignore for idempotency)
const IGNORABLE_ERROR_PATTERNS = [
    /already exists/i,
    /duplicate key/i,
    /relation .* already exists/i,
    /column .* of relation .* already exists/i,
    /column .* does not exist/i,
    /relation .* does not exist/i,
    /constraint .* does not exist/i,
    /index .* does not exist/i,
    /constraint .* already exists/i,
    /index .* already exists/i,
];

function isIgnorableError(err) {
    const message = err.message || '';
    return IGNORABLE_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

function splitStatements(sql) {
    // Split on --> statement-breakpoint markers (drizzle convention)
    const parts = sql.split(/-->\s*statement-breakpoint\s*/);

    const statements = [];
    for (const part of parts) {
        // Strip leading comment lines (lines that are only comments)
        // but keep inline comments and comments within SQL
        const lines = part.split('\n');
        let startIndex = 0;

        // Skip leading lines that are pure comments or empty
        while (startIndex < lines.length) {
            const line = lines[startIndex].trim();
            if (line === '' || (line.startsWith('--') && !line.includes('CREATE') && !line.includes('ALTER') && !line.includes('DROP') && !line.includes('INSERT'))) {
                startIndex++;
            } else {
                break;
            }
        }

        // Join remaining lines
        const statement = lines.slice(startIndex).join('\n').trim();

        if (statement) {
            statements.push(statement);
        }
    }
    return statements;
}

async function runMigrations() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        console.error('DATABASE_URL environment variable is not set');
        process.exit(1);
    }

    const client = new Client({ connectionString: databaseUrl });

    try {
        await client.connect();
        console.log('Connected to database');

        // Create migrations tracking table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS __drizzle_migrations (
                id SERIAL PRIMARY KEY,
                hash TEXT NOT NULL UNIQUE,
                created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
            )
        `);

        // Read migration files from drizzle folder
        const migrationsDir = path.join(__dirname, 'drizzle');

        if (!fs.existsSync(migrationsDir)) {
            console.log('No migrations directory found, skipping migrations');
            return;
        }

        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        const fileHashes = new Set(files.map(f => f.replace('.sql', '')));

        // Get list of already applied migrations
        const { rows: appliedMigrations } = await client.query(
            'SELECT hash FROM __drizzle_migrations'
        );
        const appliedHashes = new Set(appliedMigrations.map(m => m.hash));

        // Clean up orphaned migration records (for deleted migration files)
        for (const appliedHash of appliedHashes) {
            if (!fileHashes.has(appliedHash)) {
                console.log(`Removing orphaned migration record: ${appliedHash}`);
                await client.query(
                    'DELETE FROM __drizzle_migrations WHERE hash = $1',
                    [appliedHash]
                );
            }
        }

        console.log(`Found ${files.length} migration files`);

        for (const file of files) {
            const hash = file.replace('.sql', '');

            if (appliedHashes.has(hash)) {
                console.log(`Skipping already applied: ${file}`);
                continue;
            }

            console.log(`Applying migration: ${file}`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
            const statements = splitStatements(sql);

            console.log(`  Found ${statements.length} statements`);

            await client.query('BEGIN');
            try {
                let successCount = 0;
                let skippedCount = 0;

                for (let i = 0; i < statements.length; i++) {
                    const statement = statements[i];
                    const savepointName = `sp_${i}`;

                    // Create a savepoint before each statement
                    // This allows us to recover from errors without aborting the whole transaction
                    await client.query(`SAVEPOINT ${savepointName}`);

                    try {
                        await client.query(statement);
                        // Release savepoint on success (optional, but good practice)
                        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
                        successCount++;
                    } catch (stmtErr) {
                        // Rollback to savepoint to clear the error state
                        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);

                        if (isIgnorableError(stmtErr)) {
                            console.log(`  Statement ${i + 1}: Skipped (already exists)`);
                            skippedCount++;
                        } else {
                            // Re-throw non-ignorable errors
                            console.error(`  Statement ${i + 1} failed:`, stmtErr.message);
                            throw stmtErr;
                        }
                    }
                }

                await client.query(
                    'INSERT INTO __drizzle_migrations (hash) VALUES ($1)',
                    [hash]
                );
                await client.query('COMMIT');
                console.log(`Applied: ${file} (${successCount} executed, ${skippedCount} skipped)`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`Failed to apply ${file}:`, err.message);
                throw err;
            }
        }

        console.log('All migrations completed successfully');
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigrations();
