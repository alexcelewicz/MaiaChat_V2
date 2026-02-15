/**
 * Discord Channel Connector
 *
 * Connects to Discord using discord.js library.
 * Supports guild (server) and DM channels.
 */

import {
    ChannelConnector,
    ChannelMessage,
    ChannelConfig,
    SendMessageOptions,
    ChannelAttachment,
} from '../base';

// Lazy import discord.js to avoid bundling issues
let DiscordClient: typeof import('discord.js').Client;
let GatewayIntentBits: typeof import('discord.js').GatewayIntentBits;
let DiscordEvents: typeof import('discord.js').Events;
let ChannelType: typeof import('discord.js').ChannelType;

async function getDiscordJS() {
    if (!DiscordClient) {
        const discord = await import('discord.js');
        DiscordClient = discord.Client;
        GatewayIntentBits = discord.GatewayIntentBits;
        DiscordEvents = discord.Events;
        ChannelType = discord.ChannelType;
    }
    return { Client: DiscordClient, GatewayIntentBits, Events: DiscordEvents, ChannelType };
}

export class DiscordConnector extends ChannelConnector {
    readonly type = 'discord';
    readonly name = 'Discord';

    private client: InstanceType<typeof import('discord.js').Client> | null = null;
    private config: ChannelConfig | null = null;

    async connect(config: ChannelConfig): Promise<void> {
        this.config = config;
        const { Client, GatewayIntentBits, Events } = await getDiscordJS();

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildMessageReactions,
            ],
        });

        // Handle new messages
        this.client.on(Events.MessageCreate, async (message) => {
            // Ignore bot messages
            if (message.author.bot) return;

            const attachments: ChannelAttachment[] = message.attachments.map(a => ({
                type: a.contentType?.startsWith('image/') ? 'image' as const :
                      a.contentType?.startsWith('audio/') ? 'audio' as const :
                      a.contentType?.startsWith('video/') ? 'video' as const : 'file' as const,
                url: a.url,
                name: a.name,
                size: a.size,
                mimeType: a.contentType || undefined,
            }));

            const channelMessage: ChannelMessage = {
                id: message.id,
                channelType: 'discord',
                channelId: message.channelId,
                threadId: message.thread?.id,
                content: message.content,
                contentType: attachments.length > 0 ?
                    (attachments[0].type === 'image' ? 'image' : 'file') : 'text',
                attachments: attachments.length > 0 ? attachments : undefined,
                sender: {
                    id: message.author.id,
                    name: message.author.displayName || message.author.username,
                    avatarUrl: message.author.avatarURL() || undefined,
                },
                timestamp: message.createdAt,
                replyTo: message.reference?.messageId,
                metadata: {
                    guildId: message.guildId,
                    guildName: message.guild?.name,
                },
            };

            await this.onMessage?.(channelMessage);
        });

        // Handle message edits
        this.client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
            if (newMessage.author?.bot) return;
            if (!newMessage.content) return;

            const channelMessage: ChannelMessage = {
                id: newMessage.id,
                channelType: 'discord',
                channelId: newMessage.channelId,
                content: newMessage.content,
                contentType: 'text',
                sender: {
                    id: newMessage.author?.id ?? 'unknown',
                    name: newMessage.author?.displayName || newMessage.author?.username || 'Unknown',
                    avatarUrl: newMessage.author?.avatarURL() || undefined,
                },
                timestamp: newMessage.editedAt || newMessage.createdAt || new Date(),
            };

            await this.onMessageEdit?.(channelMessage);
        });

        // Handle message deletions
        this.client.on(Events.MessageDelete, async (message) => {
            await this.onMessageDelete?.(message.channelId, message.id);
        });

        // Handle errors
        this.client.on(Events.Error, (error) => {
            console.error('[Discord] Client error:', error);
            this.onError?.(error);
        });

        // Ready event
        this.client.once(Events.ClientReady, (readyClient) => {
            console.log(`[Discord] Bot logged in as ${readyClient.user.tag}`);
        });

        await this.client.login(config.credentials.botToken);
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
            console.log('[Discord] Bot disconnected');
        }
    }

    isConnected(): boolean {
        return this.client?.isReady() ?? false;
    }

    async sendMessage(
        channelId: string,
        content: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.client) throw new Error('Not connected');

        const channel = await this.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Invalid or non-text channel');
        }

        const textChannel = channel as import('discord.js').TextChannel;
        const message = await textChannel.send({
            content,
            reply: options?.replyTo ? { messageReference: options.replyTo } : undefined,
        });

        return message.id;
    }

    async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
        if (!this.client) throw new Error('Not connected');

        const channel = await this.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Invalid or non-text channel');
        }

        const textChannel = channel as import('discord.js').TextChannel;
        const message = await textChannel.messages.fetch(messageId);
        await message.edit(content);
    }

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        if (!this.client) throw new Error('Not connected');

        const channel = await this.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Invalid or non-text channel');
        }

        const textChannel = channel as import('discord.js').TextChannel;
        const message = await textChannel.messages.fetch(messageId);
        await message.delete();
    }

    // OAuth methods
    getAuthUrl(state: string): string {
        const clientId = process.env.DISCORD_CLIENT_ID;
        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/callback/discord`;
        const scopes = 'bot applications.commands';
        const permissions = '274877975552'; // Send messages, read message history, add reactions, etc.

        return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code`;
    }

    async handleAuthCallback(code: string, state: string): Promise<ChannelConfig> {
        const response = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID!,
                client_secret: process.env.DISCORD_CLIENT_SECRET!,
                grant_type: 'authorization_code',
                code,
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/callback/discord`,
            }),
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`Discord OAuth failed: ${data.error}`);
        }

        // Get guild info if available
        let guildId = '';
        let guildName = '';
        if (data.guild) {
            guildId = data.guild.id;
            guildName = data.guild.name;
        }

        return {
            channelType: 'discord',
            credentials: {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                guildId,
                guildName,
                botToken: process.env.DISCORD_BOT_TOKEN!, // Use the bot token for actual messaging
            },
        };
    }

    /**
     * Send an embed message
     */
    async sendEmbed(
        channelId: string,
        embed: {
            title?: string;
            description?: string;
            color?: number;
            fields?: { name: string; value: string; inline?: boolean }[];
            footer?: { text: string };
        },
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.client) throw new Error('Not connected');

        const channel = await this.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Invalid or non-text channel');
        }

        const textChannel = channel as import('discord.js').TextChannel;
        const message = await textChannel.send({
            embeds: [embed],
            reply: options?.replyTo ? { messageReference: options.replyTo } : undefined,
        });

        return message.id;
    }

    /**
     * Add a reaction to a message
     */
    async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
        if (!this.client) throw new Error('Not connected');

        const channel = await this.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Invalid or non-text channel');
        }

        const textChannel = channel as import('discord.js').TextChannel;
        const message = await textChannel.messages.fetch(messageId);
        await message.react(emoji);
    }

    /**
     * Send typing indicator
     */
    async sendTyping(channelId: string): Promise<void> {
        if (!this.client) throw new Error('Not connected');

        const channel = await this.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error('Invalid or non-text channel');
        }

        const textChannel = channel as import('discord.js').TextChannel;
        await textChannel.sendTyping();
    }

    /**
     * Get guilds the bot is in
     */
    getGuilds(): { id: string; name: string }[] {
        if (!this.client) return [];

        return Array.from(this.client.guilds.cache.values()).map(guild => ({
            id: guild.id,
            name: guild.name,
        }));
    }
}
