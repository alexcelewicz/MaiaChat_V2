/**
 * MaiaChat Configuration Types
 *
 * Defines the structure of the unified configuration system.
 * Used for both JSON config files and runtime config objects.
 */

export interface MaiaChatConfig {
    $schema?: string;
    version: string;

    taskExecution: TaskExecutionConfig;
    notifications: NotificationsConfig;
    cli: CliConfig;
    tools: ToolsConfig;
    memory: MemoryConfig;
    skills: SkillsConfig;
    integrations: IntegrationsConfig;
    cost: CostConfig;
    channels: ChannelsConfig;
    agents: AgentsConfig;
    rateLimits: RateLimitsConfig;
    security: SecurityConfig;
    general: GeneralConfig;
    soul: SoulConfig;
}

export interface TaskExecutionConfig {
    /** Maximum retry attempts for task completion (default: 3) */
    maxAttempts: number;
    /** Timeout per attempt in milliseconds (default: 60000) */
    completionTimeout: number;
    /** Require tool call for scheduled task completion (default: true) */
    requireToolCallForScheduled: boolean;
}

export interface NotificationsConfig {
    /** Notify on original channel when task fails (default: true) */
    failureNotifyOriginalChannel: boolean;
    /** Also notify on Telegram when task fails (default: true) */
    failureNotifyTelegram: boolean;
    /** Default Telegram user ID for notifications */
    telegramUserId: string | null;
}

export interface CliConfig {
    /** Enable CLI tools (Claude Code, Gemini CLI) */
    enabled: boolean;
    /** Default CLI to use: 'claude' or 'gemini' */
    defaultCli: "claude" | "gemini";
    /** Skip permission prompts (--dangerously-skip-permissions) */
    skipPermissions: boolean;
    /** Root directory for CLI output files */
    workspaceRoot: string;
    /** Organize output files by task/date */
    organizeByTask: boolean;
}

export interface ToolsConfig {
    /** Enable local file system access */
    localFileAccessEnabled: boolean;
    /** Enable shell command execution */
    commandExecutionEnabled: boolean;
    /** Base directory for file access (null = unrestricted) */
    fileAccessBaseDir: string | null;
    /** Per-user disk quota in MB for hosted mode workspaces (default: 100) */
    workspaceQuotaMb: number;
}

export interface MemoryConfig {
    /** Auto-save conversations to memory */
    autoSave: boolean;
    /** Enable RAG (document search) */
    ragEnabled: boolean;
    /** Enable user profile learning */
    userProfileMemoryEnabled: boolean;
    /** Auto-recall relevant memories before agent runs */
    autoRecallEnabled: boolean;
    /** Auto-capture facts after agent runs */
    autoCaptureEnabled: boolean;
    /** Model used for Gemini retrieval */
    geminiRetrievalModel: string | null;
    /** Max characters for memory context injected into prompts (default: 4000) */
    memoryMaxChars: number;
}

export interface SkillsConfig {
    /** Enable loading skills from Clawdbot source */
    clawdbotSkillsEnabled: boolean;
    /** Path to clawdbot-source directory */
    clawdbotSourcePath: string;
    /** List of enabled skill slugs */
    enabledSkills: string[];
}

export interface GoogleIntegrationConfig {
    /** Enable Google integration */
    enabled: boolean;
    /** OAuth scopes to request */
    scopes: string[];
}

export interface HubSpotIntegrationConfig {
    /** Enable HubSpot integration */
    enabled: boolean;
}

export interface AsanaIntegrationConfig {
    /** Enable Asana integration */
    enabled: boolean;
}

export interface HttpRequestConfig {
    /** Enable HTTP request tool */
    enabled: boolean;
    /** Allowed domains ("*" explicitly allows all) */
    allowedDomains: string[];
}

export interface TwitterIntegrationConfig {
    /** Enable Twitter/X integration */
    enabled: boolean;
    /** Enable tier 1 (FXTwitter) */
    tier1Enabled: boolean;
    /** Enable tier 2 (TwitterAPI.io) */
    tier2Enabled: boolean;
    /** Enable tier 3 (X API v2) */
    tier3Enabled: boolean;
    /** Enable tier 4 (xAI/Grok analysis) */
    tier4Enabled: boolean;
    /** Enable fxtwitter URL conversion */
    fxTwitterEnabled: boolean;
    /** TwitterAPI.io key */
    twitterApiIoKey: string | null;
    /** X API bearer token */
    xApiBearerToken: string | null;
    /** xAI API key */
    xAiApiKey: string | null;
}

export interface IntegrationsConfig {
    google: GoogleIntegrationConfig;
    hubspot: HubSpotIntegrationConfig;
    asana: AsanaIntegrationConfig;
    httpRequest: HttpRequestConfig;
    twitter: TwitterIntegrationConfig;
}

export interface ChannelsConfig {
    /** Auto-start channel connectors on boot */
    autoStartOnBoot: boolean;
    /** Default number of context messages to include */
    defaultContextMessages: number;
    /** Default max output tokens when channel has no maxTokens set (default: 4096) */
    defaultMaxTokens: number;
}

export interface AgentsConfig {
    /** Enable background agent */
    backgroundAgentEnabled: boolean;
    /** Auto-start background agent on boot */
    backgroundAgentAutoStart: boolean;
    /** Default model for agents (null = auto-select) */
    defaultModel: string | null;
    /** Enable proactive messaging */
    proactiveMessagingEnabled: boolean;
    /** Enable event triggers */
    eventTriggersEnabled: boolean;
    /** Enable boot scripts */
    bootScriptsEnabled: boolean;
    /** Background agent heartbeat interval in milliseconds */
    heartbeatIntervalMs: number;
    /** Stale threshold in milliseconds (after which agent is considered stale) */
    staleThresholdMs: number;
}

export interface RateLimitsConfig {
    /** Max proactive messages per hour */
    proactiveMaxPerHour: number;
    /** Max proactive messages per day */
    proactiveMaxPerDay: number;
    /** Max trigger executions per hour */
    triggerMaxPerHour: number;
}

export interface SecurityConfig {
    /** Enable IP filtering */
    ipFilteringEnabled: boolean;
    /** Allowed IP addresses (whitelist) */
    allowedIps: string[];
    /** Blocked IP addresses (blacklist) */
    blockedIps: string[];
}

export interface GeneralConfig {
    /** Days to retain visitor data */
    visitorRetentionDays: number;
    /** Deployment mode: 'local', 'hosted', 'self-hosted' */
    deploymentMode: "local" | "hosted" | "self-hosted";
}

export interface CostConfig {
    /** Enable cost-aware model routing */
    costOptimizationEnabled: boolean;
    /** Monthly budget in USD (0 = unlimited) */
    monthlyBudgetUsd: number;
    /** Prefer cheaper fallback models */
    preferCheaperFallback: boolean;
    /** Alert when usage exceeds this percentage (0-100) */
    alertAtPercentage: number;
}

export interface SoulConfig {
    /** Enable soul personality system (default: true) */
    enabled: boolean;
    /** Max characters per soul file before trimming (default: 20000) */
    maxCharsPerFile: number;
}

/**
 * Partial config for updates (all fields optional)
 */
export type PartialMaiaChatConfig = {
    [K in keyof MaiaChatConfig]?: Partial<MaiaChatConfig[K]>;
};

/**
 * Config source priority (highest to lowest)
 */
export type ConfigSource = "file" | "database" | "env" | "default";

/**
 * Config load result with source tracking
 */
export interface ConfigLoadResult {
    config: MaiaChatConfig;
    sources: Record<string, ConfigSource>;
    errors: string[];
}
