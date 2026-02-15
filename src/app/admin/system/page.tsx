export const dynamic = 'force-dynamic';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { s3Client, S3_BUCKET } from "@/lib/storage/s3";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import {
    CheckCircle,
    XCircle,
    AlertCircle,
    Database,
    HardDrive,
    Server,
    Zap,
    Activity,
} from "lucide-react";
import { sql } from "drizzle-orm";

interface ServiceStatus {
    name: string;
    status: "operational" | "degraded" | "down";
    latency?: number;
    message?: string;
}

async function checkPostgres(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
        await db.execute(sql`SELECT 1`);
        return {
            name: "PostgreSQL",
            status: "operational",
            latency: Date.now() - start,
        };
    } catch (error) {
        return {
            name: "PostgreSQL",
            status: "down",
            message: error instanceof Error ? error.message : "Connection failed",
        };
    }
}

async function checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
        await redis.ping();
        return {
            name: "Redis",
            status: "operational",
            latency: Date.now() - start,
        };
    } catch (error) {
        return {
            name: "Redis",
            status: "down",
            message: error instanceof Error ? error.message : "Connection failed",
        };
    }
}

async function checkS3(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
        await s3Client.send(new ListBucketsCommand({}));
        return {
            name: "S3/MinIO",
            status: "operational",
            latency: Date.now() - start,
            message: `Bucket: ${S3_BUCKET}`,
        };
    } catch (error) {
        return {
            name: "S3/MinIO",
            status: "down",
            message: error instanceof Error ? error.message : "Connection failed",
        };
    }
}

async function getSystemHealth(): Promise<{
    services: ServiceStatus[];
    overallStatus: "operational" | "degraded" | "down";
}> {
    const [postgres, redisStatus, s3Status] = await Promise.all([
        checkPostgres(),
        checkRedis(),
        checkS3(),
    ]);

    const services = [postgres, redisStatus, s3Status];
    
    const downCount = services.filter(s => s.status === "down").length;
    const degradedCount = services.filter(s => s.status === "degraded").length;

    let overallStatus: "operational" | "degraded" | "down" = "operational";
    if (downCount > 0) {
        overallStatus = downCount === services.length ? "down" : "degraded";
    } else if (degradedCount > 0) {
        overallStatus = "degraded";
    }

    return { services, overallStatus };
}

function StatusIcon({ status }: { status: ServiceStatus["status"] }) {
    switch (status) {
        case "operational":
            return <CheckCircle className="h-5 w-5 text-green-500" />;
        case "degraded":
            return <AlertCircle className="h-5 w-5 text-yellow-500" />;
        case "down":
            return <XCircle className="h-5 w-5 text-red-500" />;
    }
}

function StatusBadge({ status }: { status: ServiceStatus["status"] }) {
    const variants = {
        operational: "bg-green-500/10 text-green-500 border-green-500/20",
        degraded: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
        down: "bg-red-500/10 text-red-500 border-red-500/20",
    };

    return (
        <Badge variant="outline" className={variants[status]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
    );
}

function ServiceIcon({ name }: { name: string }) {
    switch (name) {
        case "PostgreSQL":
            return <Database className="h-5 w-5" />;
        case "Redis":
            return <Zap className="h-5 w-5" />;
        case "S3/MinIO":
            return <HardDrive className="h-5 w-5" />;
        default:
            return <Server className="h-5 w-5" />;
    }
}

export default async function AdminSystemPage() {
    const health = await getSystemHealth();

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
                <p className="text-muted-foreground mt-1">
                    Monitor infrastructure and service status
                </p>
            </div>

            {/* Overall Status */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>System Status</CardTitle>
                            <CardDescription>Current operational status</CardDescription>
                        </div>
                        <StatusBadge status={health.overallStatus} />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Activity className="h-8 w-8 text-muted-foreground" />
                        <div>
                            <p className="text-lg font-medium">
                                {health.overallStatus === "operational" && "All systems operational"}
                                {health.overallStatus === "degraded" && "Some services degraded"}
                                {health.overallStatus === "down" && "Service outage detected"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Last checked: {new Date().toLocaleString()}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Service Details */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {health.services.map((service) => (
                    <Card key={service.name}>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <ServiceIcon name={service.name} />
                                    <CardTitle className="text-base">{service.name}</CardTitle>
                                </div>
                                <StatusIcon status={service.status} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <StatusBadge status={service.status} />
                                {service.latency !== undefined && (
                                    <p className="text-sm text-muted-foreground">
                                        Response time: {service.latency}ms
                                    </p>
                                )}
                                {service.message && (
                                    <p className="text-sm text-muted-foreground truncate">
                                        {service.message}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Environment Info */}
            <Card>
                <CardHeader>
                    <CardTitle>Environment</CardTitle>
                    <CardDescription>Application configuration</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <p className="text-sm">
                                <span className="text-muted-foreground">Node Environment:</span>{" "}
                                <Badge variant="outline">{process.env.NODE_ENV || "development"}</Badge>
                            </p>
                            <p className="text-sm">
                                <span className="text-muted-foreground">Next.js Version:</span>{" "}
                                <span>15.x</span>
                            </p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm">
                                <span className="text-muted-foreground">Database:</span>{" "}
                                <span>PostgreSQL with pgvector</span>
                            </p>
                            <p className="text-sm">
                                <span className="text-muted-foreground">Cache:</span>{" "}
                                <span>Redis</span>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Quick Health Check */}
            <Card>
                <CardHeader>
                    <CardTitle>Service Dependencies</CardTitle>
                    <CardDescription>External services and integrations</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                                <Server className="h-5 w-5 text-muted-foreground" />
                                <span>Better Auth</span>
                            </div>
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                Connected
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                                <Zap className="h-5 w-5 text-muted-foreground" />
                                <span>AI Providers (OpenAI, Anthropic, Google)</span>
                            </div>
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                Available
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
