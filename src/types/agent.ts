import { z } from "zod";
import type { ProviderId } from "@/lib/ai/providers/types";

// ============================================================================
// Agent Configuration Types
// ============================================================================

/**
 * Agent role defines the primary function of the agent
 */
export type AgentRole =
    | "assistant"      // General purpose assistant
    | "coder"          // Code generation and review
    | "analyst"        // Data analysis and reasoning
    | "writer"         // Content creation
    | "researcher"     // Information gathering
    | "coordinator"    // Orchestrates other agents
    | "reviewer"       // Reviews and validates outputs
    | "custom";        // User-defined role

/**
 * Orchestration mode for multi-agent conversations
 */
export type OrchestrationMode =
    | "single"         // Single agent (default)
    | "sequential"     // Agents respond in order
    | "parallel"       // Agents respond simultaneously
    | "hierarchical"   // Coordinator delegates to specialists
    | "consensus"      // Multiple agents, synthesized response
    | "auto"           // System selects optimal mode

/**
 * Tool definitions for agent capabilities
 */
export type AgentTool =
    | "web_search"     // Search the internet
    | "code_exec"      // Execute shell commands (alias for shell_exec)
    | "file_read"      // Read files from local system
    | "file_write"     // Write files to local system
    | "file_list"      // List directory contents
    | "file_search"    // Search file contents
    | "file_delete"    // Delete files/directories
    | "file_move"      // Move/rename files
    | "shell_exec"     // Execute shell commands
    | "rag_search"     // Search user documents
    | "calculator"     // Mathematical calculations
    | "coding_cli"     // Execute coding tasks (Sherlock Fix)
    | "email"          // Email integration (Sherlock Fix)
    | "workflow"       // Workflow management (Sherlock Fix)
    | "skill"          // Plugin/skill tools
    | "custom";        // Custom tools

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const agentRoleSchema = z.enum([
    "assistant", "coder", "analyst", "writer",
    "researcher", "coordinator", "reviewer", "custom"
]);

export const orchestrationModeSchema = z.enum([
    "single", "sequential", "parallel", "hierarchical", "consensus", "auto"
]);

export const agentToolSchema = z.enum([
    "web_search", "code_exec", "file_read", "file_write",
    "file_list", "file_search", "file_delete", "file_move",
    "shell_exec", "rag_search", "calculator",
    "coding_cli", "email", "workflow", "skill", "custom"
]);

/**
 * Agent configuration schema
 */
