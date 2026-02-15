import { db } from "@/lib/db";
import { channelAccounts, channelMessages } from "@/lib/db/schema";
import type { ChannelConfig } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

const TELEGRAM_CHAT_ID_REGEX = /^-?\d+$/;

export function isTelegramChatId(value: unknown): value is string {
    if (typeof value !== "string") return false;
    return TELEGRAM_CHAT_ID_REGEX.test(value.trim());
}

function normalizeChatId(value: unknown): string | undefined {
    if (value == null) return undefined;
    const normalized = String(value).trim();
    if (!normalized || normalized === "null" || normalized === "undefined") {
        return undefined;
    }
    return isTelegramChatId(normalized) ? normalized : undefined;
}

export async function resolveTelegramChatIdFromAccount(
    accountId: string,
    explicitTarget?: string | null
): Promise<{ chatId?: string; source: string }> {
    const explicit = normalizeChatId(explicitTarget);
    if (explicit) {
        return { chatId: explicit, source: "explicit_target" };
    }

    const [account] = await db
        .select()
        .from(channelAccounts)
        .where(eq(channelAccounts.id, accountId))
        .limit(1);

    if (!account || account.channelType !== "telegram") {
        return { source: "account_not_found_or_not_telegram" };
    }

    const config = (account.config || {}) as ChannelConfig;
    const defaultChatId = normalizeChatId(config.defaultChatId);
    if (defaultChatId) {
        return { chatId: defaultChatId, source: "config.defaultChatId" };
    }

    const lastInboundChatId = normalizeChatId(
        (config as unknown as Record<string, unknown>).lastInboundChatId
    );
    if (lastInboundChatId) {
        return { chatId: lastInboundChatId, source: "config.lastInboundChatId" };
    }

    const [recentMessage] = await db
        .select({
            senderExternalId: channelMessages.senderExternalId,
        })
        .from(channelMessages)
        .where(
            and(
                eq(channelMessages.channelAccountId, account.id),
                eq(channelMessages.direction, "inbound")
            )
        )
        .orderBy(desc(channelMessages.createdAt))
        .limit(1);

    const inboundChatId = normalizeChatId(recentMessage?.senderExternalId);
    // Legacy fallback only: older rows may have stored chat_id in senderExternalId.
    // Accept group/supergroup IDs (negative) only to avoid mistaking sender user IDs for target chats.
    if (inboundChatId && inboundChatId.startsWith("-")) {
        return { chatId: inboundChatId, source: "recent_inbound_message_legacy" };
    }

    const accountChannelId = normalizeChatId(account.channelId);
    if (accountChannelId) {
        return { chatId: accountChannelId, source: "account.channelId" };
    }

    return { source: "not_found" };
}
