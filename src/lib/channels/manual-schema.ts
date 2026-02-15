import { z } from "zod";

const baseSchema = {
    channelId: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
};

export const manualConnectSchemas = {
    telegram: z.object({
        ...baseSchema,
        channelId: z.string().min(1),
        accessToken: z.string().min(1),
    }),
    matrix: z.object({
        ...baseSchema,
        channelId: z.string().min(1),
        accessToken: z.string().min(1),
        homeserverUrl: z.string().url(),
        userId: z.string().min(1),
    }),
    webchat: z.object({
        ...baseSchema,
    }),
    teams: z.object({
        ...baseSchema,
        channelId: z.string().min(1),
        appId: z.string().min(1),
        appPassword: z.string().min(1),
    }),
    whatsapp: z.object({
        ...baseSchema,
        authDir: z.string().optional().describe("Directory for auth state (default: ./whatsapp-auth)"),
    }),
    signal: z.object({
        ...baseSchema,
        phoneNumber: z.string().min(1).describe("Signal phone number with country code (e.g. +1234567890)"),
        signalCliPath: z.string().optional().describe("Path to signal-cli binary"),
    }),
    slack: z.object({
        ...baseSchema,
        channelId: z.string().min(1),
        botToken: z.string().min(1).describe("Bot User OAuth Token (xoxb-...)"),
        signingSecret: z.string().optional().describe("Signing secret from Slack app settings"),
        appToken: z.string().optional().describe("App-level token for Socket Mode (xapp-...)"),
    }),
    discord: z.object({
        ...baseSchema,
        channelId: z.string().min(1),
        botToken: z.string().min(1).describe("Discord bot token"),
    }),
};

export type ManualConnectPayload =
    | z.infer<typeof manualConnectSchemas.telegram>
    | z.infer<typeof manualConnectSchemas.matrix>
    | z.infer<typeof manualConnectSchemas.webchat>
    | z.infer<typeof manualConnectSchemas.teams>
    | z.infer<typeof manualConnectSchemas.whatsapp>
    | z.infer<typeof manualConnectSchemas.signal>
    | z.infer<typeof manualConnectSchemas.slack>
    | z.infer<typeof manualConnectSchemas.discord>;
