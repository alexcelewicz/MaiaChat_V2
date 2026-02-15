import type { Tool, ToolId, ToolCall, ToolResult, ToolContext } from "./types";
import { webSearchTool } from "./web-search";
import { calculatorTool } from "./calculator";
import { urlFetchTool } from "./url-fetch";
import { ragSearchTool } from "./rag-search";
import { jsonProcessorTool } from "./json-processor";
import { fileReadTool, fileWriteTool, fileListTool, fileSearchTool, fileDeleteTool, fileMoveTool } from "./file-system";
import { shellExecTool } from "./shell-exec";
import { channelMessageTool } from "./channel-message";
import { scheduledTaskTool } from "./scheduled-task";
import { emailTool } from "./email";
import { codingCliTool } from "./coding-cli";
import { workflowTool } from "./workflow";
import { googleCalendarTool } from "./google-calendar";
import { githubIntegrationTool } from "./github-integration";
import { browserAutomationTool } from "./browser-automation";
import { imageGenerationTool } from "./image-generation";
import { crmTool } from "./crm";
import { hubspotTool } from "./hubspot";
import { asanaTool } from "./asana";
import { httpRequestTool } from "./http-request";
import { googleDriveTool } from "./google-drive";
import { twitterTool } from "./twitter";
import { logToolExecution, logToolDenied } from "./audit-logger";

export * from "./types";

// ============================================================================
// Tool Registry
// ============================================================================

const toolRegistry: Map<ToolId, Tool> = new Map([
    ["web_search", webSearchTool],
    ["calculator", calculatorTool],
    ["url_fetch", urlFetchTool],
    ["rag_search", ragSearchTool],
    ["json_processor", jsonProcessorTool],
    // File system tools (require localFileAccessEnabled)
    ["file_read", fileReadTool],
    ["file_write", fileWriteTool],
    ["file_list", fileListTool],
    ["file_search", fileSearchTool],
    ["file_delete", fileDeleteTool],
    ["file_move", fileMoveTool],
    // System tools (require commandExecutionEnabled)
    ["shell_exec", shellExecTool],
    // Channel messaging (proactive outreach)
    ["channel_message", channelMessageTool],
    // Scheduled task management
    ["scheduled_task", scheduledTaskTool],
    // Email integration (requires Google connection)
    // Email integration (requires Google connection)
    ["email", emailTool],
    // Coding CLI (requires local access & authorization)
    ["coding_cli", codingCliTool],
    // Workflow management
    ["workflow", workflowTool],
    // Google Calendar (requires Google connection)
    ["google_calendar", googleCalendarTool],
    // GitHub integration (requires GitHub token)
    ["github_integration", githubIntegrationTool],
    // Browser automation (requires local access)
    ["browser_automation", browserAutomationTool],
    // Image generation (multi-provider)
    ["image_generation", imageGenerationTool],
    // CRM (contact management)
    ["crm", crmTool],
    // HubSpot CRM (requires HubSpot connection)
    ["hubspot", hubspotTool],
    // Asana (requires Asana connection)
    ["asana", asanaTool],
    // Generic HTTP requests (URL allowlist enforced)
    ["http_request", httpRequestTool],
    // Google Drive (requires Google connection)
    ["google_drive", googleDriveTool],
    // Twitter/X (tiered API access)
    ["twitter", twitterTool],
]);

/**
 * Get all available tools
 */
export function getAllTools(): Tool[] {
    return Array.from(toolRegistry.values());
}

/**
 * Get a tool by ID
 */
export function getTool(id: ToolId): Tool | undefined {
    return toolRegistry.get(id);
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: Tool["category"]): Tool[] {
    return Array.from(toolRegistry.values()).filter(t => t.category === category);
}

/**
 * Get tools that require local access (for UI filtering)
 */
export function getLocalAccessTools(): Tool[] {
    return Array.from(toolRegistry.values()).filter(t => t.requiresLocalAccess);
}

/**
 * Get tools that do NOT require local access (always available)
 */
export function getCloudSafeTools(): Tool[] {
    return Array.from(toolRegistry.values()).filter(t => !t.requiresLocalAccess);
}

/**
 * Execute a tool call with access control enforcement
 */
export async function executeTool(
    call: ToolCall,
    context?: ToolContext
): Promise<ToolResult> {
    const tool = toolRegistry.get(call.toolId);

    if (!tool) {
        return {
            success: false,
            error: `Tool not found: ${call.toolId}`,
        };
    }

    // Access control: check if tool requires local access
    if (tool.requiresLocalAccess) {
        const isFileTool = tool.category === "filesystem";
        const isSystemTool = tool.category === "system";

        if (isFileTool && !context?.localFileAccessEnabled) {
            const reason = `File system access is disabled. Enable 'Local File Access' in the admin panel to use ${tool.name}.`;
            if (context?.userId) {
                logToolDenied(context.userId, call.toolId, tool.name, reason);
            }
            return { success: false, error: reason };
        }

        if (isSystemTool && !context?.commandExecutionEnabled) {
            const reason = `Command execution is disabled. Enable 'Command Execution' in the admin panel to use ${tool.name}.`;
            if (context?.userId) {
                logToolDenied(context.userId, call.toolId, tool.name, reason);
            }
            return { success: false, error: reason };
        }
    }

    // Validate parameters
    const validation = tool.schema.safeParse(call.params);
    if (!validation.success) {
        return {
            success: false,
            error: `Invalid parameters: ${validation.error.message}`,
        };
    }

    // Execute the tool with timing
    const startTime = Date.now();
    try {
        const result = await tool.execute(validation.data as Record<string, unknown>, context);
        const durationMs = Date.now() - startTime;

        // Audit log (fire-and-forget)
        if (context?.userId) {
            logToolExecution(
                context.userId,
                context.conversationId || null,
                call.toolId,
                tool.name,
                call.params,
                result,
                durationMs
            );
        }

        return result;
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const result: ToolResult = {
            success: false,
            error: error instanceof Error ? error.message : "Tool execution failed",
        };

        if (context?.userId) {
            logToolExecution(
                context.userId,
                context.conversationId || null,
                call.toolId,
                tool.name,
                call.params,
                result,
                durationMs
            );
        }

        return result;
    }
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeTools(
    calls: ToolCall[],
    context?: ToolContext
): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();

    const promises = calls.map(async (call, index) => {
        const result = await executeTool(call, context);
        // Use index-based key to prevent collisions when the same tool is called multiple times
        const key = calls.filter(c => c.toolId === call.toolId).length > 1
            ? `${call.toolId}_${index}`
            : call.toolId;
        results.set(key, result);
    });

    await Promise.all(promises);
    return results;
}

/**
 * Convert tools to AI SDK format for function calling
 */
export function toolsToAISDKFormat(toolIds?: ToolId[]): Record<string, unknown> {
    const tools: Record<string, unknown> = {};

    const selectedTools = toolIds
        ? toolIds.map(id => toolRegistry.get(id)).filter(Boolean)
        : Array.from(toolRegistry.values());

    for (const tool of selectedTools) {
        if (!tool) continue;

        tools[tool.id] = {
            description: tool.description,
            parameters: tool.schema,
        };
    }

    return tools;
}

/**
 * Get tool info for display
 */
export function getToolInfo(id: ToolId): {
    name: string;
    description: string;
    icon: string;
    category: string;
    requiresLocalAccess: boolean;
} | null {
    const tool = toolRegistry.get(id);
    if (!tool) return null;

    return {
        name: tool.name,
        description: tool.description,
        icon: tool.icon,
        category: tool.category,
        requiresLocalAccess: tool.requiresLocalAccess ?? false,
    };
}
