/**
 * Channel Message Tool
 *
 * AI tool for proactive messaging to any connected channel.
 * Supports: send, reply, react, edit, delete actions.
 *
 * Rate limited and access controlled.
 */

import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types";
import { db } from "@/lib/db";
import { channelAccounts, proactiveMessageRateLimits } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAdminSettings, getDeploymentMode } from "@/lib/admin/settings";
import { emitMessageEvent } from "@/lib/background/events";
import { resolveTelegramChatIdFromAccount } from "@/lib/channels/telegram/chat-id";

// ============================================================================
// Schema
// ============================================================================

const channelMessageSchema = z.object({
    action: z.enum(["send", "reply", "react", "edit", "delete"]).describe(
        "The action to perform: send (new message), reply (to existing), react (add emoji), edit (modify message), delete (remove message)"
    ),
    channel: z.string().describe(
        "The channel type to send to: telegram, discord, slack, webchat"
    ),
    target: z.string().describe(
        "The target chat/user/group ID. For Telegram: chat_id. For Discord: channel_id. For Slack: channel or user ID."
    ),
    content: z.string().optional().describe(
        "The message content (required for send, reply, edit). Can include markdown formatting."
    ),
    replyTo: z.string().optional().describe(
        "The message ID to reply to (for reply action) or to react to (for react action)"
    ),
    emoji: z.string().optional().describe(
        "The emoji to react with (for react action)"
    ),
    messageId: z.string().optional().describe(
        "The message ID to edit or delete (for edit/delete actions)"
    ),
    options: z.object({
        silent: z.boolean().optional().describe("Send silently (no notification)"),
        parseMode: z.enum(["text", "html", "markdown"]).optional().describe("Message parse mode"),
    }).optional(),
});

type ChannelMessageParams = z.infer<typeof channelMessageSchema>;

// ============================================================================
// Rate Limiting
// ============================================================================

async function checkRateLimit(
    userId: string,
    channelAccountId: string,
    targetId: string
): Promise<{ allowed: boolean; reason?: string }> {
    const settings = await getAdminSettings();
    const deploymentMode = getDeploymentMode();

    // In self-hosted/local mode, skip rate limiting
    if (deploymentMode !== "hosted") {
        return { allowed: true };
    }

    // Check if proactive messaging is enabled
    if (!settings.proactiveMessagingEnabled) {
        return { allowed: false, reason: "Proactive messaging is disabled" };
    }

    // Get or create rate limit record
    let [rateLimit] = await db
        .select()
        .from(proactiveMessageRateLimits)
        .where(
            and(
                eq(proactiveMessageRateLimits.userId, userId),
                eq(proactiveMessageRateLimits.channelAccountId, channelAccountId),
                eq(proactiveMessageRateLimits.targetId, targetId)
            )
        )
        .limit(1);

    const now = new Date();
    const maxPerHour = settings.defaultProactiveMaxPerHour ?? 10;
    const maxPerDay = settings.defaultProactiveMaxPerDay ?? 100;

    if (!rateLimit) {
        // Create new rate limit record
        [rateLimit] = await db
            .insert(proactiveMessageRateLimits)
            .values({
                userId,
                channelAccountId,
                targetId,
                messagesThisHour: 0,
                messagesThisDay: 0,
                maxPerHour,
                maxPerDay,
                hourResetAt: new Date(now.getTime() + 3600000),
                dayResetAt: new Date(now.getTime() + 86400000),
            })
            .returning();
    }

    // Check if counters need reset
    let messagesThisHour = rateLimit.messagesThisHour ?? 0;
    let messagesThisDay = rateLimit.messagesThisDay ?? 0;

    if (rateLimit.hourResetAt && now > rateLimit.hourResetAt) {
        messagesThisHour = 0;
    }
    if (rateLimit.dayResetAt && now > rateLimit.dayResetAt) {
        messagesThisDay = 0;
    }

    // Check limits
    if (messagesThisHour >= (rateLimit.maxPerHour ?? maxPerHour)) {
        return {
            allowed: false,
            reason: `Rate limit exceeded: ${messagesThisHour}/${rateLimit.maxPerHour ?? maxPerHour} messages per hour`,
        };
    }

    if (messagesThisDay >= (rateLimit.maxPerDay ?? maxPerDay)) {
        return {
            allowed: false,
            reason: `Rate limit exceeded: ${messagesThisDay}/${rateLimit.maxPerDay ?? maxPerDay} messages per day`,
        };
    }

    return { allowed: true };
}

