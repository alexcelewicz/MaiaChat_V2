'use client';

/**
 * useGateway Hook
 *
 * React hook for connecting to and interacting with the gateway.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    GatewayClient,
    createGatewayClient,
    type GatewayClientState,
} from './client';
import type {
    GatewayTokenResponse,
    HelloOk,
    ChatEvent,
    SessionEvent,
    EventFrame,
} from './types';

// ============================================================================
// Types
// ============================================================================

export interface UseGatewayOptions {
    /** Auto-connect on mount */
    autoConnect?: boolean;
    /** Conversation ID to scope the connection */
    conversationId?: string;
    /** Channel type for channel-scoped connections */
    channelType?: string;
    /** Channel ID for channel-scoped connections */
    channelId?: string;
}

export interface UseGatewayReturn {
    /** Current connection state */
    state: GatewayClientState;
    /** Whether connected to gateway */
    isConnected: boolean;
    /** Connection error if any */
    error: Error | null;
    /** Server info after connection */
    serverInfo: HelloOk['server'] | null;
    /** Connect to gateway */
    connect: () => Promise<void>;
    /** Disconnect from gateway */
    disconnect: () => void;
    /** Send a chat message */
    sendMessage: (
        sessionKey: string,
        content: string,
        options?: { model?: string; systemPrompt?: string }
    ) => Promise<{ messageId: string }>;
    /** Abort current chat generation */
    abortChat: (sessionKey: string) => Promise<void>;
    /** Get chat history */
    getChatHistory: (
        sessionKey: string,
        options?: { limit?: number; before?: string }
    ) => Promise<{ messages: unknown[]; hasMore: boolean }>;
    /** List sessions */
    listSessions: (options?: { limit?: number; offset?: number }) => Promise<{
        sessions: unknown[];
        total: number;
    }>;
    /** Create a new session */
    createSession: (options?: {
        title?: string;
        agentId?: string;
    }) => Promise<{ sessionKey: string }>;
    /** Subscribe to chat events */
    onChatEvent: (handler: (event: ChatEvent) => void) => () => void;
    /** Subscribe to session events */
    onSessionEvent: (handler: (event: SessionEvent) => void) => () => void;
    /** Subscribe to all events */
    onEvent: (handler: (event: EventFrame) => void) => () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGateway(options: UseGatewayOptions = {}): UseGatewayReturn {
    const { autoConnect = false, conversationId, channelType, channelId } = options;

    const [state, setState] = useState<GatewayClientState>('disconnected');
    const [error, setError] = useState<Error | null>(null);
    const [serverInfo, setServerInfo] = useState<HelloOk['server'] | null>(null);

    const clientRef = useRef<GatewayClient | null>(null);
    const chatEventHandlersRef = useRef<Set<(event: ChatEvent) => void>>(new Set());
    const sessionEventHandlersRef = useRef<Set<(event: SessionEvent) => void>>(new Set());
    const eventHandlersRef = useRef<Set<(event: EventFrame) => void>>(new Set());

    // ========================================================================
    // Connection Management
    // ========================================================================

    const connect = useCallback(async () => {
        if (clientRef.current?.isConnected()) {
            return;
        }

        try {
            setError(null);
            setState('connecting');

            // Fetch gateway token from API
            const response = await fetch('/api/gateway/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId, channelType, channelId }),
            });

            if (!response.ok) {
                throw new Error('Failed to get gateway token');
            }

            const tokenData: GatewayTokenResponse = await response.json();

            // Create and connect client
            const client = createGatewayClient(
                {
                    url: tokenData.gatewayUrl,
                    token: tokenData.token,
                    tenant: tokenData.tenant,
                    displayName: 'MaiaChat Web',
                },
                {
                    onConnected: (hello) => {
                        setState('connected');
                        setServerInfo(hello.server);
                    },
                    onDisconnected: (code, reason) => {
                        setState('disconnected');
                        console.log(`[Gateway] Disconnected: ${code} ${reason}`);
                    },
                    onError: (err) => {
                        setError(err);
                    },
                    onReconnecting: (attempt) => {
                        setState('reconnecting');
                        console.log(`[Gateway] Reconnecting (attempt ${attempt})`);
                    },
                    onChatEvent: (event) => {
                        for (const handler of chatEventHandlersRef.current) {
                            handler(event);
                        }
                    },
                    onSessionEvent: (event) => {
                        for (const handler of sessionEventHandlersRef.current) {
                            handler(event);
                        }
                    },
                    onEvent: (event) => {
                        for (const handler of eventHandlersRef.current) {
                            handler(event);
                        }
                    },
                }
            );

            clientRef.current = client;
            client.connect();
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            setState('disconnected');
        }
    }, [conversationId, channelType, channelId]);

