/**
 * MaiaChat Configuration Loader
 *
 * Unified configuration system with priority chain:
 * 1. config.json file (highest priority)
 * 2. Database settings
 * 3. Environment variables
 * 4. Default values (lowest priority)
 *
 * Supports:
 * - Import/export of configuration
 * - Runtime updates (persisted to DB)
 * - Environment variable overrides
 */

import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { adminSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
    maiaChatConfigSchema,
    validateConfig,
    getDefaultConfig,
    type MaiaChatConfigSchema,
} from "./schema";
import type {
    MaiaChatConfig,
    PartialMaiaChatConfig,
    ConfigSource,
    ConfigLoadResult,
} from "./types";

// ============================================================================
// Configuration Paths
// ============================================================================

const CONFIG_FILENAME = "config.json";
const DEFAULT_CONFIG_FILENAME = "default.json";

function getConfigDir(): string {
    // In development, use the config directory relative to the project
    // In production, use the current working directory
    return process.env.MAIACHAT_CONFIG_DIR || path.join(process.cwd(), "config");
}

function getConfigPath(): string {
    return path.join(getConfigDir(), CONFIG_FILENAME);
}

function getDefaultConfigPath(): string {
    return path.join(getConfigDir(), DEFAULT_CONFIG_FILENAME);
}

// ============================================================================
// Configuration Cache
// ============================================================================

let cachedConfig: MaiaChatConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5000; // 5 seconds

