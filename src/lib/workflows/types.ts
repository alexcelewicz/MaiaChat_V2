/**
 * Workflow Types
 *
 * Type definitions for the deterministic workflow system.
 * Inspired by Clawdbot's Lobster extension.
 */

// ============================================================================
// Workflow Definition Types
// ============================================================================

export type StepType = "tool" | "llm" | "condition" | "approval" | "transform";

export interface WorkflowStep {
    id: string;
    name: string;
    type: StepType;

    // Tool execution
    tool?: string;
    action?: string;
    args?: Record<string, unknown>;

    // LLM step
    prompt?: string;
    model?: string;

    // Condition step
    condition?: string; // Expression like "$step1.success && $step2.value > 10"

    // Approval gate
    approval?: {
        required: boolean;
        prompt: string;
        timeout?: number; // Timeout in milliseconds
        items?: unknown[]; // Items to show for approval
    };

    // Transform step
    transform?: {
        input: string; // Expression to get input
        output: string; // Variable name to store result
        expression: string; // Transform expression
    };

    // Flow control
    onSuccess?: string; // Next step ID on success
    onFailure?: string; // Next step ID on failure
    continueOnError?: boolean;
}

export interface WorkflowDefinition {
    version: string;
    steps: WorkflowStep[];
    trigger?: {
        type: "manual" | "schedule" | "event";
        config?: Record<string, unknown>;
    };
    variables?: Record<string, unknown>;
    input?: {
        required?: string[];
        optional?: string[];
        schema?: Record<string, unknown>;
    };
    output?: {
        type?: string;
        schema?: Record<string, unknown>;
    };
}

export interface Workflow {
    id: string;
    userId: string;
    name: string;
    description?: string;
    definition: WorkflowDefinition;
    status: WorkflowStatus;
    isTemplate: boolean;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
}

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

// ============================================================================
// Workflow Run Types
// ============================================================================

export type WorkflowRunStatus =
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";

export interface StepResult {
    stepId: string;
    status: "success" | "failure" | "skipped";
    output?: unknown;
    error?: string;
    startedAt: Date;
    completedAt: Date;
    duration: number;
}

export interface WorkflowRunState {
    currentStepIndex: number;
    currentStepId: string | null;
    stepResults: Record<string, StepResult>;
    variables: Record<string, unknown>;
    pendingApproval?: {
        stepId: string;
        prompt: string;
        items?: unknown[];
        requestedAt: Date;
        expiresAt?: Date;
    };
}

export interface WorkflowRun {
    id: string;
    workflowId: string;
    userId: string;
    status: WorkflowRunStatus;
    state: WorkflowRunState;
    input?: Record<string, unknown>;
    output?: unknown;
    error?: string;
    resumeToken?: string;
    startedAt?: Date;
    pausedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
}

// ============================================================================
// Approval Types
// ============================================================================

export interface WorkflowApproval {
    id: string;
    runId: string;
    stepId: string;
    prompt: string;
    items?: unknown[];
    approved?: boolean;
    approvedBy?: string;
    approvedAt?: Date;
    expiresAt?: Date;
    createdAt: Date;
}

export interface ApprovalRequest {
    runId: string;
    stepId: string;
    prompt: string;
    items?: unknown[];
    resumeToken: string;
    expiresAt?: Date;
}

export interface ApprovalResponse {
    approved: boolean;
    resumeToken: string;
    comment?: string;
}

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecuteWorkflowOptions {
    workflowId: string;
    userId: string;
    input?: Record<string, unknown>;
    dryRun?: boolean;
}

export interface ResumeWorkflowOptions {
    resumeToken: string;
    approved: boolean;
    comment?: string;
}

export interface WorkflowExecutionResult {
    runId: string;
    status: WorkflowRunStatus;
    output?: unknown;
    error?: string;
    approval?: ApprovalRequest;
    completedSteps: string[];
    pendingSteps: string[];
}

// ============================================================================
// Tool Context
// ============================================================================

export interface WorkflowToolContext {
    userId: string;
    workflowId: string;
    runId: string;
    stepId: string;
    variables: Record<string, unknown>;
    previousResults: Record<string, StepResult>;
}

