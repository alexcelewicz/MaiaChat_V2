/**
 * Google Drive Tool
 *
 * Provides Google Drive file management capabilities to AI agents.
 * Supports: list, search, upload, download, create_folder, share, get_info
 */

import { z } from "zod";
import type { Tool, ToolId, ToolResult } from "./types";
import {
    listFiles,
    getFile,
    uploadFile,
    createFolder,
    downloadFile,
    searchFiles,
    shareFile,
} from "@/lib/integrations/google/drive";
import { hasValidCredentials } from "@/lib/integrations/google/oauth";

// ============================================================================
// Tool Schema
// ============================================================================

const googleDriveToolSchema = z.object({
    action: z.enum([
        "list",
        "search",
        "upload",
        "download",
        "create_folder",
        "share",
        "get_info",
    ]),

    // File identification
    fileId: z.string().optional(),

    // Folder
    folderId: z.string().optional(),
    folderName: z.string().optional(),
    parentId: z.string().optional(),

    // Search / list
    query: z.string().optional(),
    maxResults: z.number().min(1).max(100).optional(),

    // Upload
    fileName: z.string().optional(),
    content: z.string().optional(), // base64 or text content
    mimeType: z.string().optional(),

    // Share
    email: z.string().optional(),
    role: z.enum(["reader", "writer", "commenter"]).optional(),
});

type GoogleDriveToolInput = z.infer<typeof googleDriveToolSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const googleDriveTool: Tool = {
    id: "google_drive" as ToolId,
    name: "Google Drive",
    description: `Manage files in Google Drive.

Actions:
- list: List files in Drive (optional: folderId, query filter, maxResults)
- search: Search files by text content (requires query)
- upload: Upload a file (requires fileName, content as text/base64, mimeType; optional: folderId)
- download: Download file content (requires fileId; returns text for documents)
- create_folder: Create a folder (requires folderName; optional: parentId)
- share: Share a file with someone (requires fileId, email; optional: role - reader/writer/commenter)
- get_info: Get file metadata (requires fileId)

Requires Google account to be connected in settings.`,
    category: "integration",
    icon: "HardDrive",
    schema: googleDriveToolSchema,
    execute: async (params, context) => {
        if (!context?.userId) {
            return { success: false, error: "User context required for Google Drive actions" };
        }
        return executeDriveTool(params as GoogleDriveToolInput, { userId: context.userId });
    },
};

// ============================================================================
// Tool Execution
// ============================================================================

async function executeDriveTool(
    input: GoogleDriveToolInput,
    context: { userId: string }
): Promise<ToolResult> {
    const { action } = input;
    const { userId } = context;

    // Verify Google credentials
    const connected = await hasValidCredentials(userId);
    if (!connected) {
        return {
            success: false,
            error: "Google Drive not connected. Please connect your Google account in Settings > Integrations.",
        };
    }

    try {
        switch (action) {
            case "list":
                return await handleList(userId, input);

            case "search":
                return await handleSearch(userId, input);

            case "upload":
                return await handleUpload(userId, input);

            case "download":
                return await handleDownload(userId, input);

            case "create_folder":
                return await handleCreateFolder(userId, input);

            case "share":
                return await handleShare(userId, input);

            case "get_info":
                return await handleGetInfo(userId, input);

            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`,
                };
        }
    } catch (error) {
        console.error("[Google Drive Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Google Drive operation failed",
        };
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleList(
    userId: string,
    input: GoogleDriveToolInput
): Promise<ToolResult> {
    const result = await listFiles(userId, input.query, input.folderId, input.maxResults);

    return {
        success: true,
        data: {
            count: result.files.length,
            files: result.files,
            hasMore: !!result.nextPageToken,
        },
    };
}

async function handleSearch(
    userId: string,
    input: GoogleDriveToolInput
): Promise<ToolResult> {
    if (!input.query) {
        return { success: false, error: "query is required for search action" };
    }

    const result = await searchFiles(userId, input.query);

    return {
        success: true,
        data: {
            query: input.query,
            count: result.files.length,
            files: result.files,
        },
    };
}

async function handleUpload(
    userId: string,
    input: GoogleDriveToolInput
): Promise<ToolResult> {
    if (!input.fileName) {
        return { success: false, error: "fileName is required for upload action" };
    }
    if (!input.content) {
        return { success: false, error: "content is required for upload action" };
    }

    const mimeType = input.mimeType || "text/plain";

    // Detect if content is base64 or plain text
    let buffer: Buffer;
    if (input.content.match(/^[A-Za-z0-9+/=]+$/) && input.content.length > 100) {
        // Likely base64 encoded
        buffer = Buffer.from(input.content, "base64");
    } else {
        buffer = Buffer.from(input.content, "utf-8");
    }

    const file = await uploadFile(userId, input.fileName, buffer, mimeType, input.folderId);

    return {
        success: true,
        data: {
            ...file,
            message: "File uploaded successfully",
        },
    };
}

async function handleDownload(
    userId: string,
    input: GoogleDriveToolInput
): Promise<ToolResult> {
    if (!input.fileId) {
        return { success: false, error: "fileId is required for download action" };
    }

    const { content, mimeType } = await downloadFile(userId, input.fileId);

    // Truncate very large content
    const truncated = content.length > 50000;
    const displayContent = truncated
        ? content.substring(0, 50000) + "\n... (truncated, file too large)"
        : content;

    return {
        success: true,
        data: {
            fileId: input.fileId,
            mimeType,
            contentLength: content.length,
            truncated,
            content: displayContent,
        },
    };
}

async function handleCreateFolder(
    userId: string,
    input: GoogleDriveToolInput
): Promise<ToolResult> {
    if (!input.folderName) {
        return { success: false, error: "folderName is required for create_folder action" };
    }

    const folder = await createFolder(userId, input.folderName, input.parentId);

    return {
        success: true,
        data: {
            ...folder,
            message: "Folder created successfully",
        },
    };
}

async function handleShare(
    userId: string,
    input: GoogleDriveToolInput
): Promise<ToolResult> {
    if (!input.fileId) {
        return { success: false, error: "fileId is required for share action" };
    }
    if (!input.email) {
        return { success: false, error: "email is required for share action" };
    }

    const permission = await shareFile(
        userId,
        input.fileId,
        input.email,
        input.role || "reader"
    );

    return {
        success: true,
        data: {
            ...permission,
            message: `File shared with ${input.email} as ${input.role || "reader"}`,
        },
    };
}

async function handleGetInfo(
    userId: string,
    input: GoogleDriveToolInput
): Promise<ToolResult> {
    if (!input.fileId) {
        return { success: false, error: "fileId is required for get_info action" };
    }

    const file = await getFile(userId, input.fileId);

    return {
        success: true,
        data: file,
    };
}

export default googleDriveTool;
