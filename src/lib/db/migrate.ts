import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const main = async () => {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not defined");
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });
    console.log("Database URL:", process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@"));

    const db = drizzle(pool);

    console.log("⏳ Running migrations...");

    const start = Date.now();

    try {
        // Enable pgvector extension
        await pool.query("CREATE EXTENSION IF NOT EXISTS vector");

        await migrate(db, { migrationsFolder: "drizzle" });
        const end = Date.now();
        console.log(`✅ Migrations completed in ${end - start}ms`);
    } catch (err) {
        console.error("❌ Migration failed");
        console.error(err);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

main();
