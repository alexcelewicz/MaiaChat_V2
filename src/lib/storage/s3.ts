import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    CreateBucketCommand,
    HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

// ============================================================================
// S3/MinIO Client Configuration
// ============================================================================

// Build endpoint from legacy MINIO_* variables if S3_ENDPOINT not set
function getS3Endpoint(): string | undefined {
    if (env.S3_ENDPOINT) {
        return env.S3_ENDPOINT;
    }
    // Fallback to legacy MINIO_* variables
    if (env.MINIO_ENDPOINT) {
        const protocol = env.MINIO_USE_SSL ? "https" : "http";
        const port = env.MINIO_PORT || 9000;
        return `${protocol}://${env.MINIO_ENDPOINT}:${port}`;
    }
    return undefined;
}

const s3Config = {
    region: env.S3_REGION || "us-east-1",
    endpoint: getS3Endpoint(),
    credentials: {
        accessKeyId: env.S3_ACCESS_KEY || env.MINIO_ACCESS_KEY || "",
        secretAccessKey: env.S3_SECRET_KEY || env.MINIO_SECRET_KEY || "",
    },
    forcePathStyle: true, // Required for MinIO
};

export const s3Client = new S3Client(s3Config);

export const S3_BUCKET = env.S3_BUCKET || env.MINIO_BUCKET || "maiachat-documents";

// Track if bucket has been ensured
let bucketEnsured = false;

/**
 * Ensure the S3 bucket exists, create it if it doesn't
 */
export async function ensureBucketExists(): Promise<void> {
    if (bucketEnsured) return;

    try {
        // Check if bucket exists
        await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
        bucketEnsured = true;
    } catch (error: unknown) {
        // Bucket doesn't exist, try to create it
        const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (statusCode === 404 || statusCode === 403) {
            try {
                await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
                console.log(`[S3] Created bucket: ${S3_BUCKET}`);
                bucketEnsured = true;
            } catch (createError: unknown) {
                // Bucket might already exist (race condition) or other error
                const createStatusCode = (createError as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
                if (createStatusCode === 409) {
                    // BucketAlreadyOwnedByYou - that's fine
                    bucketEnsured = true;
                } else {
                    console.error(`[S3] Failed to create bucket: ${S3_BUCKET}`, createError);
                    throw createError;
                }
            }
        } else {
            throw error;
        }
    }
}

// ============================================================================
// Upload Functions
// ============================================================================

export interface UploadOptions {
    contentType?: string;
    metadata?: Record<string, string>;
}

/**
 * Upload a file to S3
 */
export async function uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    options: UploadOptions = {}
): Promise<{ key: string; etag?: string }> {
    // Ensure bucket exists before uploading
    await ensureBucketExists();

    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: options.contentType || "application/octet-stream",
        Metadata: options.metadata,
    });

    const result = await s3Client.send(command);

    return {
        key,
        etag: result.ETag,
    };
}

/**
 * Upload a file from a web File/Blob
 */
export async function uploadBlob(
    key: string,
    file: Blob,
    options: UploadOptions = {}
): Promise<{ key: string; etag?: string }> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return uploadFile(key, buffer, {
        contentType: options.contentType || file.type,
        metadata: options.metadata,
    });
}

// ============================================================================
// Download Functions
// ============================================================================

/**
 * Download a file from S3
 */
export async function downloadFile(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
        throw new Error("No body in response");
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
}

/**
 * Get a presigned URL for downloading
 */
export async function getDownloadUrl(
    key: string,
    expiresIn: number = 3600 // 1 hour default
): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get a presigned URL for uploading
 */
export async function getUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600
): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: contentType,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
}

// ============================================================================
// Delete Functions
// ============================================================================

/**
 * Delete a file from S3
 */
export async function deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
    });

    await s3Client.send(command);
}

/**
 * Delete multiple files from S3
 */
export async function deleteFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map(key => deleteFile(key)));
}

// ============================================================================
// Metadata Functions
// ============================================================================

/**
 * Check if a file exists
 */
export async function fileExists(key: string): Promise<boolean> {
    try {
        const command = new HeadObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
        });
        await s3Client.send(command);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(key: string): Promise<{
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    metadata?: Record<string, string>;
} | null> {
    try {
        const command = new HeadObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
        });
        const response = await s3Client.send(command);
        
        return {
            contentType: response.ContentType,
            contentLength: response.ContentLength,
            lastModified: response.LastModified,
            metadata: response.Metadata,
        };
    } catch {
        return null;
    }
}

// ============================================================================
// List Functions
// ============================================================================

/**
 * List files in a prefix (folder)
 */
export async function listFiles(
    prefix: string,
    maxKeys: number = 1000
): Promise<Array<{
    key: string;
    size?: number;
    lastModified?: Date;
}>> {
    const command = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        MaxKeys: maxKeys,
    });

    const response = await s3Client.send(command);
    
    return (response.Contents || []).map(item => ({
        key: item.Key || "",
        size: item.Size,
        lastModified: item.LastModified,
    }));
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a unique storage key for a document
 */
export function generateDocumentKey(
    userId: string,
    filename: string,
    documentId?: string
): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const id = documentId || `doc_${timestamp}`;
    
    return `users/${userId}/documents/${id}/${sanitizedFilename}`;
}

/**
 * Generate a key for document chunks
 */
export function generateChunkKey(
    userId: string,
    documentId: string,
    chunkIndex: number
): string {
    return `users/${userId}/chunks/${documentId}/chunk_${chunkIndex.toString().padStart(5, "0")}.txt`;
}
