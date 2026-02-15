import type { AgentConfig } from "@/types/agent";
import { getModelById, getAllModels } from "@/lib/ai/models";
import type { ModelConfig, ModelCapability } from "@/lib/ai/providers/types";

// ============================================================================
// Task Analysis Types
// ============================================================================

export interface TaskAnalysis {
    type: TaskType;
    complexity: "simple" | "moderate" | "complex";
    requiredCapabilities: ModelCapability[];
    estimatedTokens: number;
    priority: "low" | "normal" | "high";
}

export type TaskType = 
    | "code"           // Code generation, review, debugging
    | "analysis"       // Data analysis, reasoning
    | "creative"       // Creative writing, brainstorming
    | "research"       // Information gathering, Q&A
    | "conversation"   // General chat
    | "image"          // Image-related tasks
    | "math"           // Mathematical computations
    | "unknown";

// ============================================================================
// Capability-Based Routing
// ============================================================================

/**
 * Analyze a task to determine required capabilities
 */
export function analyzeTask(input: string): TaskAnalysis {
    const lowerInput = input.toLowerCase();
    
    // Detect task type
    let type: TaskType = "conversation";
    const requiredCapabilities: ModelCapability[] = ["text"];
    
    // Code detection
    const codeKeywords = ["code", "function", "class", "implement", "debug", "fix", "error", "programming", "script", "api", "typescript", "javascript", "python"];
    if (codeKeywords.some(k => lowerInput.includes(k))) {
        type = "code";
        requiredCapabilities.push("code");
    }
    
    // Analysis/reasoning detection
    const analysisKeywords = ["analyze", "compare", "evaluate", "explain why", "reason", "think through", "step by step", "logic"];
    if (analysisKeywords.some(k => lowerInput.includes(k))) {
        type = "analysis";
        requiredCapabilities.push("reasoning");
    }
    
    // Image detection
    const imageKeywords = ["image", "picture", "photo", "screenshot", "diagram", "visual", "look at this"];
    if (imageKeywords.some(k => lowerInput.includes(k))) {
        type = "image";
        requiredCapabilities.push("vision");
    }
    
    // Creative writing detection
    const creativeKeywords = ["write", "story", "poem", "creative", "imagine", "describe", "narrative"];
    if (creativeKeywords.some(k => lowerInput.includes(k)) && type === "conversation") {
        type = "creative";
    }
    
    // Research detection
    const researchKeywords = ["search", "find", "lookup", "research", "what is", "how does", "who is"];
    if (researchKeywords.some(k => lowerInput.includes(k)) && type === "conversation") {
        type = "research";
    }
    
    // Math detection
    const mathKeywords = ["calculate", "math", "equation", "formula", "compute", "sum", "multiply"];
    if (mathKeywords.some(k => lowerInput.includes(k))) {
        type = "math";
    }
    
    // Complexity estimation
    let complexity: "simple" | "moderate" | "complex" = "simple";
    const wordCount = input.split(/\s+/).length;
    
    if (wordCount > 100 || input.includes("detailed") || input.includes("comprehensive")) {
        complexity = "complex";
    } else if (wordCount > 30 || type === "analysis" || type === "code") {
        complexity = "moderate";
    }
    
    // Token estimation (rough approximation: 1 word ≈ 1.3 tokens)
    const estimatedTokens = Math.ceil(wordCount * 1.3);
    
    // Priority detection
    let priority: "low" | "normal" | "high" = "normal";
    if (lowerInput.includes("urgent") || lowerInput.includes("important") || lowerInput.includes("critical")) {
        priority = "high";
    }
    
    return {
        type,
        complexity,
        requiredCapabilities,
        estimatedTokens,
        priority,
    };
}

/**
 * Match task requirements to agent capabilities
 */
export function matchAgentToTask(
    agents: AgentConfig[],
    analysis: TaskAnalysis
): AgentConfig[] {
    // Score each agent based on match
    const scored = agents.map(agent => {
        let score = 0;
        
        // Role match
        switch (analysis.type) {
            case "code":
                if (agent.role === "coder") score += 50;
                else if (agent.role === "assistant") score += 20;
                break;
            case "analysis":
                if (agent.role === "analyst") score += 50;
                else if (agent.role === "coder") score += 30;
                else if (agent.role === "assistant") score += 20;
                break;
            case "creative":
                if (agent.role === "writer") score += 50;
                else if (agent.role === "assistant") score += 30;
                break;
            case "research":
                if (agent.role === "researcher") score += 50;
                else if (agent.role === "assistant") score += 30;
                break;
            default:
                if (agent.role === "assistant") score += 40;
        }
        
        // Model capability match
        const model = getModelById(agent.modelId);
        if (model) {
            for (const cap of analysis.requiredCapabilities) {
                if (model.capabilities.includes(cap)) {
                    score += 20;
                }
            }
            
            // Complexity match
            if (analysis.complexity === "complex" && model.capabilities.includes("reasoning")) {
                score += 30;
            }
        }
        
        // Tool availability
        if (analysis.type === "research" && agent.tools?.includes("web_search")) {
            score += 25;
        }
        if (analysis.type === "code" && agent.tools?.includes("code_exec")) {
            score += 25;
        }
        
        return { agent, score };
    });
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    // Return top agents (at least 1, at most 3)
    const threshold = (scored[0]?.score ?? 0) * 0.7;
    return scored
        .filter(s => s.score >= threshold)
        .slice(0, 3)
        .map(s => s.agent);
}

