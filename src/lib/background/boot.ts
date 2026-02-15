import { initializeDaemon } from "./daemon";

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
    process.env.MAIACHAT_DISABLE_BACKGROUND_BOOT === "1";

export async function ensureBackgroundDaemonInitialized(reason = "auto"): Promise<void> {
    if (started) return;
    if (typeof window !== "undefined") return;
    if (process.env.NEXT_RUNTIME === "edge") return;
    if (isBuildPhase || disableAutoStart) return;

    started = true;
    try {
        await initializeDaemon();
        console.log(`[Daemon] Auto-initialized (${reason})`);
    } catch (error) {
        console.error("[Daemon] Failed to auto-initialize:", error);
        started = false;
    }
}

if (typeof window === "undefined" && process.env.NEXT_RUNTIME !== "edge" && !isBuildPhase && !disableAutoStart) {
    void ensureBackgroundDaemonInitialized("boot");
}
