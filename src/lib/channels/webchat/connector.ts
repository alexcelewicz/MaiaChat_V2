/**
 * WebChat Channel Connector
 *
 * Provides real-time chat via WebSocket for web-based chat widgets.
 * This is a server-side connector that manages WebSocket connections.
 *
 * Protocol (aligned with WebChatWidget.tsx client):
 * - Client sends: { type: "auth", payload: { token, channelId } }
 * - Server responds: { type: "auth_success", sessionId, channelId }
 * - Client sends: { type: "chat.send", payload: { content } }
 * - Server responds: { type: "chat.start", messageId } -> { type: "chat.chunk", messageId, content } -> { type: "chat.end", messageId }
 * - Legacy: also accepts { type: "message", content } from older clients
 */

import WebSocket from 'ws';
import type { IncomingMessage } from 'http';

const { Server: WebSocketServer, OPEN: WS_OPEN } = WebSocket;
import {
    ChannelConnector,
    ChannelMessage,
    ChannelConfig,
    SendMessageOptions,
} from '../base';

interface WebChatClient {
    ws: WebSocket;
    channelId: string;
    userId?: string;
    sessionId: string;
    authenticated: boolean;
}

interface WebChatPayload {
    type: 'message' | 'chat.send' | 'auth' | 'typing' | 'read';
    messageId?: string;
    content?: string;
    senderId?: string;
    senderName?: string;
    payload?: {
        token?: string;
        channelId?: string;
        content?: string;
    };
}

export class WebChatConnector extends ChannelConnector {
    readonly type = 'webchat';
    readonly name = 'WebChat';

    private wss: InstanceType<typeof WebSocketServer> | null = null;
    private clients: Map<string, Set<WebChatClient>> = new Map();
    private config: ChannelConfig | null = null;

