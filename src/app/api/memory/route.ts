/**
 * Memory CRUD Endpoint
 *
 * GET /api/memory - List all memories + store info
 * DELETE /api/memory?documentName=... - Delete a specific memory
 * DELETE /api/memory?clearAll=true - Clear all memories
 */

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import {
    listMemories,
    deleteMemory,
    clearAllMemories,
    getMemoryStoreInfo,
} from "@/lib/memory/memory-store";

export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const apiKeys = await getUserApiKeys(userId);
        const googleKey = (apiKeys as Record<string, string>).google;

        if (!googleKey) {
            return NextResponse.json({
                memories: [],
                storeInfo: { exists: false, documentCount: 0 },
                error: "Google API key required for memory",
            });
        }

        const [memories, storeInfo] = await Promise.all([
            listMemories(userId, googleKey),
            getMemoryStoreInfo(userId, googleKey),
        ]);

        return NextResponse.json({
            memories: memories.map((m) => ({
                name: m.name,
                displayName: m.displayName,
                state: m.state,
                createTime: m.createTime,
                sizeBytes: m.sizeBytes,
            })),
            storeInfo,
        });
    } catch (error) {
        console.error("[Memory] GET Error:", error);
        return NextResponse.json(
            { error: "Failed to list memories" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const apiKeys = await getUserApiKeys(userId);
        const googleKey = (apiKeys as Record<string, string>).google;

        if (!googleKey) {
            return NextResponse.json(
                { error: "Google API key required" },
                { status: 400 }
            );
        }

        const { searchParams } = new URL(req.url);
        const clearAll = searchParams.get("clearAll") === "true";
        const documentName = searchParams.get("documentName");

        if (clearAll) {
            await clearAllMemories(userId, googleKey);
            return NextResponse.json({ success: true, message: "All memories cleared" });
        }

        if (documentName) {
            await deleteMemory(userId, googleKey, documentName);
            return NextResponse.json({ success: true, message: "Memory deleted" });
        }

        return NextResponse.json(
            { error: "Specify documentName or clearAll=true" },
            { status: 400 }
        );
    } catch (error) {
        console.error("[Memory] DELETE Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to delete memory" },
            { status: 500 }
        );
    }
}
