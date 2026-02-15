/**
 * Email Tool
 *
 * Provides email capabilities to AI agents via Gmail API.
 * Supports: search, read, send, draft, reply, archive, trash
 */

import { z } from "zod";
import type { Tool, ToolResult } from "./types";
import {
    searchEmails,
    getEmail,
    getEmailThread,
    sendEmail,
    createDraft,
    sendDraft,
    markEmailAsRead,
    archiveEmail,
    trashEmail,
    type GmailMessage,
    type GmailMessagePreview,
} from "@/lib/integrations/google/gmail";
import { hasValidCredentials } from "@/lib/integrations/google/oauth";

// ============================================================================
// Tool Schema
// ============================================================================

const emailToolSchema = z.object({
    action: z.enum([
        "search",
        "read",
        "read_thread",
        "send",
        "draft",
        "send_draft",
        "reply",
        "mark_read",
        "archive",
        "trash",
        "check_connection",
    ]),

    // Search parameters
    query: z.string().optional(),
    maxResults: z.number().min(1).max(100).optional(),

    // Read parameters
    messageId: z.string().optional(),
    threadId: z.string().optional(),

    // Send/Draft parameters
    to: z.union([z.string(), z.array(z.string())]).optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    html: z.string().optional(),
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    bcc: z.union([z.string(), z.array(z.string())]).optional(),

    // Reply parameters
    replyToMessageId: z.string().optional(),

    // Draft send
    draftId: z.string().optional(),
});

type EmailToolInput = z.infer<typeof emailToolSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const emailTool: Tool = {
    id: "email",
    name: "Email",
    description: `Read and send emails using Gmail.

Actions:
- search: Search emails with Gmail query syntax (e.g., "from:john newer_than:1d")
- read: Read a specific email by messageId
- read_thread: Read an entire email thread
- send: Send an email
- draft: Create a draft email
- send_draft: Send an existing draft
- reply: Reply to an email thread
- mark_read: Mark email as read
- archive: Archive an email
- trash: Move email to trash
- check_connection: Check if Gmail is connected

Requires Google account to be connected in settings.`,
    category: "integration",
    icon: "Mail",
    schema: emailToolSchema,
    execute: async (params, context) => {
        if (!context?.userId) {
            return { success: false, error: "User context required for email actions" };
        }
        return executeEmailTool(params as EmailToolInput, { userId: context.userId });
    },
};

// ============================================================================
// Tool Execution
// ============================================================================

