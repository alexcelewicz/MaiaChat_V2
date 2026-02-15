import useSWR, { mutate } from "swr";
import type { Tag } from "@/types/api";
import { refreshConversations } from "./useConversations";

/**
 * Generate SWR key for conversation tags
 */
export function getTagsKey(conversationId: string | null) {
    return conversationId ? `/api/conversations/${conversationId}/tags` : null;
}

interface TagsResponse {
    tags: Tag[];
}

const fetcher = async (url: string): Promise<TagsResponse> => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
        throw new Error("Failed to fetch tags");
    }
    return res.json();
};

/**
 * Hook to fetch and manage tags for a conversation
 */
export function useTags(conversationId: string | null) {
    const key = getTagsKey(conversationId);

    const { data, error, isLoading, mutate: boundMutate } = useSWR<TagsResponse>(
        key,
        fetcher
    );

    return {
        tags: data?.tags ?? [],
        isLoading,
        error,
        mutate: boundMutate,
    };
}

/**
 * Add a tag to a conversation
 */
export async function addTag(conversationId: string, tag: string): Promise<Tag> {
    const res = await fetch(`/api/conversations/${conversationId}/tags`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add tag");
    }

    const { tag: newTag } = await res.json();
    await mutate(getTagsKey(conversationId));
    await refreshConversations();
    return newTag;
}

/**
 * Remove a tag from a conversation
 */
export async function removeTag(conversationId: string, tag: string): Promise<void> {
    const res = await fetch(`/api/conversations/${conversationId}/tags?tag=${encodeURIComponent(tag)}`, {
        method: "DELETE",
        credentials: "include",
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove tag");
    }

    await mutate(getTagsKey(conversationId));
    await refreshConversations();
}

/**
 * Refresh tags for a conversation
 */
export function refreshTags(conversationId: string) {
    return mutate(getTagsKey(conversationId));
}
