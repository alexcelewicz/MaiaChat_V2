import { Cron } from "croner";

export function computeNextRunAt(
    cronExpression: string,
    timezone?: string,
    fromDate: Date = new Date()
): Date | null {
    try {
        const cron = new Cron(cronExpression, {
            timezone: timezone?.trim() || undefined,
            catch: false,
        });
        const nextRun = cron.nextRun(fromDate);
        return nextRun ?? null;
    } catch (error) {
        console.error("[Scheduler] Invalid cron expression:", error);
        return null;
    }
}

export function isValidCronExpression(cronExpression: string, timezone?: string): boolean {
    return computeNextRunAt(cronExpression, timezone) !== null;
}
