import { db } from "@/lib/db";
import { adminSettings, users } from "@/lib/db/schema";
import { backgroundService } from "@/lib/channels/background-service";
import { eq } from "drizzle-orm";
import { getConfigSection } from "@/lib/config";
import { ensureWorkspaceDir } from "@/lib/tools/workspace-quota";

const DEFAULT_RETENTION_DAYS = 30;

export type AdminSettingsRecord = typeof adminSettings.$inferSelect;

export async function getAdminSettings(): Promise<AdminSettingsRecord> {
    const [settings] = await db.select().from(adminSettings).limit(1);
    if (settings) {
        return settings;
    }

    const [created] = await db.insert(adminSettings)
        .values({
            autoStartChannels: false,
            ipFilteringEnabled: false,
            visitorRetentionDays: DEFAULT_RETENTION_DAYS,
            localFileAccessEnabled: false,
            commandExecutionEnabled: false,
            fileAccessBaseDir: null,
            // Background Agent Settings (Phase G)
            backgroundAgentEnabled: false,
            backgroundAgentAutoStart: false,
            defaultAgentModel: null,
            proactiveMessagingEnabled: false,
            eventTriggersEnabled: false,
            bootScriptsEnabled: false,
            // Rate Limiting Defaults
            defaultProactiveMaxPerHour: 10,
            defaultProactiveMaxPerDay: 100,
            defaultTriggerMaxPerHour: 60,
        })
        .returning();

    return created;
}

export async function updateAdminSettings(patch: {
    autoStartChannels?: boolean;
    ipFilteringEnabled?: boolean;
    visitorRetentionDays?: number;
    localFileAccessEnabled?: boolean;
    commandExecutionEnabled?: boolean;
    fileAccessBaseDir?: string | null;
    // Background Agent Settings
    backgroundAgentEnabled?: boolean;
    backgroundAgentAutoStart?: boolean;
    defaultAgentModel?: string | null;
    proactiveMessagingEnabled?: boolean;
    eventTriggersEnabled?: boolean;
    bootScriptsEnabled?: boolean;
    // Rate Limiting Defaults
    defaultProactiveMaxPerHour?: number;
    defaultProactiveMaxPerDay?: number;
    defaultTriggerMaxPerHour?: number;
}): Promise<AdminSettingsRecord> {
    const current = await getAdminSettings();
    const retentionDays = typeof patch.visitorRetentionDays === "number"
        ? Math.max(DEFAULT_RETENTION_DAYS, Math.floor(patch.visitorRetentionDays))
        : current.visitorRetentionDays;

    const [updated] = await db.update(adminSettings)
        .set({
            autoStartChannels: patch.autoStartChannels ?? current.autoStartChannels,
            ipFilteringEnabled: patch.ipFilteringEnabled ?? current.ipFilteringEnabled,
            visitorRetentionDays: retentionDays,
            localFileAccessEnabled: patch.localFileAccessEnabled ?? current.localFileAccessEnabled,
            commandExecutionEnabled: patch.commandExecutionEnabled ?? current.commandExecutionEnabled,
            fileAccessBaseDir: patch.fileAccessBaseDir !== undefined ? patch.fileAccessBaseDir : current.fileAccessBaseDir,
            // Background Agent Settings
            backgroundAgentEnabled: patch.backgroundAgentEnabled ?? current.backgroundAgentEnabled,
            backgroundAgentAutoStart: patch.backgroundAgentAutoStart ?? current.backgroundAgentAutoStart,
            defaultAgentModel: patch.defaultAgentModel !== undefined ? patch.defaultAgentModel : current.defaultAgentModel,
            proactiveMessagingEnabled: patch.proactiveMessagingEnabled ?? current.proactiveMessagingEnabled,
            eventTriggersEnabled: patch.eventTriggersEnabled ?? current.eventTriggersEnabled,
            bootScriptsEnabled: patch.bootScriptsEnabled ?? current.bootScriptsEnabled,
            // Rate Limiting Defaults
            defaultProactiveMaxPerHour: patch.defaultProactiveMaxPerHour ?? current.defaultProactiveMaxPerHour,
            defaultProactiveMaxPerDay: patch.defaultProactiveMaxPerDay ?? current.defaultProactiveMaxPerDay,
            defaultTriggerMaxPerHour: patch.defaultTriggerMaxPerHour ?? current.defaultTriggerMaxPerHour,
            updatedAt: new Date(),
        })
        .where(eq(adminSettings.id, current.id))
        .returning();

    return updated ?? current;
}

/**
 * Get the local access settings for tool context injection.
 * This is the bridge between admin settings and the tool execution layer.
 */
export async function getLocalAccessContext(userId?: string): Promise<{
    localFileAccessEnabled: boolean;
    commandExecutionEnabled: boolean;
    fileAccessBaseDir: string | undefined;
    workspaceQuotaMb?: number;
    hostedSandbox?: boolean;
}> {
    return getLocalAccessContextForUser(userId);
}

type LocalAccessContext = {
    localFileAccessEnabled: boolean;
    commandExecutionEnabled: boolean;
    fileAccessBaseDir: string | undefined;
    workspaceQuotaMb?: number;
    hostedSandbox?: boolean;
};

const DISABLED_LOCAL_ACCESS: LocalAccessContext = {
    localFileAccessEnabled: false,
    commandExecutionEnabled: false,
    fileAccessBaseDir: undefined,
};

