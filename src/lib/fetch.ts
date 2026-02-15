/**
 * Authenticated fetch wrapper
 *
 * Use this instead of raw fetch() for any API calls that need authentication.
 * This ensures cookies (including session tokens) are sent with the request.
 */
export async function fetchApi<T = unknown>(
    url: string,
    options: RequestInit = {}
): Promise<T> {
    const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * SWR fetcher with credentials
 */
export const swrFetcher = async <T>(url: string): Promise<T> => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
        throw new Error("Failed to fetch");
    }
    return res.json();
};
