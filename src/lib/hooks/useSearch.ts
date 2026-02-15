import useSWR from "swr";

interface SearchResult {
    id: string;
    title: string;
    isFavorite: boolean;
    createdAt: string;
    updatedAt: string;
    matchType: "title" | "content";
    snippet: string | null;
}

interface SearchResponse {
    success: boolean;
    results: SearchResult[];
    query: string;
}

const fetcher = async (url: string): Promise<SearchResponse> => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
        throw new Error("Search failed");
    }
    return res.json();
};

export function useSearch(query: string, enabled: boolean = true) {
    const { data, error, isLoading } = useSWR<SearchResponse>(
        enabled && query.length >= 1 ? `/api/conversations/search?q=${encodeURIComponent(query)}` : null,
        fetcher,
        {
            dedupingInterval: 300,
            revalidateOnFocus: false,
        }
    );

    return {
        results: data?.results || [],
        query: data?.query || "",
        error,
        isLoading,
    };
}
