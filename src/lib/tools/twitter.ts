/**
 * Twitter/X Integration Tool
 *
 * Provides Twitter/X capabilities with tiered API access for cost optimization.
 *
 * Tier 1 (Free):     FXTwitter API       - get_tweet only, no key needed
 * Tier 2 (Cheap):    Twitterapi.io       - search, profiles, timelines
 * Tier 3 (Standard): X API v2            - full access
 * Tier 4 (Premium):  xAI/Grok LLM       - deep analysis fallback
 *
 * Auto-selection tries the cheapest tier first for each action, falling back
 * up the chain on failure.
 */

import { z } from "zod";
import type { Tool, ToolId, ToolResult } from "./types";
import { getConfigSection } from "@/lib/config";

// ============================================================================
// Tool Schema
// ============================================================================

const twitterToolSchema = z.object({
    action: z.enum(["search", "get_tweet", "get_user", "get_timeline", "analyze"]),
    query: z.string().optional().describe("Search query"),
    tweetId: z.string().optional().describe("Tweet ID for get_tweet"),
    username: z.string().optional().describe("Username for get_user/get_timeline"),
    maxResults: z.number().int().min(1).max(100).default(10).optional(),
});

type TwitterToolInput = z.infer<typeof twitterToolSchema>;

// ============================================================================
// Twitter Config Type
// ============================================================================

