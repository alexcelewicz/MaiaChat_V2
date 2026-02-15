import useSWR, { mutate } from "swr";
import type { Folder } from "@/types/api";

// Shared SWR key for folders
export const FOLDERS_SWR_KEY = "/api/folders";

interface FoldersResponse {
    folders: Folder[];
}

const fetcher = async (url: string): Promise<FoldersResponse> => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
        throw new Error("Failed to fetch folders");
    }
    return res.json();
};

/**
 * Hook to fetch and manage folders
 */
export function useFolders() {
    const { data, error, isLoading, mutate: boundMutate } = useSWR<FoldersResponse>(
        FOLDERS_SWR_KEY,
        fetcher
    );

    return {
        folders: data?.folders ?? [],
        isLoading,
        error,
        mutate: boundMutate,
    };
}

/**
 * Create a new folder
 */
export async function createFolder(name: string, color?: string): Promise<Folder> {
    const res = await fetch(FOLDERS_SWR_KEY, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
    });
    
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create folder");
    }
    
    const { folder } = await res.json();
    await mutate(FOLDERS_SWR_KEY);
    return folder;
}

/**
 * Update a folder
 */
export async function updateFolder(id: string, updates: { name?: string; color?: string }): Promise<Folder> {
    const res = await fetch(`${FOLDERS_SWR_KEY}?id=${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update folder");
    }
    
    const { folder } = await res.json();
    await mutate(FOLDERS_SWR_KEY);
    return folder;
}

/**
 * Delete a folder
 */
export async function deleteFolder(id: string): Promise<void> {
    const res = await fetch(`${FOLDERS_SWR_KEY}?id=${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete folder");
    }
    
    await mutate(FOLDERS_SWR_KEY);
}

/**
 * Refresh folders from anywhere in the app
 */
export function refreshFolders() {
    return mutate(FOLDERS_SWR_KEY);
}
