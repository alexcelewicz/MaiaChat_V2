/**
 * Channel Connector Base Classes and Types
 *
 * Provides the abstraction layer for multi-channel messaging integration.
 * Each channel (Slack, Discord, Telegram, etc.) implements this interface.
 */

// ============================================================================
// Message Types
// ============================================================================

export interface ChannelMessage {
    id: string;
    channelType: string;
    channelId: string;
    threadId?: string;
    content: string;
    contentType: 'text' | 'image' | 'file' | 'voice';
    attachments?: ChannelAttachment[];
    sender: {
        id: string;
        name: string;
        avatarUrl?: string;
    };
    timestamp: Date;
    replyTo?: string;
    metadata?: Record<string, unknown>;
}

export interface ChannelAttachment {
    type: 'image' | 'file' | 'audio' | 'video';
    url: string;
    name: string;
    size: number;
    mimeType?: string;
}

export interface SendMessageOptions {
    threadId?: string;
    replyTo?: string;
    attachments?: ChannelAttachment[];
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ChannelConfig {
    channelType: string;
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
}

export interface ChannelAccountConfig {
    autoReplyEnabled?: boolean;
    agentId?: string;
    allowedUsers?: string[];
    blockedUsers?: string[];
    responseDelay?: number;
    workingHours?: { start: string; end: string; timezone: string };
}

// ============================================================================
// Channel Connector Abstract Base Class
// ============================================================================

export abstract class ChannelConnector {
    /** Channel type identifier (e.g., 'slack', 'discord', 'telegram') */
    abstract readonly type: string;

    /** Human-readable channel name */
    abstract readonly name: string;

    // =========================================================================
    // Lifecycle Methods
    // =========================================================================

    /**
     * Connect to the channel with the given configuration
     */
    abstract connect(config: ChannelConfig): Promise<void>;

    /**
     * Disconnect from the channel and cleanup resources
     */
    abstract disconnect(): Promise<void>;

    /**
     * Check if the connector is currently connected
     */
    abstract isConnected(): boolean;

    // =========================================================================
    // Messaging Methods
    // =========================================================================

    /**
     * Send a message to a channel
     * @returns The message ID of the sent message
     */
    abstract sendMessage(
        channelId: string,
        content: string,
        options?: SendMessageOptions
    ): Promise<string>;

    /**
     * Edit an existing message
     */
    abstract editMessage(
        channelId: string,
        messageId: string,
        content: string
    ): Promise<void>;

    /**
     * Delete a message
     */
    abstract deleteMessage(
        channelId: string,
        messageId: string
    ): Promise<void>;

    // =========================================================================
    // Event Handlers (set by ChannelManager)
    // =========================================================================

    /** Called when a new message is received */
    onMessage?: (message: ChannelMessage) => Promise<void>;

    /** Called when a message is edited */
    onMessageEdit?: (message: ChannelMessage) => Promise<void>;

    /** Called when a message is deleted */
    onMessageDelete?: (channelId: string, messageId: string) => Promise<void>;

    /** Called on connection errors */
    onError?: (error: Error) => void;

    // =========================================================================
    // OAuth Methods (optional - for channels that require OAuth)
    // =========================================================================

    /**
     * Get the OAuth authorization URL
     * @param state Opaque state value for CSRF protection
     */
    getAuthUrl?(state: string): string;

    /**
     * Handle the OAuth callback and exchange code for tokens
     */
    handleAuthCallback?(code: string, state: string): Promise<ChannelConfig>;

    /**
     * Refresh an expired access token
     */
    refreshToken?(config: ChannelConfig): Promise<ChannelConfig>;
}

// ============================================================================
// Channel Type Constants
// ============================================================================

export const CHANNEL_TYPES = {
    SLACK: 'slack',
    DISCORD: 'discord',
    TELEGRAM: 'telegram',
    WEBCHAT: 'webchat',
    TEAMS: 'teams',
    MATRIX: 'matrix',
    WHATSAPP: 'whatsapp',
    SIGNAL: 'signal',
} as const;

export type ChannelType = typeof CHANNEL_TYPES[keyof typeof CHANNEL_TYPES];

// ============================================================================
// Channel Info (for UI display)
// ============================================================================

export interface ChannelInfo {
    type: ChannelType;
    name: string;
    icon: string;
    color: string;
    supportsOAuth: boolean;
    supportsWebhooks: boolean;
    supportsThreads: boolean;
}

export const CHANNEL_INFO: Record<ChannelType, ChannelInfo> = {
    slack: {
        type: 'slack',
        name: 'Slack',
        icon: '💬',
        color: 'bg-purple-500',
        supportsOAuth: true,
        supportsWebhooks: true,
        supportsThreads: true,
    },
    discord: {
        type: 'discord',
        name: 'Discord',
        icon: '🎮',
        color: 'bg-indigo-500',
        supportsOAuth: true,
        supportsWebhooks: true,
        supportsThreads: true,
    },
    telegram: {
        type: 'telegram',
        name: 'Telegram',
        icon: '✈️',
        color: 'bg-blue-500',
        supportsOAuth: false,
        supportsWebhooks: true,
        supportsThreads: true,
    },
    webchat: {
        type: 'webchat',
        name: 'WebChat',
        icon: '🌐',
        color: 'bg-gray-500',
        supportsOAuth: false,
        supportsWebhooks: false,
        supportsThreads: false,
    },
    teams: {
        type: 'teams',
        name: 'Microsoft Teams',
        icon: '👥',
        color: 'bg-blue-600',
        supportsOAuth: true,
        supportsWebhooks: true,
        supportsThreads: true,
    },
    matrix: {
        type: 'matrix',
        name: 'Matrix',
        icon: '🔗',
        color: 'bg-green-500',
        supportsOAuth: false,
        supportsWebhooks: false,
        supportsThreads: true,
    },
    whatsapp: {
        type: 'whatsapp',
        name: 'WhatsApp',
        icon: '📱',
        color: 'bg-green-600',
        supportsOAuth: false,
        supportsWebhooks: true,
        supportsThreads: false,
    },
    signal: {
        type: 'signal',
        name: 'Signal',
        icon: '🔒',
        color: 'bg-blue-500',
        supportsOAuth: false,
        supportsWebhooks: false,
        supportsThreads: false,
    },
};
