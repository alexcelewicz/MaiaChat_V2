import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types";
import { uploadFile, getDownloadUrl } from "@/lib/storage/s3";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// Schema
// ============================================================================

const schema = z.object({
    action: z.enum(["generate", "edit", "variation"]),
    prompt: z.string().min(1).max(2000).describe("Image generation prompt"),
    size: z
        .enum(["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"])
        .default("1024x1024")
        .optional(),
    quality: z.enum(["standard", "hd"]).default("standard").optional(),
    style: z.enum(["natural", "vivid"]).default("natural").optional(),
    provider: z
        .enum(["auto", "openai", "gemini", "openrouter"])
        .default("auto")
        .optional(),
    imageUrl: z
        .string()
        .url()
        .optional()
        .describe("Source image URL for edit/variation actions"),
    n: z.number().int().min(1).max(4).default(1).optional(),
    saveHistory: z
        .boolean()
        .default(true)
        .optional()
        .describe("Whether to keep this generated image in user history"),
});

type ImageGenerationParams = z.infer<typeof schema>;

interface MediaGenerationPreferences {
    provider?: "auto" | "openai" | "gemini" | "openrouter";
    quality?: "standard" | "hd";
    size?: "256x256" | "512x512" | "1024x1024" | "1024x1792" | "1792x1024";
    style?: "natural" | "vivid";
    saveHistory?: boolean;
}

async function getMediaGenerationPreferences(
    userId: string
): Promise<MediaGenerationPreferences> {
    const [user] = await db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    const prefs = (user?.preferences as Record<string, unknown> | null) || {};
    const media = (prefs.mediaGeneration as Record<string, unknown> | undefined) || {};

    return {
        provider:
            media.provider === "auto" ||
            media.provider === "openai" ||
            media.provider === "gemini" ||
            media.provider === "openrouter"
                ? media.provider
                : undefined,
        quality: media.quality === "standard" || media.quality === "hd" ? media.quality : undefined,
        size:
            media.size === "256x256" ||
            media.size === "512x512" ||
            media.size === "1024x1024" ||
            media.size === "1024x1792" ||
            media.size === "1792x1024"
                ? media.size
                : undefined,
        style: media.style === "natural" || media.style === "vivid" ? media.style : undefined,
        saveHistory: typeof media.saveHistory === "boolean" ? media.saveHistory : undefined,
    };
}

// ============================================================================
// Provider Implementations
// ============================================================================

interface GeneratedImage {
    imageData: Buffer;
    model: string;
    provider: string;
    costEstimate: number;
}

async function fetchImageBufferFromResponseData(data: {
    data?: Array<{ b64_json?: string; url?: string }>;
}): Promise<Buffer> {
    const imageB64 = data.data?.[0]?.b64_json;
    const imageUrl = data.data?.[0]?.url;

    if (imageB64) {
        return Buffer.from(imageB64, "base64");
    }

    if (imageUrl) {
        const imgResponse = await fetch(imageUrl, {
            signal: AbortSignal.timeout(30000),
        });
        if (!imgResponse.ok) {
            throw new Error(`Failed to download generated image: ${imgResponse.statusText}`);
        }
        const arrayBuffer = await imgResponse.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    throw new Error("OpenAI returned no image data");
}

async function fetchSourceImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch source image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > 20 * 1024 * 1024) {
        throw new Error("Source image exceeds 20MB maximum size");
    }

    return buffer;
}

/**
 * Generate image via OpenAI gpt-image-1
 */