    const disconnect = useCallback(() => {
        clientRef.current?.disconnect();
        clientRef.current = null;
        setState('disconnected');
        setServerInfo(null);
    }, []);

    // ========================================================================
    // Chat Methods
    // ========================================================================

    const sendMessage = useCallback(
        async (
            sessionKey: string,
            content: string,
            opts?: { model?: string; systemPrompt?: string }
        ) => {
            if (!clientRef.current?.isConnected()) {
                throw new Error('Gateway not connected');
            }
            return clientRef.current.sendChatMessage(sessionKey, content, opts);
        },
        []
    );

    const abortChat = useCallback(async (sessionKey: string) => {
        if (!clientRef.current?.isConnected()) {
            throw new Error('Gateway not connected');
        }
        return clientRef.current.abortChat(sessionKey);
    }, []);

    const getChatHistory = useCallback(
        async (sessionKey: string, opts?: { limit?: number; before?: string }) => {
            if (!clientRef.current?.isConnected()) {
                throw new Error('Gateway not connected');
            }
            return clientRef.current.getChatHistory(sessionKey, opts);
        },
        []
    );

    // ========================================================================
    // Session Methods
    // ========================================================================

    const listSessions = useCallback(
        async (opts?: { limit?: number; offset?: number }) => {
            if (!clientRef.current?.isConnected()) {
                throw new Error('Gateway not connected');
            }
            return clientRef.current.listSessions(opts);
        },
        []
    );

    const createSession = useCallback(
        async (opts?: { title?: string; agentId?: string }) => {
            if (!clientRef.current?.isConnected()) {
                throw new Error('Gateway not connected');
            }
            return clientRef.current.createSession(opts);
        },
        []
    );

    // ========================================================================
    // Event Subscriptions
    // ========================================================================

    const onChatEvent = useCallback((handler: (event: ChatEvent) => void) => {
        chatEventHandlersRef.current.add(handler);
        return () => {
            chatEventHandlersRef.current.delete(handler);
        };
    }, []);

    const onSessionEvent = useCallback((handler: (event: SessionEvent) => void) => {
        sessionEventHandlersRef.current.add(handler);
        return () => {
            sessionEventHandlersRef.current.delete(handler);
        };
    }, []);

    const onEvent = useCallback((handler: (event: EventFrame) => void) => {
        eventHandlersRef.current.add(handler);
        return () => {
            eventHandlersRef.current.delete(handler);
        };
    }, []);

    // ========================================================================
    // Effects
    // ========================================================================

    useEffect(() => {
        if (autoConnect) {
            connect();
        }

        return () => {
            clientRef.current?.disconnect();
        };
    }, [autoConnect, connect]);

    // ========================================================================
    // Return
    // ========================================================================

    return {
        state,
        isConnected: state === 'connected',
        error,
        serverInfo,
        connect,
        disconnect,
        sendMessage,
        abortChat,
        getChatHistory,
        listSessions,
        createSession,
        onChatEvent,
        onSessionEvent,
        onEvent,
    };
}
