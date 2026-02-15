/**
 * MaiaChat Configuration Schema
 *
 * Zod validation schema for the configuration system.
 * Ensures type safety and validates config files.
 */

import { z } from "zod";

export const taskExecutionSchema = z.object({
    maxAttempts: z.number().int().min(1).max(10).default(3),
    completionTimeout: z.number().int().min(5000).max(600000).default(60000),
    requireToolCallForScheduled: z.boolean().default(true),
});

export const notificationsSchema = z.object({
    failureNotifyOriginalChannel: z.boolean().default(true),
    failureNotifyTelegram: z.boolean().default(true),
    telegramUserId: z.string().nullable().default(null),
});

export const cliSchema = z.object({
    enabled: z.boolean().default(false),
    defaultCli: z.enum(["claude", "gemini"]).default("claude"),
    skipPermissions: z.boolean().default(true),
    workspaceRoot: z.string().default("./workspace"),
    organizeByTask: z.boolean().default(true),
});

export const toolsSchema = z.object({
    localFileAccessEnabled: z.boolean().default(false),
    commandExecutionEnabled: z.boolean().default(false),
    fileAccessBaseDir: z.string().nullable().default(null),
    workspaceQuotaMb: z.number().int().min(10).max(10000).default(100),
});

export const memorySchema = z.object({
    autoSave: z.boolean().default(true),
    ragEnabled: z.boolean().default(true),
    userProfileMemoryEnabled: z.boolean().default(true),
    autoRecallEnabled: z.boolean().default(true),
    autoCaptureEnabled: z.boolean().default(true),
    geminiRetrievalModel: z.string().nullable().default("gemini-3-flash-preview"),
    memoryMaxChars: z.number().int().min(500).max(32000).default(4000),
});

export const skillsSchema = z.object({
    clawdbotSkillsEnabled: z.boolean().default(true),
    clawdbotSourcePath: z.string().default("./clawdbot-source"),
    enabledSkills: z.array(z.string()).default([]),
});

export const googleIntegrationSchema = z.object({
    enabled: z.boolean().default(false),
    scopes: z.array(z.string()).default(["gmail.readonly", "gmail.send", "calendar.readonly"]),
});

export const hubspotIntegrationSchema = z.object({
    enabled: z.boolean().default(false),
});

export const asanaIntegrationSchema = z.object({
    enabled: z.boolean().default(false),
});

export const httpRequestSchema = z.object({
    enabled: z.boolean().default(false),
    allowedDomains: z.array(z.string()).default([]),
});

export const twitterSchema = z.object({
    enabled: z.boolean().default(false),
    tier1Enabled: z.boolean().default(true),
    tier2Enabled: z.boolean().default(true),
    tier3Enabled: z.boolean().default(true),
    tier4Enabled: z.boolean().default(false),
    fxTwitterEnabled: z.boolean().default(true),
    twitterApiIoKey: z.string().nullable().default(null),
    xApiBearerToken: z.string().nullable().default(null),
    xAiApiKey: z.string().nullable().default(null),
});

export const costSchema = z.object({
    costOptimizationEnabled: z.boolean().default(false),
    monthlyBudgetUsd: z.number().min(0).default(0), // 0 = unlimited
    preferCheaperFallback: z.boolean().default(false),
    alertAtPercentage: z.number().min(0).max(100).default(80),
});

export const integrationsSchema = z.object({
    google: googleIntegrationSchema.optional().default({ enabled: false, scopes: ["gmail.readonly", "gmail.send", "calendar.readonly"] }),
    hubspot: hubspotIntegrationSchema.optional().default({ enabled: false }),
    asana: asanaIntegrationSchema.optional().default({ enabled: false }),
    httpRequest: httpRequestSchema.optional().default({ enabled: false, allowedDomains: [] }),
    twitter: twitterSchema.optional().default({
        enabled: false,
        tier1Enabled: true,
        tier2Enabled: true,
        tier3Enabled: true,
        tier4Enabled: false,
        fxTwitterEnabled: true,
        twitterApiIoKey: null,
        xApiBearerToken: null,
        xAiApiKey: null,
    }),
});

export const channelsSchema = z.object({
    autoStartOnBoot: z.boolean().default(false),
    defaultContextMessages: z.number().int().min(1).max(100).default(20),
    defaultMaxTokens: z.number().int().min(256).max(128000).default(4096),
});

export const agentsSchema = z.object({
    backgroundAgentEnabled: z.boolean().default(false),
    backgroundAgentAutoStart: z.boolean().default(false),
    defaultModel: z.string().nullable().default(null),
    proactiveMessagingEnabled: z.boolean().default(false),
    eventTriggersEnabled: z.boolean().default(false),
    bootScriptsEnabled: z.boolean().default(false),
    heartbeatIntervalMs: z.number().int().min(60000).max(3600000).default(900000),
    staleThresholdMs: z.number().int().min(120000).max(10800000).default(2700000),
});

