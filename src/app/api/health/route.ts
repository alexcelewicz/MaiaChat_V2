import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { sql } from "drizzle-orm";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    s3: ServiceHealth;
  };
}

interface ServiceHealth {
  status: "up" | "down" | "degraded";
  latency?: number;
  error?: string;
}

const startTime = Date.now();

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return {
      status: "up",
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "down",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Database connection failed",
    };
  }
}

async function checkRedis(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const result = await redis.ping();
    if (result === "PONG") {
      return {
        status: "up",
        latency: Date.now() - start,
      };
    }
    return {
      status: "degraded",
      latency: Date.now() - start,
      error: "Unexpected ping response",
    };
  } catch (error) {
    return {
      status: "down",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Redis connection failed",
    };
  }
}

async function checkS3(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const s3Client = new S3Client({
      endpoint: `http${env.MINIO_USE_SSL ? "s" : ""}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
      region: "us-east-1",
      credentials: {
        accessKeyId: env.MINIO_ACCESS_KEY || "",
        secretAccessKey: env.MINIO_SECRET_KEY || "",
      },
      forcePathStyle: true,
    });

    await s3Client.send(
      new HeadBucketCommand({
        Bucket: env.MINIO_BUCKET || "maiachat",
      })
    );

    return {
      status: "up",
      latency: Date.now() - start,
    };
  } catch (error) {
    // If bucket doesn't exist but connection works, that's still "up"
    const errorMessage = error instanceof Error ? error.message : "S3 connection failed";
    if (errorMessage.includes("NotFound") || errorMessage.includes("NoSuchBucket")) {
      return {
        status: "degraded",
        latency: Date.now() - start,
        error: "Bucket not found",
      };
    }
    return {
      status: "down",
      latency: Date.now() - start,
      error: errorMessage,
    };
  }
}

function determineOverallStatus(services: HealthStatus["services"]): HealthStatus["status"] {
  const statuses = Object.values(services).map((s) => s.status);
  
  if (statuses.every((s) => s === "up")) {
    return "healthy";
  }
  
  // Database is critical
  if (services.database.status === "down") {
    return "unhealthy";
  }
  
  // If any service is down but database is up
  if (statuses.some((s) => s === "down")) {
    return "degraded";
  }
  
  return "degraded";
}

export async function GET() {
  const [database, redisHealth, s3] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkS3(),
  ]);

  const services = {
    database,
    redis: redisHealth,
    s3,
  };

  const health: HealthStatus = {
    status: determineOverallStatus(services),
    timestamp: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || "development",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    services,
  };

  // Return appropriate status code
  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}

// HEAD request for simple health checks (load balancers)
export async function HEAD() {
  try {
    await db.execute(sql`SELECT 1`);
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
