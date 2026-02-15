import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminSettings } from "@/lib/admin/settings";
import { getConfig, updateConfig } from "@/lib/config";

export async function GET() {
    try {
        await requireAdmin();
        const [settings, config] = await Promise.all([
            getAdminSettings(),
            getConfig(),
        ]);

        return NextResponse.json({
            settings: {
                autoStartChannels: config.channels.autoStartOnBoot,
                ipFilteringEnabled: config.security.ipFilteringEnabled,
                visitorRetentionDays: config.general.visitorRetentionDays,
                localFileAccessEnabled: config.tools.localFileAccessEnabled,
                commandExecutionEnabled: config.tools.commandExecutionEnabled,
                fileAccessBaseDir: config.tools.fileAccessBaseDir,
                workspaceQuotaMb: config.tools.workspaceQuotaMb,
                // Background Agent settings
                backgroundAgentEnabled: config.agents.backgroundAgentEnabled,
                backgroundAgentAutoStart: config.agents.backgroundAgentAutoStart,
                defaultAgentModel: config.agents.defaultModel,
                proactiveMessagingEnabled: config.agents.proactiveMessagingEnabled,
                eventTriggersEnabled: config.agents.eventTriggersEnabled,
                bootScriptsEnabled: config.agents.bootScriptsEnabled,
                defaultProactiveMaxPerHour: config.rateLimits.proactiveMaxPerHour,
                defaultProactiveMaxPerDay: config.rateLimits.proactiveMaxPerDay,
                defaultTriggerMaxPerHour: config.rateLimits.triggerMaxPerHour,
                // Memory & Retrieval settings
                geminiRetrievalModel: config.memory.geminiRetrievalModel ?? settings.geminiRetrievalModel,
                userProfileMemoryEnabled: config.memory.userProfileMemoryEnabled,
                memoryMaxChars: config.memory.memoryMaxChars,
                // Channel settings
                defaultMaxTokens: config.channels.defaultMaxTokens,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        const status = message.includes("Unauthorized") ? 401 : 403;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        await requireAdmin();
        const payload = await request.json();

        const patch = {
            channels: {
                autoStartOnBoot: typeof payload.autoStartChannels === "boolean" ? payload.autoStartChannels : undefined,
                defaultMaxTokens: typeof payload.defaultMaxTokens === "number" ? payload.defaultMaxTokens : undefined,
            },
            security: {
                ipFilteringEnabled: typeof payload.ipFilteringEnabled === "boolean" ? payload.ipFilteringEnabled : undefined,
            },
            general: {
                visitorRetentionDays: typeof payload.visitorRetentionDays === "number" ? payload.visitorRetentionDays : undefined,
            },
            tools: {
                localFileAccessEnabled: typeof payload.localFileAccessEnabled === "boolean" ? payload.localFileAccessEnabled : undefined,
                commandExecutionEnabled: typeof payload.commandExecutionEnabled === "boolean" ? payload.commandExecutionEnabled : undefined,
                fileAccessBaseDir: typeof payload.fileAccessBaseDir === "string" || payload.fileAccessBaseDir === null ? payload.fileAccessBaseDir : undefined,
                workspaceQuotaMb: typeof payload.workspaceQuotaMb === "number" ? payload.workspaceQuotaMb : undefined,
            },
            agents: {
                backgroundAgentEnabled: typeof payload.backgroundAgentEnabled === "boolean" ? payload.backgroundAgentEnabled : undefined,
                backgroundAgentAutoStart: typeof payload.backgroundAgentAutoStart === "boolean" ? payload.backgroundAgentAutoStart : undefined,
                defaultModel: typeof payload.defaultAgentModel === "string" || payload.defaultAgentModel === null ? payload.defaultAgentModel : undefined,
                proactiveMessagingEnabled: typeof payload.proactiveMessagingEnabled === "boolean" ? payload.proactiveMessagingEnabled : undefined,
                eventTriggersEnabled: typeof payload.eventTriggersEnabled === "boolean" ? payload.eventTriggersEnabled : undefined,
                bootScriptsEnabled: typeof payload.bootScriptsEnabled === "boolean" ? payload.bootScriptsEnabled : undefined,
            },
            rateLimits: {
                proactiveMaxPerHour: typeof payload.defaultProactiveMaxPerHour === "number" ? payload.defaultProactiveMaxPerHour : undefined,
                proactiveMaxPerDay: typeof payload.defaultProactiveMaxPerDay === "number" ? payload.defaultProactiveMaxPerDay : undefined,
                triggerMaxPerHour: typeof payload.defaultTriggerMaxPerHour === "number" ? payload.defaultTriggerMaxPerHour : undefined,
            },
            memory: {
                userProfileMemoryEnabled: typeof payload.userProfileMemoryEnabled === "boolean" ? payload.userProfileMemoryEnabled : undefined,
                geminiRetrievalModel: typeof payload.geminiRetrievalModel === "string" || payload.geminiRetrievalModel === null
                    ? payload.geminiRetrievalModel
                    : undefined,
                memoryMaxChars: typeof payload.memoryMaxChars === "number" ? payload.memoryMaxChars : undefined,
            },
        };

        const updatedConfig = await updateConfig(patch);

        return NextResponse.json({
            settings: {
                autoStartChannels: updatedConfig.channels.autoStartOnBoot,
                ipFilteringEnabled: updatedConfig.security.ipFilteringEnabled,
                visitorRetentionDays: updatedConfig.general.visitorRetentionDays,
                localFileAccessEnabled: updatedConfig.tools.localFileAccessEnabled,
                commandExecutionEnabled: updatedConfig.tools.commandExecutionEnabled,
                fileAccessBaseDir: updatedConfig.tools.fileAccessBaseDir,
                workspaceQuotaMb: updatedConfig.tools.workspaceQuotaMb,
                // Background Agent settings
                backgroundAgentEnabled: updatedConfig.agents.backgroundAgentEnabled,
                backgroundAgentAutoStart: updatedConfig.agents.backgroundAgentAutoStart,
                defaultAgentModel: updatedConfig.agents.defaultModel,
                proactiveMessagingEnabled: updatedConfig.agents.proactiveMessagingEnabled,
                eventTriggersEnabled: updatedConfig.agents.eventTriggersEnabled,
                bootScriptsEnabled: updatedConfig.agents.bootScriptsEnabled,
                defaultProactiveMaxPerHour: updatedConfig.rateLimits.proactiveMaxPerHour,
                defaultProactiveMaxPerDay: updatedConfig.rateLimits.proactiveMaxPerDay,
                defaultTriggerMaxPerHour: updatedConfig.rateLimits.triggerMaxPerHour,
                // Memory & Retrieval settings
                geminiRetrievalModel: updatedConfig.memory.geminiRetrievalModel,
                userProfileMemoryEnabled: updatedConfig.memory.userProfileMemoryEnabled,
                memoryMaxChars: updatedConfig.memory.memoryMaxChars,
                // Channel settings
                defaultMaxTokens: updatedConfig.channels.defaultMaxTokens,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        const status = message.includes("Unauthorized") ? 401 : 403;
        return NextResponse.json({ error: message }, { status });
    }
}
