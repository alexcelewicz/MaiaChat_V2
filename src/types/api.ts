import { z } from "zod";

// ============================================================================
// Chat API Schemas
// ============================================================================

export const messageSchema = z.object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    createdAt: z.date().optional(),
});

export const chatRequestSchema = z.object({
    messages: z.array(messageSchema).min(1, "At least one message is required"),
    conversationId: z.string().uuid().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type MessageInput = z.infer<typeof messageSchema>;

// ============================================================================
// Auth API Schemas
// ============================================================================

export const authRequestSchema = z.object({
    name: z.string().min(1).max(100).optional(),
});

export type AuthRequest = z.infer<typeof authRequestSchema>;

// ============================================================================
// Conversation API Schemas
// ============================================================================

export const createConversationSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    profileId: z.string().uuid().optional(),
    folderId: z.string().uuid().optional(),
});

export const updateConversationSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    isFavorite: z.boolean().optional(),
    folderId: z.string().uuid().nullable().optional(),
});

export const conversationQuerySchema = z.object({
    folderId: z.string().uuid().optional(),
    tag: z.string().optional(),
    favorite: z.enum(["true", "false"]).optional(),
    limit: z.coerce.number().min(1).max(100).optional().default(50),
    offset: z.coerce.number().min(0).optional().default(0),
});

export type CreateConversationRequest = z.infer<typeof createConversationSchema>;
export type UpdateConversationRequest = z.infer<typeof updateConversationSchema>;
export type ConversationQueryParams = z.infer<typeof conversationQuerySchema>;

// ============================================================================
// Folder API Schemas
// ============================================================================

export const createFolderSchema = z.object({
    name: z.string().min(1).max(100),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const updateFolderSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export type CreateFolderRequest = z.infer<typeof createFolderSchema>;
export type UpdateFolderRequest = z.infer<typeof updateFolderSchema>;

// ============================================================================
// Tag API Schemas
// ============================================================================

export const addTagSchema = z.object({
    tag: z.string().min(1).max(50).trim(),
});

export type AddTagRequest = z.infer<typeof addTagSchema>;

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiError {
    error: string;
    code?: string;
    details?: Record<string, string[]>;
}

export interface ApiSuccess<T = unknown> {
    success: true;
    data?: T;
}

// ============================================================================
// User Types (from database)
// ============================================================================

export interface User {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    firebaseUid?: string | null;
    role: "user" | "admin";
    preferences: UserPreferences;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserPreferences {
    name?: string;
    theme?: "light" | "dark" | "system";
    [key: string]: unknown;
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface Conversation {
    id: string;
    userId: string;
    profileId?: string | null;
    folderId?: string | null;
    title: string;
    metadata: Record<string, unknown>;
    isFavorite: boolean;
    shareToken?: string | null;
    deletedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface Folder {
    id: string;
    userId: string;
    name: string;
    color: string;
    parentId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface Tag {
    id: string;
    conversationId: string;
    tag: string;
    createdAt: Date;
}

// ============================================================================
// Helper function for parsing request bodies with Zod
// ============================================================================

export async function parseRequestBody<T>(
    request: Request,
    schema: z.ZodType<T>
): Promise<{ data: T; error: null } | { data: null; error: ApiError }> {
    try {
        const body = await request.json();
        const result = schema.safeParse(body);

        if (!result.success) {
            const details: Record<string, string[]> = {};
            for (const issue of result.error.issues) {
                const path = issue.path.join(".");
                if (!details[path]) {
                    details[path] = [];
                }
                details[path].push(issue.message);
            }

            return {
                data: null,
                error: {
                    error: "Validation failed",
                    code: "VALIDATION_ERROR",
                    details,
                },
            };
        }

        return { data: result.data, error: null };
    } catch {
        return {
            data: null,
            error: {
                error: "Invalid JSON body",
                code: "INVALID_JSON",
            },
        };
    }
}
