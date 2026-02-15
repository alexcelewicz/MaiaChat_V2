import { getSessionUserId } from "@/lib/auth/session";
import { uploadFile, getDownloadUrl } from "@/lib/storage/s3";
import { randomUUID } from "crypto";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * POST /api/chat/images — Upload a user image to S3
 * Body: { dataUrl: string, mediaType: string, filename?: string }
 * Returns: { url: string, s3Key: string }
 */
export async function POST(req: Request) {
    const userId = await getSessionUserId();
    if (!userId) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { dataUrl, mediaType, filename } = body as {
        dataUrl: string;
        mediaType: string;
        filename?: string;
    };

    if (!dataUrl || !mediaType) {
        return Response.json({ error: "Missing dataUrl or mediaType" }, { status: 400 });
    }

    if (!ACCEPTED_TYPES.includes(mediaType)) {
        return Response.json({ error: "Unsupported image type" }, { status: 400 });
    }

    // Extract base64 data from data URL
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!match?.[1]) {
        return Response.json({ error: "Invalid data URL format" }, { status: 400 });
    }

    // Reject oversized base64 before decoding to prevent large memory allocations.
    // base64 inflates ~33%, so MAX_IMAGE_SIZE * 1.4 is a safe upper bound.
    const base64Data = match[1];
    if (base64Data.length > MAX_IMAGE_SIZE * 1.4) {
        return Response.json({ error: "Image exceeds 10MB limit" }, { status: 400 });
    }

    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > MAX_IMAGE_SIZE) {
        return Response.json({ error: "Image exceeds 10MB limit" }, { status: 400 });
    }

    const imageId = randomUUID();
    const ext = mediaType.split("/")[1] || "png";
    const s3Key = `users/${userId}/images/${imageId}.${ext}`;

    await uploadFile(s3Key, buffer, { contentType: mediaType });
    const url = await getDownloadUrl(s3Key, 24 * 60 * 60); // 24h presigned URL

    return Response.json({ url, s3Key });
}

/**
 * GET /api/chat/images?key=users/xxx/images/yyy.png — Redirect to presigned S3 URL
 * Can be used directly as an <img src="..."> URL
 */
export async function GET(req: Request) {
    const userId = await getSessionUserId();
    if (!userId) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (!key) {
        return Response.json({ error: "Missing key parameter" }, { status: 400 });
    }

    // Security: only allow access to user's own images or generated images
    if (!key.startsWith(`users/${userId}/`)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = await getDownloadUrl(key, 24 * 60 * 60);
    return Response.redirect(url, 302);
}
