/**
 * Slack Channel Connector
 *
 * Connects to Slack using the Bolt framework.
 * Supports Socket Mode for real-time messaging and OAuth for workspace installation.
 */

import {
    ChannelConnector,
    ChannelMessage,
    ChannelConfig,
    SendMessageOptions,
    ChannelAttachment,
} from '../base';

// Lazy import slack bolt to avoid bundling issues
let SlackApp: typeof import('@slack/bolt').App;
let LogLevel: typeof import('@slack/bolt').LogLevel;

async function getSlackBolt() {
    if (!SlackApp) {
        const bolt = await import('@slack/bolt');
        SlackApp = bolt.App;
        LogLevel = bolt.LogLevel;
    }
    return { App: SlackApp, LogLevel };
}

export class SlackConnector extends ChannelConnector {
    readonly type = 'slack';
    readonly name = 'Slack';

    private app: InstanceType<typeof import('@slack/bolt').App> | null = null;
    private config: ChannelConfig | null = null;

    async connect(config: ChannelConfig): Promise<void> {
        this.config = config;
        const { App, LogLevel } = await getSlackBolt();

        this.app = new App({
            token: config.credentials.botToken,
            signingSecret: config.credentials.signingSecret ?? process.env.SLACK_SIGNING_SECRET!,
            appToken: config.credentials.appToken ?? process.env.SLACK_APP_TOKEN!,
            socketMode: true,
            logLevel: LogLevel.INFO,
        });

        // Handle incoming messages
        this.app.message(async ({ message, client }) => {
            // Ignore bot messages and message edits
            if ('subtype' in message && message.subtype) return;
            if (!('text' in message)) return;

            // Get user info for display name
            let senderName = 'Unknown User';
            let avatarUrl: string | undefined;

            if ('user' in message && message.user) {
                try {
                    const userInfo = await client.users.info({ user: message.user });
                    if (userInfo.user) {
                        senderName = userInfo.user.real_name || userInfo.user.name || 'Unknown User';
                        avatarUrl = userInfo.user.profile?.image_72;
                    }
                } catch (error) {
                    console.warn('[Slack] Failed to get user info:', error);
                }
            }

            const channelMessage: ChannelMessage = {
                id: message.ts as string,
                channelType: 'slack',
                channelId: message.channel as string,
                threadId: 'thread_ts' in message ? message.thread_ts as string : undefined,
                content: message.text || '',
                contentType: 'text',
                attachments: await this.parseAttachments(message as unknown as Record<string, unknown>, config.credentials.botToken),
                sender: {
                    id: 'user' in message ? message.user as string : 'unknown',
                    name: senderName,
                    avatarUrl,
                },
                timestamp: new Date(parseFloat(message.ts as string) * 1000),
            };

            await this.onMessage?.(channelMessage);
        });

        // Handle message edits
        this.app.event('message', async ({ event, client }) => {
            if (event.subtype !== 'message_changed') return;
            if (!('message' in event)) return;

            const editedMessage = event.message as { ts: string; text?: string; user?: string };

            let senderName = 'Unknown User';
            if (editedMessage.user) {
                try {
                    const userInfo = await client.users.info({ user: editedMessage.user });
                    if (userInfo.user) {
                        senderName = userInfo.user.real_name || userInfo.user.name || 'Unknown User';
                    }
                } catch (error) {
                    console.warn('[Slack] Failed to get user info:', error);
                }
            }

            const channelMessage: ChannelMessage = {
                id: editedMessage.ts,
                channelType: 'slack',
                channelId: event.channel,
                content: editedMessage.text || '',
                contentType: 'text',
                sender: {
                    id: editedMessage.user || 'unknown',
                    name: senderName,
                },
                timestamp: new Date(parseFloat(editedMessage.ts) * 1000),
            };

            await this.onMessageEdit?.(channelMessage);
        });

        // Handle message deletions
        this.app.event('message', async ({ event }) => {
            if (event.subtype !== 'message_deleted') return;
            if (!('deleted_ts' in event)) return;

            await this.onMessageDelete?.(event.channel, event.deleted_ts as string);
        });

        await this.app.start();
        console.log('[Slack] Bot started in socket mode');
    }

    async disconnect(): Promise<void> {
        if (this.app) {
            await this.app.stop();
            this.app = null;
            console.log('[Slack] Bot stopped');
        }
    }

    isConnected(): boolean {
        return this.app !== null;
    }

    async sendMessage(
        channelId: string,
        content: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.app) throw new Error('Not connected');

        const result = await this.app.client.chat.postMessage({
            channel: channelId,
            text: content,
            thread_ts: options?.threadId,
            mrkdwn: true,
        });

        return result.ts as string;
    }

    async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
        if (!this.app) throw new Error('Not connected');

        await this.app.client.chat.update({
            channel: channelId,
            ts: messageId,
            text: content,
        });
    }

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        if (!this.app) throw new Error('Not connected');

        await this.app.client.chat.delete({
            channel: channelId,
            ts: messageId,
        });
    }

    // OAuth methods
    getAuthUrl(state: string): string {
        const clientId = process.env.SLACK_CLIENT_ID;
        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/callback/slack`;
        const scopes = [
            'channels:history',
            'channels:read',
            'chat:write',
            'users:read',
            'files:read',
            'groups:history',
            'groups:read',
            'im:history',
            'im:read',
            'mpim:history',
            'mpim:read',
        ].join(',');

        return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    }

    async handleAuthCallback(code: string, state: string): Promise<ChannelConfig> {
        const response = await fetch('https://slack.com/api/oauth.v2.access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.SLACK_CLIENT_ID!,
                client_secret: process.env.SLACK_CLIENT_SECRET!,
                code,
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/callback/slack`,
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(`Slack OAuth failed: ${data.error}`);
        }

        return {
            channelType: 'slack',
            credentials: {
                botToken: data.access_token,
                teamId: data.team.id,
                teamName: data.team.name,
                botUserId: data.bot_user_id,
            },
        };
    }

    /**
     * Parse Slack file attachments
     */
    private async parseAttachments(
        message: Record<string, unknown>,
        botToken: string
    ): Promise<ChannelAttachment[] | undefined> {
        const files = message.files as Array<{
            id: string;
            name: string;
            mimetype: string;
            size: number;
            url_private: string;
        }> | undefined;

        if (!files?.length) return undefined;

        return files.map(file => ({
            type: file.mimetype?.startsWith('image/') ? 'image' as const : 'file' as const,
            url: file.url_private,
            name: file.name,
            size: file.size,
            mimeType: file.mimetype,
        }));
    }

    /**
     * Send a file/image
     */
    async sendFile(
        channelId: string,
        fileUrl: string,
        filename: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.app) throw new Error('Not connected');

        const result = await this.app.client.files.uploadV2({
            channel_id: channelId,
            file: fileUrl,
            filename,
            thread_ts: options?.threadId,
        });

        return (result.file as { id?: string } | undefined)?.id ?? crypto.randomUUID();
    }

    /**
     * React to a message with an emoji
     */
    async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
        if (!this.app) throw new Error('Not connected');

        await this.app.client.reactions.add({
            channel: channelId,
            timestamp: messageId,
            name: emoji.replace(/:/g, ''),
        });
    }
}
