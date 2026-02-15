import { scheduledTaskRunner, startScheduledTaskRunner } from "./index";

let started = false;
const nextPhase = process.env.NEXT_PHASE || "";
const lifecycleEvent = process.env.npm_lifecycle_event || "";
const argv = process.argv.join(" ");
const isBuildPhase =
    nextPhase.includes("build") ||
    lifecycleEvent === "build" ||
    (argv.includes("next") && argv.includes("build"));
const disableAutoStart =
    process.env.MAIACHAT_DISABLE_AUTOSTART === "1" ||
    process.env.MAIACHAT_DISABLE_SCHEDULER_BOOT === "1";

export function ensureSchedulerStarted(reason = "auto"): void {
    if (started || scheduledTaskRunner.isRunning()) return;
    if (typeof window !== "undefined") return;
    if (process.env.NEXT_RUNTIME === "edge") return;
    if (isBuildPhase || disableAutoStart) return;

    started = true;
    try {
        startScheduledTaskRunner();
        console.log(`[Scheduler] Auto-started (${reason})`);
    } catch (error) {
        console.error("[Scheduler] Failed to auto-start:", error);
        started = false;
    }
}

if (typeof window === "undefined" && process.env.NEXT_RUNTIME !== "edge" && !isBuildPhase && !disableAutoStart) {
    ensureSchedulerStarted("boot");
}
