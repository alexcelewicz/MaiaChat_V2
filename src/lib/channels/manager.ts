/**
 * Channel Manager
 *
 * Manages the lifecycle of all channel connectors for a user.
 * Handles connection, message routing, and credential management.
 */

import { db } from '@/lib/db';
import { channelAccounts, channelMessages } from '@/lib/db/schema';
import type { ChannelConfig as SchemaChannelConfig } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { encrypt, decrypt } from '@/lib/crypto';
import {
    ChannelConnector,
    ChannelMessage,
    ChannelConfig,
    ChannelType,
} from './base';

// ============================================================================
// Connector Registry
// ============================================================================

type ConnectorFactory = () => ChannelConnector;

// Registry of connector factories - populated by registerConnector()
const CONNECTOR_FACTORIES: Map<string, ConnectorFactory> = new Map();

/**
 * Register a channel connector factory
 */
export function registerConnector(type: string, factory: ConnectorFactory): void {
    CONNECTOR_FACTORIES.set(type, factory);
}

/**
 * Get a connector factory by type
 */
export function getConnectorFactory(type: string): ConnectorFactory | undefined {
    return CONNECTOR_FACTORIES.get(type);
}

// ============================================================================
// Channel Manager
// ============================================================================

export type MessageHandler = (userId: string, message: ChannelMessage) => Promise<void>;

export class ChannelManager {
    private connectors: Map<string, ChannelConnector> = new Map();
    private messageHandler: MessageHandler;

    constructor(messageHandler: MessageHandler) {
        this.messageHandler = messageHandler;
    }

    /**
     * Update the message handler (useful for setting up processor after singleton creation)
     */
    setMessageHandler(handler: MessageHandler): void {
        console.log('[ChannelManager] Message handler updated');
        this.messageHandler = handler;
    }

    /**
     * Generate a unique key for a connector instance
     */
    private getConnectorKey(userId: string, channelType: string, channelId: string): string {
        return `${userId}:${channelType}:${channelId}`;
    }

    /**
     * Load and connect all active channels for a user
     */
    async loadUserChannels(userId: string): Promise<void> {
        const accounts = await db.select()
            .from(channelAccounts)
            .where(and(
                eq(channelAccounts.userId, userId),
                eq(channelAccounts.isActive, true)
            ));

        for (const account of accounts) {
            await this.connectChannel(userId, account);
        }
    }