async function executeEmailTool(
    input: EmailToolInput,
    context: { userId: string }
): Promise<ToolResult> {
    const { action } = input;
    const { userId } = context;

    // Check connection first for non-check actions
    if (action !== "check_connection") {
        const connected = await hasValidCredentials(userId);
        if (!connected) {
            return {
                success: false,
                error: "Gmail not connected. Please connect your Google account in Settings > Integrations.",
            };
        }
    }

    try {
        switch (action) {
            case "check_connection":
                return await handleCheckConnection(userId);

            case "search":
                return await handleSearch(userId, input);

            case "read":
                return await handleRead(userId, input);

            case "read_thread":
                return await handleReadThread(userId, input);

            case "send":
                return await handleSend(userId, input);

            case "draft":
                return await handleDraft(userId, input);

            case "send_draft":
                return await handleSendDraft(userId, input);

            case "reply":
                return await handleReply(userId, input);

            case "mark_read":
                return await handleMarkRead(userId, input);

            case "archive":
                return await handleArchive(userId, input);

            case "trash":
                return await handleTrash(userId, input);

            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`,
                };
        }
    } catch (error) {
        console.error("[Email Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Email operation failed",
        };
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleCheckConnection(userId: string): Promise<ToolResult> {
    const connected = await hasValidCredentials(userId);

    return {
        success: true,
        data: {
            connected,
            message: connected
                ? "Gmail is connected and ready to use."
                : "Gmail is not connected. Please connect your Google account in Settings > Integrations.",
        },
    };
}

async function handleSearch(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.query) {
        return {
            success: false,
            error: "Query is required for search action",
        };
    }

    const result = await searchEmails(userId, input.query, {
        maxResults: input.maxResults || 20,
    });

    if (!result) {
        return {
            success: false,
            error: "Failed to search emails",
        };
    }

    return {
        success: true,
        data: {
            count: result.messages.length,
            totalEstimate: result.resultSizeEstimate,
            emails: result.messages.map(formatMessagePreview),
        },
    };
}

async function handleRead(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.messageId) {
        return {
            success: false,
            error: "messageId is required for read action",
        };
    }

    const email = await getEmail(userId, input.messageId);

    if (!email) {
        return {
            success: false,
            error: "Failed to read email",
        };
    }

    return {
        success: true,
        data: formatFullMessage(email),
    };
}

async function handleReadThread(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.threadId) {
        return {
            success: false,
            error: "threadId is required for read_thread action",
        };
    }

    const thread = await getEmailThread(userId, input.threadId);

    if (!thread) {
        return {
            success: false,
            error: "Failed to read thread",
        };
    }

    return {
        success: true,
        data: {
            threadId: thread.id,
            messageCount: thread.messages.length,
            messages: thread.messages.map(formatFullMessage),
        },
    };
}

async function handleSend(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.to || !input.subject || !input.body) {
        return {
            success: false,
            error: "to, subject, and body are required for send action",
        };
    }

    const result = await sendEmail(userId, {
        to: input.to,
        subject: input.subject,
        body: input.body,
        html: input.html,
        cc: input.cc,
        bcc: input.bcc,
    });

    if (!result) {
        return {
            success: false,
            error: "Failed to send email",
        };
    }

    return {
        success: true,
        data: {
            messageId: result.id,
            threadId: result.threadId,
            message: "Email sent successfully",
        },
    };
}

async function handleDraft(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.to || !input.subject || !input.body) {
        return {
            success: false,
            error: "to, subject, and body are required for draft action",
        };
    }

    const result = await createDraft(userId, {
        to: input.to,
        subject: input.subject,
        body: input.body,
        html: input.html,
        cc: input.cc,
        bcc: input.bcc,
    });

    if (!result) {
        return {
            success: false,
            error: "Failed to create draft",
        };
    }

    return {
        success: true,
        data: {
            draftId: result.id,
            messageId: result.messageId,
            threadId: result.threadId,
            message: "Draft created successfully",
        },
    };
}

async function handleSendDraft(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.draftId) {
        return {
            success: false,
            error: "draftId is required for send_draft action",
        };
    }

    const result = await sendDraft(userId, input.draftId);

    if (!result) {
        return {
            success: false,
            error: "Failed to send draft",
        };
    }

    return {
        success: true,
        data: {
            messageId: result.id,
            threadId: result.threadId,
            message: "Draft sent successfully",
        },
    };
}

async function handleReply(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.replyToMessageId || !input.body) {
        return {
            success: false,
            error: "replyToMessageId and body are required for reply action",
        };
    }

    // Get original message to get thread info
    const original = await getEmail(userId, input.replyToMessageId);

    if (!original) {
        return {
            success: false,
            error: "Original message not found",
        };
    }

    const result = await sendEmail(userId, {
        to: original.from,
        subject: original.subject.startsWith("Re:")
            ? original.subject
            : `Re: ${original.subject}`,
        body: input.body,
        html: input.html,
        threadId: original.threadId,
        inReplyTo: input.replyToMessageId,
    });

    if (!result) {
        return {
            success: false,
            error: "Failed to send reply",
        };
    }

    return {
        success: true,
        data: {
            messageId: result.id,
            threadId: result.threadId,
            message: "Reply sent successfully",
        },
    };
}

async function handleMarkRead(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.messageId) {
        return {
            success: false,
            error: "messageId is required for mark_read action",
        };
    }

    const success = await markEmailAsRead(userId, input.messageId);

    return {
        success,
        data: success
            ? { message: "Email marked as read" }
            : undefined,
        error: success ? undefined : "Failed to mark email as read",
    };
}

async function handleArchive(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.messageId) {
        return {
            success: false,
            error: "messageId is required for archive action",
        };
    }

    const success = await archiveEmail(userId, input.messageId);

    return {
        success,
        data: success
            ? { message: "Email archived" }
            : undefined,
        error: success ? undefined : "Failed to archive email",
    };
}

async function handleTrash(
    userId: string,
    input: EmailToolInput
): Promise<ToolResult> {
    if (!input.messageId) {
        return {
            success: false,
            error: "messageId is required for trash action",
        };
    }

    const success = await trashEmail(userId, input.messageId);

    return {
        success,
        data: success
            ? { message: "Email moved to trash" }
            : undefined,
        error: success ? undefined : "Failed to trash email",
    };
}

// ============================================================================
// Formatters
// ============================================================================

function formatMessagePreview(msg: GmailMessagePreview) {
    return {
        id: msg.id,
        threadId: msg.threadId,
        from: msg.from,
        subject: msg.subject,
        snippet: msg.snippet,
        date: msg.date.toISOString(),
        isUnread: msg.isUnread,
        labels: msg.labelIds,
    };
}

function formatFullMessage(msg: GmailMessage) {
    return {
        id: msg.id,
        threadId: msg.threadId,
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        date: msg.date.toISOString(),
        body: msg.body.text || msg.body.html || msg.snippet,
        hasHtml: !!msg.body.html,
        attachments: msg.attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
        })),
        labels: msg.labelIds,
    };
}

export default emailTool;
