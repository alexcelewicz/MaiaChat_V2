/**
 * Google Drive Integration
 *
 * Provides Google Drive capabilities via Google Drive API v3.
 * Uses the shared Google OAuth credentials from oauth.ts.
 */

import { getValidCredentials } from "./oauth";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

// ============================================================================
// Types
// ============================================================================

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    createdTime?: string;
    modifiedTime?: string;
    parents?: string[];
    webViewLink?: string;
    webContentLink?: string;
    iconLink?: string;
    owners?: Array<{ displayName: string; emailAddress: string }>;
    shared?: boolean;
    trashed?: boolean;
}

export interface DriveFileList {
    files: DriveFile[];
    nextPageToken?: string;
    incompleteSearch?: boolean;
}

export interface DrivePermission {
    id: string;
    type: string;
    role: string;
    emailAddress?: string;
}

// ============================================================================
// Authenticated Fetch Helper
// ============================================================================

/**
 * Make an authenticated request to the Google Drive API
 */
async function driveFetch(
    userId: string,
    url: string,
    options?: RequestInit
): Promise<Response> {
    const credentials = await getValidCredentials(userId);
    if (!credentials) {
        throw new Error(
            "Google Drive not connected. Please connect your Google account in Settings > Integrations."
        );
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            ...options?.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Drive API error (${response.status}): ${errorText}`
        );
    }

    return response;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * List files in Google Drive
 */
export async function listFiles(
    userId: string,
    query?: string,
    folderId?: string,
    maxResults?: number
): Promise<DriveFileList> {
    const params = new URLSearchParams({
        fields: "nextPageToken,incompleteSearch,files(id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,webContentLink,owners,shared,trashed)",
        pageSize: String(maxResults || 25),
        orderBy: "modifiedTime desc",
    });

    // Build query
    const queryParts: string[] = ["trashed = false"];
    if (query) queryParts.push(query);
    if (folderId) queryParts.push(`'${folderId}' in parents`);

    params.set("q", queryParts.join(" and "));

    const response = await driveFetch(
        userId,
        `${DRIVE_API_BASE}/files?${params}`,
        { headers: { "Content-Type": "application/json" } }
    );

    return await response.json();
}

/**
 * Get file metadata
 */
export async function getFile(
    userId: string,
    fileId: string
): Promise<DriveFile> {
    const params = new URLSearchParams({
        fields: "id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,webContentLink,iconLink,owners,shared,trashed",
    });

    const response = await driveFetch(
        userId,
        `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params}`,
        { headers: { "Content-Type": "application/json" } }
    );

    return await response.json();
}

/**
 * Upload a file to Google Drive
 */
export async function uploadFile(
    userId: string,
    name: string,
    content: Buffer,
    mimeType: string,
    folderId?: string
): Promise<DriveFile> {
    const credentials = await getValidCredentials(userId);
    if (!credentials) {
        throw new Error(
            "Google Drive not connected. Please connect your Google account in Settings > Integrations."
        );
    }

    // Metadata
    const metadata: Record<string, unknown> = {
        name,
        mimeType,
    };
    if (folderId) {
        metadata.parents = [folderId];
    }

    // Build multipart request
    const boundary = "----DriveUploadBoundary" + Date.now();
    const metadataStr = JSON.stringify(metadata);

    const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
        `${metadataStr}\r\n`,
        `--${boundary}\r\n`,
        `Content-Type: ${mimeType}\r\n\r\n`,
    ];

    // Combine parts with content buffer
    const prefix = Buffer.from(bodyParts.join(""), "utf-8");
    const suffix = Buffer.from(`\r\n--${boundary}--`, "utf-8");
    const body = Buffer.concat([prefix, content, suffix]);

    const response = await fetch(
        `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${credentials.accessToken}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
                "Content-Length": String(body.length),
            },
            body,
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive upload error (${response.status}): ${errorText}`);
    }

    return await response.json();
}

/**
 * Create a folder in Google Drive
 */
export async function createFolder(
    userId: string,
    name: string,
    parentId?: string
): Promise<DriveFile> {
    const metadata: Record<string, unknown> = {
        name,
        mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) {
        metadata.parents = [parentId];
    }

    const response = await driveFetch(
        userId,
        `${DRIVE_API_BASE}/files?fields=id,name,mimeType,createdTime,modifiedTime,webViewLink`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(metadata),
        }
    );

    return await response.json();
}

/**
 * Download file content
 */
export async function downloadFile(
    userId: string,
    fileId: string
): Promise<{ content: string; mimeType: string }> {
    // First get metadata to check type
    const file = await getFile(userId, fileId);

    // Google Docs/Sheets/Slides need export
    const isGoogleDoc = file.mimeType.startsWith("application/vnd.google-apps.");
    let url: string;
    let exportMimeType: string;

    if (isGoogleDoc) {
        // Export Google Docs as plain text, Sheets as CSV, Slides as text
        switch (file.mimeType) {
            case "application/vnd.google-apps.document":
                exportMimeType = "text/plain";
                break;
            case "application/vnd.google-apps.spreadsheet":
                exportMimeType = "text/csv";
                break;
            case "application/vnd.google-apps.presentation":
                exportMimeType = "text/plain";
                break;
            default:
                exportMimeType = "text/plain";
        }
        url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMimeType)}`;
    } else {
        url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
        exportMimeType = file.mimeType;
    }

    const response = await driveFetch(userId, url);
    const content = await response.text();

    return { content, mimeType: exportMimeType };
}

/**
 * Search files in Google Drive
 */
export async function searchFiles(
    userId: string,
    query: string
): Promise<DriveFileList> {
    // Build a fullText search query
    const searchQuery = `fullText contains '${query.replace(/'/g, "\\'")}'  and trashed = false`;

    const params = new URLSearchParams({
        q: searchQuery,
        fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,owners,shared)",
        pageSize: "25",
        orderBy: "modifiedTime desc",
    });

    const response = await driveFetch(
        userId,
        `${DRIVE_API_BASE}/files?${params}`,
        { headers: { "Content-Type": "application/json" } }
    );

    return await response.json();
}

/**
 * Share a file with a specific user
 */
export async function shareFile(
    userId: string,
    fileId: string,
    email: string,
    role: string = "reader"
): Promise<DrivePermission> {
    const response = await driveFetch(
        userId,
        `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/permissions`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: "user",
                role,
                emailAddress: email,
            }),
        }
    );

    return await response.json();
}
