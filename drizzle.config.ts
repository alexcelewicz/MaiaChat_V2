import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load .env.local for local development, production uses system env vars
dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
}

export default defineConfig({
    schema: "./src/lib/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
});