    async connect(config: ChannelConfig): Promise<void> {
        this.config = config;
        const port = Number(config.settings?.port ?? 18791);

        this.wss = new WebSocketServer({ port });

        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const channelId = url.searchParams.get('channelId') || 'webchat-default';
            const sessionId = url.searchParams.get('sessionId') || crypto.randomUUID();

            const client: WebChatClient = { ws, channelId, sessionId, authenticated: false };

            // Add client to channel
            if (!this.clients.has(channelId)) {
                this.clients.set(channelId, new Set());
            }
            this.clients.get(channelId)!.add(client);

            // Handle incoming messages
            ws.on('message', async (data: WebSocket.Data) => {
                try {
                    const payload = JSON.parse(data.toString()) as WebChatPayload;

                    if (payload.type === 'auth') {
                        // Client authentication request
                        const authChannelId = payload.payload?.channelId || channelId;
                        client.channelId = authChannelId;
                        client.authenticated = true;

                        // Move client to correct channel group if needed
                        if (authChannelId !== channelId) {
                            this.clients.get(channelId)?.delete(client);
                            if (!this.clients.has(authChannelId)) {
                                this.clients.set(authChannelId, new Set());
                            }
                            this.clients.get(authChannelId)!.add(client);
                        }

                        ws.send(JSON.stringify({
                            type: 'auth_success',
                            sessionId,
                            channelId: authChannelId,
                        }));
                    } else if (payload.type === 'chat.send' && payload.payload?.content) {
                        // New protocol: { type: "chat.send", payload: { content } }
                        const channelMessage: ChannelMessage = {
                            id: crypto.randomUUID(),
                            channelType: 'webchat',
                            channelId: client.channelId,
                            content: payload.payload.content,
                            contentType: 'text',
                            sender: {
                                id: sessionId,
                                name: 'Guest',
                            },
                            timestamp: new Date(),
                        };

                        await this.onMessage?.(channelMessage);
                    } else if (payload.type === 'message' && payload.content) {
                        // Legacy protocol: { type: "message", content }
                        const channelMessage: ChannelMessage = {
                            id: payload.messageId ?? crypto.randomUUID(),
                            channelType: 'webchat',
                            channelId: client.channelId,
                            content: payload.content,
                            contentType: 'text',
                            sender: {
                                id: payload.senderId ?? sessionId,
                                name: payload.senderName ?? 'Guest',
                            },
                            timestamp: new Date(),
                        };

                        await this.onMessage?.(channelMessage);
                    }
                } catch (error) {
                    console.error('[WebChat] Error processing message:', error);
                }
            });

            ws.on('close', () => {
                this.clients.get(client.channelId)?.delete(client);
                if (this.clients.get(client.channelId)?.size === 0) {
                    this.clients.delete(client.channelId);
                }
            });

            ws.on('error', (error: Error) => {
                console.error('[WebChat] WebSocket error:', error);
                this.onError?.(error);
            });

            // Send initial connected message (for legacy clients that don't send auth)
            ws.send(JSON.stringify({
                type: 'connected',
                sessionId,
                channelId,
            }));
        });

        console.log(`[WebChat] Server started on port ${port}`);
    }

    async disconnect(): Promise<void> {
        // Close all client connections
        for (const clients of this.clients.values()) {
            for (const client of clients) {
                client.ws.close(1000, 'Server shutting down');
            }
        }
        this.clients.clear();

        // Close the server
        await new Promise<void>((resolve) => {
            if (this.wss) {
                this.wss.close(() => resolve());
            } else {
                resolve();
            }
        });

        this.wss = null;
        console.log('[WebChat] Server stopped');
    }

    isConnected(): boolean {
        return this.wss !== null;
    }

    async sendMessage(
        channelId: string,
        content: string,
        options?: SendMessageOptions
    ): Promise<string> {
        const messageId = crypto.randomUUID();
        const clients = this.clients.get(channelId) ?? new Set();

        // Send using streaming protocol that WebChatWidget expects:
        // chat.start -> chat.chunk (full content) -> chat.end
        const startPayload = JSON.stringify({
            type: 'chat.start',
            messageId,
        });

        const chunkPayload = JSON.stringify({
            type: 'chat.chunk',
            messageId,
            content,
        });

        const endPayload = JSON.stringify({
            type: 'chat.end',
            messageId,
        });

        // Also send as legacy 'message' type for backwards compatibility
        const legacyPayload = JSON.stringify({
            type: 'message',
            messageId,
            content,
            threadId: options?.threadId,
            replyTo: options?.replyTo,
            timestamp: new Date().toISOString(),
            sender: {
                id: 'assistant',
                name: 'AI Assistant',
            },
        });

        for (const client of clients) {
            if (client.ws.readyState === WS_OPEN) {
                if (client.authenticated) {
                    // New protocol client
                    client.ws.send(startPayload);
                    client.ws.send(chunkPayload);
                    client.ws.send(endPayload);
                } else {
                    // Legacy client
                    client.ws.send(legacyPayload);
                }
            }
        }

        return messageId;
    }

    async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
        const clients = this.clients.get(channelId) ?? new Set();
        const payload = JSON.stringify({
            type: 'edit',
            messageId,
            content,
            timestamp: new Date().toISOString(),
        });

        for (const client of clients) {
            if (client.ws.readyState === WS_OPEN) {
                client.ws.send(payload);
            }
        }
    }

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        const clients = this.clients.get(channelId) ?? new Set();
        const payload = JSON.stringify({
            type: 'delete',
            messageId,
        });

        for (const client of clients) {
            if (client.ws.readyState === WS_OPEN) {
                client.ws.send(payload);
            }
        }
    }

    /**
     * Get the number of connected clients for a channel
     */
    getClientCount(channelId: string): number {
        return this.clients.get(channelId)?.size ?? 0;
    }

    /**
     * Send a typing indicator to all clients in a channel
     */
    sendTypingIndicator(channelId: string, isTyping: boolean): void {
        const clients = this.clients.get(channelId) ?? new Set();
        const payload = JSON.stringify({
            type: 'typing',
            isTyping,
            sender: {
                id: 'assistant',
                name: 'AI Assistant',
            },
        });

        for (const client of clients) {
            if (client.ws.readyState === WS_OPEN) {
                client.ws.send(payload);
            }
        }
    }
}
