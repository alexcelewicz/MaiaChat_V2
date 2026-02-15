import useSWR, { mutate } from "swr";
import type { Conversation, Tag } from "@/types/api";

// Shared SWR key for conversations
export const CONVERSATIONS_SWR_KEY = "/api/conversations";

export interface ConversationPreview {
    id: string;
    title: string;
    isFavorite: boolean;
    folderId: string | null;
    createdAt: string;
    updatedAt: string;
    tags?: Tag[];
}

interface ConversationsResponse {
    conversations: ConversationPreview[];
    total: number;
}

export interface ConversationFilters {
    folderId?: string;
    tag?: string;
    favorite?: boolean;
    limit?: number;
    offset?: number;
}

function buildQueryString(filters?: ConversationFilters): string {
    if (!filters) return "";

    const params = new URLSearchParams();
    if (filters.folderId) params.set("folderId", filters.folderId);
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.favorite !== undefined) params.set("favorite", String(filters.favorite));
    if (filters.limit) params.set("limit", String(filters.limit));
    if (filters.offset) params.set("offset", String(filters.offset));

    const query = params.toString();
    return query ? `?${query}` : "";
}

const fetcher = async (url: string): Promise<ConversationsResponse> => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
        throw new Error("Failed to fetch conversations");
    }
    return res.json();
};

/**
 * Hook to fetch and manage conversations list with filtering
 * Use this in components that need conversation data
 */
export function useConversations(filters?: ConversationFilters) {
    const queryString = buildQueryString(filters);
    const key = `${CONVERSATIONS_SWR_KEY}${queryString}`;

    const { data, error, isLoading, mutate: boundMutate } = useSWR<ConversationsResponse>(
        key,
        fetcher
    );

    return {
        conversations: data?.conversations ?? [],
        total: data?.total ?? 0,
        isLoading,
        error,
        mutate: boundMutate,
    };
}

/**
 * Hook specifically for favorites
 */
export function useFavoriteConversations() {
    return useConversations({ favorite: true });
}

/**
 * Hook for conversations in a specific folder
 */
export function useFolderConversations(folderId: string | null) {
    return useConversations(folderId ? { folderId } : undefined);
}

/**
 * Hook for conversations with a specific tag
 */
export function useTaggedConversations(tag: string | null) {
    return useConversations(tag ? { tag } : undefined);
}

/**
 * Refresh the conversations list from anywhere in the app
 * Use this after creating a new conversation
 */
export function refreshConversations() {
    // Revalidate all conversation queries
    return mutate((key) => typeof key === "string" && key.startsWith(CONVERSATIONS_SWR_KEY));
}

/**
 * Update a conversation
 */
export async function updateConversation(
    id: string,
    updates: { title?: string; isFavorite?: boolean; folderId?: string | null }
): Promise<Conversation> {
    const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update conversation");
    }

    const { conversation } = await res.json();
    await refreshConversations();
    return conversation;
}

/**
 * Delete a conversation (soft delete by default)
 */
export async function deleteConversation(id: string, hard = false): Promise<void> {
    const url = hard ? `/api/conversations/${id}?hard=true` : `/api/conversations/${id}`;
    const res = await fetch(url, { method: "DELETE", credentials: "include" });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete conversation");
    }

    await refreshConversations();
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(id: string, currentStatus: boolean): Promise<Conversation> {
    return updateConversation(id, { isFavorite: !currentStatus });
}

/**
 * Move conversation to folder
 */
export async function moveToFolder(id: string, folderId: string | null): Promise<Conversation> {
    return updateConversation(id, { folderId });
}

/**
 * Delete all conversations for the current user
 */
export async function deleteAllConversations(): Promise<{ deletedCount: number }> {
    const res = await fetch("/api/conversations", { method: "DELETE", credentials: "include" });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete all conversations");
    }

    const result = await res.json();
    await refreshConversations();
    return result;
}