// ============================================================================
// Event Types
// ============================================================================

export type WorkflowEventType =
    | "workflow.started"
    | "workflow.completed"
    | "workflow.failed"
    | "workflow.paused"
    | "workflow.resumed"
    | "step.started"
    | "step.completed"
    | "step.failed"
    | "step.skipped"
    | "approval.requested"
    | "approval.received";

export interface WorkflowEvent {
    type: WorkflowEventType;
    timestamp: Date;
    runId: string;
    workflowId: string;
    stepId?: string;
    data?: unknown;
}

export type WorkflowEventHandler = (event: WorkflowEvent) => void | Promise<void>;

// ============================================================================
// Expression Evaluation
// ============================================================================

export interface ExpressionContext {
    $input: Record<string, unknown>;
    $output: unknown;
    [key: string]: unknown; // Step results accessible as $stepId
}

// ============================================================================
// Workflow Templates
// ============================================================================

export const WORKFLOW_TEMPLATES = {
    EMAIL_TRIAGE: {
        name: "Email Triage",
        description: "Search and categorize emails, optionally draft replies",
        definition: {
            version: "1.0.0",
            input: {
                required: ["query"],
                optional: ["maxResults"],
            },
            steps: [
                {
                    id: "search",
                    name: "Search Emails",
                    type: "tool" as StepType,
                    tool: "email",
                    action: "search",
                    args: {
                        query: "$input.query",
                        maxResults: "$input.maxResults || 20",
                    },
                },
                {
                    id: "categorize",
                    name: "Categorize Emails",
                    type: "llm" as StepType,
                    prompt: `Categorize these emails into:
                        - needs_reply: Requires a response
                        - needs_action: Requires action but not a reply
                        - fyi: Informational only

                        Emails: $search.output

                        Return JSON: { "needs_reply": [...], "needs_action": [...], "fyi": [...] }`,
                },
                {
                    id: "approve_replies",
                    name: "Approve Draft Replies",
                    type: "approval" as StepType,
                    condition: "$categorize.output.needs_reply.length > 0",
                    approval: {
                        required: true,
                        prompt: "Draft replies to these emails?",
                    },
                },
            ],
        },
    },

    DAILY_SUMMARY: {
        name: "Daily Summary",
        description: "Generate a daily summary of emails and calendar events",
        definition: {
            version: "1.0.0",
            steps: [
                {
                    id: "emails",
                    name: "Get Recent Emails",
                    type: "tool" as StepType,
                    tool: "email",
                    action: "search",
                    args: {
                        query: "newer_than:1d",
                        maxResults: 50,
                    },
                },
                {
                    id: "summarize",
                    name: "Generate Summary",
                    type: "llm" as StepType,
                    prompt: `Create a brief daily summary of these emails.
                        Group by: Important, Action Required, FYI.
                        Keep it concise.

                        Emails: $emails.output`,
                },
            ],
        },
    },
    MORNING_BRIEFING: {
        name: "Morning Briefing",
        description: "Daily briefing: calendar events, important emails, stale CRM contacts, and weather",
        category: "life_os",
        icon: "Sun",
        requiredIntegrations: ["google"],
        requiredTools: ["email", "google_calendar", "crm"],
        definition: {
            version: "1.0.0",
            trigger: { type: "schedule" as const, config: { cron: "0 7 * * *" } },
            steps: [
                {
                    id: "calendar",
                    name: "Get Today's Events",
                    type: "tool" as StepType,
                    tool: "google_calendar",
                    action: "list_events",
                    args: { timeMin: "$today_start", timeMax: "$today_end" },
                },
                {
                    id: "emails",
                    name: "Get Important Emails",
                    type: "tool" as StepType,
                    tool: "email",
                    action: "search",
                    args: { query: "is:unread is:important newer_than:1d", maxResults: 10 },
                },
                {
                    id: "stale_contacts",
                    name: "Get Stale Contacts",
                    type: "tool" as StepType,
                    tool: "crm",
                    action: "find_stale_contacts",
                },
                {
                    id: "briefing",
                    name: "Generate Briefing",
                    type: "llm" as StepType,
                    prompt: "Create a concise morning briefing from: Calendar: $calendar.output, Emails: $emails.output, Stale Contacts: $stale_contacts.output. Format with sections and priorities.",
                },
            ],
        },
    },

    WEEKLY_REVIEW: {
        name: "Weekly Review",
        description: "End-of-week summary: interaction stats, CRM activity, email volume, highlights",
        category: "life_os",
        icon: "BarChart3",
        requiredIntegrations: ["google"],
        requiredTools: ["email", "crm"],
        definition: {
            version: "1.0.0",
            trigger: { type: "schedule" as const, config: { cron: "0 18 * * FRI" } },
            steps: [
                {
                    id: "email_stats",
                    name: "Week's Email Stats",
                    type: "tool" as StepType,
                    tool: "email",
                    action: "search",
                    args: { query: "newer_than:7d", maxResults: 50 },
                },
                {
                    id: "crm_activity",
                    name: "CRM Activity Summary",
                    type: "tool" as StepType,
                    tool: "crm",
                    action: "morning_briefing",
                },
                {
                    id: "report",
                    name: "Generate Weekly Report",
                    type: "llm" as StepType,
                    prompt: "Create a weekly review report from: Emails: $email_stats.output, CRM: $crm_activity.output. Include metrics, highlights, and action items for next week.",
                },
            ],
        },
    },

    CONTENT_PIPELINE: {
        name: "Content Pipeline",
        description: "Fetch URL content, summarize, get approval, then post to channel",
        category: "content",
        icon: "FileText",
        requiredTools: ["url_fetch"],
        definition: {
            version: "1.0.0",
            trigger: { type: "manual" as const },
            input: { required: ["url"], optional: ["channel"] },
            steps: [
                {
                    id: "fetch",
                    name: "Fetch Content",
                    type: "tool" as StepType,
                    tool: "url_fetch",
                    action: "fetch",
                    args: { url: "$input.url" },
                },
                {
                    id: "summarize",
                    name: "Summarize Content",
                    type: "llm" as StepType,
                    prompt: "Summarize this content for sharing. Keep it concise (2-3 paragraphs max). Content: $fetch.output",
                },
                {
                    id: "approve",
                    name: "Approve Summary",
                    type: "approval" as StepType,
                    approval: { required: true, prompt: "Review and approve this summary before posting?" },
                },
                {
                    id: "post",
                    name: "Post to Channel",
                    type: "tool" as StepType,
                    tool: "channel_message",
                    action: "send",
                    args: { channel: "$input.channel", message: "$summarize.output" },
                },
            ],
        },
    },

    MEETING_PREP: {
        name: "Meeting Prep",
        description: "30 min before meetings: lookup attendees in CRM, get recent interactions, generate prep doc",
        category: "productivity",
        icon: "ClipboardList",
        requiredIntegrations: ["google"],
        requiredTools: ["google_calendar", "crm"],
        definition: {
            version: "1.0.0",
            trigger: { type: "event" as const, config: { type: "calendar_event", beforeMinutes: 30 } },
            steps: [
                {
                    id: "event",
                    name: "Get Event Details",
                    type: "tool" as StepType,
                    tool: "google_calendar",
                    action: "get_event",
                    args: { eventId: "$trigger.eventId" },
                },
                {
                    id: "attendees",
                    name: "Lookup Attendees in CRM",
                    type: "tool" as StepType,
                    tool: "crm",
                    action: "search_contacts",
                    args: { query: "$event.output.attendees" },
                },
                {
                    id: "prep",
                    name: "Generate Prep Doc",
                    type: "llm" as StepType,
                    prompt: "Create a meeting prep document. Event: $event.output, Attendees CRM Data: $attendees.output. Include: attendee backgrounds, recent interactions, talking points, preparation notes.",
                },
            ],
        },
    },

    CRM_AUTO_SYNC: {
        name: "CRM Auto-Sync",
        description: "Nightly: ingest Gmail contacts, Calendar events, deduplicate, update scores",
        category: "crm",
        icon: "RefreshCw",
        requiredIntegrations: ["google"],
        requiredTools: ["crm"],
        definition: {
            version: "1.0.0",
            trigger: { type: "schedule" as const, config: { cron: "0 2 * * *" } },
            steps: [
                {
                    id: "gmail_sync",
                    name: "Sync Gmail Contacts",
                    type: "tool" as StepType,
                    tool: "crm",
                    action: "sync",
                    args: { source: "gmail" },
                },
                {
                    id: "calendar_sync",
                    name: "Sync Calendar Events",
                    type: "tool" as StepType,
                    tool: "crm",
                    action: "sync",
                    args: { source: "calendar" },
                },
                {
                    id: "deduplicate",
                    name: "Deduplicate Contacts",
                    type: "tool" as StepType,
                    tool: "crm",
                    action: "deduplicate",
                    args: {},
                    continueOnError: true,
                },
                {
                    id: "enrich",
                    name: "Enrich New Contacts",
                    type: "tool" as StepType,
                    tool: "crm",
                    action: "enrich",
                    args: {},
                    continueOnError: true,
                },
                {
                    id: "summary",
                    name: "Generate Sync Report",
                    type: "llm" as StepType,
                    prompt: "Summarize the CRM sync results: Gmail: $gmail_sync.output, Calendar: $calendar_sync.output, Deduplication: $deduplicate.output, Enrichment: $enrich.output. Report new contacts, merged duplicates, enriched contacts, and any issues.",
                },
            ],
        },
    },

    DEAL_TRACKER: {
        name: "Deal Tracker",
        description: "Daily: check HubSpot deals, identify changes, analyze pipeline health",
        category: "sales",
        icon: "TrendingUp",
        requiredIntegrations: ["hubspot"],
        requiredTools: ["hubspot"],
        definition: {
            version: "1.0.0",
            trigger: { type: "schedule" as const, config: { cron: "0 9 * * *" } },
            steps: [
                {
                    id: "deals",
                    name: "Fetch HubSpot Deals",
                    type: "tool" as StepType,
                    tool: "hubspot",
                    action: "list_deals",
                },
                {
                    id: "analysis",
                    name: "Analyze Pipeline",
                    type: "llm" as StepType,
                    prompt: "Analyze this sales pipeline. Deals: $deals.output. Report: total pipeline value, deals by stage, deals at risk (stale >14 days), win probability trends, and recommended actions.",
                },
            ],
        },
    },

    AI_COUNCIL: {
        name: "AI Council",
        description: "Multi-agent debate: 4 perspectives (Growth, Revenue, Operations, Risk) with consensus",
        category: "strategy",
        icon: "Users",
        requiredTools: [],
        definition: {
            version: "1.0.0",
            trigger: { type: "manual" as const },
            input: { required: ["question"] },
            steps: [
                {
                    id: "growth",
                    name: "Growth Perspective",
                    type: "llm" as StepType,
                    prompt: "You are the Growth Advisor. Analyze this question from a growth/expansion perspective. Be bold and ambitious. Question: $input.question",
                },
                {
                    id: "revenue",
                    name: "Revenue Perspective",
                    type: "llm" as StepType,
                    prompt: "You are the Revenue Advisor. Analyze this question from a financial/ROI perspective. Focus on costs, revenue impact, and profitability. Question: $input.question",
                },
                {
                    id: "operations",
                    name: "Operations Perspective",
                    type: "llm" as StepType,
                    prompt: "You are the Operations Advisor. Analyze feasibility, implementation complexity, and operational requirements. Question: $input.question",
                },
                {
                    id: "risk",
                    name: "Risk Perspective",
                    type: "llm" as StepType,
                    prompt: "You are the Risk Advisor. Identify risks, downsides, failure modes, and mitigation strategies. Question: $input.question",
                },
                {
                    id: "consensus",
                    name: "Build Consensus",
                    type: "llm" as StepType,
                    prompt: "You are the Council Moderator. Synthesize these 4 perspectives into a balanced recommendation. Growth: $growth.output, Revenue: $revenue.output, Operations: $operations.output, Risk: $risk.output. Provide: unified recommendation, key trade-offs, and suggested next steps.",
                },
            ],
        },
    },
} as const;