export const rateLimitsSchema = z.object({
    proactiveMaxPerHour: z.number().int().min(1).max(1000).default(10),
    proactiveMaxPerDay: z.number().int().min(1).max(10000).default(100),
    triggerMaxPerHour: z.number().int().min(1).max(1000).default(60),
});

export const securitySchema = z.object({
    ipFilteringEnabled: z.boolean().default(false),
    allowedIps: z.array(z.string()).default([]),
    blockedIps: z.array(z.string()).default([]),
});

export const generalSchema = z.object({
    visitorRetentionDays: z.number().int().min(1).max(365).default(30),
    deploymentMode: z.enum(["local", "hosted", "self-hosted"]).default("self-hosted"),
});

export const soulSchema = z.object({
    enabled: z.boolean().default(true),
    maxCharsPerFile: z.number().int().min(1000).max(50000).default(20000),
});

export const maiaChatConfigSchema = z.object({
    $schema: z.string().optional(),
    version: z.string().default("1.0.0"),
    taskExecution: taskExecutionSchema.optional().default({ maxAttempts: 3, completionTimeout: 60000, requireToolCallForScheduled: true }),
    notifications: notificationsSchema.optional().default({ failureNotifyOriginalChannel: true, failureNotifyTelegram: true, telegramUserId: null }),
    cli: cliSchema.optional().default({ enabled: false, defaultCli: "claude", skipPermissions: true, workspaceRoot: "./workspace", organizeByTask: true }),
    tools: toolsSchema.optional().default({ localFileAccessEnabled: false, commandExecutionEnabled: false, fileAccessBaseDir: null, workspaceQuotaMb: 100 }),
    memory: memorySchema.optional().default({ autoSave: true, ragEnabled: true, userProfileMemoryEnabled: true, autoRecallEnabled: true, autoCaptureEnabled: true, geminiRetrievalModel: "gemini-3-flash-preview", memoryMaxChars: 4000 }),
    skills: skillsSchema.optional().default({ clawdbotSkillsEnabled: true, clawdbotSourcePath: "./clawdbot-source", enabledSkills: [] }),
    integrations: integrationsSchema.optional().default({
        google: { enabled: false, scopes: ["gmail.readonly", "gmail.send", "calendar.readonly"] },
        hubspot: { enabled: false },
        asana: { enabled: false },
        httpRequest: { enabled: false, allowedDomains: [] },
        twitter: {
            enabled: false,
            tier1Enabled: true,
            tier2Enabled: true,
            tier3Enabled: true,
            tier4Enabled: false,
            fxTwitterEnabled: true,
            twitterApiIoKey: null,
            xApiBearerToken: null,
            xAiApiKey: null,
        },
    }),
    cost: costSchema.optional().default({ costOptimizationEnabled: false, monthlyBudgetUsd: 0, preferCheaperFallback: false, alertAtPercentage: 80 }),
    channels: channelsSchema.optional().default({ autoStartOnBoot: false, defaultContextMessages: 20, defaultMaxTokens: 4096 }),
    agents: agentsSchema.optional().default({ backgroundAgentEnabled: false, backgroundAgentAutoStart: false, defaultModel: null, proactiveMessagingEnabled: false, eventTriggersEnabled: false, bootScriptsEnabled: false, heartbeatIntervalMs: 900000, staleThresholdMs: 2700000 }),
    rateLimits: rateLimitsSchema.optional().default({ proactiveMaxPerHour: 10, proactiveMaxPerDay: 100, triggerMaxPerHour: 60 }),
    security: securitySchema.optional().default({ ipFilteringEnabled: false, allowedIps: [], blockedIps: [] }),
    general: generalSchema.optional().default({ visitorRetentionDays: 30, deploymentMode: "self-hosted" }),
    soul: soulSchema.optional().default({ enabled: true, maxCharsPerFile: 20000 }),
});

export type MaiaChatConfigSchema = z.infer<typeof maiaChatConfigSchema>;

/**
 * Validate a config object against the schema
 */
export function validateConfig(config: unknown): {
    success: boolean;
    data?: MaiaChatConfigSchema;
    errors?: z.ZodError;
} {
    const result = maiaChatConfigSchema.safeParse(config);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, errors: result.error };
}

/**
 * Get the default configuration
 */
export function getDefaultConfig(): MaiaChatConfigSchema {
    return maiaChatConfigSchema.parse({});
}
