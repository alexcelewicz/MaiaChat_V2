/**
 * Memory Lifecycle Hooks
 *
 * Automatic memory recall and capture for AI conversations.
 * Inspired by Clawdbot's before_agent/after_agent pattern.
 *
 * Usage:
 * - beforeAgentStart(): Called before AI generates response, injects relevant memories
 * - afterAgentEnd(): Called after AI generates response, captures key facts
 */

import { getConfig, getMemoryConfig } from "@/lib/config";
import { searchLocalMemory, getLocalMemoryContext, appendToWorkingMemory, type MemoryEntry } from "./local-memory";
import { summarizeConversation } from "./summarizer";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";

// ============================================================================
// Types
// ============================================================================

export interface AgentContext {
    userId: string;
    conversationId: string;
    input: string;
    systemPrompt: string;
    channelType?: string;
    channelId?: string;
}

export interface AgentResponse {
    output: string;
    tokensUsed?: {
        input: number;
        output: number;
    };
    toolsCalled?: string[];
}

export interface MemoryInjection {
    systemPrompt: string;
    memoriesFound: number;
    memoryContext: string;
}

export interface FactCapture {
    captured: boolean;
    entryId?: string;
    facts?: string[];
    error?: string;
}

// ============================================================================
// Before Agent Start - Memory Recall
// ============================================================================

/**
 * Retrieve and inject relevant memories before agent runs
 *
 * @param context - The agent context with user input
 * @returns Modified system prompt with injected memories
 */
export async function beforeAgentStart(context: AgentContext): Promise<MemoryInjection> {
    try {
        const memoryConfig = await getMemoryConfig();

        // Check if auto-recall is enabled
        if (!memoryConfig.autoRecallEnabled) {
            return {
                systemPrompt: context.systemPrompt,
                memoriesFound: 0,
                memoryContext: "",
            };
        }

        const memoryMaxChars = memoryConfig.memoryMaxChars ?? 4000;

        // Search for relevant memories based on user input
        const relevantMemories = await searchLocalMemory(context.userId, context.input, 5);

        if (relevantMemories.length === 0) {
            // No relevant memories found, try getting recent context
            const recentContext = await getLocalMemoryContext(context.userId, "", memoryMaxChars);

            if (!recentContext) {
                return {
                    systemPrompt: context.systemPrompt,
                    memoriesFound: 0,
                    memoryContext: "",
                };
            }

            // Inject recent context
            const enhancedPrompt = injectMemoryContext(context.systemPrompt, recentContext, "recent");
            return {
                systemPrompt: enhancedPrompt,
                memoriesFound: 1,
                memoryContext: recentContext,
            };
        }

        // Build memory context from search results, truncating to configured limit
        const joined = relevantMemories.join("\n\n---\n\n");
        const memoryContext = truncateAtBoundary(joined, memoryMaxChars);

        // Inject into system prompt
        const enhancedPrompt = injectMemoryContext(context.systemPrompt, memoryContext, "relevant");

        console.log(`[MemoryHooks] Injected ${relevantMemories.length} relevant memories for user ${context.userId.slice(0, 8)}`);

        return {
            systemPrompt: enhancedPrompt,
            memoriesFound: relevantMemories.length,
            memoryContext,
        };
    } catch (error) {
        console.error("[MemoryHooks] Error in beforeAgentStart:", error);
        return {
            systemPrompt: context.systemPrompt,
            memoriesFound: 0,
            memoryContext: "",
        };
    }
}

/**
 * Truncate text at a clean `---` boundary to stay within maxChars
 */
function truncateAtBoundary(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const truncated = text.slice(0, maxChars);
    const lastBoundary = truncated.lastIndexOf("\n\n---\n\n");
    if (lastBoundary > 0) {
        return truncated.slice(0, lastBoundary);
    }
    return truncated;
}

/**
 * Inject memory context into system prompt
 */
function injectMemoryContext(
    systemPrompt: string,
    memoryContext: string,
    type: "relevant" | "recent"
): string {
    const header = type === "relevant"
        ? "## Relevant Memories\n\nThe following memories from previous conversations may be relevant:"
        : "## Recent Context\n\nHere is context from recent conversations:";

    const memorySection = `

${header}

<memories>
${memoryContext}
</memories>

Use this context to provide more personalized and contextually aware responses. Reference past discussions when relevant.

---

`;

    // Insert after the main system prompt, before any tool instructions
    if (systemPrompt.includes("## Available Tools")) {
        return systemPrompt.replace("## Available Tools", memorySection + "## Available Tools");
    }

    return systemPrompt + memorySection;
}

