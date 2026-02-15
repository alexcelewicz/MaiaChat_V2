import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { createBackup, cleanupOldBackups } from "@/lib/services/backup";
import { runHealthCheck, auditSystemPrompts } from "@/lib/services/self-audit";

const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const HEALTHCHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const AUDIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // weekly

let maintenanceTimers: NodeJS.Timeout[] = [];
let started = false;

function getBackupTarget(): "s3" | "local" {
    return process.env.MAIACHAT_BACKUP_TARGET === "local" ? "local" : "s3";
}

function getRetentionCount(): number {
    const parsed = Number(process.env.MAIACHAT_BACKUP_RETENTION || "10");
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 10;
    }
    return Math.min(Math.floor(parsed), 1000);
}

async function runScheduledBackup(): Promise<void> {
    try {
        const target = getBackupTarget();
        const retentionCount = getRetentionCount();
        const result = await createBackup(target);
        const deleted = await cleanupOldBackups(retentionCount);
        console.log(
            `[Maintenance] Automated backup complete (${target}): ${result.backupId}, cleanup deleted ${deleted} old backup(s)`
        );
    } catch (error) {
        console.error("[Maintenance] Automated backup failed:", error);
    }
}

async function runDailySystemHealthCheck(): Promise<void> {
    try {
        const result = await runHealthCheck();
        if (result.overall !== "healthy") {
            console.warn(
                `[Maintenance] Daily health check: ${result.overall}. Issues: ${result.checks
                    .filter((check) => check.status !== "ok")
                    .map((check) => `${check.name}=${check.status}`)
                    .join(", ")}`
            );
        } else {
            console.log("[Maintenance] Daily health check completed: healthy");
        }
    } catch (error) {
        console.error("[Maintenance] Daily health check failed:", error);
    }
}

async function runWeeklyPromptAudit(): Promise<void> {
    try {
        const [adminUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.role, "admin"))
            .limit(1);

        if (!adminUser?.id) {
            console.log("[Maintenance] Weekly audit skipped: no admin user found");
            return;
        }

        const apiKeys = await getUserApiKeys(adminUser.id);
        const result = await auditSystemPrompts(apiKeys as Record<string, string>);
        console.log(
            `[Maintenance] Weekly prompt audit completed: ${result.overallScore}/100 across ${result.agents.length} agent(s)`
        );
    } catch (error) {
        console.error("[Maintenance] Weekly prompt audit failed:", error);
    }
}

export function startMaintenanceService(): void {
    if (started) {
        return;
    }

    started = true;
    console.log("[Maintenance] Starting maintenance service");

    maintenanceTimers.push(setInterval(() => void runScheduledBackup(), BACKUP_INTERVAL_MS));
    maintenanceTimers.push(setInterval(() => void runDailySystemHealthCheck(), HEALTHCHECK_INTERVAL_MS));
    maintenanceTimers.push(setInterval(() => void runWeeklyPromptAudit(), AUDIT_INTERVAL_MS));
}

export function stopMaintenanceService(): void {
    if (!started) {
        return;
    }

    for (const timer of maintenanceTimers) {
        clearInterval(timer);
    }

    maintenanceTimers = [];
    started = false;
    console.log("[Maintenance] Maintenance service stopped");
}