// ============================================================================
// Cost-Based Routing
// ============================================================================

export interface CostEstimate {
    modelId: string;
    estimatedInputCost: number;
    estimatedOutputCost: number;
    totalEstimate: number;
}

/**
 * Estimate cost for a task using different models
 */
export function estimateCosts(
    input: string,
    models: ModelConfig[],
    expectedOutputTokens: number = 500
): CostEstimate[] {
    const inputTokens = Math.ceil(input.split(/\s+/).length * 1.3);
    
    return models.map(model => ({
        modelId: model.id,
        estimatedInputCost: (inputTokens / 1_000_000) * model.pricing.input,
        estimatedOutputCost: (expectedOutputTokens / 1_000_000) * model.pricing.output,
        totalEstimate: 
            (inputTokens / 1_000_000) * model.pricing.input +
            (expectedOutputTokens / 1_000_000) * model.pricing.output,
    }));
}

/**
 * Select model based on cost preferences
 */
export function selectByBudget(
    analysis: TaskAnalysis,
    maxCostPerMessage: number = 0.10 // Default 10 cents max
): ModelConfig | null {
    const allModels = getAllModels();
    const costs = estimateCosts("", allModels, analysis.complexity === "complex" ? 2000 : 500);
    
    // Filter models that fit budget
    const affordable = costs
        .filter(c => c.totalEstimate <= maxCostPerMessage)
        .sort((a, b) => a.totalEstimate - b.totalEstimate);
    
    // For complex tasks, prefer more capable models even if more expensive
    if (analysis.complexity === "complex") {
        const capableAffordable = affordable.filter(c => {
            const model = getModelById(c.modelId);
            return model?.capabilities.includes("reasoning");
        });
        const firstCapable = capableAffordable[0];
        if (firstCapable) {
            return getModelById(firstCapable.modelId) || null;
        }
    }

    // For simple tasks, prefer cheapest
    const firstAffordable = affordable[0];
    if (firstAffordable) {
        return getModelById(firstAffordable.modelId) || null;
    }

    return null;
}

// ============================================================================
// Quality-Based Routing
// ============================================================================

export interface QualityTier {
    tier: "budget" | "balanced" | "premium" | "frontier";
    models: string[];
}

const QUALITY_TIERS: QualityTier[] = [
    {
        tier: "frontier",
        models: ["o1", "claude-opus-4-20250514", "gemini-2.5-pro-preview-06-05"],
    },
    {
        tier: "premium",
        models: ["gpt-4o", "claude-sonnet-4-20250514", "grok-3"],
    },
    {
        tier: "balanced",
        models: ["gpt-4o-mini", "claude-3-5-haiku-20241022", "gemini-2.0-flash"],
    },
    {
        tier: "budget",
        models: ["gpt-4o-mini", "gemini-2.0-flash", "grok-3-fast"],
    },
];

/**
 * Get quality tier for a task
 */
export function getQualityTier(analysis: TaskAnalysis): QualityTier {
    // Default tier in case array access fails
    const defaultTier: QualityTier = {
        tier: "balanced",
        models: ["gpt-4o", "claude-sonnet-4-20250514", "gemini-2.5-pro-preview-06-05"],
    };

    // High priority + complex = frontier
    if (analysis.priority === "high" && analysis.complexity === "complex") {
        return QUALITY_TIERS[0] ?? defaultTier;
    }

    // Complex or high priority = premium
    if (analysis.complexity === "complex" || analysis.priority === "high") {
        return QUALITY_TIERS[1] ?? defaultTier;
    }

    // Moderate = balanced
    if (analysis.complexity === "moderate") {
        return QUALITY_TIERS[2] ?? defaultTier;
    }

    // Simple = budget
    return QUALITY_TIERS[3] ?? defaultTier;
}

// ============================================================================
// Latency-Based Routing
// ============================================================================

