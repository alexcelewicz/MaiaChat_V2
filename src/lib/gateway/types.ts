/**
 * Gateway Types
 *
 * Type definitions for the MaiaChat gateway client and protocol.
 * Based on Clawdbot gateway protocol with MaiaChat-specific extensions.
 */

// ============================================================================
// Protocol Types
// ============================================================================

export const PROTOCOL_VERSION = 1;

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

export interface RequestFrame {
    type: 'req';
    id: string;
    method: string;
    params?: unknown;
}

export interface ResponseFrame {
    type: 'res';
    id: string;
    ok: boolean;
    payload?: unknown;
    error?: ErrorShape;
}

export interface EventFrame {
    type: 'event';
    event: string;
    payload?: unknown;
    seq?: number;
    stateVersion?: StateVersion;
}

export interface ErrorShape {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
}

export interface StateVersion {
    version: number;
    ts: number;
}

// ============================================================================
// Connection Types
// ============================================================================

export interface ConnectParams {
    minProtocol: number;
    maxProtocol: number;
    client: ClientInfo;
    caps?: string[];
    auth?: AuthParams;
    tenant?: TenantInfo;
}

export interface ClientInfo {
    id: string;
    displayName?: string;
    version: string;
    platform: string;
    mode: 'frontend' | 'backend' | 'probe';
    instanceId?: string;
}

export interface AuthParams {
    token?: string;
    refreshToken?: string;
}

export interface TenantInfo {
    tenantId: string;
    userId: string;
    conversationId?: string;
}

export interface HelloOk {
    type: 'hello-ok';
    protocol: number;
    server: ServerInfo;
    features: FeatureSet;
    snapshot?: Snapshot;
    auth?: AuthResponse;
    policy: PolicyConfig;
}

export interface ServerInfo {
    version: string;
    commit?: string;
    host?: string;
    connId: string;
}

export interface FeatureSet {
    methods: string[];
    events: string[];
}

export interface AuthResponse {
    token?: string;
    expiresAt?: number;
    scopes?: string[];
}

export interface PolicyConfig {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
}

// ============================================================================
// Chat Types
// ============================================================================

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
    metadata?: ChatMessageMetadata;
}

export interface ChatMessageMetadata {
    model?: string;
    provider?: string;
    tokenUsage?: TokenUsage;
    channelType?: string;
    channelId?: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: string;
}

export interface ToolResult {
    toolCallId: string;
    result: unknown;
    error?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export interface ChatEvent {
    type: 'chat.start' | 'chat.chunk' | 'chat.end' | 'chat.error' | 'chat.abort';
    sessionKey: string;
    messageId?: string;
    content?: string;
    error?: ErrorShape;
    metadata?: ChatMessageMetadata;
}

export interface TickEvent {
    ts: number;
}

export interface ShutdownEvent {
    reason: string;
    restartExpectedMs?: number;
}

export interface SessionEvent {
    type: 'session.created' | 'session.updated' | 'session.deleted';
    sessionKey: string;
    data?: SessionData;
}

export interface SessionData {
    key: string;
    title?: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// Snapshot Types
// ============================================================================

export interface Snapshot {
    sessions?: SessionData[];
    channels?: ChannelStatus[];
    models?: ModelInfo[];
    agents?: AgentInfo[];
}

export interface ChannelStatus {
    type: string;
    id: string;
    name?: string;
    status: 'connected' | 'disconnected' | 'error';
    lastActivity?: number;
}

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    capabilities?: string[];
}

export interface AgentInfo {
    id: string;
    name: string;
    status: 'idle' | 'running' | 'error';
    currentTask?: string;
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface GatewayClientConfig {
    /** Gateway WebSocket URL */
    url: string;
    /** JWT auth token from MaiaChat */
    token: string;
    /** Tenant information */
    tenant: TenantInfo;
    /** Client display name */
    displayName?: string;
    /** Client version */
    version?: string;
    /** Platform identifier */
    platform?: string;
    /** Minimum protocol version supported */
    minProtocol?: number;
    /** Maximum protocol version supported */
    maxProtocol?: number;
    /** Auto-reconnect on disconnect */
    autoReconnect?: boolean;
    /** Maximum reconnect attempts */
    maxReconnectAttempts?: number;
    /** Base reconnect delay in ms */
    reconnectBaseDelay?: number;
}

export interface GatewayClientCallbacks {
    onConnected?: (hello: HelloOk) => void;
    onDisconnected?: (code: number, reason: string) => void;
    onError?: (error: Error) => void;
    onEvent?: (event: EventFrame) => void;
    onChatEvent?: (event: ChatEvent) => void;
    onSessionEvent?: (event: SessionEvent) => void;
    onReconnecting?: (attempt: number) => void;
}

// ============================================================================
// API Types
// ============================================================================

export interface GatewayTokenRequest {
    conversationId?: string;
    channelType?: string;
    channelId?: string;
    scopes?: string[];
}

export interface GatewayTokenResponse {
    token: string;
    expiresAt: number;
    gatewayUrl: string;
    tenant: TenantInfo;
}