function isCacheValid(): boolean {
    return cachedConfig !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

function setCache(config: MaiaChatConfig): void {
    cachedConfig = config;
    cacheTimestamp = Date.now();
}

export function invalidateConfigCache(): void {
    cachedConfig = null;
    cacheTimestamp = 0;
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load configuration from file
 */
async function loadConfigFromFile(): Promise<Partial<MaiaChatConfig> | null> {
    try {
        const configPath = getConfigPath();
        const content = await fs.readFile(configPath, "utf-8");
        const parsed = JSON.parse(content);
        return parsed;
    } catch (error) {
        // File doesn't exist or is invalid - not an error, just no file config
        return null;
    }
}

/**
 * Load configuration from database (admin settings)
 */
async function loadConfigFromDatabase(): Promise<Partial<MaiaChatConfig> | null> {
    try {
        const [settings] = await db.select().from(adminSettings).limit(1);
        if (!settings) return null;

        // Map database fields to config structure
        return {
            tools: {
                localFileAccessEnabled: settings.localFileAccessEnabled ?? false,
                commandExecutionEnabled: settings.commandExecutionEnabled ?? false,
                fileAccessBaseDir: settings.fileAccessBaseDir ?? null,
                workspaceQuotaMb: 100, // Not stored in legacy DB table; configured via config system
            },
            memory: {
                autoSave: true,
                ragEnabled: true,
                userProfileMemoryEnabled: settings.userProfileMemoryEnabled ?? true,
                autoRecallEnabled: true,
                autoCaptureEnabled: true,
                geminiRetrievalModel: settings.geminiRetrievalModel ?? "gemini-3-flash-preview",
                memoryMaxChars: settings.memoryMaxChars ?? 4000,
            },
            channels: {
                autoStartOnBoot: settings.autoStartChannels ?? false,
                defaultContextMessages: 20, // Not in DB yet
                defaultMaxTokens: settings.defaultMaxTokens ?? 4096,
            },
            agents: {
                backgroundAgentEnabled: settings.backgroundAgentEnabled ?? false,
                backgroundAgentAutoStart: settings.backgroundAgentAutoStart ?? false,
                defaultModel: settings.defaultAgentModel ?? null,
                proactiveMessagingEnabled: settings.proactiveMessagingEnabled ?? false,
                eventTriggersEnabled: settings.eventTriggersEnabled ?? false,
                bootScriptsEnabled: settings.bootScriptsEnabled ?? false,
                heartbeatIntervalMs: 900000,
                staleThresholdMs: 2700000,
            },
            rateLimits: {
                proactiveMaxPerHour: settings.defaultProactiveMaxPerHour ?? 10,
                proactiveMaxPerDay: settings.defaultProactiveMaxPerDay ?? 100,
                triggerMaxPerHour: settings.defaultTriggerMaxPerHour ?? 60,
            },
            security: {
                ipFilteringEnabled: settings.ipFilteringEnabled ?? false,
                allowedIps: [],
                blockedIps: [],
            },
            general: {
                visitorRetentionDays: settings.visitorRetentionDays ?? 30,
                deploymentMode: process.env.MAIACHAT_LOCAL_MODE === "true"
                    ? "local"
                    : process.env.MAIACHAT_HOSTED === "true"
                        ? "hosted"
                        : "self-hosted",
            },
        };
    } catch (error) {
        console.error("[Config] Error loading from database:", error);
        return null;
    }
}

/**
 * Load configuration from environment variables
 */
function loadConfigFromEnv(): Partial<MaiaChatConfig> {
    const config: Partial<MaiaChatConfig> = {};

    // Task Execution
    if (process.env.MAIACHAT_TASK_MAX_ATTEMPTS) {
        config.taskExecution = {
            ...config.taskExecution,
            maxAttempts: parseInt(process.env.MAIACHAT_TASK_MAX_ATTEMPTS, 10),
        } as MaiaChatConfig["taskExecution"];
    }

    if (process.env.MAIACHAT_AGENT_HEARTBEAT_MS) {
        config.agents = {
            ...config.agents,
            heartbeatIntervalMs: parseInt(process.env.MAIACHAT_AGENT_HEARTBEAT_MS, 10),
        } as MaiaChatConfig["agents"];
    }

    if (process.env.MAIACHAT_AGENT_STALE_THRESHOLD_MS) {
        config.agents = {
            ...config.agents,
            staleThresholdMs: parseInt(process.env.MAIACHAT_AGENT_STALE_THRESHOLD_MS, 10),
        } as MaiaChatConfig["agents"];
    }

    // Tools
    if (process.env.MAIACHAT_LOCAL_MODE === "true") {
        config.tools = {
            localFileAccessEnabled: true,
            commandExecutionEnabled: true,
            fileAccessBaseDir: null,
            workspaceQuotaMb: config.tools?.workspaceQuotaMb ?? 100,
        };
    }

    // CLI
    if (process.env.MAIACHAT_CLI_ENABLED === "true") {
        config.cli = {
            ...config.cli,
            enabled: true,
        } as MaiaChatConfig["cli"];
    }

    if (process.env.MAIACHAT_CLI_DEFAULT) {
        config.cli = {
            ...config.cli,
            defaultCli: process.env.MAIACHAT_CLI_DEFAULT as "claude" | "gemini",
        } as MaiaChatConfig["cli"];
    }

    // General
    if (process.env.MAIACHAT_LOCAL_MODE === "true") {
        config.general = {
            ...config.general,
            deploymentMode: "local",
        } as MaiaChatConfig["general"];
    } else if (process.env.MAIACHAT_HOSTED === "true") {
        config.general = {
            ...config.general,
            deploymentMode: "hosted",
        } as MaiaChatConfig["general"];
    }

    return config;
}

/**
 * Deep merge configuration objects
 */
function deepMerge<T extends object>(base: T, overlay: Partial<T>): T {
    const result = { ...base };

    for (const key of Object.keys(overlay) as (keyof T)[]) {
        const overlayValue = overlay[key];
        if (overlayValue === undefined) continue;

        if (
            typeof overlayValue === "object" &&
            overlayValue !== null &&
            !Array.isArray(overlayValue) &&
            typeof result[key] === "object" &&
            result[key] !== null
        ) {
            result[key] = deepMerge(result[key] as object, overlayValue as object) as T[keyof T];
        } else {
            result[key] = overlayValue as T[keyof T];
        }
    }

    return result;
}

/**
 * Load the complete configuration with priority chain
 */
export async function loadConfig(): Promise<ConfigLoadResult> {
    const errors: string[] = [];
    const sources: Record<string, ConfigSource> = {};

    // Start with defaults
    let config = getDefaultConfig() as MaiaChatConfig;

    // Layer 1: Database settings (lowest priority after defaults)
    const dbConfig = await loadConfigFromDatabase();
        if (dbConfig) {
            config = deepMerge(config, dbConfig);
            // Track which settings came from DB
            if (dbConfig.tools) sources["tools"] = "database";
            if (dbConfig.memory) sources["memory"] = "database";
            if (dbConfig.agents) sources["agents"] = "database";
            if (dbConfig.rateLimits) sources["rateLimits"] = "database";
            if (dbConfig.security) sources["security"] = "database";
            if (dbConfig.general) sources["general"] = "database";
        }

    // Layer 2: Environment variables
    const envConfig = loadConfigFromEnv();
    config = deepMerge(config, envConfig);
    if (envConfig.tools) sources["tools"] = "env";
    if (envConfig.cli) sources["cli"] = "env";
    if (envConfig.general) sources["general"] = "env";

    // Layer 3: Config file (highest priority)
    const fileConfig = await loadConfigFromFile();
    if (fileConfig) {
        const validation = validateConfig(fileConfig);
        if (validation.success && validation.data) {
            config = deepMerge(config, validation.data);
            // Track file sources
            for (const key of Object.keys(fileConfig)) {
                sources[key] = "file";
            }
        } else if (validation.errors) {
            errors.push(`Config file validation errors: ${validation.errors.message}`);
        }
    }

    // Final validation
    const finalValidation = validateConfig(config);
    if (!finalValidation.success) {
        errors.push(`Final config validation failed: ${finalValidation.errors?.message}`);
        // Return default config on validation failure
        return {
            config: getDefaultConfig() as MaiaChatConfig,
            sources: {},
            errors,
        };
    }

    return {
        config: finalValidation.data as MaiaChatConfig,
        sources,
        errors,
    };
}

/**
 * Get the current configuration (with caching)
 */
export async function getConfig(): Promise<MaiaChatConfig> {
    if (isCacheValid() && cachedConfig) {
        return cachedConfig;
    }

    const result = await loadConfig();
    if (result.errors.length > 0) {
        console.warn("[Config] Errors loading config:", result.errors);
    }

    setCache(result.config);
    return result.config;
}

/**
 * Get a specific config section
 */
export async function getConfigSection<K extends keyof MaiaChatConfig>(
    section: K
): Promise<MaiaChatConfig[K]> {
    const config = await getConfig();
    return config[section];
}

// ============================================================================
// Configuration Updates
// ============================================================================

/**
 * Update configuration and persist to database
 */
export async function updateConfig(patch: PartialMaiaChatConfig): Promise<MaiaChatConfig> {
    const current = await getConfig();
    const updated = deepMerge(current, patch as Partial<MaiaChatConfig>);

    // Validate
    const validation = validateConfig(updated);
    if (!validation.success) {
        throw new Error(`Invalid config update: ${validation.errors?.message}`);
    }

    // Persist relevant settings to database
    await syncConfigToDatabase(updated);

    // Persist to file (Sherlock Fix: ensuring persistence beyond DB)
    const configPath = getConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(updated, null, 2), "utf-8");

    // Invalidate cache
    invalidateConfigCache();

    return updated;
}

/**
 * Sync configuration to database (admin settings)
 */
async function syncConfigToDatabase(config: MaiaChatConfig): Promise<void> {
    const [existing] = await db.select().from(adminSettings).limit(1);

        const dbValues = {
            autoStartChannels: config.channels.autoStartOnBoot,
            ipFilteringEnabled: config.security.ipFilteringEnabled,
            visitorRetentionDays: config.general.visitorRetentionDays,
            localFileAccessEnabled: config.tools.localFileAccessEnabled,
            commandExecutionEnabled: config.tools.commandExecutionEnabled,
            fileAccessBaseDir: config.tools.fileAccessBaseDir,
            backgroundAgentEnabled: config.agents.backgroundAgentEnabled,
            backgroundAgentAutoStart: config.agents.backgroundAgentAutoStart,
            defaultAgentModel: config.agents.defaultModel,
            proactiveMessagingEnabled: config.agents.proactiveMessagingEnabled,
            eventTriggersEnabled: config.agents.eventTriggersEnabled,
            bootScriptsEnabled: config.agents.bootScriptsEnabled,
            defaultProactiveMaxPerHour: config.rateLimits.proactiveMaxPerHour,
            defaultProactiveMaxPerDay: config.rateLimits.proactiveMaxPerDay,
            defaultTriggerMaxPerHour: config.rateLimits.triggerMaxPerHour,
            geminiRetrievalModel: config.memory.geminiRetrievalModel ?? "gemini-3-flash-preview",
            userProfileMemoryEnabled: config.memory.userProfileMemoryEnabled,
            memoryMaxChars: config.memory.memoryMaxChars ?? 4000,
            defaultMaxTokens: config.channels.defaultMaxTokens ?? 4096,
            updatedAt: new Date(),
        };

    if (existing) {
        await db.update(adminSettings).set(dbValues).where(eq(adminSettings.id, existing.id));
    } else {
        await db.insert(adminSettings).values(dbValues);
    }
}

// ============================================================================
// Configuration Export/Import
// ============================================================================

/**
 * Export configuration to JSON string
 */
export async function exportConfig(): Promise<string> {
    const config = await getConfig();
    return JSON.stringify(config, null, 2);
}

/**
 * Import configuration from JSON string
 */
export async function importConfig(jsonString: string): Promise<{
    success: boolean;
    config?: MaiaChatConfig;
    errors?: string[];
}> {
    try {
        const parsed = JSON.parse(jsonString);
        const validation = validateConfig(parsed);

        if (!validation.success) {
            return {
                success: false,
                errors: validation.errors?.issues.map((e) => `${e.path.map(String).join(".")}: ${e.message}`),
            };
        }

        // Save to config file
        const configPath = getConfigPath();
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(validation.data, null, 2));

        // Sync to database
        await syncConfigToDatabase(validation.data as MaiaChatConfig);

        // Invalidate cache
        invalidateConfigCache();

        return {
            success: true,
            config: validation.data as MaiaChatConfig,
        };
    } catch (error) {
        return {
            success: false,
            errors: [error instanceof Error ? error.message : "Unknown error parsing JSON"],
        };
    }
}

/**
 * Save current configuration to file
 */
export async function saveConfigToFile(): Promise<void> {
    const config = await getConfig();
    const configPath = getConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// ============================================================================
// Convenience Getters
// ============================================================================

/**
 * Get task execution config
 */
export async function getTaskExecutionConfig() {
    return getConfigSection("taskExecution");
}

/**
 * Get CLI config
 */
export async function getCliConfig() {
    return getConfigSection("cli");
}

/**
 * Get memory config
 */
export async function getMemoryConfig() {
    return getConfigSection("memory");
}

/**
 * Get tools config
 */
export async function getToolsConfig() {
    return getConfigSection("tools");
}

/**
 * Get notifications config
 */
export async function getNotificationsConfig() {
    return getConfigSection("notifications");
}
