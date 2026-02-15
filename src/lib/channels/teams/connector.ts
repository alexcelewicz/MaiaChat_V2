/**
 * Microsoft Teams Channel Connector
 *
 * Connects to Microsoft Teams using the Microsoft Bot Framework REST API.
 * This is a webhook-based connector - incoming messages are received via
 * the /api/channels/webhook/teams endpoint (Microsoft pushes messages to us).
 *
 * Requires a Microsoft Bot Framework registration with App ID and Password.
 * See: https://dev.botframework.com/
 */

import {
    ChannelConnector,
    ChannelMessage,
    ChannelConfig,
    SendMessageOptions,
    ChannelAttachment,
} from '../base';

// Microsoft Bot Framework API endpoints
const BOT_FRAMEWORK_TOKEN_URL = 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';
const BOT_FRAMEWORK_SCOPE = 'https://api.botframework.com/.default';

// Teams activity types
interface TeamsActivity {
    type: string;
    id: string;
    timestamp: string;
    channelId: string;
    conversation: {
        id: string;
        tenantId?: string;
        conversationType?: string;
        isGroup?: boolean;
        name?: string;
    };
    from: {
        id: string;
        name?: string;
        aadObjectId?: string;
    };
    recipient?: {
        id: string;
        name?: string;
    };
    text?: string;
    attachments?: Array<{
        contentType: string;
        contentUrl?: string;
        name?: string;
        content?: unknown;
    }>;
    replyToId?: string;
    serviceUrl: string;
    channelData?: {
        teamsChannelId?: string;
        teamsTeamId?: string;
        channel?: { id: string; name?: string };
        team?: { id: string; name?: string };
        tenant?: { id: string };
    };
}

export class TeamsConnector extends ChannelConnector {
    readonly type = 'teams';
    readonly name = 'Microsoft Teams';

    private config: ChannelConfig | null = null;
    private appId: string = '';
    private appPassword: string = '';
    private tenantId: string = '';
    private accessToken: string = '';
    private tokenExpiry: number = 0;
    private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;
    private connected: boolean = false;

    // Map of service URLs per conversation for sending messages
    private serviceUrls: Map<string, string> = new Map();

    async connect(config: ChannelConfig): Promise<void> {
        this.config = config;
        this.appId = config.credentials.appId;
        this.appPassword = config.credentials.appPassword;
        this.tenantId = config.credentials.tenantId || '';

        if (!this.appId || !this.appPassword) {
            throw new Error(
                'Teams connector requires credentials.appId and credentials.appPassword ' +
                '(Microsoft Bot Framework App ID and Password)'
            );
        }

        // Validate credentials by fetching an access token
        await this.refreshAccessToken();

        // Clear any existing timer to prevent leaks on repeated connect() calls
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
        }

        // Set up automatic token refresh (tokens expire in ~1 hour)
        this.tokenRefreshTimer = setInterval(async () => {
            try {
                await this.refreshAccessToken();
            } catch (error) {
                console.error('[Teams] Token refresh failed:', error);
                this.onError?.(error instanceof Error ? error : new Error(String(error)));
            }
        }, 45 * 60 * 1000); // Refresh every 45 minutes

