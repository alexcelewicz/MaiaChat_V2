/**
 * Agent-to-Agent Communication System
 *
 * Enables agents to discover, message, and share context with each other.
 * Similar to OpenClaw's sessions_list, sessions_send, sessions_history.
 */

import { db } from "@/lib/db";
import { agents, conversations, messages } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

export interface AgentSession {
    agentId: string;
    agentName: string;
    conversationId: string;
    conversationTitle: string;
    model?: string;
    status: "active" | "idle";
    lastMessageAt?: string;
    messageCount: number;
}

export interface AgentMessage {
    fromAgentId: string;
    fromAgentName: string;
    toAgentId: string;
    content: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
}

// ============================================================================
// Session Discovery
// ============================================================================

/**
 * List all active agent sessions for a user
 */
export async function listAgentSessions(userId: string): Promise<AgentSession[]> {
    // Get all agents for the user
    const userAgents = await db.select()
        .from(agents)
        .where(eq(agents.userId, userId));

    // Get conversations with agent activity
    const userConversations = await db.select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.updatedAt))
        .limit(50);

    const sessions: AgentSession[] = [];

    for (const agent of userAgents) {
        // Find conversations this agent is active in (check metadata)
        const agentConvs = userConversations.filter(c => {
            const meta = c.metadata as Record<string, unknown> | null;
            return meta?.agentId === agent.id;
        });

        for (const conv of agentConvs) {
            // Get last message timestamp and actual message count
            const [lastMsg] = await db.select({ createdAt: messages.createdAt })
                .from(messages)
                .where(eq(messages.conversationId, conv.id))
                .orderBy(desc(messages.createdAt))
                .limit(1);

            const [msgCount] = await db.select({ value: count() })
                .from(messages)
                .where(eq(messages.conversationId, conv.id));

            sessions.push({
                agentId: agent.id,
                agentName: agent.name,
                conversationId: conv.id,
                conversationTitle: conv.title,
                model: (conv.metadata as Record<string, unknown>)?.model as string,
                status: "idle",
                lastMessageAt: lastMsg?.createdAt?.toISOString(),
                messageCount: msgCount?.value ?? 0,
            });
        }

        // If agent has no conversations, still list it
        if (agentConvs.length === 0) {
            sessions.push({
                agentId: agent.id,
                agentName: agent.name,
                conversationId: "",
                conversationTitle: "(no active conversation)",
                status: "idle",
                messageCount: 0,
            });
        }
    }

    return sessions;
}

/**
 * Get conversation history for an agent session
 */
export async function getAgentHistory(
    userId: string,
    conversationId: string,
    limit: number = 20
): Promise<Array<{ role: string; content: string; createdAt: string }>> {
    // Verify ownership
    const [conv] = await db.select()
        .from(conversations)
        .where(and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId)
        ))
        .limit(1);

    if (!conv) {
        throw new Error("Conversation not found or access denied");
    }

    const history = await db.select({
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
    })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

    return history.map(m => ({
        role: m.role,
        content: m.content || "",
        createdAt: m.createdAt.toISOString(),
    })).reverse();
}

/**
 * Send a message from one agent to another's conversation
 */
export async function sendAgentMessage(
    userId: string,
    targetConversationId: string,
    content: string,
    fromAgentName: string = "System"
): Promise<{ messageId: string }> {
    // Verify ownership
    const [conv] = await db.select()
        .from(conversations)
        .where(and(
            eq(conversations.id, targetConversationId),
            eq(conversations.userId, userId)
        ))
        .limit(1);

    if (!conv) {
        throw new Error("Target conversation not found or access denied");
    }

    // Insert the message as a system message from the agent
    const [msg] = await db.insert(messages).values({
        conversationId: targetConversationId,
        role: "system",
        content: `[Message from agent "${fromAgentName}"]: ${content}`,
        metadata: {
            fromAgent: fromAgentName,
            isAgentMessage: true,
            timestamp: new Date().toISOString(),
        },
    }).returning();

    // Update conversation timestamp
    await db.update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, targetConversationId));

    return { messageId: msg.id };
}

/**
 * Broadcast a message to all active agent sessions for a user
 */
export async function broadcastToAgents(
    userId: string,
    content: string,
    fromAgentName: string = "System",
    excludeConversationIds: string[] = []
): Promise<{ sentTo: number }> {
    const sessions = await listAgentSessions(userId);
    let sentTo = 0;

    for (const session of sessions) {
        if (!session.conversationId || excludeConversationIds.includes(session.conversationId)) {
            continue;
        }

        try {
            await sendAgentMessage(userId, session.conversationId, content, fromAgentName);
            sentTo++;
        } catch (error) {
            console.warn(`[AgentComm] Failed to send to ${session.conversationId}:`, error);
        }
    }

    return { sentTo };
}