    /**
     * Connect a specific channel account
     */
    async connectChannel(
        userId: string,
        account: typeof channelAccounts.$inferSelect
    ): Promise<void> {
        const key = this.getConnectorKey(userId, account.channelType, account.channelId);

        // Disconnect existing connection if any
        const existing = this.connectors.get(key);
        if (existing) {
            await existing.disconnect();
        }

        // Get connector factory
        const factory = CONNECTOR_FACTORIES.get(account.channelType);
        if (!factory) {
            console.error(`[ChannelManager] Unknown channel type: ${account.channelType}`);
            return;
        }

        const connector = factory();

        // Set up message handler
        connector.onMessage = async (message) => {
            // Dedup guard: skip if we already processed this message
            // (can happen when drop_pending_updates is false and bot restarts)
            const [existing] = await db.select({ id: channelMessages.id })
                .from(channelMessages)
                .where(and(
                    eq(channelMessages.channelAccountId, account.id),
                    eq(channelMessages.externalMessageId, message.id)
                ))
                .limit(1);

            if (existing) {
                console.log(`[ChannelManager] Skipping duplicate message ${message.id} for account ${account.id}`);
                return;
            }

            const telegramChatId = account.channelType === "telegram" ? message.channelId : undefined;

            // Store inbound message
            await db.insert(channelMessages).values({
                channelAccountId: account.id,
                externalMessageId: message.id,
                externalThreadId: message.threadId,
                direction: 'inbound',
                content: message.content,
                contentType: message.contentType,
                attachments: message.attachments,
                // Preserve sender identity here; Telegram delivery chat IDs are tracked in account config.
                senderExternalId: message.sender.id,
                senderDisplayName: message.sender.name,
                status: 'received',
            });

            // Auto-populate/update Telegram delivery IDs from inbound chat context.
            if (account.channelType === "telegram" && telegramChatId) {
                const currentConfig = (account.config || {}) as Record<string, unknown>;
                const nextConfig: SchemaChannelConfig = {
                    ...currentConfig,
                    lastInboundChatId: telegramChatId,
                    lastInboundSenderId: message.sender.id,
                    defaultChatId: currentConfig.defaultChatId
                        ? String(currentConfig.defaultChatId)
                        : telegramChatId,
                };
                const hasChanged =
                    String(currentConfig.defaultChatId ?? "") !== String(nextConfig.defaultChatId ?? "") ||
                    String(currentConfig.lastInboundChatId ?? "") !== String(nextConfig.lastInboundChatId ?? "") ||
                    String(currentConfig.lastInboundSenderId ?? "") !== String(nextConfig.lastInboundSenderId ?? "");
                if (hasChanged) {
                    await db.update(channelAccounts)
                        .set({
                            config: nextConfig,
                            updatedAt: new Date(),
                        })
                        .where(eq(channelAccounts.id, account.id));
                    console.log(
                        `[ChannelManager] Updated Telegram IDs for account ${account.id}: default=${nextConfig.defaultChatId}, lastInboundChat=${nextConfig.lastInboundChatId}, lastInboundSender=${nextConfig.lastInboundSenderId}`
                    );
                }
            }

            // Route to AI handler
            await this.messageHandler(userId, message);
        };

        connector.onError = (error) => {
            console.error(`[ChannelManager] Channel error [${key}]:`, error);
        };

        // Decrypt credentials and connect
        const decryptedAccessToken = account.accessToken ? decrypt(account.accessToken) : '';
        const decryptedRefreshToken = account.refreshToken ? decrypt(account.refreshToken) : '';

        const config: ChannelConfig = {
            channelType: account.channelType,
            credentials: {
                ...(account.config as Record<string, string> || {}),
                accessToken: decryptedAccessToken,
                refreshToken: decryptedRefreshToken,
                botToken: (account.config as Record<string, string> | undefined)?.botToken || decryptedAccessToken,
            },
            settings: { ...(account.config as Record<string, unknown> || {}), accountId: account.id },
        };

        try {
            // Store connector BEFORE connecting to avoid race condition
            // (messages can arrive immediately after connect starts)
            this.connectors.set(key, connector);
            console.log(`[ChannelManager] Registered channel: ${key}`);

            await connector.connect(config);
            console.log(`[ChannelManager] Connected channel: ${key}`);
        } catch (error) {
            // Remove connector on failure
            this.connectors.delete(key);
            console.error(`[ChannelManager] Failed to connect channel ${key}:`, error);
        }
    }

    /**
     * Disconnect a specific channel
     */
    async disconnectChannel(
        userId: string,
        channelType: string,
        channelId: string
    ): Promise<void> {
        const key = this.getConnectorKey(userId, channelType, channelId);
        const connector = this.connectors.get(key);

        if (connector) {
            await connector.disconnect();
            this.connectors.delete(key);
            console.log(`[ChannelManager] Disconnected channel: ${key}`);
        }
    }

    /**
     * Find a connector by type (for platforms where channelId varies per chat)
     */
    findConnectorByType(userId: string, channelType: string): ChannelConnector | undefined {
        const prefix = `${userId}:${channelType}:`;
        console.log(`[ChannelManager] Looking for connector with prefix: ${prefix}`);
        console.log(`[ChannelManager] Available connectors: ${Array.from(this.connectors.keys()).join(', ')}`);
        for (const [key, connector] of this.connectors) {
            if (key.startsWith(prefix)) {
                console.log(`[ChannelManager] Found connector: ${key}`);
                return connector;
            }
        }
        console.log(`[ChannelManager] No connector found for prefix: ${prefix}`);
        return undefined;
    }

