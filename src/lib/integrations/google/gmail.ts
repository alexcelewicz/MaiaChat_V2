/**
 * Gmail API Wrapper
 *
 * Provides high-level functions for Gmail operations:
 * - Search emails
 * - Read email content
 * - Send emails
 * - Create drafts
 * - Reply to threads
 */

import { getValidCredentials } from "./oauth";

// ============================================================================
// Types
// ============================================================================

export interface GmailMessage {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    subject: string;
    from: string;
    to: string;
    date: Date;
    body: {
        text?: string;
        html?: string;
    };
    attachments: GmailAttachment[];
}

export interface GmailAttachment {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
}

export interface GmailThread {
    id: string;
    historyId: string;
    messages: GmailMessage[];
}

export interface GmailSearchResult {
    messages: GmailMessagePreview[];
    nextPageToken?: string;
    resultSizeEstimate: number;
}

export interface GmailMessagePreview {
    id: string;
    threadId: string;
    snippet: string;
    subject: string;
    from: string;
    date: Date;
    labelIds: string[];
    isUnread: boolean;
}

export interface SendEmailOptions {
    to: string | string[];
    subject: string;
    body: string;
    html?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    threadId?: string;
    inReplyTo?: string;
}

export interface DraftOptions extends SendEmailOptions {
    // Same as SendEmailOptions
}

// ============================================================================
// Gmail API Client
// ============================================================================

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

