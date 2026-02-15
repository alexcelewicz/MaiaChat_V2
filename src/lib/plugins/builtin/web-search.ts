/**
 * Web Search Plugin
 *
 * Provides web search capabilities using various search APIs.
 */

import { Plugin, PluginManifest, PluginContext, PluginExecutionResult } from '../runtime';

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source?: string;
}

interface SerperResult {
    title?: string;
    link?: string;
    snippet?: string;
    description?: string;
    source?: string;
}

interface BraveResult {
    title?: string;
    url?: string;
    description?: string;
}

export class WebSearchPlugin extends Plugin {
    manifest: PluginManifest = {
        name: 'Web Search',
        slug: 'web-search',
        version: '1.0.0',
        description: 'Search the web for current information',
        author: 'MaiaChat',
        icon: '🔍',
        category: 'search',
        permissions: ['web_search', 'api_calls'],
        configSchema: {
            searchEngine: {
                type: 'select',
                label: 'Search Engine',
                description: 'Choose which search engine to use',
                options: [
                    { value: 'auto', label: 'Auto (Gemini → DuckDuckGo)' },
                    { value: 'gemini', label: 'Gemini Grounding' },
                    { value: 'serper', label: 'Serper.dev (Google)' },
                    { value: 'brave', label: 'Brave Search' },
                    { value: 'duckduckgo', label: 'DuckDuckGo' },
                ],
                default: 'auto',
            },
            apiKey: {
                type: 'secret',
                label: 'API Key',
                description: 'API key for the selected search engine',
                required: false,
            },
        },
        tools: [
            {
                name: 'search',
                description: 'Search the web for information. Use this when you need current information, news, or facts not in your training data.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'The search query',
                        },
                        maxResults: {
                            type: 'number',
                            description: 'Maximum number of results to return (1-10)',
                            default: 5,
                        },
                        searchType: {
                            type: 'string',
                            description: 'Type of search',
                            enum: ['web', 'news', 'images'],
                            default: 'web',
                        },
                    },
                    required: ['query'],
                },
            },
        ],
    };

    async execute(
        toolName: string,
        args: Record<string, unknown>,
        context: PluginContext
    ): Promise<PluginExecutionResult> {
        if (toolName !== 'search') {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        const query = args.query as string;
        const maxResults = Math.min(Math.max(1, (args.maxResults as number) || 5), 10);
        const searchType = (args.searchType as string) || 'web';
        const searchEngine = (context.config.searchEngine as string) || 'auto';
        const apiKey = context.config.apiKey as string | undefined;
        // User API keys can be passed via config for Gemini grounding support
        const googleApiKey = (context.config.googleApiKey as string) || undefined;

        try {
            let results: SearchResult[];

            if (searchEngine === 'auto') {
                // Auto mode: try Gemini grounding first (if Google key available),
                // then DuckDuckGo (free, no API key), then Serper/Brave if configured
                results = [];
                if (googleApiKey) {
                    try {
                        results = await this.searchWithGeminiGrounding(query, maxResults, googleApiKey);
                    } catch (err) {
                        console.warn(`[WebSearchPlugin] Gemini grounding failed, falling back:`, err);
                    }
                }
                if (results.length === 0) {
                    results = await this.searchWithDuckDuckGo(query, maxResults);
                }
            } else {
                switch (searchEngine) {
                    case 'serper':
                        results = await this.searchWithSerper(query, maxResults, searchType, apiKey);
                        break;
                    case 'brave':
                        results = await this.searchWithBrave(query, maxResults, apiKey);
                        break;
                    case 'gemini':
                        results = await this.searchWithGeminiGrounding(query, maxResults, googleApiKey || apiKey || '');
                        break;
                    case 'duckduckgo':
                    default:
                        results = await this.searchWithDuckDuckGo(query, maxResults);
                        break;
                }
            }

            if (results.length === 0) {
                return {
                    success: true,
                    output: 'No results found for the query.',
                    data: { results: [] },
                };
            }

            const formattedOutput = results
                .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   URL: ${r.url}`)
                .join('\n\n');

            return {
                success: true,
                output: `Found ${results.length} results:\n\n${formattedOutput}`,
                data: { results },
                metadata: { searchEngine, query },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Search failed',
            };
        }
    }

    private async searchWithSerper(
        query: string,
        maxResults: number,
        searchType: string,
        apiKey?: string
    ): Promise<SearchResult[]> {
        const key = apiKey || process.env.SERPER_API_KEY;
        if (!key) {
            throw new Error('Serper API key not configured');
        }

        const endpoint = searchType === 'news'
            ? 'https://google.serper.dev/news'
            : searchType === 'images'
            ? 'https://google.serper.dev/images'
            : 'https://google.serper.dev/search';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'X-API-KEY': key,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: query,
                num: maxResults,
            }),
        });

        if (!response.ok) {
            throw new Error(`Serper API error: ${response.statusText}`);
        }

        const data = await response.json() as {
            organic?: SerperResult[];
            news?: SerperResult[];
            images?: SerperResult[];
        };
        const items = data.organic || data.news || data.images || [];

        return items.slice(0, maxResults).map((item) => ({
            title: item.title ?? 'Untitled',
            url: item.link ?? '',
            snippet: item.snippet ?? item.description ?? '',
            source: item.source,
        }));
    }

    private async searchWithBrave(
        query: string,
        maxResults: number,
        apiKey?: string
    ): Promise<SearchResult[]> {
        const key = apiKey || process.env.BRAVE_API_KEY;
        if (!key) {
            throw new Error('Brave API key not configured');
        }

        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.searchParams.set('q', query);
        url.searchParams.set('count', String(maxResults));

        const response = await fetch(url.toString(), {
            headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': key,
            },
        });

        if (!response.ok) {
            throw new Error(`Brave API error: ${response.statusText}`);
        }

        const data = await response.json() as { web?: { results?: BraveResult[] } };
        const results = data.web?.results || [];

        return results.slice(0, maxResults).map((item) => ({
            title: item.title ?? 'Untitled',
            url: item.url ?? '',
            snippet: item.description ?? '',
        }));
    }

    private async searchWithGeminiGrounding(
        query: string,
        maxResults: number,
        apiKey: string
    ): Promise<SearchResult[]> {
        if (!apiKey) throw new Error('Google API key required for Gemini grounding');

        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });

        const currentDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

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
                tools: [{ googleSearch: {} }],
            },
        });

        const text = response.text || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
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

        // Fallback: return text as single result
        if (text.length > 0) {
            return [{
                title: `Search results for: ${query}`,
                url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                snippet: text.substring(0, 500),
                source: "gemini",
            }];
        }

        return [];
    }

    private async searchWithDuckDuckGo(
        query: string,
        maxResults: number
    ): Promise<SearchResult[]> {
        // First try Instant Answer API (good for factual/wiki queries)
        const instantResults = await this.searchDuckDuckGoInstant(query, maxResults);
        if (instantResults.length > 0) {
            console.log(`[WebSearchPlugin] Got ${instantResults.length} results from Instant API`);
            return instantResults;
        }

        // Fallback to HTML scraping for news/general queries
        console.log(`[WebSearchPlugin] Instant API returned no results, trying HTML scrape...`);
        const htmlResults = await this.searchDuckDuckGoHTML(query, maxResults);
        if (htmlResults.length > 0) {
            console.log(`[WebSearchPlugin] Got ${htmlResults.length} results from HTML scrape`);
            return htmlResults;
        }

        console.log(`[WebSearchPlugin] No results from either method`);
        return [];
    }

    private async searchDuckDuckGoInstant(
        query: string,
        maxResults: number
    ): Promise<SearchResult[]> {
        // DuckDuckGo Instant Answer API (limited - only works for factual/wiki queries)
        const url = new URL('https://api.duckduckgo.com/');
        url.searchParams.set('q', query);
        url.searchParams.set('format', 'json');
        url.searchParams.set('no_html', '1');

        try {
            const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
            if (!response.ok) {
                console.error(`[WebSearchPlugin] Instant API error: ${response.statusText}`);
                return [];
            }

            const data = await response.json();
            const results: SearchResult[] = [];

            // Abstract (main answer)
            if (data.Abstract) {
                results.push({
                    title: data.Heading || 'Answer',
                    url: data.AbstractURL || '',
                    snippet: data.Abstract,
                    source: data.AbstractSource,
                });
            }

            // Related topics
            for (const topic of (data.RelatedTopics || []).slice(0, maxResults - results.length)) {
                if (topic.Text) {
                    results.push({
                        title: topic.Text.split(' - ')[0] || 'Related',
                        url: topic.FirstURL || '',
                        snippet: topic.Text,
                    });
                }
            }

            return results;
        } catch (error) {
            console.error(`[WebSearchPlugin] Instant API error:`, error);
            return [];
        }
    }

    private async searchDuckDuckGoHTML(
        query: string,
        maxResults: number
    ): Promise<SearchResult[]> {
        // Use DuckDuckGo HTML endpoint for actual web search results
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
                console.error(`[WebSearchPlugin] HTML endpoint error: ${response.statusText}`);
                return [];
            }

            const html = await response.text();
            const results: SearchResult[] = [];

            // Parse search results from HTML using regex
            const linkRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]+)</gi;
            const snippetRegex = /class="result__snippet"[^>]*>([^<]+)</gi;

            const links: Array<{ url: string; title: string }> = [];
            const snippets: string[] = [];

            let match;
            while ((match = linkRegex.exec(html)) !== null && links.length < maxResults) {
                let resultUrl = match[1];
                // DDG HTML uses uddg redirect, extract the actual URL
                if (resultUrl.includes("uddg=")) {
                    const uddgMatch = resultUrl.match(/uddg=([^&]+)/);
                    if (uddgMatch) {
                        resultUrl = decodeURIComponent(uddgMatch[1]);
                    }
                }
                links.push({
                    url: resultUrl.startsWith("http") ? resultUrl : `https://duckduckgo.com${resultUrl}`,
                    title: match[2].trim(),
                });
            }

            while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
                snippets.push(match[1].trim().replace(/<[^>]*>/g, ''));
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
            console.error(`[WebSearchPlugin] HTML scrape error:`, error);
            return [];
        }
    }
}
