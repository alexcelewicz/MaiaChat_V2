/**
 * Gateway Client
 *
 * WebSocket client for connecting to the Clawdbot gateway from MaiaChat UI.
 * Handles authentication, reconnection, and event mapping.
 */

import {
    PROTOCOL_VERSION,
    type GatewayClientConfig,
    type GatewayClientCallbacks,
    type RequestFrame,
    type ResponseFrame,
    type EventFrame,
    type HelloOk,
    type ConnectParams,
    type ChatEvent,
    type SessionEvent,
    type ErrorShape,
} from './types';

// ============================================================================
// Types
// ============================================================================

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

export type GatewayClientState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// ============================================================================
// Gateway Client
// ============================================================================

export class GatewayClient {
    private config: GatewayClientConfig;
    private callbacks: GatewayClientCallbacks;
    private ws: WebSocket | null = null;
    private pending = new Map<string, PendingRequest>();
    private state: GatewayClientState = 'disconnected';
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private lastSeq: number | null = null;
    private lastTick: number | null = null;
    private tickTimer: ReturnType<typeof setInterval> | null = null;
    private tickIntervalMs = 30_000;
    private connectionId: string | null = null;

    constructor(config: GatewayClientConfig, callbacks: GatewayClientCallbacks = {}) {
        this.config = {
            autoReconnect: true,
            maxReconnectAttempts: 10,
            reconnectBaseDelay: 1000,
            minProtocol: PROTOCOL_VERSION,
            maxProtocol: PROTOCOL_VERSION,
            version: '1.0.0',
            platform: 'web',
            ...config,
        };
        this.callbacks = callbacks;
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Connect to the gateway
     */
    connect(): void {
        if (this.state === 'connected' || this.state === 'connecting') {
            return;
        }

        this.state = 'connecting';
        this.createWebSocket();
    }

    /**
     * Disconnect from the gateway
     */
    disconnect(): void {
        this.state = 'disconnected';
        this.clearReconnectTimer();
        this.clearTickTimer();

        if (this.ws) {
            this.ws.close(1000, 'client disconnect');
            this.ws = null;
        }

        this.flushPendingErrors(new Error('Client disconnected'));
    }

    /**
     * Get the current connection state
     */
    getState(): GatewayClientState {
        return this.state;
    }

    /**
     * Get the connection ID
     */
    getConnectionId(): string | null {
        return this.connectionId;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * Send a chat message
     */
    async sendChatMessage(
        sessionKey: string,
        content: string,
        options: {
            model?: string;
            systemPrompt?: string;
            attachments?: Array<{ type: string; data: string }>;
        } = {}
    ): Promise<{ messageId: string }> {
        return this.request('chat.send', {
            sessionKey,
            content,
            ...options,
        });
    }

    /**
     * Abort a chat generation
     */
    async abortChat(sessionKey: string): Promise<void> {
        await this.request('chat.abort', { sessionKey });
    }

    /**
     * Get chat history for a session
     */
    async getChatHistory(
        sessionKey: string,
        options: { limit?: number; before?: string } = {}
    ): Promise<{ messages: unknown[]; hasMore: boolean }> {
        return this.request('chat.history', {
            sessionKey,
            ...options,
        });
    }

    /**
     * List sessions
     */
    async listSessions(options: { limit?: number; offset?: number } = {}): Promise<{
        sessions: unknown[];
        total: number;
    }> {
        return this.request('sessions.list', options);
    }

    /**
     * Create a new session
     */
    async createSession(options: {
        title?: string;
        agentId?: string;
        channelType?: string;
        channelId?: string;
    } = {}): Promise<{ sessionKey: string }> {
        return this.request('sessions.create', options);
    }

    /**
     * Delete a session
     */
    async deleteSession(sessionKey: string): Promise<void> {
        await this.request('sessions.delete', { sessionKey });
    }

    /**
     * Get channel status
     */
    async getChannelStatus(): Promise<{ channels: unknown[] }> {
        return this.request('channels.status', {});
    }

    /**
     * Send a low-level request
     */
    async request<T = unknown>(method: string, params?: unknown): Promise<T> {
        if (!this.isConnected()) {
            throw new Error('Gateway not connected');
        }

        const id = crypto.randomUUID();
        const frame: RequestFrame = {
            type: 'req',
            id,
            method,
            params,
        };

        return new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Request timeout: ${method}`));
            }, 30_000);

            this.pending.set(id, {
                resolve: (value) => resolve(value as T),
                reject,
                timeout,
            });

            this.ws!.send(JSON.stringify(frame));
        });
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    private createWebSocket(): void {
        try {
            this.ws = new WebSocket(this.config.url);

            this.ws.onopen = () => {
                this.sendConnect();
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onclose = (event) => {
                this.handleClose(event.code, event.reason);
            };

            this.ws.onerror = (event) => {
                this.handleError(new Error('WebSocket error'));
            };
        } catch (error) {
            this.handleError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private sendConnect(): void {
        const params: ConnectParams = {
            minProtocol: this.config.minProtocol!,
            maxProtocol: this.config.maxProtocol!,
            client: {
                id: 'maiachat-web',
                displayName: this.config.displayName || 'MaiaChat Web',
                version: this.config.version!,
                platform: this.config.platform!,
                mode: 'frontend',
            },
            caps: ['chat', 'channels', 'sessions'],
            auth: {
                token: this.config.token,
            },
            tenant: this.config.tenant,
        };

        this.request<HelloOk>('connect', params)
            .then((hello) => {
                this.state = 'connected';
                this.reconnectAttempts = 0;
                this.connectionId = hello.server.connId;
                this.tickIntervalMs = hello.policy.tickIntervalMs;
                this.lastTick = Date.now();
                this.startTickWatch();
                this.callbacks.onConnected?.(hello);
            })
            .catch((error) => {
                this.handleError(error);
                this.ws?.close(1008, 'connect failed');
            });
    }

    private handleMessage(data: string): void {
        try {
            const parsed = JSON.parse(data);

            if (this.isEventFrame(parsed)) {
                this.handleEvent(parsed);
                return;
            }

            if (this.isResponseFrame(parsed)) {
                this.handleResponse(parsed);
                return;
            }
        } catch (error) {
            console.error('[Gateway] Message parse error:', error);
        }
    }

    private handleEvent(event: EventFrame): void {
        // Update sequence tracking
        if (typeof event.seq === 'number') {
            if (this.lastSeq !== null && event.seq > this.lastSeq + 1) {
                console.warn(`[Gateway] Event sequence gap: expected ${this.lastSeq + 1}, got ${event.seq}`);
            }
            this.lastSeq = event.seq;
        }

        // Handle tick events
        if (event.event === 'tick') {
            this.lastTick = Date.now();
            return;
        }

        // Emit generic event
        this.callbacks.onEvent?.(event);

        // Route to specific handlers
        if (event.event.startsWith('chat.')) {
            this.callbacks.onChatEvent?.(event.payload as ChatEvent);
        } else if (event.event.startsWith('session.')) {
            this.callbacks.onSessionEvent?.(event.payload as SessionEvent);
        }
    }

    private handleResponse(response: ResponseFrame): void {
        const pending = this.pending.get(response.id);
        if (!pending) return;

        clearTimeout(pending.timeout);
        this.pending.delete(response.id);

        if (response.ok) {
            pending.resolve(response.payload);
        } else {
            const error = response.error || { code: 'unknown', message: 'Unknown error' };
            pending.reject(new Error(`${error.code}: ${error.message}`));
        }
    }

    private handleClose(code: number, reason: string): void {
        this.ws = null;
        this.connectionId = null;
        this.clearTickTimer();
        this.flushPendingErrors(new Error(`Gateway closed: ${code} ${reason}`));

        this.callbacks.onDisconnected?.(code, reason);

        if (this.config.autoReconnect && this.state !== 'disconnected') {
            this.scheduleReconnect();
        } else {
            this.state = 'disconnected';
        }
    }

    private handleError(error: Error): void {
        console.error('[Gateway] Error:', error);
        this.callbacks.onError?.(error);
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
            this.state = 'disconnected';
            this.handleError(new Error('Max reconnect attempts exceeded'));
            return;
        }

        this.state = 'reconnecting';
        this.reconnectAttempts++;
        this.callbacks.onReconnecting?.(this.reconnectAttempts);

        const delay = Math.min(
            this.config.reconnectBaseDelay! * Math.pow(2, this.reconnectAttempts - 1),
            30_000
        );

        this.reconnectTimer = setTimeout(() => {
            this.createWebSocket();
        }, delay);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private startTickWatch(): void {
        this.clearTickTimer();
        this.tickTimer = setInterval(() => {
            if (!this.lastTick) return;
            const gap = Date.now() - this.lastTick;
            if (gap > this.tickIntervalMs * 2) {
                console.warn('[Gateway] Tick timeout, reconnecting...');
                this.ws?.close(4000, 'tick timeout');
            }
        }, this.tickIntervalMs);
    }

    private clearTickTimer(): void {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
    }

    private flushPendingErrors(error: Error): void {
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timeout);
            pending.reject(error);
        }
        this.pending.clear();
    }

    private isEventFrame(obj: unknown): obj is EventFrame {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            (obj as { type?: unknown }).type === 'event' &&
            typeof (obj as { event?: unknown }).event === 'string'
        );
    }

    private isResponseFrame(obj: unknown): obj is ResponseFrame {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            (obj as { type?: unknown }).type === 'res' &&
            typeof (obj as { id?: unknown }).id === 'string'
        );
    }
}

// ============================================================================
// Factory
// ============================================================================

let clientInstance: GatewayClient | null = null;

/**
 * Create or get the gateway client instance
 */
export function getGatewayClient(
    config?: GatewayClientConfig,
    callbacks?: GatewayClientCallbacks
): GatewayClient | null {
    if (!config && !clientInstance) {
        return null;
    }

    if (config) {
        // Close existing client if config changed
        if (clientInstance) {
            clientInstance.disconnect();
        }
        clientInstance = new GatewayClient(config, callbacks);
    }

    return clientInstance;
}

/**
 * Create a new gateway client (does not set as singleton)
 */
export function createGatewayClient(
    config: GatewayClientConfig,
    callbacks?: GatewayClientCallbacks
): GatewayClient {
    return new GatewayClient(config, callbacks);
}
