import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types";

const schema = z.object({
    query: z.string().min(1).max(500).describe("A single search query string to search the web for"),
    maxResults: z.number().min(1).max(10).default(5).describe("Maximum number of results to return"),
    deepResearch: z.boolean().default(false).describe("Set to true for thorough, in-depth research on complex topics. Uses a deep research model with longer processing time. Only use when the user explicitly requests deep/thorough research."),
});

type WebSearchParams = z.infer<typeof schema>;

export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
    displayUrl?: string;
    source?: string; // Which provider returned this result
}

// Search provider priority: User preference > Gemini > DuckDuckGo (free fallback)
type SearchProvider = "perplexity" | "gemini" | "duckduckgo";

/**
 * Search using Perplexity Sonar models (built-in web search with citations)
 */
async function searchWithPerplexity(
    query: string,
    maxResults: number,
    apiKey: string,
    modelId: string,
    currentDate: string,
    timeoutMs: number = 30000
): Promise<WebSearchResult[]> {
    try {
        const response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: modelId,
                messages: [
                    {
                        role: "system",
                        content: `Today is ${currentDate}. You are a web search assistant. Return search results as a JSON array.`,
                    },
                    {
                        role: "user",
                        content: `Search the web for: "${query}"\n\nReturn the top ${maxResults} results as a JSON array with objects containing "title", "url", and "snippet" fields. Return ONLY the JSON array.`,
                    },
                ],
                max_tokens: 2048,
                return_citations: true,
                return_related_questions: false,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Perplexity API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        const citations: string[] = data.citations || [];

        // Try to parse structured results from the response
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed)) {
                    return parsed.slice(0, maxResults).map((item: { title?: string; url?: string; snippet?: string }) => ({
                        title: item.title || "Search Result",
                        url: item.url || "",
                        snippet: item.snippet || "",
                        source: "perplexity",
                    }));
                }
            } catch {
                // JSON parse failed, fall through to citation-based results
            }
        }

        // Fallback: build results from citations
        if (citations.length > 0) {
            return citations.slice(0, maxResults).map((url, i) => ({
                title: `Source ${i + 1}`,
                url,
                snippet: content.substring(0, 200),
                source: "perplexity",
            }));
        }

        // Last fallback: return the full response as a single result
        if (content.length > 0) {
            return [{
                title: `Perplexity search: ${query}`,
                url: `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`,
                snippet: content.substring(0, 500),
                source: "perplexity",
            }];
        }

        return [];
    } catch (error) {
        console.error(`[WebSearch] Perplexity search error:`, error);
        throw error;
    }
}