async function generateWithOpenAI(
    params: ImageGenerationParams,
    apiKey: string
): Promise<GeneratedImage> {
    let response: Response;
    const imageCount = params.n || 1;
    const size = params.size || "1024x1024";

    if (params.action === "generate") {
        const body: Record<string, unknown> = {
            model: "gpt-image-1",
            prompt: params.prompt,
            n: imageCount,
            size,
            quality: params.quality || "standard",
        };

        response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120000),
        });
    } else {
        const sourceImageUrl = params.imageUrl;
        if (!sourceImageUrl) {
            throw new Error(`The "${params.action}" action requires imageUrl`);
        }

        const sourceImage = await fetchSourceImage(sourceImageUrl);
        const formData = new FormData();
        formData.append("model", "gpt-image-1");
        formData.append("n", String(imageCount));
        formData.append("size", size);
        // OpenAI treats "edit" as prompt-guided and "variation" as prompt-optional
        formData.append("prompt", params.prompt);
        if (params.action === "edit") {
            formData.append("quality", params.quality || "standard");
        }

        const imageBlob = new Blob([new Uint8Array(sourceImage)], { type: "image/png" });
        formData.append("image", imageBlob, "source.png");

        const endpoint =
            params.action === "edit"
                ? "https://api.openai.com/v1/images/edits"
                : "https://api.openai.com/v1/images/variations";

        response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
            signal: AbortSignal.timeout(120000),
        });
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Images API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const imageBuffer = await fetchImageBufferFromResponseData(data);

    // Cost estimate based on size and quality
    const sizeCosts: Record<string, number> = {
        "256x256": 0.016,
        "512x512": 0.018,
        "1024x1024": 0.04,
        "1024x1792": 0.08,
        "1792x1024": 0.08,
    };
    const baseCost = sizeCosts[size] || 0.04;
    const qualityMultiplier = params.action === "variation" ? 1 : params.quality === "hd" ? 2 : 1;

    return {
        imageData: imageBuffer,
        model: "gpt-image-1",
        provider: "openai",
        costEstimate: baseCost * qualityMultiplier * imageCount,
    };
}

/**
 * Generate image via Google Gemini
 */
async function generateWithGemini(
    params: ImageGenerationParams,
    apiKey: string
): Promise<GeneratedImage> {
    const { GoogleGenAI } = await import("@google/genai");

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-image-generation",
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: `Generate an image: ${params.prompt}`,
                    },
                ],
            },
        ],
        config: {
            responseModalities: ["image", "text"],
        },
    });

    // Extract image from response parts
    const candidates = (response as unknown as {
        candidates?: Array<{
            content?: {
                parts?: Array<{
                    inlineData?: { mimeType: string; data: string };
                    text?: string;
                }>;
            };
        }>;
    })?.candidates;

    const parts = candidates?.[0]?.content?.parts;
    if (!parts) {
        throw new Error("Gemini returned no content");
    }

    const imagePart = parts.find(
        (p) => p.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart?.inlineData?.data) {
        throw new Error(
            "Gemini did not return an image. The model may have returned text only."
        );
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");

    return {
        imageData: imageBuffer,
        model: "gemini-2.5-flash-preview-image-generation",
        provider: "gemini",
        costEstimate: 0.02 * (params.n || 1),
    };
}

/**
 * Generate image via OpenRouter
 */
async function generateWithOpenRouter(
    params: ImageGenerationParams,
    apiKey: string
): Promise<GeneratedImage> {
    // Use a known image-capable model on OpenRouter
    const model = "openai/dall-e-3";

    const body: Record<string, unknown> = {
        model,
        prompt: params.prompt,
        n: 1, // OpenRouter typically supports 1 at a time
        size: params.size || "1024x1024",
        quality: params.quality || "standard",
        response_format: "b64_json",
    };

    const response = await fetch(
        "https://openrouter.ai/api/v1/images/generations",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://maiachat.ai",
                "X-Title": "MaiaChat",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120000),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `OpenRouter Images API error (${response.status}): ${errorText}`
        );
    }

    const data = await response.json();
    const imageB64 = data.data?.[0]?.b64_json;
    const imageUrl = data.data?.[0]?.url;

    let imageBuffer: Buffer;

    if (imageB64) {
        imageBuffer = Buffer.from(imageB64, "base64");
    } else if (imageUrl) {
        const imgResponse = await fetch(imageUrl, {
            signal: AbortSignal.timeout(30000),
        });
        if (!imgResponse.ok) {
            throw new Error(
                `Failed to download generated image: ${imgResponse.statusText}`
            );
        }
        const arrayBuffer = await imgResponse.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
    } else {
        throw new Error("OpenRouter returned no image data");
    }

    return {
        imageData: imageBuffer,
        model,
        provider: "openrouter",
        costEstimate: 0.04 * (params.n || 1),
    };
}

// ============================================================================
// Provider Selection
// ============================================================================

type ImageProvider = "openai" | "gemini" | "openrouter";

function selectProvider(
    preference: string | undefined,
    apiKeys: Record<string, string>
): ImageProvider {
    if (preference && preference !== "auto") {
        const pref = preference as ImageProvider;
        const keyMap: Record<ImageProvider, string> = {
            openai: "openai",
            gemini: "google",
            openrouter: "openrouter",
        };
        if (apiKeys[keyMap[pref]]) {
            return pref;
        }
        console.warn(
            `[ImageGeneration] Preferred provider "${pref}" has no API key, falling back to auto`
        );
    }

    // Auto-select: openai > gemini > openrouter
    if (apiKeys.openai) return "openai";
    if (apiKeys.google) return "gemini";
    if (apiKeys.openrouter) return "openrouter";

    throw new Error(
        "No API key available for image generation. Please add an OpenAI, Google, or OpenRouter API key in Settings."
    );
}

