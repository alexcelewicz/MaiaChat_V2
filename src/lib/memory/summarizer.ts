/**
 * Conversation Summarizer
 *
 * Summarizes conversations into structured markdown documents
 * suitable for storage in Gemini File Search stores.
 * Uses the cheapest available model for cost efficiency.
 */

import type { ProviderId } from "@/lib/ai/providers/types";

interface Message {
    role: "user" | "assistant" | "system";
    content: string;
}

interface ConversationMetadata {
    conversationId: string;
    title?: string;
    model?: string;
    createdAt?: string;
}

interface SummarizeResult {
    markdown: string;
    summary: string;
    keyFacts: string[];
    userInfo: string[];
    topics: string[];
}

const SUMMARIZE_SYSTEM_PROMPT = `You are a conversation summarizer. Analyze the conversation and extract:
1. A concise summary (2-3 sentences)
2. Key facts and information discussed
3. Personal information about the user (preferences, context, etc.)
4. Main topics covered

Respond in JSON format:
{
  "summary": "...",
  "keyFacts": ["fact1", "fact2", ...],
  "userInfo": ["info1", "info2", ...],
  "topics": ["topic1", "topic2", ...]
}`;

export async function summarizeConversation(
    messages: Message[],
    apiKeys: Partial<Record<ProviderId, string>>,
    metadata: ConversationMetadata
): Promise<SummarizeResult> {
    // Build conversation text for summarization
    const conversationText = messages
        .filter((m) => m.role !== "system")
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");

    // Try cheapest models in order
    let extracted = {
        summary: "",
        keyFacts: [] as string[],
        userInfo: [] as string[],
        topics: [] as string[],
    };

    try {
        if (apiKeys.openai) {
            extracted = await summarizeWithOpenAI(conversationText, apiKeys.openai);
        } else if (apiKeys.google) {
            extracted = await summarizeWithGemini(conversationText, apiKeys.google);
        } else if (apiKeys.anthropic) {
            extracted = await summarizeWithAnthropic(conversationText, apiKeys.anthropic);
        } else {
            // Fallback: basic extraction without AI
            extracted = basicExtract(messages);
        }
    } catch (error) {
        console.error("[Memory Summarizer] AI summarization failed, using basic extraction:", error);
        extracted = basicExtract(messages);
    }

    // Format as structured markdown for Gemini File Search
    const markdown = formatAsMarkdown(extracted, metadata);

    return {
        markdown,
        ...extracted,
    };
}

async function summarizeWithOpenAI(
    conversationText: string,
    apiKey: string
): Promise<{ summary: string; keyFacts: string[]; userInfo: string[]; topics: string[] }> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
                { role: "user", content: `Summarize this conversation:\n\n${conversationText.slice(0, 8000)}` },
            ],
            temperature: 0.3,
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
}

async function summarizeWithGemini(
    conversationText: string,
    apiKey: string
): Promise<{ summary: string; keyFacts: string[]; userInfo: string[]; topics: string[] }> {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
            {
                role: "user",
                parts: [
                    { text: `${SUMMARIZE_SYSTEM_PROMPT}\n\nSummarize this conversation:\n\n${conversationText.slice(0, 8000)}` },
                ],
            },
        ],
        config: {
            responseMimeType: "application/json",
            temperature: 0.3,
        },
    });

    const text = response?.candidates?.[0]?.content?.parts
        ?.filter((p): p is { text: string } => typeof (p as { text?: string }).text === "string")
        .map((p) => p.text)
        .join("") || "{}";

    return JSON.parse(text);
}

async function summarizeWithAnthropic(
    conversationText: string,
    apiKey: string
): Promise<{ summary: string; keyFacts: string[]; userInfo: string[]; topics: string[] }> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "claude-3-5-haiku-latest",
            max_tokens: 1024,
            system: SUMMARIZE_SYSTEM_PROMPT,
            messages: [
                { role: "user", content: `Summarize this conversation:\n\n${conversationText.slice(0, 8000)}` },
            ],
        }),
    });

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);

    const data = await response.json();
    const content = data.content?.[0]?.text || "{}";

    // Extract JSON from potential markdown code block
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: content, keyFacts: [], userInfo: [], topics: [] };
}

function basicExtract(messages: Message[]) {
    const userMessages = messages.filter((m) => m.role === "user");
    const topics = new Set<string>();

    // Extract basic topics from user messages
    for (const msg of userMessages) {
        const words = msg.content.split(/\s+/).slice(0, 5);
        if (words.length > 0) {
            topics.add(words.join(" ").slice(0, 50));
        }
    }

    return {
        summary: `Conversation with ${userMessages.length} user messages and ${messages.filter((m) => m.role === "assistant").length} assistant responses.`,
        keyFacts: [],
        userInfo: [],
        topics: Array.from(topics).slice(0, 5),
    };
}

function formatAsMarkdown(
    data: { summary: string; keyFacts: string[]; userInfo: string[]; topics: string[] },
    metadata: ConversationMetadata
): string {
    const lines: string[] = [];

    lines.push(`# Conversation Memory: ${metadata.title || metadata.conversationId}`);
    lines.push("");
    lines.push(`**Date:** ${metadata.createdAt || new Date().toISOString()}`);
    lines.push(`**Conversation ID:** ${metadata.conversationId}`);
    if (metadata.model) {
        lines.push(`**Model:** ${metadata.model}`);
    }
    lines.push("");

    lines.push("## Summary");
    lines.push(data.summary);
    lines.push("");

    if (data.keyFacts.length > 0) {
        lines.push("## Key Facts");
        for (const fact of data.keyFacts) {
            lines.push(`- ${fact}`);
        }
        lines.push("");
    }

    if (data.userInfo.length > 0) {
        lines.push("## User Information");
        for (const info of data.userInfo) {
            lines.push(`- ${info}`);
        }
        lines.push("");
    }

    if (data.topics.length > 0) {
        lines.push("## Topics");
        for (const topic of data.topics) {
            lines.push(`- ${topic}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}