    /**
     * Send a message through a channel
     */
    async sendMessage(
        userId: string,
        channelType: string,
        channelId: string,
        content: string,
        options?: { threadId?: string; replyTo?: string }
    ): Promise<string> {
        // First try exact match
        const key = this.getConnectorKey(userId, channelType, channelId);
        let connector = this.connectors.get(key);

        // For bot platforms, the channelId varies per chat, so fall back to finding by type
        if (!connector) {
            connector = this.findConnectorByType(userId, channelType);
        }

        if (!connector) {
            throw new Error(`Channel not connected: ${key}`);
        }

        const messageId = await connector.sendMessage(channelId, content, options);

        // Get channel account ID for storing the message
        // Try exact match first, then fall back to type-only match
        let [account] = await db.select({ id: channelAccounts.id })
            .from(channelAccounts)
            .where(and(
                eq(channelAccounts.userId, userId),
                eq(channelAccounts.channelType, channelType),
                eq(channelAccounts.channelId, channelId)
            ));

        if (!account) {
            [account] = await db.select({ id: channelAccounts.id })
                .from(channelAccounts)
                .where(and(
                    eq(channelAccounts.userId, userId),
                    eq(channelAccounts.channelType, channelType),
                    eq(channelAccounts.isActive, true)
                ))
                .limit(1);
        }

        if (account) {
            // Store outbound message
            await db.insert(channelMessages).values({
                channelAccountId: account.id,
                externalMessageId: messageId,
                externalThreadId: options?.threadId,
                direction: 'outbound',
                content,
                contentType: 'text',
                status: 'sent',
            });
        }

        return messageId;
    }

    /**
     * Get a connector instance
     */
    getConnector(
        userId: string,
        channelType: string,
        channelId: string
    ): ChannelConnector | undefined {
        const key = this.getConnectorKey(userId, channelType, channelId);
        return this.connectors.get(key);
    }

    /**
     * Check if a channel is connected
     */
    isConnected(userId: string, channelType: string, channelId: string): boolean {
        const connector = this.getConnector(userId, channelType, channelId);
        return connector?.isConnected() ?? false;
    }

    /**
     * Get all connected channels for a user
     */
    getConnectedChannels(userId: string): { type: string; channelId: string }[] {
        const channels: { type: string; channelId: string }[] = [];

        for (const key of this.connectors.keys()) {
            const [keyUserId, type, channelId] = key.split(':');
            if (keyUserId === userId) {
                channels.push({ type, channelId });
            }
        }

        return channels;
    }

    /**
     * Disconnect all channels for a user
     */
    async disconnectUser(userId: string): Promise<void> {
        const keysToRemove: string[] = [];

        for (const [key, connector] of this.connectors) {
            if (key.startsWith(`${userId}:`)) {
                try {
                    await connector.disconnect();
                } catch (error) {
                    console.error(`[ChannelManager] Error disconnecting ${key}:`, error);
                }
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            this.connectors.delete(key);
        }
    }

    /**
     * Disconnect all channels and cleanup
     */
    async shutdown(): Promise<void> {
        for (const [key, connector] of this.connectors) {
            try {
                await connector.disconnect();
            } catch (error) {
                console.error(`[ChannelManager] Error disconnecting ${key}:`, error);
            }
        }
        this.connectors.clear();
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let channelManagerInstance: ChannelManager | null = null;

/**
 * Get the global channel manager instance
 * Initializes with a default message handler if not already created
 */
export function getChannelManager(
    messageHandler?: MessageHandler
): ChannelManager {
    if (!channelManagerInstance) {
        if (!messageHandler) {
            // Default handler just logs messages
            messageHandler = async (userId, message) => {
                console.log(`[ChannelManager] Received message from ${userId}:`, message.content);
            };
        }
        channelManagerInstance = new ChannelManager(messageHandler);
    }
    return channelManagerInstance;
}

/**
 * Initialize the channel manager with a message handler
 */
export function initializeChannelManager(messageHandler: MessageHandler): ChannelManager {
    if (channelManagerInstance) {
        console.warn('[ChannelManager] Already initialized, returning existing instance');
        return channelManagerInstance;
    }
    channelManagerInstance = new ChannelManager(messageHandler);
    return channelManagerInstance;
}