        this.connected = true;
        console.log(`[Teams] Connector initialized for app ${this.appId}`);
        console.log('[Teams] Waiting for incoming messages via webhook at /api/channels/webhook/teams');
    }

    async disconnect(): Promise<void> {
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }

        this.accessToken = '';
        this.tokenExpiry = 0;
        this.serviceUrls.clear();
        this.connected = false;
        this.config = null;
        console.log('[Teams] Connector disconnected');
    }

    isConnected(): boolean {
        return this.connected;
    }

    async sendMessage(
        channelId: string,
        content: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.isConnected()) throw new Error('Not connected');

        await this.ensureValidToken();

        const serviceUrl = this.serviceUrls.get(channelId);
        if (!serviceUrl) {
            throw new Error(
                `No service URL found for conversation ${channelId}. ` +
                'A message must be received first before replies can be sent.'
            );
        }

        const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(channelId)}/activities`;

        const activity: Record<string, unknown> = {
            type: 'message',
            text: content,
            textFormat: 'markdown',
        };

        // Handle reply-to (thread reply)
        if (options?.replyTo) {
            activity.replyToId = options.replyTo;
        }

        // Handle attachments
        if (options?.attachments && options.attachments.length > 0) {
            activity.attachments = options.attachments.map(att => ({
                contentType: att.mimeType || 'application/octet-stream',
                contentUrl: att.url,
                name: att.name,
            }));
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(activity),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Teams API error (${response.status}): ${errorBody}`);
        }

        const result = await response.json() as { id: string };
        return result.id;
    }

    async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
        if (!this.isConnected()) throw new Error('Not connected');

        await this.ensureValidToken();

        const serviceUrl = this.serviceUrls.get(channelId);
        if (!serviceUrl) {
            throw new Error(`No service URL found for conversation ${channelId}`);
        }

        const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(channelId)}/activities/${encodeURIComponent(messageId)}`;

        const activity = {
            type: 'message',
            text: content,
            textFormat: 'markdown',
        };

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(activity),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Teams API error (${response.status}): ${errorBody}`);
        }
    }

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        if (!this.isConnected()) throw new Error('Not connected');

        await this.ensureValidToken();

        const serviceUrl = this.serviceUrls.get(channelId);
        if (!serviceUrl) {
            throw new Error(`No service URL found for conversation ${channelId}`);
        }

        const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(channelId)}/activities/${encodeURIComponent(messageId)}`;

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Teams API error (${response.status}): ${errorBody}`);
        }
    }

    // =========================================================================
    // Webhook handling - called from /api/channels/webhook/teams
    // =========================================================================

    /**
     * Process an incoming activity from the Teams webhook endpoint.
     * This should be called by the webhook API route handler.
     */
    async handleIncomingActivity(activity: TeamsActivity): Promise<void> {
        // Store the service URL for this conversation so we can reply later
        if (activity.serviceUrl && activity.conversation?.id) {
            this.serviceUrls.set(activity.conversation.id, activity.serviceUrl.replace(/\/$/, ''));
        }

        switch (activity.type) {
            case 'message':
                await this.handleMessageActivity(activity);
                break;
            case 'messageUpdate':
                await this.handleMessageUpdateActivity(activity);
                break;
            case 'messageDelete':
                await this.handleMessageDeleteActivity(activity);
                break;
            case 'conversationUpdate':
                // Members added/removed, conversation created, etc.
                console.log('[Teams] Conversation update:', activity.conversation.id);
                break;
            default:
                console.log(`[Teams] Unhandled activity type: ${activity.type}`);
        }
    }

    /**
     * Validate an incoming request from Microsoft Bot Framework.
     * Returns true if the request is authenticated.
     */
    async validateIncomingRequest(authHeader: string | undefined): Promise<boolean> {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return false;
        }

        const token = authHeader.substring(7);
        if (token.length === 0) return false;

        // Validate JWT structure (must have 3 base64 parts separated by dots)
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.warn('[Teams] Invalid JWT structure: expected 3 parts');
            return false;
        }

        try {
            // Decode and validate JWT payload
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

            // Verify issuer is Microsoft Bot Framework
            const validIssuers = [
                'https://api.botframework.com',
                'https://sts.windows.net/',
                'https://login.microsoftonline.com/',
            ];
            const issuer = payload.iss || '';
            if (!validIssuers.some(vi => issuer.startsWith(vi))) {
                console.warn(`[Teams] JWT issuer mismatch: ${issuer}`);
                return false;
            }

            // Verify audience matches our app ID
            if (this.appId && payload.aud !== this.appId) {
                console.warn(`[Teams] JWT audience mismatch: ${payload.aud} !== ${this.appId}`);
                return false;
            }

            // Verify token is not expired
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < now) {
                console.warn('[Teams] JWT token expired');
                return false;
            }

            return true;
        } catch (error) {
            console.warn('[Teams] Failed to decode JWT:', error);
            return false;
        }
    }

    // =========================================================================
    // OAuth methods
    // =========================================================================

    getAuthUrl(state: string): string {
        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/callback/teams`;
        const scope = 'https://api.botframework.com/.default';

        const tenantId = this.tenantId || 'common';

        return (
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
            `?client_id=${this.appId}` +
            `&response_type=code` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&scope=${encodeURIComponent(scope)}` +
            `&state=${state}`
        );
    }

    async handleAuthCallback(code: string, state: string): Promise<ChannelConfig> {
        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/callback/teams`;
        const tenantId = this.tenantId || 'common';

        const response = await fetch(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.appId,
                    client_secret: this.appPassword,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri,
                    scope: BOT_FRAMEWORK_SCOPE,
                }),
            }
        );

        const data = await response.json() as {
            access_token?: string;
            error?: string;
            error_description?: string;
        };

        if (data.error) {
            throw new Error(`Teams OAuth failed: ${data.error} - ${data.error_description}`);
        }

        return {
            channelType: 'teams',
            credentials: {
                appId: this.appId,
                appPassword: this.appPassword,
                tenantId: this.tenantId,
                accessToken: data.access_token ?? '',
            },
        };
    }

    // =========================================================================
    // Teams-specific methods
    // =========================================================================

    /**
     * Send a typing indicator to a conversation
     */
    async sendTypingIndicator(channelId: string): Promise<void> {
        if (!this.isConnected()) throw new Error('Not connected');

        await this.ensureValidToken();

        const serviceUrl = this.serviceUrls.get(channelId);
        if (!serviceUrl) return;

        const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(channelId)}/activities`;

        const activity = {
            type: 'typing',
        };

        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(activity),
        });
    }

    /**
     * Send an Adaptive Card message
     */
    async sendAdaptiveCard(
        channelId: string,
        card: Record<string, unknown>,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.isConnected()) throw new Error('Not connected');

        await this.ensureValidToken();

        const serviceUrl = this.serviceUrls.get(channelId);
        if (!serviceUrl) {
            throw new Error(`No service URL found for conversation ${channelId}`);
        }

        const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(channelId)}/activities`;

        const activity: Record<string, unknown> = {
            type: 'message',
            attachments: [
                {
                    contentType: 'application/vnd.microsoft.card.adaptive',
                    content: card,
                },
            ],
        };

        if (options?.replyTo) {
            activity.replyToId = options.replyTo;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(activity),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Teams API error (${response.status}): ${errorBody}`);
        }

        const result = await response.json() as { id: string };
        return result.id;
    }

    /**
     * Create a new 1:1 conversation with a user
     */
    async createConversation(
        serviceUrl: string,
        userId: string,
        tenantId?: string
    ): Promise<string> {
        if (!this.isConnected()) throw new Error('Not connected');

        await this.ensureValidToken();

        const url = `${serviceUrl.replace(/\/$/, '')}/v3/conversations`;

        const body: Record<string, unknown> = {
            bot: { id: this.appId },
            members: [{ id: userId }],
            channelData: tenantId ? { tenant: { id: tenantId } } : undefined,
            isGroup: false,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Teams API error (${response.status}): ${errorBody}`);
        }

        const result = await response.json() as { id: string };

        // Store the service URL for this new conversation
        this.serviceUrls.set(result.id, serviceUrl.replace(/\/$/, ''));

        return result.id;
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Get an access token from Microsoft identity platform
     */
    private async refreshAccessToken(): Promise<void> {
        const response = await fetch(BOT_FRAMEWORK_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.appId,
                client_secret: this.appPassword,
                scope: BOT_FRAMEWORK_SCOPE,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to get Teams access token (${response.status}): ${errorBody}`);
        }

        const data = await response.json() as {
            access_token: string;
            expires_in: number;
        };

        this.accessToken = data.access_token;
        // Set expiry with 5-minute buffer
        this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

        console.log('[Teams] Access token refreshed');
    }

    /**
     * Ensure the current access token is valid, refreshing if needed
     */
    private async ensureValidToken(): Promise<void> {
        if (!this.accessToken || Date.now() >= this.tokenExpiry) {
            await this.refreshAccessToken();
        }
    }

    /**
     * Handle an incoming message activity
     */
    private async handleMessageActivity(activity: TeamsActivity): Promise<void> {
        if (!activity.text && (!activity.attachments || activity.attachments.length === 0)) return;

        // Parse attachments
        const attachments: ChannelAttachment[] = (activity.attachments ?? [])
            .filter(att => att.contentUrl)
            .map(att => ({
                type: att.contentType?.startsWith('image/') ? 'image' as const :
                      att.contentType?.startsWith('audio/') ? 'audio' as const :
                      att.contentType?.startsWith('video/') ? 'video' as const : 'file' as const,
                url: att.contentUrl!,
                name: att.name ?? 'attachment',
                size: 0,
                mimeType: att.contentType,
            }));

        const channelMessage: ChannelMessage = {
            id: activity.id,
            channelType: 'teams',
            channelId: activity.conversation.id,
            content: activity.text ?? '',
            contentType: attachments.length > 0
                ? (attachments[0].type === 'image' ? 'image' : 'file')
                : 'text',
            attachments: attachments.length > 0 ? attachments : undefined,
            sender: {
                id: activity.from.id,
                name: activity.from.name ?? 'Unknown User',
            },
            timestamp: new Date(activity.timestamp),
            replyTo: activity.replyToId,
            metadata: {
                serviceUrl: activity.serviceUrl,
                tenantId: activity.channelData?.tenant?.id ?? activity.conversation.tenantId,
                teamId: activity.channelData?.teamsTeamId ?? activity.channelData?.team?.id,
                teamsChannelId: activity.channelData?.teamsChannelId ?? activity.channelData?.channel?.id,
                teamName: activity.channelData?.team?.name,
                channelName: activity.channelData?.channel?.name,
                isGroup: activity.conversation.isGroup,
            },
        };

        await this.onMessage?.(channelMessage);
    }

    /**
     * Handle a message update activity
     */
    private async handleMessageUpdateActivity(activity: TeamsActivity): Promise<void> {
        if (!activity.text) return;

        const channelMessage: ChannelMessage = {
            id: activity.id,
            channelType: 'teams',
            channelId: activity.conversation.id,
            content: activity.text,
            contentType: 'text',
            sender: {
                id: activity.from.id,
                name: activity.from.name ?? 'Unknown User',
            },
            timestamp: new Date(activity.timestamp),
        };

        await this.onMessageEdit?.(channelMessage);
    }

    /**
     * Handle a message delete activity
     */
    private async handleMessageDeleteActivity(activity: TeamsActivity): Promise<void> {
        await this.onMessageDelete?.(activity.conversation.id, activity.id);
    }
}
