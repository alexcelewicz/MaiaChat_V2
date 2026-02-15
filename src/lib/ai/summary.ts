/**
 * AI-powered summary and title generation utilities
 */

import { generateText } from "ai";
import { getModelWithKey } from "./providers/factory";
import type { ProviderId } from "./providers/types";

// ============================================================================
// Title Generation
// ============================================================================

const TITLE_GENERATION_PROMPT = `Generate a concise, descriptive title (5-7 words maximum) for a conversation that starts with this message and response.

User message: {USER_MESSAGE}

Assistant response: {ASSISTANT_RESPONSE}

Requirements:
- Maximum 7 words
- Capture the main topic or intent
- Do not include quotes or punctuation at the end
- Do not start with "Discussion about" or "Conversation on"
- Be specific and descriptive

Respond with ONLY the title, nothing else.`;

/**
 * Generate an AI-powered title for a conversation based on the first exchange
 * @param userMessage - The first user message
 * @param assistantResponse - The first assistant response
 * @param apiKeys - Available API keys for different providers
 * @param preferredModelId - Optional specific model ID to use for title generation
 */
export async function generateConversationTitle(
    userMessage: string,
    assistantResponse: string,
    apiKeys: Partial<Record<ProviderId, string>>,
    preferredModelId?: string
): Promise<string> {
    try {
        // Truncate inputs to avoid token limits
        const truncatedUser = userMessage.slice(0, 500);
        const truncatedResponse = assistantResponse.slice(0, 500);

        const prompt = TITLE_GENERATION_PROMPT
            .replace("{USER_MESSAGE}", truncatedUser)
            .replace("{ASSISTANT_RESPONSE}", truncatedResponse);

        let model;

        // If a preferred model is specified, try to use it
        if (preferredModelId) {
            try {
                model = getModelWithKey(preferredModelId, apiKeys);
            } catch {
                // Preferred model not available, fall through to auto-selection
            }
        }

        // If no model yet, use the first available provider's default model
        // This avoids hardcoding specific model IDs which become outdated
        if (!model) {
            const providerPriority: ProviderId[] = ["openrouter", "openai", "anthropic", "google", "xai"];

            for (const provider of providerPriority) {
                if (apiKeys[provider]) {
                    try {
                        // For OpenRouter, use a generic fast model pattern
                        // For others, try to get any model from that provider
                        const modelId = provider === "openrouter"
                            ? "openai/gpt-4o-mini" // OpenRouter format, widely available
                            : provider === "openai" ? "gpt-4o-mini"
                            : provider === "anthropic" ? "claude-3-5-haiku-20241022"
                            : provider === "google" ? "gemini-2.0-flash"
                            : "grok-3-fast"; // xai

                        model = getModelWithKey(modelId, apiKeys);
                        break;
                    } catch {
                        // Model not available, try next provider
                        continue;
                    }
                }
            }
        }

        if (!model) {
            // Fallback to substring-based title
            return generateFallbackTitle(userMessage);
        }

        const result = await generateText({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            maxOutputTokens: 50,
        });

        const title = result.text.trim();

        // Validate the generated title
        if (title && title.length > 0 && title.length <= 100) {
            return title;
        }

        return generateFallbackTitle(userMessage);
    } catch (error) {
        console.error("Error generating conversation title:", error);
        return generateFallbackTitle(userMessage);
    }
}

/**
 * Generate a fallback title from the user message (when AI is unavailable)
 */
export function generateFallbackTitle(userMessage: string): string {
    // Clean the message
    const cleaned = userMessage
        .replace(/\s+/g, " ")
        .trim();

    // Extract first sentence or first N words
    const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() || cleaned;

    // Limit to ~50 characters
    if (firstSentence.length <= 50) {
        return firstSentence;
    }

    // Split into words and take first 7
    const words = firstSentence.split(/\s+/).slice(0, 7);
    return words.join(" ") + (firstSentence.length > words.join(" ").length ? "..." : "");
}

// ============================================================================
// Conversation Summary
// ============================================================================

const SUMMARY_GENERATION_PROMPT = `Summarize this conversation in 2-3 sentences. Focus on the main topics discussed and any conclusions reached.

Conversation:
{CONVERSATION}

Respond with ONLY the summary, nothing else.`;

/**
 * Generate a summary of a conversation
 */
export async function generateConversationSummary(
    messages: Array<{ role: string; content: string }>,
    apiKeys: Partial<Record<ProviderId, string>>
): Promise<string | null> {
    try {
        // Format conversation
        const conversationText = messages
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
            .join("\n\n")
            .slice(0, 3000); // Limit total context

        const prompt = SUMMARY_GENERATION_PROMPT.replace("{CONVERSATION}", conversationText);

        // Use same model priority as title generation (including OpenRouter)
        const modelPriority = [
            { modelId: "gpt-4o-mini", provider: "openai" as ProviderId },
            { modelId: "claude-3-5-haiku-20241022", provider: "anthropic" as ProviderId },
            { modelId: "gemini-2.0-flash", provider: "google" as ProviderId },
            // OpenRouter fallbacks
            { modelId: "openai/gpt-4o-mini", provider: "openrouter" as ProviderId },
            { modelId: "meta-llama/llama-3.3-70b-instruct", provider: "openrouter" as ProviderId },
        ];

        let model;
        for (const { modelId, provider } of modelPriority) {
            if (apiKeys[provider]) {
                try {
                    model = getModelWithKey(modelId, apiKeys);
                    break;
                } catch {
                    continue;
                }
            }
        }

        if (!model) {
            return null;
        }

        const result = await generateText({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            maxOutputTokens: 200,
        });

        return result.text.trim() || null;
    } catch (error) {
        console.error("Error generating conversation summary:", error);
        return null;
    }
}
