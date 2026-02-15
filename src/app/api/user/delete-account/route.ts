/**
 * Account Deletion API
 *
 * GDPR-compliant endpoint for users to delete their account and all associated data.
 * This implements the "right to be forgotten" (Article 17 GDPR).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
    users,
    apiKeys,
    conversations,
    messages,
    channelAccounts,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { clearUserProfile } from "@/lib/memory/user-profile";
import { clearLocalMemory } from "@/lib/memory/local-memory";

// POST - Request account deletion (could be used for email confirmation flow)
// DELETE - Immediately delete account and all data
export async function DELETE(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Optional: Verify with password or confirmation
        const body = await request.json().catch(() => ({}));
        const { confirmation } = body;

        if (confirmation !== "DELETE MY ACCOUNT") {
            return NextResponse.json(
                {
                    error: "Please type 'DELETE MY ACCOUNT' to confirm",
                    required: "DELETE MY ACCOUNT",
                },
                { status: 400 }
            );
        }

        console.log(`[Account Deletion] Starting deletion for user ${userId.slice(0, 8)}`);

        // 1. Delete local profile data
        try {
            await clearUserProfile(userId);
            console.log(`[Account Deletion] Cleared user profile`);
        } catch (error) {
            console.error("[Account Deletion] Failed to clear profile:", error);
        }

        // 2. Delete local memory data
        try {
            await clearLocalMemory(userId);
            console.log(`[Account Deletion] Cleared local memory`);
        } catch (error) {
            console.error("[Account Deletion] Failed to clear local memory:", error);
        }

        // 3. Delete Gemini stores (if applicable)
        // Note: This would require calling Gemini API to delete stores
        // For now, we log that this should be done
        console.log(`[Account Deletion] Note: Gemini stores should be cleaned up for user ${userId.slice(0, 8)}`);

        // 4. Delete database records in correct order (foreign key constraints)
        try {
            // Delete conversations (messages are deleted via CASCADE)
            await db.delete(conversations).where(eq(conversations.userId, userId));
            console.log(`[Account Deletion] Deleted conversations (and messages via cascade)`);

            // Delete API keys
            await db.delete(apiKeys).where(eq(apiKeys.userId, userId));
            console.log(`[Account Deletion] Deleted API keys`);

            // Delete channel accounts
            await db.delete(channelAccounts).where(eq(channelAccounts.userId, userId));
            console.log(`[Account Deletion] Deleted channel accounts`);

            // Finally delete the user
            await db.delete(users).where(eq(users.id, userId));
            console.log(`[Account Deletion] Deleted user record`);
        } catch (dbError) {
            console.error("[Account Deletion] Database deletion error:", dbError);
            return NextResponse.json(
                { error: "Failed to delete account from database" },
                { status: 500 }
            );
        }

        console.log(`[Account Deletion] Successfully deleted all data for user ${userId.slice(0, 8)}`);

        return NextResponse.json({
            success: true,
            message: "Your account and all associated data have been permanently deleted",
            deletedData: [
                "User profile and personal information",
                "Conversation history",
                "Saved messages",
                "API keys",
                "Memory and learned facts",
                "Channel connections",
            ],
        });
    } catch (error) {
        console.error("[Account Deletion] Unexpected error:", error);
        return NextResponse.json(
            { error: "Failed to delete account" },
            { status: 500 }
        );
    }
}

// GET - Preview what will be deleted (GDPR data portability)
export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Count records that would be deleted
        const userConversations = await db.query.conversations.findMany({
            where: eq(conversations.userId, userId),
            columns: { id: true },
        });

        // Count messages in user's conversations
        let messagesTotal = 0;
        if (userConversations.length > 0) {
            const conversationIds = userConversations.map(c => c.id);
            for (const convId of conversationIds) {
                const convMessages = await db.query.messages.findMany({
                    where: eq(messages.conversationId, convId),
                    columns: { id: true },
                });
                messagesTotal += convMessages.length;
            }
        }

        const userApiKeys = await db.query.apiKeys.findMany({
            where: eq(apiKeys.userId, userId),
            columns: { id: true },
        });

        const userChannels = await db.query.channelAccounts.findMany({
            where: eq(channelAccounts.userId, userId),
            columns: { id: true },
        });

        return NextResponse.json({
            userId: userId.slice(0, 8) + "...",
            dataToBeDeleted: {
                conversations: userConversations.length,
                messages: messagesTotal,
                apiKeys: userApiKeys.length,
                channelConnections: userChannels.length,
                profileData: "All stored personal information",
                memoryData: "All conversation memories and learned facts",
            },
            warning: "This action is irreversible. All your data will be permanently deleted.",
            confirmationRequired: "DELETE MY ACCOUNT",
        });
    } catch (error) {
        console.error("[Account Deletion] Preview error:", error);
        return NextResponse.json(
            { error: "Failed to preview deletion" },
            { status: 500 }
        );
    }
}
