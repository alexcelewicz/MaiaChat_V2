import { NextResponse } from "next/server";
import archiver from "archiver";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";

const downloadSchema = z.object({
    files: z.array(z.object({
        path: z.string().min(1),
        content: z.string(),
    })).min(1),
    projectName: z.string().min(1).max(100).default("project"),
});

// POST /api/code/download - Generate and download ZIP file
export async function POST(request: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", {
            windowSeconds: 60,
            limit: 20,
        });

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, { windowSeconds: 60, limit: 20 });
        }

        const body = await request.json();
        const validation = downloadSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid request", details: validation.error.issues },
                { status: 400 }
            );
        }

        const { files, projectName } = validation.data;

        // Create ZIP archive
        const chunks: Buffer[] = [];
        
        const archive = archiver("zip", {
            zlib: { level: 9 }, // Maximum compression
        });

        // Collect chunks
        archive.on("data", (chunk) => {
            chunks.push(chunk);
        });

        // Add files to archive
        for (const file of files) {
            // Sanitize path
            const safePath = file.path
                .replace(/\\/g, "/")
                .replace(/^\/+/, "")
                .replace(/\.{2,}/g, "");
            
            archive.append(file.content, { name: `${projectName}/${safePath}` });
        }

        // Finalize
        await archive.finalize();

        // Combine chunks
        const buffer = Buffer.concat(chunks);

        // Return as downloadable file
        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${projectName}.zip"`,
                "Content-Length": String(buffer.length),
            },
        });
    } catch (error) {
        console.error("Download error:", error);
        return NextResponse.json(
            { error: "Failed to create download", code: "DOWNLOAD_FAILED" },
            { status: 500 }
        );
    }
}