// Model latency estimates (in ms) - would be dynamically updated in production
const MODEL_LATENCIES: Record<string, number> = {
    // Fast models
    "gpt-4o-mini": 500,
    "gemini-2.0-flash": 400,
    "grok-3-fast": 450,
    "claude-3-5-haiku-20241022": 600,
    // Balanced models
    "gpt-4o": 1000,
    "claude-sonnet-4-20250514": 1200,
    "gemini-2.5-flash-preview-05-20": 800,
    "grok-3": 1100,
    // Slower but more capable
    "o1": 5000,
    "o1-mini": 3000,
    "claude-opus-4-20250514": 2500,
    "gemini-2.5-pro-preview-06-05": 2000,
};

/**
 * Get estimated latency for a model
 */
export function getModelLatency(modelId: string): number {
    return MODEL_LATENCIES[modelId] || 1500; // Default 1.5s
}

/**
 * Select model based on latency requirements
 */
export function selectByLatency(
    maxLatency: number = 2000, // Default 2 seconds
    requiredCapabilities: ModelCapability[] = []
): ModelConfig | null {
    const allModels = getAllModels();
    
    const suitable = allModels
        .filter(model => {
            // Check latency
            const latency = getModelLatency(model.id);
            if (latency > maxLatency) return false;
            
            // Check capabilities
            for (const cap of requiredCapabilities) {
                if (!model.capabilities.includes(cap)) return false;
            }
            
            return true;
        })
        .sort((a, b) => getModelLatency(a.id) - getModelLatency(b.id));
    
    return suitable[0] || null;
}

// ============================================================================
// Combined Intelligent Router
// ============================================================================

export interface RoutingDecision {
    selectedAgents: AgentConfig[];
    mode: "single" | "parallel" | "sequential";
    reasoning: string;
    estimatedCost: number;
    estimatedLatency: number;
}

export interface RoutingPreferences {
    maxCost?: number;
    maxLatency?: number;
    preferQuality?: boolean;
    preferSpeed?: boolean;
}

/**
 * Make an intelligent routing decision
 */
export function makeRoutingDecision(
    input: string,
    availableAgents: AgentConfig[],
    preferences: RoutingPreferences = {}
): RoutingDecision {
    const analysis = analyzeTask(input);
    const reasoning: string[] = [];
    
    reasoning.push(`Task type: ${analysis.type}, Complexity: ${analysis.complexity}`);
    
    // Get matched agents
    let selectedAgents = matchAgentToTask(availableAgents, analysis);
    reasoning.push(`Matched ${selectedAgents.length} agents based on capabilities`);
    
    // Apply cost filter if specified
    if (preferences.maxCost) {
        selectedAgents = selectedAgents.filter(agent => {
            const model = getModelById(agent.modelId);
            if (!model) return false;
            const cost = estimateCosts(input, [model])[0];
            return cost ? cost.totalEstimate <= preferences.maxCost! : false;
        });
        reasoning.push(`Filtered to ${selectedAgents.length} agents within budget`);
    }
    
    // Apply latency filter if specified
    if (preferences.maxLatency) {
        selectedAgents = selectedAgents.filter(agent => {
            return getModelLatency(agent.modelId) <= preferences.maxLatency!;
        });
        reasoning.push(`Filtered to ${selectedAgents.length} agents within latency requirements`);
    }
    
    // Determine mode
    let mode: "single" | "parallel" | "sequential" = "single";
    
    if (selectedAgents.length > 1) {
        if (analysis.complexity === "complex") {
            // Complex tasks benefit from multiple perspectives
            mode = "parallel";
            reasoning.push("Using parallel mode for complex task");
        } else if (selectedAgents.some(a => a.role === "reviewer")) {
            // If there's a reviewer, use sequential
            mode = "sequential";
            reasoning.push("Using sequential mode for review process");
        }
    }
    
    // Ensure at least one agent
    const firstAvailable = availableAgents[0];
    if (selectedAgents.length === 0 && firstAvailable) {
        selectedAgents = [firstAvailable];
        reasoning.push("Fell back to first available agent");
    }

    // Calculate estimates
    const estimatedCost = selectedAgents.reduce((sum, agent) => {
        const model = getModelById(agent.modelId);
        if (!model) return sum;
        const cost = estimateCosts(input, [model])[0];
        return sum + (cost?.totalEstimate ?? 0);
    }, 0);
    
    const estimatedLatency = mode === "parallel"
        ? Math.max(...selectedAgents.map(a => getModelLatency(a.modelId)))
        : selectedAgents.reduce((sum, a) => sum + getModelLatency(a.modelId), 0);
    
    return {
        selectedAgents,
        mode,
        reasoning: reasoning.join(". "),
        estimatedCost,
        estimatedLatency,
    };
}