async function execute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();
    console.log(`[WebSearch] Starting search with params:`, rawParams);
    console.log(`[WebSearch] Available API keys:`, Object.keys(context?.apiKeys || {}).join(", ") || "(none)");

    try {
        // Handle case where model sends "queries" array instead of "query" string
        let normalizedParams = { ...rawParams };
        if (!normalizedParams.query && normalizedParams.queries) {
            const queries = normalizedParams.queries as string[];
            if (Array.isArray(queries) && queries.length > 0) {
                // Join multiple queries into one search
                normalizedParams.query = queries.join(" ");
                console.log(`[WebSearch] Normalized queries array to single query: "${normalizedParams.query}"`);
            }
        }

        const params = schema.parse(normalizedParams) as WebSearchParams;
        console.log(`[WebSearch] Parsed query: "${params.query}", maxResults: ${params.maxResults}`);

        // Add current date to provide temporal context
        const currentDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        let results: WebSearchResult[] = [];
        let provider: SearchProvider = "duckduckgo";

        // Deep research routing: use deep research model if requested
        const deepResearchModel = context?.userPreferences?.deepResearchModel;
        const perplexityApiKey = context?.apiKeys?.perplexity;
        if (params.deepResearch && deepResearchModel && deepResearchModel !== "none" && perplexityApiKey) {
            const deepModelMap: Record<string, string> = {
                "perplexity-sonar-deep-research": "sonar-deep-research",
                "perplexity-sonar-reasoning-pro": "sonar-reasoning-pro",
            };
            const deepModelId = deepModelMap[deepResearchModel] || deepResearchModel;
            console.log(`[WebSearch] Using deep research model: ${deepModelId}`);
            try {
                results = await searchWithPerplexity(params.query, params.maxResults, perplexityApiKey, deepModelId, currentDate, 120000);
                provider = "perplexity";
                console.log(`[WebSearch] Deep research returned ${results.length} results`);
            } catch (error) {
                console.warn(`[WebSearch] Deep research failed, falling back to regular search:`, error);
                // Fall through to regular search
            }
        }

        // Check user's web search preference (skip if deep research already returned results)
        const webSearchPref = context?.userPreferences?.webSearchModel || "auto";
        const googleApiKey = context?.apiKeys?.google;

        // Route based on user preference (skip if deep research already returned results)
        if (results.length > 0) {
            // Deep research already returned results - skip regular routing
        } else if (webSearchPref.startsWith("perplexity-") && perplexityApiKey) {
            // User explicitly chose Perplexity
            const modelMap: Record<string, string> = {
                "perplexity-sonar": "sonar",
                "perplexity-sonar-pro": "sonar-pro",
            };
            const modelId = modelMap[webSearchPref] || "sonar";
            console.log(`[WebSearch] Using Perplexity ${modelId} (user preference)...`);
            try {
                results = await searchWithPerplexity(params.query, params.maxResults, perplexityApiKey, modelId, currentDate);
                provider = "perplexity";
                console.log(`[WebSearch] Perplexity returned ${results.length} results`);
            } catch (error) {
                console.warn(`[WebSearch] Perplexity failed, falling back:`, error);
            }
        } else if (webSearchPref === "gemini" && googleApiKey) {
            // User explicitly chose Gemini
            console.log(`[WebSearch] Using Gemini grounding (user preference)...`);
            try {
                results = await searchWithGeminiGrounding(params.query, params.maxResults, googleApiKey, currentDate);
                provider = "gemini";
            } catch (error) {
                console.warn(`[WebSearch] Gemini failed, falling back:`, error);
            }
        } else if (webSearchPref === "duckduckgo") {
            // User explicitly chose DuckDuckGo
            console.log(`[WebSearch] Using DuckDuckGo (user preference)...`);
            results = await searchDuckDuckGo(params.query, params.maxResults);
            provider = "duckduckgo";
        } else {
            // Auto mode: Perplexity (if key) > Gemini (if key) > DuckDuckGo
            if (perplexityApiKey) {
                console.log(`[WebSearch] Auto: Trying Perplexity sonar...`);
                try {
                    results = await searchWithPerplexity(params.query, params.maxResults, perplexityApiKey, "sonar", currentDate);
                    provider = "perplexity";
                    console.log(`[WebSearch] Perplexity returned ${results.length} results`);
                } catch (error) {
                    console.warn(`[WebSearch] Perplexity failed, trying Gemini:`, error);
                }
            }

            if (results.length === 0 && googleApiKey) {
                console.log(`[WebSearch] Auto: Trying Gemini grounding...`);
                try {
                    results = await searchWithGeminiGrounding(params.query, params.maxResults, googleApiKey, currentDate);
                    provider = "gemini";
                } catch (error) {
                    console.warn(`[WebSearch] Gemini failed, falling back to DuckDuckGo:`, error);
                }
            }
        }

        // Fallback to DuckDuckGo if no results from any provider
        if (results.length === 0) {
            console.log(`[WebSearch] Falling back to DuckDuckGo...`);
            results = await searchDuckDuckGo(params.query, params.maxResults);
            provider = "duckduckgo";
        }

        console.log(`[WebSearch] Got ${results.length} results from ${provider} in ${Date.now() - startTime}ms`);
        if (results.length > 0) {
            console.log(`[WebSearch] First result:`, results[0]);
        } else {
            console.log(`[WebSearch] WARNING: No results returned`);
        }

        return {
            success: true,
            data: {
                query: params.query,
                results,
                totalResults: results.length,
                searchDate: currentDate,
            },
            metadata: {
                executionTime: Date.now() - startTime,
                source: provider,
            },
        };
    } catch (error) {
        console.error(`[WebSearch] Error:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Search failed",
            metadata: {
                executionTime: Date.now() - startTime,
            },
        };
    }
}

/**
 * Search using Google Gemini with grounding (real-time web search)
 * Uses the @google/genai SDK with grounding capability
 */
async function searchWithGeminiGrounding(
    query: string,
    maxResults: number,
    apiKey: string,
    currentDate: string
): Promise<WebSearchResult[]> {
    try {
        // Dynamic import to avoid issues if package not installed
        const { GoogleGenAI } = await import("@google/genai");

        const ai = new GoogleGenAI({ apiKey });

        // Use Gemini with Google Search grounding
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
                role: "user",
                parts: [{
                    text: `Today is ${currentDate}. Search the web and provide the top ${maxResults} most relevant and recent results for: "${query}"

For each result, provide:
1. Title - the page/article title
2. URL - the full URL
3. Snippet - a brief 1-2 sentence description

Format your response as a JSON array like this:
[
  {"title": "...", "url": "...", "snippet": "..."},
  ...
]

Return ONLY the JSON array, no other text.`
                }]
            }],
            config: {
                tools: [{
                    googleSearch: {}
                }],
            },
        });

        // Parse the response
        const text = response.text || "";
        console.log(`[WebSearch] Gemini raw response (first 500 chars):`, text.substring(0, 500));

        // Try to extract JSON from the response
        const jsonMatch = text.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
                return parsed.slice(0, maxResults).map((item: { title?: string; url?: string; snippet?: string }) => ({
                    title: item.title || "Search Result",
                    url: item.url || "",
                    snippet: item.snippet || "",
                    source: "gemini",
                }));
            }
        }

        // If we couldn't parse JSON, try to extract grounding metadata
        const groundingMetadata = (response as unknown as {
            candidates?: Array<{ groundingMetadata?: { webSearchQueries?: string[] } }>
        })?.candidates?.[0]?.groundingMetadata;

        if (groundingMetadata) {
            console.log(`[WebSearch] Gemini grounding metadata:`, groundingMetadata);
        }

        // Fallback: return the text response as a single result
        if (text.length > 0) {
            return [{
                title: `Search results for: ${query}`,
                url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                snippet: text.substring(0, 500),
                source: "gemini",
            }];
        }

        return [];
    } catch (error) {
        console.error(`[WebSearch] Gemini grounding error:`, error);
        throw error;
    }
}

async function searchDuckDuckGo(
    query: string,
    maxResults: number
): Promise<WebSearchResult[]> {
    // First try DuckDuckGo Instant Answer API (good for factual/wiki queries)
    const instantResults = await searchDuckDuckGoInstant(query, maxResults);

    // If we got results from Instant API, use those
    if (instantResults.length > 0) {
        console.log(`[WebSearch] Got ${instantResults.length} results from Instant Answer API`);
        return instantResults;
    }

    // Otherwise, try HTML scraping for general web searches (news, recent content, etc.)
    console.log(`[WebSearch] Instant API returned no results, trying HTML scrape...`);
    const scrapeResults = await searchDuckDuckGoHTML(query, maxResults);

    if (scrapeResults.length > 0) {
        console.log(`[WebSearch] Got ${scrapeResults.length} results from HTML scrape`);
        return scrapeResults;
    }

    // Last resort: return an informative message to help the model
    console.log(`[WebSearch] No results from either method`);
    return [{
        title: "Search completed",
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: `No direct results found for "${query}". The user can try searching directly at DuckDuckGo.`,
        source: "duckduckgo",
    }];
}

async function searchDuckDuckGoInstant(
    query: string,
    maxResults: number
): Promise<WebSearchResult[]> {
    // DuckDuckGo Instant Answer API (limited - only works for factual/wiki queries)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
        console.error(`[WebSearch] Instant API error: ${response.statusText}`);
        return [];
    }

    const data = await response.json();
    const results: WebSearchResult[] = [];

    // Abstract (main result)
    if (data.Abstract) {
        results.push({
            title: data.Heading || "Search Result",
            url: data.AbstractURL || "",
            snippet: data.Abstract,
            displayUrl: data.AbstractSource,
        });
    }

    // Related topics
    if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
            if (topic.Text && topic.FirstURL) {
                results.push({
                    title: topic.Text.split(" - ")[0] || "Related Topic",
                    url: topic.FirstURL,
                    snippet: topic.Text,
                });
            }
        }
    }

    // Results (if any)
    if (data.Results) {
        for (const result of data.Results.slice(0, maxResults - results.length)) {
            results.push({
                title: result.Text || "Result",
                url: result.FirstURL,
                snippet: result.Text,
            });
        }
    }

    return results.slice(0, maxResults);
}

async function searchDuckDuckGoHTML(
    query: string,
    maxResults: number
): Promise<WebSearchResult[]> {
    // Use DuckDuckGo HTML endpoint for actual web search results
    // This works for news, general queries, etc. but requires HTML parsing
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            console.error(`[WebSearch] HTML endpoint error: ${response.statusText}`);
            return [];
        }

        const html = await response.text();
        const results: WebSearchResult[] = [];

        // Parse search results from HTML using regex (simple approach, no DOM parser needed)
        // DuckDuckGo HTML results are in <a class="result__a" href="...">Title</a>
        // with <a class="result__snippet">Snippet</a>

        // Extract results from DuckDuckGo HTML
        let match;

        // Find all result links
        // Match title text including any nested <b> tags from DuckDuckGo highlighting
        const linkRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>((?:[^<]|<b>[^<]*<\/b>)+)/gi;
        const snippetRegex = /class="result__snippet"[^>]*>([^<]+)</gi;

        const links: Array<{ url: string; title: string }> = [];
        const snippets: string[] = [];

        while ((match = linkRegex.exec(html)) !== null && links.length < maxResults) {
            // DDG encodes the actual URL in the redirect URL
            let url = match[1];
            // DDG HTML uses uddg redirect, extract the actual URL
            if (url.includes("uddg=")) {
                const uddgMatch = url.match(/uddg=([^&]+)/);
                if (uddgMatch) {
                    url = decodeURIComponent(uddgMatch[1]);
                }
            }
            links.push({
                url: url.startsWith("http") ? url : `https://duckduckgo.com${url}`,
                title: match[2].replace(/<\/?b>/gi, "").trim(),
            });
        }

        while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
            snippets.push(match[1].trim().replace(/<[^>]*>/g, '')); // Strip any remaining HTML
        }

        // Combine links and snippets
        for (let i = 0; i < Math.min(links.length, maxResults); i++) {
            results.push({
                title: links[i].title,
                url: links[i].url,
                snippet: snippets[i] || links[i].title,
            });
        }

        return results;
    } catch (error) {
        console.error(`[WebSearch] HTML scrape error:`, error);
        return [];
    }
}

export const webSearchTool: Tool = {
    id: "web_search",
    name: "Web Search",
    description: "Search the web for current information, news, or facts. Takes a single query string and returns search results with titles, URLs, and snippets.",
    category: "search",
    icon: "Search",
    schema,
    execute,
};