async function incrementRateLimit(
    userId: string,
    channelAccountId: string,
    targetId: string
): Promise<void> {
    const now = new Date();

    await db
        .update(proactiveMessageRateLimits)
        .set({
            messagesThisHour: proactiveMessageRateLimits.messagesThisHour,
            messagesThisDay: proactiveMessageRateLimits.messagesThisDay,
            lastMessageAt: now,
            updatedAt: now,
        })
        .where(
            and(
                eq(proactiveMessageRateLimits.userId, userId),
                eq(proactiveMessageRateLimits.channelAccountId, channelAccountId),
                eq(proactiveMessageRateLimits.targetId, targetId)
            )
        );

    // Use raw SQL for increment since Drizzle doesn't support this directly in set
    await db.execute(sql`
        UPDATE proactive_message_rate_limits
        SET messages_this_hour = messages_this_hour + 1,
            messages_this_day = messages_this_day + 1,
            last_message_at = NOW(),
            hour_reset_at = CASE
                WHEN hour_reset_at IS NULL OR hour_reset_at < NOW()
                THEN NOW() + INTERVAL '1 hour'
                ELSE hour_reset_at
            END,
            day_reset_at = CASE
                WHEN day_reset_at IS NULL OR day_reset_at < NOW()
                THEN NOW() + INTERVAL '1 day'
                ELSE day_reset_at
            END
        WHERE user_id = ${userId}::uuid
          AND channel_account_id = ${channelAccountId}::uuid
          AND target_id = ${targetId}
    `);
}

// ============================================================================
// Telegram Chat ID Resolution
// ============================================================================

/**
 * Resolve a valid Telegram chat_id from multiple sources.
 * Priority: explicit target (if numeric) → defaultChatId/lastInboundChatId from config
 * → legacy inbound message fallback → account.channelId
 *
 * account.channelId is treated as a last-resort legacy fallback and must be numeric.
 */
async function resolveTelegramChatId(
    target: string | undefined,
    account: typeof channelAccounts.$inferSelect
): Promise<string | undefined> {
    const resolved = await resolveTelegramChatIdFromAccount(account.id, target);
    return resolved.chatId;
}

// ============================================================================
// Tool Implementation
// ============================================================================