interface TwitterConfig {
    enabled: boolean;
    tier1Enabled: boolean;
    tier2Enabled: boolean;
    tier3Enabled: boolean;
    tier4Enabled: boolean;
    fxTwitterEnabled: boolean;
    twitterApiIoKey: string | null;
    xApiBearerToken: string | null;
    xAiApiKey: string | null;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const twitterTool: Tool = {
    id: "twitter" as ToolId,
    name: "Twitter/X",
    description:
        "Search tweets, get user profiles, and analyze Twitter/X content. " +
        "Uses tiered API access for cost optimization.",
    category: "integration",
    icon: "Twitter",
    schema: twitterToolSchema,
    execute: async (params) => {
        const input = params as TwitterToolInput;
        return executeTwitterTool(input);
    },
};

// ============================================================================
// Tier Definitions
// ============================================================================

const FXTWITTER_BASE = "https://api.fxtwitter.com";
const TWITTERAPIIO_BASE = "https://api.twitterapi.io/twitter";
const XAPI_V2_BASE = "https://api.twitter.com/2";
const XAI_API_BASE = "https://api.x.ai/v1";

// ============================================================================
// Config Loader
// ============================================================================

async function getTwitterConfig(): Promise<TwitterConfig> {
    try {
        const integrations = await getConfigSection("integrations");
        const twitter = integrations?.twitter as
            | (Partial<TwitterConfig> & { [key: string]: unknown })
            | undefined;
        if (twitter) {
            return {
                enabled: Boolean(twitter.enabled),
                tier1Enabled: twitter.tier1Enabled ?? twitter.fxTwitterEnabled ?? true,
                tier2Enabled: twitter.tier2Enabled ?? true,
                tier3Enabled: twitter.tier3Enabled ?? true,
                tier4Enabled: twitter.tier4Enabled ?? false,
                fxTwitterEnabled: twitter.fxTwitterEnabled ?? twitter.tier1Enabled ?? true,
                twitterApiIoKey: twitter.twitterApiIoKey ?? null,
                xApiBearerToken: twitter.xApiBearerToken ?? null,
                xAiApiKey: twitter.xAiApiKey ?? null,
            };
        }
    } catch {
        // Config not available; fall back to defaults
    }
    return {
        enabled: false,
        tier1Enabled: true,
        tier2Enabled: true,
        tier3Enabled: true,
        tier4Enabled: false,
        fxTwitterEnabled: true,
        twitterApiIoKey: null,
        xApiBearerToken: null,
        xAiApiKey: null,
    };
}

// ============================================================================
// Main Execution Router
// ============================================================================

async function executeTwitterTool(input: TwitterToolInput): Promise<ToolResult> {
    const config = await getTwitterConfig();

    if (!config.enabled) {
        return {
            success: false,
            error: "Twitter integration is not enabled. Enable it in Settings > Integrations.",
        };
    }

    const { action } = input;

    try {
        switch (action) {
            case "get_tweet":
                return await executeGetTweet(input, config);
            case "search":
                return await executeSearch(input, config);
            case "get_user":
                return await executeGetUser(input, config);
            case "get_timeline":
                return await executeGetTimeline(input, config);
            case "analyze":
                return await executeAnalyze(input, config);
            default:
                return { success: false, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        console.error("[Twitter Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Twitter operation failed",
        };
    }
}

// ============================================================================
// get_tweet: Tier 1 -> 2 -> 3
// ============================================================================

async function executeGetTweet(
    input: TwitterToolInput,
    config: TwitterConfig
): Promise<ToolResult> {
    if (!input.tweetId) {
        return { success: false, error: "tweetId is required for get_tweet action" };
    }

    // Tier 1: FXTwitter (free)
    if (config.tier1Enabled && config.fxTwitterEnabled) {
        const result = await tryFxTwitterGetTweet(input.tweetId);
        if (result) return result;
    }

    // Tier 2: Twitterapi.io
    if (config.tier2Enabled && config.twitterApiIoKey) {
        const result = await tryTwitterApiIoGetTweet(input.tweetId, config.twitterApiIoKey);
        if (result) return result;
    }

    // Tier 3: X API v2
    if (config.tier3Enabled && config.xApiBearerToken) {
        const result = await tryXApiGetTweet(input.tweetId, config.xApiBearerToken);
        if (result) return result;
    }

    return {
        success: false,
        error: "No Twitter API tier available for get_tweet. Configure at least one API key in Settings > Integrations, or enable FXTwitter.",
    };
}

// ============================================================================
// search: Tier 2 -> 3
// ============================================================================

async function executeSearch(
    input: TwitterToolInput,
    config: TwitterConfig
): Promise<ToolResult> {
    if (!input.query) {
        return { success: false, error: "query is required for search action" };
    }

    const maxResults = input.maxResults ?? 10;

    // Tier 2: Twitterapi.io
    if (config.tier2Enabled && config.twitterApiIoKey) {
        const result = await tryTwitterApiIoSearch(input.query, maxResults, config.twitterApiIoKey);
        if (result) return result;
    }

    // Tier 3: X API v2
    if (config.tier3Enabled && config.xApiBearerToken) {
        const result = await tryXApiSearch(input.query, maxResults, config.xApiBearerToken);
        if (result) return result;
    }

    return {
        success: false,
        error: "No Twitter API tier available for search. Configure a Twitterapi.io key or X API bearer token in Settings > Integrations.",
    };
}

// ============================================================================
// get_user: Tier 2 -> 3
// ============================================================================

async function executeGetUser(
    input: TwitterToolInput,
    config: TwitterConfig
): Promise<ToolResult> {
    if (!input.username) {
        return { success: false, error: "username is required for get_user action" };
    }

    // Tier 2: Twitterapi.io
    if (config.tier2Enabled && config.twitterApiIoKey) {
        const result = await tryTwitterApiIoGetUser(input.username, config.twitterApiIoKey);
        if (result) return result;
    }

    // Tier 3: X API v2
    if (config.tier3Enabled && config.xApiBearerToken) {
        const result = await tryXApiGetUser(input.username, config.xApiBearerToken);
        if (result) return result;
    }

    return {
        success: false,
        error: "No Twitter API tier available for get_user. Configure a Twitterapi.io key or X API bearer token in Settings > Integrations.",
    };
}

// ============================================================================
// get_timeline: Tier 2 -> 3
// ============================================================================

async function executeGetTimeline(
    input: TwitterToolInput,
    config: TwitterConfig
): Promise<ToolResult> {
    if (!input.username) {
        return { success: false, error: "username is required for get_timeline action" };
    }

    const maxResults = input.maxResults ?? 10;

    // Tier 2: Twitterapi.io
    if (config.tier2Enabled && config.twitterApiIoKey) {
        const result = await tryTwitterApiIoGetTimeline(input.username, maxResults, config.twitterApiIoKey);
        if (result) return result;
    }

    // Tier 3: X API v2
    if (config.tier3Enabled && config.xApiBearerToken) {
        const result = await tryXApiGetTimeline(input.username, maxResults, config.xApiBearerToken);
        if (result) return result;
    }

    return {
        success: false,
        error: "No Twitter API tier available for get_timeline. Configure a Twitterapi.io key or X API bearer token in Settings > Integrations.",
    };
}

// ============================================================================
// analyze: Tier 4 (xAI/Grok)
// ============================================================================

async function executeAnalyze(
    input: TwitterToolInput,
    config: TwitterConfig
): Promise<ToolResult> {
    if (!config.tier4Enabled) {
        return {
            success: false,
            error: "Tier 4 analysis is disabled. Enable integrations.twitter.tier4Enabled in config.",
        };
    }

    if (!config.xAiApiKey) {
        return {
            success: false,
            error: "xAI API key is required for analyze action (integrations.twitter.xAiApiKey).",
        };
    }

    let sourceSummary = "";

    if (input.tweetId) {
        const tweetResult = await executeGetTweet({ action: "get_tweet", tweetId: input.tweetId }, config);
        if (!tweetResult.success) {
            return {
                success: false,
                error: `Failed to fetch tweet for analysis: ${tweetResult.error}`,
            };
        }
        const tweet = (tweetResult.data || {}) as Record<string, unknown>;
        sourceSummary = [
            `Tweet ID: ${tweet.id || input.tweetId}`,
            `Author: ${(tweet.author as Record<string, unknown> | undefined)?.username || "unknown"}`,
            `Text: ${tweet.text || ""}`,
            `Likes: ${tweet.likes || 0}`,
            `Retweets: ${tweet.retweets || 0}`,
            `Replies: ${tweet.replies || 0}`,
        ].join("\n");
    } else if (input.query) {
        const searchResult = await executeSearch(
            { action: "search", query: input.query, maxResults: Math.min(input.maxResults ?? 5, 20) },
            config
        );
        if (!searchResult.success) {
            return {
                success: false,
                error: `Failed to fetch tweets for analysis: ${searchResult.error}`,
            };
        }

        const payload = (searchResult.data || {}) as { tweets?: Array<Record<string, unknown>> };
        const tweets = payload.tweets || [];
        if (tweets.length === 0) {
            return {
                success: false,
                error: "No tweets found for analysis.",
            };
        }

        sourceSummary = tweets
            .map((tweet, index) =>
                [
                    `#${index + 1}`,
                    `ID: ${tweet.id || "unknown"}`,
                    `Author: ${tweet.author || "unknown"}`,
                    `Text: ${tweet.text || ""}`,
                    `Likes: ${tweet.likes || 0}`,
                    `Retweets: ${tweet.retweets || 0}`,
                ].join(" | ")
            )
            .join("\n");
    } else {
        return {
            success: false,
            error: "analyze action requires either tweetId or query",
        };
    }

    const analysisPrompt = [
        "Analyze this Twitter/X data and provide concise insights:",
        "1) Key themes and sentiment",
        "2) Notable signals or risks",
        "3) Suggested actions",
        "",
        sourceSummary,
    ].join("\n");

    const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.xAiApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "grok-3-fast",
            messages: [
                {
                    role: "system",
                    content: "You are a social media analyst. Be specific, concise, and evidence-based.",
                },
                {
                    role: "user",
                    content: analysisPrompt,
                },
            ],
            temperature: 0.2,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        return {
            success: false,
            error: `xAI analysis failed (${response.status}): ${errorText}`,
        };
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content;

    if (!analysis) {
        return {
            success: false,
            error: "xAI returned no analysis content",
        };
    }

    return {
        success: true,
        data: {
            analysis,
            input: {
                tweetId: input.tweetId,
                query: input.query,
            },
        },
        metadata: { source: "xai_grok", cached: false },
    };
}

// ============================================================================
// Tier 1: FXTwitter API (Free, get_tweet only)
// ============================================================================

async function tryFxTwitterGetTweet(tweetId: string): Promise<ToolResult | null> {
    try {
        const response = await fetch(`${FXTWITTER_BASE}/status/${tweetId}`);
        if (!response.ok) return null;

        const data = await response.json();
        const tweet = data.tweet;
        if (!tweet) return null;

        return {
            success: true,
            data: {
                id: tweet.id,
                text: tweet.text,
                author: {
                    name: tweet.author?.name,
                    username: tweet.author?.screen_name,
                    avatar: tweet.author?.avatar_url,
                },
                createdAt: tweet.created_at,
                likes: tweet.likes,
                retweets: tweet.retweets,
                replies: tweet.replies,
                views: tweet.views,
                media: tweet.media?.all?.map((m: Record<string, unknown>) => ({
                    type: m.type,
                    url: m.url,
                })),
                url: tweet.url,
            },
            metadata: { source: "fxtwitter", cached: false },
        };
    } catch {
        return null;
    }
}

// ============================================================================
// Tier 2: Twitterapi.io (Cheap)
// ============================================================================

async function twitterApiIoFetch(
    endpoint: string,
    apiKey: string
): Promise<Response> {
    return fetch(`${TWITTERAPIIO_BASE}${endpoint}`, {
        headers: {
            "X-API-Key": apiKey,
            Accept: "application/json",
        },
    });
}

async function tryTwitterApiIoGetTweet(
    tweetId: string,
    apiKey: string
): Promise<ToolResult | null> {
    try {
        const response = await twitterApiIoFetch(`/tweets?tweet_ids=${tweetId}`, apiKey);
        if (!response.ok) return null;

        const data = await response.json();
        const tweets = data.tweets || data.data;
        if (!tweets || tweets.length === 0) return null;

        const tweet = tweets[0];
        return {
            success: true,
            data: {
                id: tweet.id || tweet.id_str,
                text: tweet.text || tweet.full_text,
                author: {
                    name: tweet.author?.name || tweet.user?.name,
                    username: tweet.author?.username || tweet.user?.screen_name,
                },
                createdAt: tweet.created_at,
                likes: tweet.public_metrics?.like_count ?? tweet.favorite_count,
                retweets: tweet.public_metrics?.retweet_count ?? tweet.retweet_count,
                replies: tweet.public_metrics?.reply_count,
            },
            metadata: { source: "twitterapiio", cached: false },
        };
    } catch {
        return null;
    }
}

async function tryTwitterApiIoSearch(
    query: string,
    maxResults: number,
    apiKey: string
): Promise<ToolResult | null> {
    try {
        const encodedQuery = encodeURIComponent(query);
        const response = await twitterApiIoFetch(
            `/tweet/advanced_search?query=${encodedQuery}&queryType=Latest&cursor=`,
            apiKey
        );
        if (!response.ok) return null;

        const data = await response.json();
        const tweets = data.tweets || data.data || [];
        const limited = tweets.slice(0, maxResults);

        return {
            success: true,
            data: {
                query,
                count: limited.length,
                tweets: limited.map((t: Record<string, unknown>) => ({
                    id: t.id || t.id_str,
                    text: t.text || t.full_text,
                    author: (t.author as Record<string, unknown>)?.username ||
                            (t.user as Record<string, unknown>)?.screen_name,
                    createdAt: t.created_at,
                    likes: (t.public_metrics as Record<string, unknown>)?.like_count ?? t.favorite_count,
                    retweets: (t.public_metrics as Record<string, unknown>)?.retweet_count ?? t.retweet_count,
                })),
            },
            metadata: { source: "twitterapiio", cached: false },
        };
    } catch {
        return null;
    }
}

async function tryTwitterApiIoGetUser(
    username: string,
    apiKey: string
): Promise<ToolResult | null> {
    try {
        const response = await twitterApiIoFetch(
            `/user/info?userName=${encodeURIComponent(username)}`,
            apiKey
        );
        if (!response.ok) return null;

        const data = await response.json();
        const user = data.data || data;

        return {
            success: true,
            data: {
                id: user.id || user.id_str,
                name: user.name,
                username: user.userName || user.username || user.screen_name,
                description: user.description,
                location: user.location,
                verified: user.isBlueVerified || user.verified,
                followers: user.followers || user.public_metrics?.followers_count || user.followers_count,
                following: user.following || user.public_metrics?.following_count || user.friends_count,
                tweetCount: user.statusesCount || user.public_metrics?.tweet_count || user.statuses_count,
                profileImage: user.profilePicture || user.profile_image_url,
                createdAt: user.createdAt || user.created_at,
            },
            metadata: { source: "twitterapiio", cached: false },
        };
    } catch {
        return null;
    }
}

async function tryTwitterApiIoGetTimeline(
    username: string,
    maxResults: number,
    apiKey: string
): Promise<ToolResult | null> {
    try {
        const response = await twitterApiIoFetch(
            `/user/last_tweets?userName=${encodeURIComponent(username)}`,
            apiKey
        );
        if (!response.ok) return null;

        const data = await response.json();
        const tweets = data.tweets || data.data || [];
        const limited = tweets.slice(0, maxResults);

        return {
            success: true,
            data: {
                username,
                count: limited.length,
                tweets: limited.map((t: Record<string, unknown>) => ({
                    id: t.id || t.id_str,
                    text: t.text || t.full_text,
                    createdAt: t.created_at || t.createdAt,
                    likes: (t.public_metrics as Record<string, unknown>)?.like_count ?? t.favorite_count,
                    retweets: (t.public_metrics as Record<string, unknown>)?.retweet_count ?? t.retweet_count,
                    replies: (t.public_metrics as Record<string, unknown>)?.reply_count,
                })),
            },
            metadata: { source: "twitterapiio", cached: false },
        };
    } catch {
        return null;
    }
}

// ============================================================================
// Tier 3: X API v2 (Standard)
// ============================================================================

async function xApiFetch(
    endpoint: string,
    bearerToken: string
): Promise<Response> {
    return fetch(`${XAPI_V2_BASE}${endpoint}`, {
        headers: {
            Authorization: `Bearer ${bearerToken}`,
            Accept: "application/json",
        },
    });
}

async function tryXApiGetTweet(
    tweetId: string,
    bearerToken: string
): Promise<ToolResult | null> {
    try {
        const fields = "tweet.fields=created_at,public_metrics,author_id,text";
        const expansions = "expansions=author_id";
        const userFields = "user.fields=name,username,profile_image_url";
        const response = await xApiFetch(
            `/tweets/${tweetId}?${fields}&${expansions}&${userFields}`,
            bearerToken
        );
        if (!response.ok) return null;

        const data = await response.json();
        const tweet = data.data;
        if (!tweet) return null;

        const author = data.includes?.users?.[0];

        return {
            success: true,
            data: {
                id: tweet.id,
                text: tweet.text,
                author: {
                    name: author?.name,
                    username: author?.username,
                    avatar: author?.profile_image_url,
                },
                createdAt: tweet.created_at,
                likes: tweet.public_metrics?.like_count,
                retweets: tweet.public_metrics?.retweet_count,
                replies: tweet.public_metrics?.reply_count,
                views: tweet.public_metrics?.impression_count,
            },
            metadata: { source: "xapi_v2", cached: false },
        };
    } catch {
        return null;
    }
}

async function tryXApiSearch(
    query: string,
    maxResults: number,
    bearerToken: string
): Promise<ToolResult | null> {
    try {
        const encodedQuery = encodeURIComponent(query);
        const clampedMax = Math.min(Math.max(maxResults, 10), 100);
        const fields = "tweet.fields=created_at,public_metrics,author_id";
        const expansions = "expansions=author_id";
        const userFields = "user.fields=name,username";
        const response = await xApiFetch(
            `/tweets/search/recent?query=${encodedQuery}&max_results=${clampedMax}&${fields}&${expansions}&${userFields}`,
            bearerToken
        );
        if (!response.ok) return null;

        const data = await response.json();
        const tweets = data.data || [];
        const usersMap = new Map<string, Record<string, unknown>>();
        for (const u of data.includes?.users || []) {
            usersMap.set(u.id, u);
        }

        return {
            success: true,
            data: {
                query,
                count: tweets.length,
                tweets: tweets.map((t: Record<string, unknown>) => {
                    const author = usersMap.get(t.author_id as string);
                    return {
                        id: t.id,
                        text: t.text,
                        author: author?.username || t.author_id,
                        createdAt: t.created_at,
                        likes: (t.public_metrics as Record<string, unknown>)?.like_count,
                        retweets: (t.public_metrics as Record<string, unknown>)?.retweet_count,
                    };
                }),
            },
            metadata: { source: "xapi_v2", cached: false },
        };
    } catch {
        return null;
    }
}

async function tryXApiGetUser(
    username: string,
    bearerToken: string
): Promise<ToolResult | null> {
    try {
        const fields = "user.fields=created_at,description,location,public_metrics,profile_image_url,verified";
        const response = await xApiFetch(
            `/users/by/username/${encodeURIComponent(username)}?${fields}`,
            bearerToken
        );
        if (!response.ok) return null;

        const data = await response.json();
        const user = data.data;
        if (!user) return null;

        return {
            success: true,
            data: {
                id: user.id,
                name: user.name,
                username: user.username,
                description: user.description,
                location: user.location,
                verified: user.verified,
                followers: user.public_metrics?.followers_count,
                following: user.public_metrics?.following_count,
                tweetCount: user.public_metrics?.tweet_count,
                profileImage: user.profile_image_url,
                createdAt: user.created_at,
            },
            metadata: { source: "xapi_v2", cached: false },
        };
    } catch {
        return null;
    }
}

async function tryXApiGetTimeline(
    username: string,
    maxResults: number,
    bearerToken: string
): Promise<ToolResult | null> {
    try {
        // X API v2 requires user ID for timeline; resolve username -> ID first
        const userResult = await tryXApiGetUser(username, bearerToken);
        if (!userResult?.success) return null;

        const userId = (userResult.data as Record<string, unknown>)?.id;
        if (!userId) return null;

        const clampedMax = Math.min(Math.max(maxResults, 5), 100);
        const fields = "tweet.fields=created_at,public_metrics,text";
        const response = await xApiFetch(
            `/users/${userId}/tweets?max_results=${clampedMax}&${fields}`,
            bearerToken
        );
        if (!response.ok) return null;

        const data = await response.json();
        const tweets = data.data || [];

        return {
            success: true,
            data: {
                username,
                count: tweets.length,
                tweets: tweets.map((t: Record<string, unknown>) => ({
                    id: t.id,
                    text: t.text,
                    createdAt: t.created_at,
                    likes: (t.public_metrics as Record<string, unknown>)?.like_count,
                    retweets: (t.public_metrics as Record<string, unknown>)?.retweet_count,
                    replies: (t.public_metrics as Record<string, unknown>)?.reply_count,
                })),
            },
            metadata: { source: "xapi_v2", cached: false },
        };
    } catch {
        return null;
    }
}

export default twitterTool;
