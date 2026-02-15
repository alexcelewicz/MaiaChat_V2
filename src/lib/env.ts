import "server-only";
import { z } from "zod";

// Check if we're in build mode (no runtime env vars available)
const isBuildTime = process.env.DOCKER === "true" && !process.env.DATABASE_URL;

const envSchema = z.object({
    // Database
    DATABASE_URL: isBuildTime
        ? z.string().default("postgresql://build:build@localhost:5432/build")
        : z.string().url(),

    // Redis
    REDIS_URL: isBuildTime
        ? z.string().default("redis://localhost:6379")
        : z.string().url(),

    // S3/MinIO Storage
    S3_ENDPOINT: z.string().optional(), // For MinIO: http://localhost:9000
    S3_REGION: z.string().default("us-east-1"),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_BUCKET: z.string().default("maiachat-documents"),

    // Legacy MinIO (kept for backward compatibility)
    MINIO_ENDPOINT: z.string().optional(),
    MINIO_PORT: z.string().transform(Number).optional(),
    MINIO_USE_SSL: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
    MINIO_ACCESS_KEY: z.string().optional(),
    MINIO_SECRET_KEY: z.string().optional(),
    MINIO_BUCKET: z.string().optional(),

    // Better Auth
    BETTER_AUTH_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // App
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Admin
    ADMIN_EMAILS: z.string().optional(),

    // Encryption
    ENCRYPTION_KEY: isBuildTime
        ? z.string().default("build-time-placeholder-key-32chars!")
        : z.string().min(32),

    // OpenAI (for embeddings)
    OPENAI_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