function isLocalAccessAllowlisted(preferences: unknown): boolean {
    if (!preferences || typeof preferences !== "object") return false;
    const prefs = preferences as Record<string, unknown>;
    const localAccess = prefs.localAccess;
    if (!localAccess || typeof localAccess !== "object") return false;
    return (localAccess as Record<string, unknown>).enabled === true;
}

function hasExplicitLocalAccessPreference(preferences: unknown): boolean {
    if (!preferences || typeof preferences !== "object") return false;
    const prefs = preferences as Record<string, unknown>;
    const localAccess = prefs.localAccess;
    if (!localAccess || typeof localAccess !== "object") return false;
    return Object.prototype.hasOwnProperty.call(localAccess, "enabled");
}

function withLocalAccessPreference(preferences: unknown, enabled: boolean): Record<string, unknown> {
    const nextPrefs = preferences && typeof preferences === "object"
        ? { ...(preferences as Record<string, unknown>) }
        : {};
    const existingLocalAccess = nextPrefs.localAccess && typeof nextPrefs.localAccess === "object"
        ? { ...(nextPrefs.localAccess as Record<string, unknown>) }
        : {};
    nextPrefs.localAccess = {
        ...existingLocalAccess,
        enabled,
    };
    return nextPrefs;
}

/**
 * Resolve local tool access for a specific user.
 *
 * Rules:
 * 1. Hosted deployment: always disabled
 * 2. MAIACHAT_LOCAL_MODE=true: always enabled (single-user local installs)
 * 3. Otherwise: user must be admin + explicitly allowlisted in preferences
 * 4. Global tool toggles still apply as master switches
 */
export async function getLocalAccessContextForUser(userId?: string): Promise<LocalAccessContext> {
    const toolsConfig = await getConfigSection("tools");
    const fileAccessBaseDir = toolsConfig.fileAccessBaseDir ?? undefined;

    if (getDeploymentMode() === "hosted") {
        // Hosted mode: sandbox each user to their own workspace directory
        // Tools are ENABLED but confined to /app/workspaces/{userId}/
        if (!userId) {
            return { ...DISABLED_LOCAL_ACCESS, fileAccessBaseDir };
        }

        const WORKSPACES_ROOT = "/app/workspaces";
        const userWorkspaceDir = `${WORKSPACES_ROOT}/${userId}`;

        // Auto-create workspace directory on first access
        try {
            await ensureWorkspaceDir(WORKSPACES_ROOT, userId);
        } catch (err) {
            console.error(`[AdminSettings] Failed to create workspace for user ${userId}:`, err);
            return { ...DISABLED_LOCAL_ACCESS, fileAccessBaseDir };
        }

        return {
            localFileAccessEnabled: true,
            commandExecutionEnabled: true,
            fileAccessBaseDir: userWorkspaceDir,
            workspaceQuotaMb: toolsConfig.workspaceQuotaMb ?? 100,
            hostedSandbox: true,
        };
    }

    if (process.env.MAIACHAT_LOCAL_MODE === "true") {
        return {
            localFileAccessEnabled: true,
            commandExecutionEnabled: true,
            fileAccessBaseDir,
        };
    }

    if (!userId) {
        return { ...DISABLED_LOCAL_ACCESS, fileAccessBaseDir };
    }

    const [user] = await db
        .select({
            role: users.role,
            preferences: users.preferences,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    const isAdmin = user?.role === "admin";
    const hasExplicitPreference = hasExplicitLocalAccessPreference(user?.preferences);
    let allowlisted = isLocalAccessAllowlisted(user?.preferences);

    // Backward compatibility for self-hosted upgrades:
    // if an admin had global local tools enabled before per-user allowlisting existed,
    // bootstrap their per-user localAccess.enabled flag automatically.
    if (
        isAdmin &&
        !allowlisted &&
        !hasExplicitPreference &&
        (toolsConfig.localFileAccessEnabled || toolsConfig.commandExecutionEnabled)
    ) {
        try {
            const nextPrefs = withLocalAccessPreference(user?.preferences, true);
            await db
                .update(users)
                .set({
                    preferences: nextPrefs,
                    updatedAt: new Date(),
                })
                .where(eq(users.id, userId));
            allowlisted = true;
            console.log(`[AdminSettings] Bootstrapped local access allowlist for admin user ${userId}`);
        } catch (error) {
            console.error(`[AdminSettings] Failed to bootstrap local access for user ${userId}:`, error);
        }
    }

    if (!isAdmin || !allowlisted) {
        return { ...DISABLED_LOCAL_ACCESS, fileAccessBaseDir };
    }

    return {
        localFileAccessEnabled: toolsConfig.localFileAccessEnabled,
        commandExecutionEnabled: toolsConfig.commandExecutionEnabled,
        fileAccessBaseDir,
    };
}

// ============================================================================
// Deployment Mode
// ============================================================================

export type DeploymentMode = "local" | "hosted" | "self-hosted";

export function getDeploymentMode(): DeploymentMode {
    if (process.env.MAIACHAT_LOCAL_MODE === "true") return "local";
    if (process.env.MAIACHAT_HOSTED === "true") return "hosted";
    return "self-hosted"; // default: full access like local
}

export function isLocalMode(): boolean {
    const mode = getDeploymentMode();
    return mode === "local" || mode === "self-hosted";
}

export async function maybeStartChannelsOnBoot(): Promise<void> {
    const settings = await getAdminSettings();
    if (settings.autoStartChannels) {
        await backgroundService.startAllChannels();
    }
}
