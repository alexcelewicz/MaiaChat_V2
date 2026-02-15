import { z } from "zod";

export type ToolId =
    | "web_search"
    | "code_executor"
    | "calculator"
    | "rag_search"
    | "url_fetch"
    | "json_processor"
    | "file_read"
    | "file_write"
    | "file_list"
    | "file_search"
    | "file_delete"
    | "file_move"
    | "shell_exec"
    | "channel_message"
    | "scheduled_task"
    | "email"
    | "coding_cli"
    | "workflow"
    | "google_calendar"
    | "github_integration"
    | "browser_automation"
    | "image_generation"
    | "crm"
    | "hubspot"
    | "asana"
    | "http_request"
    | "google_drive"
    | "twitter";

export interface Tool {
    id: ToolId;
    name: string;
    description: string;
    category: "search" | "code" | "data" | "utility" | "filesystem" | "system" | "integration";
    icon: string; // Lucide icon name
    schema: z.ZodTypeAny;
    execute: (params: Record<string, unknown>, context?: ToolContext) => Promise<ToolResult>;
    /** If true, this tool requires localFileAccessEnabled admin setting */
    requiresLocalAccess?: boolean;
}

export interface ToolContext {
    userId?: string;
    conversationId?: string;
    apiKeys?: Record<string, string>;
    maxDuration?: number;
    /** Whether local file system access is enabled (from admin settings) */
    localFileAccessEnabled?: boolean;
    /** Whether shell command execution is enabled (from admin settings) */
    commandExecutionEnabled?: boolean;
    /** Base directory for file operations (security boundary) */
    fileAccessBaseDir?: string;
    /** Per-user disk quota in MB for hosted mode workspaces */
    workspaceQuotaMb?: number;
    /** Whether this context is running in hosted sandbox mode */
    hostedSandbox?: boolean;
    /** User preferences (web search model, deep research model, etc.) */
    userPreferences?: {
        webSearchModel?: string;
        deepResearchModel?: string;
        [key: string]: unknown;
    };
}

export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
    metadata?: {
        executionTime?: number;
        source?: string;
        cached?: boolean;
        [key: string]: unknown;
    };
}

export interface ToolCall {
    toolId: ToolId;
    params: Record<string, unknown>;
}

export interface ToolResponse {
    toolId: ToolId;
    result: ToolResult;
    timestamp: Date;
}