export const agentConfigSchema = z.object({
    id: z.string().uuid().optional(), // Optional for creation
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    role: agentRoleSchema,
    provider: z.enum(["openai", "anthropic", "google", "xai", "perplexity", "openrouter", "ollama", "lmstudio", "deepgram"]),
    modelId: z.string().min(1),
    systemPrompt: z.string().max(10000).optional(),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().min(1).max(200000).optional(),
    thinkingBudget: z.number().min(1024).max(100000).optional(), // Extended thinking budget for Anthropic
    tools: z.array(agentToolSchema).default([]),
    geminiStoreIds: z.array(z.string().uuid()).optional(),
    canSeeOtherAgents: z.boolean().default(true),
    priority: z.number().min(0).max(100).default(50), // For ordering in sequential mode
    isActive: z.boolean().default(true),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Agent template for reusable configurations
 */
export const agentTemplateSchema = z.object({
    id: z.string().uuid().optional(),
    userId: z.string().uuid(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    config: agentConfigSchema,
    isDefault: z.boolean().default(false),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

/**
 * Orchestration configuration
 */
export const orchestrationConfigSchema = z.object({
    mode: orchestrationModeSchema.default("single"),
    agents: z.array(agentConfigSchema).default([]),
    coordinatorAgentId: z.string().uuid().optional(), // For hierarchical mode
    maxRounds: z.number().min(1).max(10).default(3), // For consensus mode
    timeout: z.number().min(1000).max(300000).default(60000), // ms
    enableDebug: z.boolean().default(false),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type AgentTemplate = z.infer<typeof agentTemplateSchema>;
export type OrchestrationConfig = z.infer<typeof orchestrationConfigSchema>;

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_AGENT_CONFIG: Omit<AgentConfig, "id" | "name"> = {
    description: "",
    role: "assistant",
    provider: "openai",
    modelId: "gpt-4o",
    systemPrompt: "You are a helpful AI assistant.",
    temperature: 0.7,
    tools: [],
    canSeeOtherAgents: true,
    priority: 50,
    isActive: true,
};

export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
    mode: "single",
    agents: [],
    maxRounds: 3,
    timeout: 60000,
    enableDebug: false,
};

// ============================================================================
// Preset Agent Templates
// ============================================================================

export const PRESET_AGENTS: Record<string, Omit<AgentConfig, "id">> = {
    general: {
        name: "General Assistant",
        description: "A helpful general-purpose assistant",
        role: "assistant",
        provider: "openai",
        modelId: "gpt-4o",
        systemPrompt: "You are a helpful, accurate, and friendly AI assistant. Provide clear and concise answers.",
        temperature: 0.7,
        tools: [],
        canSeeOtherAgents: true,
        priority: 50,
        isActive: true,
    },
    coder: {
        name: "Code Expert",
        description: "Specialized in code generation, review, and system operations",
        role: "coder",
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        systemPrompt: `You are an expert software engineer with full system access. You:
- Write clean, efficient, and well-documented code
- Follow best practices and design patterns
- Explain code changes clearly
- Consider edge cases and error handling
- Suggest improvements when appropriate
- Can read, write, and manage files on the local system
- Can execute shell commands to build, test, and deploy code`,
        temperature: 0.3,
        tools: ["code_exec", "file_read", "file_write", "file_list", "file_search", "shell_exec"],
        canSeeOtherAgents: true,
        priority: 50,
        isActive: true,
    },
    analyst: {
        name: "Data Analyst",
        description: "Specialized in data analysis and insights",
        role: "analyst",
        provider: "openai",
        modelId: "o1",
        systemPrompt: `You are a data analyst expert. You:
- Analyze data thoroughly and provide insights
- Use statistical methods appropriately
- Create clear visualizations when needed
- Explain complex findings in simple terms
- Identify patterns and anomalies
- Can read files from the local system for analysis`,
        temperature: 0.5,
        tools: ["calculator", "file_read", "file_list", "file_search"],
        canSeeOtherAgents: true,
        priority: 50,
        isActive: true,
    },
    writer: {
        name: "Content Writer",
        description: "Specialized in creating written content",
        role: "writer",
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        systemPrompt: `You are a professional content writer. You:
- Write engaging and well-structured content
- Adapt tone and style to the target audience
- Use clear and concise language
- Proofread and edit carefully
- Suggest improvements for clarity`,
        temperature: 0.8,
        tools: [],
        canSeeOtherAgents: true,
        priority: 50,
        isActive: true,
    },
    researcher: {
        name: "Research Assistant",
        description: "Specialized in research and information gathering",
        role: "researcher",
        provider: "google",
        modelId: "gemini-2.5-pro-preview-06-05",
        systemPrompt: `You are a research specialist. You:
- Gather information from multiple sources
- Verify facts and cite sources
- Synthesize information clearly
- Identify knowledge gaps
- Present balanced perspectives`,
        temperature: 0.5,
        tools: ["web_search", "rag_search"],
        canSeeOtherAgents: true,
        priority: 50,
        isActive: true,
    },
    sysadmin: {
        name: "System Agent",
        description: "Full local system access - file management, shell commands, automation",
        role: "assistant",
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        systemPrompt: `You are an autonomous system agent with full access to the local machine. You can:
- Read, write, create, delete, and move files and directories
- List and search directory contents
- Execute shell commands (bash, sh, PowerShell, cmd)
- Install software, run scripts, manage processes
- Organize files, process data, automate tasks

When asked to perform a task:
1. Break it into clear steps
2. Execute each step using the appropriate tool
3. Report results clearly
4. Handle errors gracefully

Always be careful with destructive operations - confirm before deleting important files.
Respect security boundaries set by the administrator.`,
        temperature: 0.3,
        tools: ["file_read", "file_write", "file_list", "file_search", "file_delete", "file_move", "shell_exec", "web_search"],
        canSeeOtherAgents: true,
        priority: 50,
        isActive: true,
    },
    coordinator: {
        name: "Task Coordinator",
        description: "Coordinates multi-agent tasks",
        role: "coordinator",
        provider: "openai",
        modelId: "gpt-4o",
        systemPrompt: `You are a task coordinator. You:
- Break down complex tasks into subtasks
- Assign tasks to appropriate specialists
- Monitor progress and quality
- Synthesize outputs from multiple agents
- Ensure coherent final deliverables`,
        temperature: 0.5,
        tools: [],
        canSeeOtherAgents: true,
        priority: 100, // Highest priority for coordinators
        isActive: true,
    },
};

// ============================================================================
// Agent State Types (for LangGraph)
// ============================================================================

export interface AgentMessage {
    agentId: string;
    agentName: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

export interface AgentState {
    conversationId: string;
    messages: AgentMessage[];
    activeAgents: AgentConfig[];
    orchestrationMode: OrchestrationMode;
    currentAgentIndex: number;
    round: number;
    isComplete: boolean;
    error?: string;
    debug?: {
        reasoning: string[];
        decisions: string[];
    };
}

export const initialAgentState = (
    conversationId: string,
    agents: AgentConfig[],
    mode: OrchestrationMode = "single"
): AgentState => ({
    conversationId,
    messages: [],
    activeAgents: agents,
    orchestrationMode: mode,
    currentAgentIndex: 0,
    round: 0,
    isComplete: false,
});