async function executeChannelMessage(
    params: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    // Parse and validate params
    const parseResult = channelMessageSchema.safeParse(params);
    if (!parseResult.success) {
        return {
            success: false,
            error: `Invalid parameters: ${parseResult.error.message}`,
        };
    }

    const { action, channel, target, content, replyTo, emoji, messageId } = parseResult.data;
    const userId = context?.userId;

    if (!userId) {
        return {
            success: false,
            error: "User context required for channel messaging",
        };
    }

    try {
        // Find channel account
        const [account] = await db
            .select()
            .from(channelAccounts)
            .where(
                and(
                    eq(channelAccounts.userId, userId),
                    eq(channelAccounts.channelType, channel),
                    eq(channelAccounts.isActive, true)
                )
            )
            .limit(1);

        if (!account) {
            return {
                success: false,
                error: `No active ${channel} channel found. Please connect and activate a ${channel} channel first.`,
            };
        }

        // Check rate limit for send/reply actions
        if (action === "send" || action === "reply") {
            const rateLimitCheck = await checkRateLimit(userId, account.id, target);
            if (!rateLimitCheck.allowed) {
                emitMessageEvent("message:failed", "main", {
                    userId,
                    channelAccountId: account.id,
                    channelType: channel,
                    targetId: target,
                    status: "failed",
                    error: rateLimitCheck.reason,
                });

                return {
                    success: false,
                    error: rateLimitCheck.reason,
                };
            }
        }

        // Get channel manager
        const { getChannelManager } = await import("@/lib/channels/manager");
        const channelManager = getChannelManager();

        // Execute action
        let result: string | undefined;

        switch (action) {
            case "send":
                if (!content) {
                    return { success: false, error: "Content is required for send action" };
                }
                {
                    // For Telegram, resolve a valid chat_id (not account.channelId which is the bot username)
                    let sendChannelId: string = account.channelId;
                    if (channel === "telegram") {
                        const resolved = await resolveTelegramChatId(target, account);
                        if (!resolved) {
                            return {
                                success: false,
                                error: "No valid Telegram chat ID found. The bot needs at least one message from a user to know where to send messages.",
                            };
                        }
                        sendChannelId = resolved;
                    }
                    result = await channelManager.sendMessage(
                        userId,
                        channel,
                        sendChannelId,
                        content,
                        {
                            threadId: channel !== "telegram" && target !== account.channelId ? target : undefined,
                        }
                    );
                }
                await incrementRateLimit(userId, account.id, target);
                break;

            case "reply":
                if (!content) {
                    return { success: false, error: "Content is required for reply action" };
                }
                if (!replyTo) {
                    return { success: false, error: "replyTo message ID is required for reply action" };
                }
                {
                    // For Telegram, resolve a valid chat_id (not account.channelId which is the bot username)
                    let replyChannelId: string = account.channelId;
                    if (channel === "telegram") {
                        const resolved = await resolveTelegramChatId(target, account);
                        if (!resolved) {
                            return {
                                success: false,
                                error: "No valid Telegram chat ID found. The bot needs at least one message from a user to know where to send messages.",
                            };
                        }
                        replyChannelId = resolved;
                    }
                    result = await channelManager.sendMessage(
                        userId,
                        channel,
                        replyChannelId,
                        content,
                        {
                            replyTo,
                            threadId: channel !== "telegram" ? target : undefined,
                        }
                    );
                }
                await incrementRateLimit(userId, account.id, target);
                break;

            case "react":
                if (!replyTo) {
                    return { success: false, error: "replyTo message ID is required for react action" };
                }
                if (!emoji) {
                    return { success: false, error: "emoji is required for react action" };
                }
                // Reactions are channel-specific and not yet supported
                return {
                    success: false,
                    error: "Reactions are not yet supported for proactive messaging",
                };

            case "edit":
                if (!messageId) {
                    return { success: false, error: "messageId is required for edit action" };
                }
                if (!content) {
                    return { success: false, error: "content is required for edit action" };
                }
                // Edit is not yet supported in ChannelManager
                return {
                    success: false,
                    error: "Message editing is not yet supported for proactive messaging",
                };

            case "delete":
                if (!messageId) {
                    return { success: false, error: "messageId is required for delete action" };
                }
                // Delete is not yet supported in ChannelManager
                return {
                    success: false,
                    error: "Message deletion is not yet supported for proactive messaging",
                };

            default:
                return { success: false, error: `Unknown action: ${action}` };
        }

        // Emit success event
        emitMessageEvent("message:sent", "main", {
            userId,
            channelAccountId: account.id,
            channelType: channel,
            targetId: target,
            status: "sent",
        });

        return {
            success: true,
            data: {
                action,
                channel,
                target,
                messageId: result,
                message: `Successfully ${action === "send" ? "sent message to" : "replied in"} ${channel}`,
            },
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        emitMessageEvent("message:failed", "main", {
            userId,
            channelAccountId: "",
            channelType: channel,
            targetId: target,
            status: "failed",
            error: errorMessage,
        });

        return {
            success: false,
            error: `Failed to ${action} message: ${errorMessage}`,
        };
    }
}

// ============================================================================
// Tool Definition
// ============================================================================

export const channelMessageTool: Tool = {
    id: "channel_message",
    name: "Send Channel Message",
    description: `Send a message proactively to any connected channel (Telegram, Discord, Slack, etc.).

Use this tool when you need to:
- Send a notification or alert to a user
- Reply to a conversation in a channel

Supported actions:
- send: Send a new message to a target chat/channel
- reply: Reply to a specific message

Not yet supported: edit, delete, react

Rate limits apply in hosted mode (default: 10/hour, 100/day per target).`,
    category: "utility",
    icon: "📨",
    schema: channelMessageSchema,
    execute: executeChannelMessage,
    requiresLocalAccess: false, // Always available, but rate limited in hosted mode
};
