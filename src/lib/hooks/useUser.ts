"use client";

import useSWR from "swr";

export interface UserData {
    id: string;
    email: string;
    role: "user" | "admin";
    name: string;
}

interface UserResponse {
    success: boolean;
    user: UserData;
}

const fetcher = async (url: string): Promise<UserResponse | null> => {
    const res = await fetch(url, { credentials: "include" });
    // If unauthorized, return null instead of throwing
    // This allows guest users to use the app without being logged in
    if (res.status === 401) {
        return null;
    }
    if (!res.ok) {
        throw new Error("Failed to fetch user");
    }
    return res.json();
};

export function useUser() {
    const { data, error, isLoading, mutate } = useSWR<UserResponse | null>(
        "/api/auth/me",
        fetcher,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: false,
            shouldRetryOnError: false,
        }
    );

    return {
        user: data?.user ?? null,
        isLoading,
        isError: !!error,
        isAuthenticated: !!data?.user,
        mutate,
    };
}

export async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    // Redirect to chat page (the main public page)
    window.location.href = "/chat";
}