class GmailClient {
    private accessToken: string;

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const response = await fetch(`${GMAIL_API_BASE}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gmail API error (${response.status}): ${error}`);
        }

        return response.json();
    }

    /**
     * Search for emails matching a query
     */
    async search(
        query: string,
        options: { maxResults?: number; pageToken?: string } = {}
    ): Promise<GmailSearchResult> {
        const params = new URLSearchParams({
            q: query,
            maxResults: String(options.maxResults || 20),
        });

        if (options.pageToken) {
            params.set("pageToken", options.pageToken);
        }

        const result = await this.request<{
            messages?: { id: string; threadId: string }[];
            nextPageToken?: string;
            resultSizeEstimate?: number;
        }>(`/messages?${params}`);

        if (!result.messages || result.messages.length === 0) {
            return {
                messages: [],
                resultSizeEstimate: 0,
            };
        }

        // Fetch message details in parallel
        const messageDetails = await Promise.all(
            result.messages.map((m) => this.getMessagePreview(m.id))
        );

        return {
            messages: messageDetails,
            nextPageToken: result.nextPageToken,
            resultSizeEstimate: result.resultSizeEstimate || messageDetails.length,
        };
    }

    /**
     * Get message preview (headers only)
     */
    async getMessagePreview(messageId: string): Promise<GmailMessagePreview> {
        const message = await this.request<GmailApiMessage>(
            `/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
        );

        return this.parseMessagePreview(message);
    }

    /**
     * Get full message content
     */
    async getMessage(messageId: string): Promise<GmailMessage> {
        const message = await this.request<GmailApiMessage>(
            `/messages/${messageId}?format=full`
        );

        return this.parseFullMessage(message);
    }

    /**
     * Get a thread with all messages
     */
    async getThread(threadId: string): Promise<GmailThread> {
        const thread = await this.request<{
            id: string;
            historyId: string;
            messages: GmailApiMessage[];
        }>(`/threads/${threadId}?format=full`);

        return {
            id: thread.id,
            historyId: thread.historyId,
            messages: thread.messages.map((m) => this.parseFullMessage(m)),
        };
    }

    /**
     * Send an email
     */
    async send(options: SendEmailOptions): Promise<{ id: string; threadId: string }> {
        const raw = this.buildRawMessage(options);

        const result = await this.request<{ id: string; threadId: string }>(
            "/messages/send",
            {
                method: "POST",
                body: JSON.stringify({
                    raw,
                    threadId: options.threadId,
                }),
            }
        );

        return result;
    }

    /**
     * Create a draft
     */
    async createDraft(options: DraftOptions): Promise<{ id: string; message: { id: string; threadId: string } }> {
        const raw = this.buildRawMessage(options);

        const result = await this.request<{
            id: string;
            message: { id: string; threadId: string };
        }>("/drafts", {
            method: "POST",
            body: JSON.stringify({
                message: {
                    raw,
                    threadId: options.threadId,
                },
            }),
        });

        return result;
    }

    /**
     * Send a draft
     */
    async sendDraft(draftId: string): Promise<{ id: string; threadId: string }> {
        const result = await this.request<{ id: string; threadId: string }>(
            "/drafts/send",
            {
                method: "POST",
                body: JSON.stringify({ id: draftId }),
            }
        );

        return result;
    }

    /**
     * List labels
     */
    async listLabels(): Promise<{ id: string; name: string; type: string }[]> {
        const result = await this.request<{
            labels: { id: string; name: string; type: string }[];
        }>("/labels");

        return result.labels || [];
    }

    /**
     * Modify message labels (mark as read, archive, etc.)
     */
    async modifyLabels(
        messageId: string,
        addLabelIds: string[],
        removeLabelIds: string[]
    ): Promise<void> {
        await this.request(`/messages/${messageId}/modify`, {
            method: "POST",
            body: JSON.stringify({
                addLabelIds,
                removeLabelIds,
            }),
        });
    }

    /**
     * Mark message as read
     */
    async markAsRead(messageId: string): Promise<void> {
        await this.modifyLabels(messageId, [], ["UNREAD"]);
    }

    /**
     * Mark message as unread
     */
    async markAsUnread(messageId: string): Promise<void> {
        await this.modifyLabels(messageId, ["UNREAD"], []);
    }

    /**
     * Archive message (remove from inbox)
     */
    async archive(messageId: string): Promise<void> {
        await this.modifyLabels(messageId, [], ["INBOX"]);
    }

    /**
     * Trash message
     */
    async trash(messageId: string): Promise<void> {
        await this.request(`/messages/${messageId}/trash`, {
            method: "POST",
        });
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private parseMessagePreview(message: GmailApiMessage): GmailMessagePreview {
        const headers = this.parseHeaders(message.payload?.headers || []);

        return {
            id: message.id,
            threadId: message.threadId,
            snippet: message.snippet || "",
            subject: headers.subject || "(no subject)",
            from: headers.from || "",
            date: new Date(parseInt(message.internalDate) || Date.now()),
            labelIds: message.labelIds || [],
            isUnread: message.labelIds?.includes("UNREAD") || false,
        };
    }

    private parseFullMessage(message: GmailApiMessage): GmailMessage {
        const headers = this.parseHeaders(message.payload?.headers || []);
        const body = this.extractBody(message.payload);
        const attachments = this.extractAttachments(message.payload);

        return {
            id: message.id,
            threadId: message.threadId,
            labelIds: message.labelIds || [],
            snippet: message.snippet || "",
            subject: headers.subject || "(no subject)",
            from: headers.from || "",
            to: headers.to || "",
            date: new Date(parseInt(message.internalDate) || Date.now()),
            body,
            attachments,
        };
    }

    private parseHeaders(
        headers: { name: string; value: string }[]
    ): Record<string, string> {
        const result: Record<string, string> = {};
        for (const header of headers) {
            result[header.name.toLowerCase()] = header.value;
        }
        return result;
    }

    private extractBody(payload?: GmailPayload): { text?: string; html?: string } {
        if (!payload) return {};

        const result: { text?: string; html?: string } = {};

        // Check if this part has a body
        if (payload.body?.data) {
            const decoded = Buffer.from(payload.body.data, "base64").toString("utf-8");
            if (payload.mimeType === "text/plain") {
                result.text = decoded;
            } else if (payload.mimeType === "text/html") {
                result.html = decoded;
            }
        }

        // Check multipart
        if (payload.parts) {
            for (const part of payload.parts) {
                const partBody = this.extractBody(part);
                if (partBody.text && !result.text) result.text = partBody.text;
                if (partBody.html && !result.html) result.html = partBody.html;
            }
        }

        return result;
    }

    private extractAttachments(payload?: GmailPayload): GmailAttachment[] {
        if (!payload) return [];

        const attachments: GmailAttachment[] = [];

        // Check if this part is an attachment
        if (payload.filename && payload.body?.attachmentId) {
            attachments.push({
                id: payload.body.attachmentId,
                filename: payload.filename,
                mimeType: payload.mimeType || "application/octet-stream",
                size: payload.body.size || 0,
            });
        }

        // Check multipart
        if (payload.parts) {
            for (const part of payload.parts) {
                attachments.push(...this.extractAttachments(part));
            }
        }

        return attachments;
    }

    private buildRawMessage(options: SendEmailOptions): string {
        const to = Array.isArray(options.to) ? options.to.join(", ") : options.to;
        const cc = options.cc
            ? Array.isArray(options.cc)
                ? options.cc.join(", ")
                : options.cc
            : undefined;
        const bcc = options.bcc
            ? Array.isArray(options.bcc)
                ? options.bcc.join(", ")
                : options.bcc
            : undefined;

        const headers = [
            `To: ${to}`,
            `Subject: ${options.subject}`,
            `MIME-Version: 1.0`,
        ];

        if (cc) headers.push(`Cc: ${cc}`);
        if (bcc) headers.push(`Bcc: ${bcc}`);
        if (options.replyTo) headers.push(`Reply-To: ${options.replyTo}`);
        if (options.inReplyTo) headers.push(`In-Reply-To: ${options.inReplyTo}`);

        let body: string;
        if (options.html) {
            headers.push(`Content-Type: text/html; charset=utf-8`);
            body = options.html;
        } else {
            headers.push(`Content-Type: text/plain; charset=utf-8`);
            body = options.body;
        }

        const message = `${headers.join("\r\n")}\r\n\r\n${body}`;

        // Base64url encode
        return Buffer.from(message)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }
}

// ============================================================================
// Gmail API Response Types
// ============================================================================

interface GmailApiMessage {
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet?: string;
    internalDate: string;
    payload?: GmailPayload;
}

interface GmailPayload {
    mimeType?: string;
    filename?: string;
    headers?: { name: string; value: string }[];
    body?: {
        data?: string;
        size?: number;
        attachmentId?: string;
    };
    parts?: GmailPayload[];
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a Gmail client for a user
 */
export async function getGmailClient(userId: string): Promise<GmailClient | null> {
    const credentials = await getValidCredentials(userId);

    if (!credentials) {
        return null;
    }

    return new GmailClient(credentials.accessToken);
}

/**
 * Search emails for a user
 */
export async function searchEmails(
    userId: string,
    query: string,
    options?: { maxResults?: number; pageToken?: string }
): Promise<GmailSearchResult | null> {
    const client = await getGmailClient(userId);
    if (!client) return null;

    return client.search(query, options);
}

/**
 * Get a specific email
 */
export async function getEmail(
    userId: string,
    messageId: string
): Promise<GmailMessage | null> {
    const client = await getGmailClient(userId);
    if (!client) return null;

    return client.getMessage(messageId);
}

/**
 * Get an email thread
 */
export async function getEmailThread(
    userId: string,
    threadId: string
): Promise<GmailThread | null> {
    const client = await getGmailClient(userId);
    if (!client) return null;

    return client.getThread(threadId);
}

/**
 * Send an email
 */
export async function sendEmail(
    userId: string,
    options: SendEmailOptions
): Promise<{ id: string; threadId: string } | null> {
    const client = await getGmailClient(userId);
    if (!client) return null;

    return client.send(options);
}

/**
 * Create a draft
 */
export async function createDraft(
    userId: string,
    options: DraftOptions
): Promise<{ id: string; messageId: string; threadId: string } | null> {
    const client = await getGmailClient(userId);
    if (!client) return null;

    const result = await client.createDraft(options);
    return {
        id: result.id,
        messageId: result.message.id,
        threadId: result.message.threadId,
    };
}

/**
 * Send a draft
 */
export async function sendDraft(
    userId: string,
    draftId: string
): Promise<{ id: string; threadId: string } | null> {
    const client = await getGmailClient(userId);
    if (!client) return null;

    return client.sendDraft(draftId);
}

/**
 * Mark email as read
 */
export async function markEmailAsRead(
    userId: string,
    messageId: string
): Promise<boolean> {
    const client = await getGmailClient(userId);
    if (!client) return false;

    await client.markAsRead(messageId);
    return true;
}

/**
 * Archive email
 */
export async function archiveEmail(
    userId: string,
    messageId: string
): Promise<boolean> {
    const client = await getGmailClient(userId);
    if (!client) return false;

    await client.archive(messageId);
    return true;
}

/**
 * Trash email
 */
export async function trashEmail(
    userId: string,
    messageId: string
): Promise<boolean> {
    const client = await getGmailClient(userId);
    if (!client) return false;

    await client.trash(messageId);
    return true;
}