// ============================================================================
// After Agent End - Fact Capture
// ============================================================================

/**
 * Capture important facts after agent completes
 *
 * @param context - The original agent context
 * @param response - The agent's response
 * @returns Capture result with any extracted facts
 */
export async function afterAgentEnd(
    context: AgentContext,
    response: AgentResponse
): Promise<FactCapture> {
    try {
        const memoryConfig = await getMemoryConfig();

        // Check if auto-capture is enabled
        if (!memoryConfig.autoCaptureEnabled) {
            return { captured: false };
        }

        // Skip very short conversations (not worth capturing)
        if (context.input.length < 50 && response.output.length < 100) {
            return { captured: false };
        }

        // Skip if this looks like a command or quick query
        if (isQuickQuery(context.input)) {
            return { captured: false };
        }

        // Get user's API keys for summarization
        const apiKeys = await getUserApiKeys(context.userId);

        // Build conversation for summarization
        const messages = [
            { role: "user" as const, content: context.input },
            { role: "assistant" as const, content: response.output },
        ];

        // Summarize and extract facts
        const summary = await summarizeConversation(messages, apiKeys, {
            conversationId: context.conversationId,
            title: generateTitle(context.input),
        });

        // Only save if we extracted meaningful content
        if (!summary.summary && summary.keyFacts.length === 0) {
            return { captured: false };
        }

        // Create memory entry
        const entry: MemoryEntry = {
            conversationId: context.conversationId,
            title: generateTitle(context.input),
            timestamp: new Date().toISOString(),
            summary: summary.summary,
            topics: summary.topics,
            keyFacts: summary.keyFacts,
        };

        // Append to working memory
        await appendToWorkingMemory(context.userId, entry);

        console.log(`[MemoryHooks] Captured ${summary.keyFacts.length} facts for user ${context.userId.slice(0, 8)}`);

        return {
            captured: true,
            entryId: context.conversationId,
            facts: summary.keyFacts,
        };
    } catch (error) {
        console.error("[MemoryHooks] Error in afterAgentEnd:", error);
        return {
            captured: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Check if input is a quick query that doesn't need memory capture
 */
function isQuickQuery(input: string): boolean {
    const quickPatterns = [
        /^(hi|hello|hey|thanks|thank you|ok|okay|bye|goodbye)/i,
        /^\/\w+/,  // Commands
        /^(what time|what's the time|what date)/i,
        /^(yes|no|yep|nope|sure|maybe)$/i,
    ];

    return quickPatterns.some((p) => p.test(input.trim()));
}

/**
 * Generate a title from the user's input
 */
function generateTitle(input: string): string {
    // Take first 50 chars or first sentence
    const firstSentence = input.split(/[.!?]/)[0];
    const title = firstSentence.length > 50
        ? firstSentence.slice(0, 47) + "..."
        : firstSentence;

    return title || "Conversation";
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Run both hooks for a complete agent turn
 */
export async function runMemoryHooks(
    context: AgentContext,
    generateResponse: (
        enhancedContext: AgentContext,
        memoryInjection: MemoryInjection
    ) => Promise<AgentResponse>
): Promise<{
    response: AgentResponse;
    memoryInjection: MemoryInjection;
    factCapture: FactCapture;
}> {
    // Before: Inject memories
    const memoryInjection = await beforeAgentStart(context);
    const enhancedContext: AgentContext = {
        ...context,
        systemPrompt: memoryInjection.systemPrompt,
    };

    // Generate response with enhanced context
    const response = await generateResponse(enhancedContext, memoryInjection);

    // After: Capture facts
    const factCapture = await afterAgentEnd(context, response);

    return {
        response,
        memoryInjection,
        factCapture,
    };
}

/**
 * Check if memory hooks should be applied
 */
export async function shouldApplyMemoryHooks(userId: string): Promise<boolean> {
    try {
        const memoryConfig = await getMemoryConfig();
        return memoryConfig.autoRecallEnabled || memoryConfig.autoCaptureEnabled;
    } catch {
        return false;
    }
}