// ============================================================================
// Execute
// ============================================================================

async function execute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        const params = schema.parse(rawParams) as ImageGenerationParams;
        const apiKeys = context?.apiKeys || {};
        const userId = context?.userId || "anonymous";

        const mediaPreferences: MediaGenerationPreferences =
            userId !== "anonymous"
                ? await getMediaGenerationPreferences(userId).catch(
                    () => ({} as MediaGenerationPreferences)
                )
                : {};

        if (rawParams.provider === undefined && mediaPreferences.provider) {
            params.provider = mediaPreferences.provider;
        }
        if (rawParams.quality === undefined && mediaPreferences.quality) {
            params.quality = mediaPreferences.quality;
        }
        if (rawParams.size === undefined && mediaPreferences.size) {
            params.size = mediaPreferences.size;
        }
        if (rawParams.style === undefined && mediaPreferences.style) {
            params.style = mediaPreferences.style;
        }
        if (rawParams.saveHistory === undefined && typeof mediaPreferences.saveHistory === "boolean") {
            params.saveHistory = mediaPreferences.saveHistory;
        }

        console.log(
            `[ImageGeneration] Action: ${params.action}, provider pref: ${params.provider}, prompt: "${params.prompt.substring(0, 80)}..."`
        );

        // Validate action-specific requirements
        if (
            (params.action === "edit" || params.action === "variation") &&
            !params.imageUrl
        ) {
            return {
                success: false,
                error: `The "${params.action}" action requires an imageUrl parameter with the source image.`,
                metadata: { executionTime: Date.now() - startTime },
            };
        }

        // Select provider
        const provider = selectProvider(params.provider, apiKeys);
        console.log(`[ImageGeneration] Selected provider: ${provider}`);

        if ((params.action === "edit" || params.action === "variation") && provider !== "openai") {
            return {
                success: false,
                error: `Action "${params.action}" is currently supported only via OpenAI. Set provider to "openai" or configure OpenAI API key for auto mode.`,
                metadata: { executionTime: Date.now() - startTime },
            };
        }

        // Generate image based on provider
        let result: GeneratedImage;

        switch (provider) {
            case "openai":
                result = await generateWithOpenAI(params, apiKeys.openai);
                break;
            case "gemini":
                result = await generateWithGemini(params, apiKeys.google);
                break;
            case "openrouter":
                result = await generateWithOpenRouter(params, apiKeys.openrouter);
                break;
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }

        // Upload to S3
        const timestamp = Date.now();
        const uuid = crypto.randomUUID();
        const saveHistory = params.saveHistory !== false;
        const storagePrefix = saveHistory ? "images" : "images-temp";
        const s3Key = `${storagePrefix}/${userId}/${timestamp}-${uuid}.png`;

        console.log(`[ImageGeneration] Uploading to S3: ${s3Key}`);
        await uploadFile(s3Key, result.imageData, {
            contentType: "image/png",
            metadata: {
                prompt: params.prompt.substring(0, 256),
                provider: result.provider,
                model: result.model,
                size: params.size || "1024x1024",
                action: params.action,
            },
        });

        // Get presigned download URL (1 hour expiry)
        const url = await getDownloadUrl(s3Key, 3600);

        console.log(
            `[ImageGeneration] Complete. Provider: ${result.provider}, Model: ${result.model}, Time: ${Date.now() - startTime}ms`
        );

        return {
            success: true,
            data: {
                url,
                provider: result.provider,
                model: result.model,
                action: params.action,
                size: params.size || "1024x1024",
                cost_estimate: result.costEstimate,
                savedToHistory: saveHistory,
            },
            metadata: {
                executionTime: Date.now() - startTime,
                source: result.provider,
            },
        };
    } catch (error) {
        console.error(`[ImageGeneration] Error:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Image generation failed",
            metadata: {
                executionTime: Date.now() - startTime,
            },
        };
    }
}

// ============================================================================
// Tool Export
// ============================================================================

export const imageGenerationTool: Tool = {
    id: "image_generation",
    name: "Image Generation",
    description:
        "Generate, edit, or create variations of images using AI. Supports multiple providers: OpenAI (gpt-image-1), Gemini, and OpenRouter models.",
    category: "utility",
    icon: "Image",
    schema,
    execute,
};
