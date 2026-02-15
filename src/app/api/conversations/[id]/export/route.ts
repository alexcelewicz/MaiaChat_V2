import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq, and, asc, isNull } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";

const exportQuerySchema = z.object({
    format: z.enum(["json", "markdown", "txt"]).default("json"),
});

interface ConversationExport {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: {
        id: string;
        role: string;
        content: string;
        createdAt: string;
    }[];
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        const { id } = await params;

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const queryResult = exportQuerySchema.safeParse({
            format: searchParams.get("format") || "json",
        });

        if (!queryResult.success) {
            return NextResponse.json(
                { error: "Invalid format", code: "INVALID_FORMAT" },
                { status: 400 }
            );
        }

        const { format } = queryResult.data;

        // Fetch conversation
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, id),
                eq(conversations.userId, userId),
                isNull(conversations.deletedAt)
            ),
        });

        if (!conversation) {
            return NextResponse.json(
                { error: "Conversation not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        // Fetch messages
        const conversationMessages = await db.query.messages.findMany({
            where: eq(messages.conversationId, id),
            orderBy: [asc(messages.createdAt)],
        });

        const exportData: ConversationExport = {
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.createdAt.toISOString(),
            updatedAt: conversation.updatedAt.toISOString(),
            messages: conversationMessages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: m.createdAt.toISOString(),
            })),
        };

        // Generate export based on format
        switch (format) {
            case "json":
                return new Response(JSON.stringify(exportData, null, 2), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Disposition": `attachment; filename="${sanitizeFilename(conversation.title)}.json"`,
                    },
                });

            case "markdown":
                const markdown = generateMarkdown(exportData);
                return new Response(markdown, {
                    status: 200,
                    headers: {
                        "Content-Type": "text/markdown; charset=utf-8",
                        "Content-Disposition": `attachment; filename="${sanitizeFilename(conversation.title)}.md"`,
                    },
                });

            case "txt":
                const plainText = generatePlainText(exportData);
                return new Response(plainText, {
                    status: 200,
                    headers: {
                        "Content-Type": "text/plain; charset=utf-8",
                        "Content-Disposition": `attachment; filename="${sanitizeFilename(conversation.title)}.txt"`,
                    },
                });

            default:
                return NextResponse.json(
                    { error: "Invalid format", code: "INVALID_FORMAT" },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error("Export conversation error:", error);
        return NextResponse.json(
            { error: "Failed to export conversation", code: "EXPORT_FAILED" },
            { status: 500 }
        );
    }
}

function sanitizeFilename(filename: string): string {
    return filename
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 100);
}

function generateMarkdown(data: ConversationExport): string {
    const lines: string[] = [];

    lines.push(`# ${data.title}`);
    lines.push("");
    lines.push(`**Created:** ${new Date(data.createdAt).toLocaleString()}`);
    lines.push(`**Last Updated:** ${new Date(data.updatedAt).toLocaleString()}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    for (const message of data.messages) {
        const timestamp = new Date(message.createdAt).toLocaleString();
        const roleLabel = message.role === "user" ? "**User**" : "**Assistant**";

        lines.push(`### ${roleLabel}`);
        lines.push(`*${timestamp}*`);
        lines.push("");
        lines.push(message.content);
        lines.push("");
        lines.push("---");
        lines.push("");
    }

    lines.push("");
    lines.push(`*Exported from MAIAChat on ${new Date().toLocaleString()}*`);

    return lines.join("\n");
}

function generatePlainText(data: ConversationExport): string {
    const lines: string[] = [];

    lines.push(`CONVERSATION: ${data.title}`);
    lines.push(`Created: ${new Date(data.createdAt).toLocaleString()}`);
    lines.push(`Last Updated: ${new Date(data.updatedAt).toLocaleString()}`);
    lines.push("");
    lines.push("=".repeat(60));
    lines.push("");

    for (const message of data.messages) {
        const timestamp = new Date(message.createdAt).toLocaleString();
        const roleLabel = message.role === "user" ? "USER" : "ASSISTANT";

        lines.push(`[${roleLabel}] - ${timestamp}`);
        lines.push("-".repeat(40));
        lines.push(message.content);
        lines.push("");
        lines.push("=".repeat(60));
        lines.push("");
    }

    lines.push(`Exported from MAIAChat on ${new Date().toLocaleString()}`);

    return lines.join("\n");
}
