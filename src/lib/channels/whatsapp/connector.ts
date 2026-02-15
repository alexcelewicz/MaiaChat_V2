/**
 * WhatsApp Channel Connector
 *
 * Connects to WhatsApp using the @whiskeysockets/baileys library (WhatsApp Web API).
 * Supports QR code pairing, multi-device auth, and automatic reconnection.
 */

import {
    ChannelConnector,
    ChannelMessage,
    ChannelConfig,
    SendMessageOptions,
    ChannelAttachment,
} from '../base';

import path from 'path';
import qrcodeTerminal from 'qrcode-terminal';
import {
    setPairingQR,
    setPairingConnected,
    setPairingError,
    clearPairingState,
} from './pairing-state';

/** Default auth state directory for WhatsApp session persistence */
const DEFAULT_AUTH_DIR = '.whatsapp-auth';

/** WhatsApp max message length is ~65536, but we split at 4096 for readability */
const WHATSAPP_MAX_LENGTH = 4096;

/**
 * Split a long message into chunks that fit within WhatsApp's practical limit.
 * Splits at natural breakpoints: paragraphs > newlines > sentences > words.
 */
function splitMessage(text: string, maxLength: number = WHATSAPP_MAX_LENGTH): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        let splitAt = -1;
        const searchRange = remaining.substring(0, maxLength);

        // Try splitting at double newline (paragraph break)
        splitAt = searchRange.lastIndexOf('\n\n');
        if (splitAt > maxLength * 0.3) {
            chunks.push(remaining.substring(0, splitAt).trimEnd());
            remaining = remaining.substring(splitAt + 2).trimStart();
            continue;
        }

        // Try splitting at single newline
        splitAt = searchRange.lastIndexOf('\n');
        if (splitAt > maxLength * 0.3) {
            chunks.push(remaining.substring(0, splitAt).trimEnd());
            remaining = remaining.substring(splitAt + 1).trimStart();
            continue;
        }

        // Try splitting at sentence end (. ! ?)
        splitAt = Math.max(
            searchRange.lastIndexOf('. '),
            searchRange.lastIndexOf('! '),
            searchRange.lastIndexOf('? '),
        );
        if (splitAt > maxLength * 0.3) {
            chunks.push(remaining.substring(0, splitAt + 1).trimEnd());
            remaining = remaining.substring(splitAt + 2).trimStart();
            continue;
        }

        // Try splitting at space (word boundary)
        splitAt = searchRange.lastIndexOf(' ');
        if (splitAt > maxLength * 0.3) {
            chunks.push(remaining.substring(0, splitAt).trimEnd());
            remaining = remaining.substring(splitAt + 1).trimStart();
            continue;
        }

        // Hard split as last resort
        chunks.push(remaining.substring(0, maxLength));
        remaining = remaining.substring(maxLength);
    }

    return chunks.filter(c => c.length > 0);
}

/**
 * Extract the plain JID (phone number) from a WhatsApp JID.
 * e.g. "5511999999999@s.whatsapp.net" -> "5511999999999"
 */
function jidToNumber(jid: string): string {
    return jid.replace(/@.*$/, '');
}

/**
 * Normalize a phone number or JID to a full WhatsApp JID.
 * Ensures it ends with @s.whatsapp.net for individual chats
 * or @g.us for group chats.
 */
function normalizeJid(channelId: string): string {
    if (channelId.includes('@')) return channelId;
    // Assume individual chat if no suffix
    return `${channelId}@s.whatsapp.net`;
}

export class WhatsAppConnector extends ChannelConnector {
    readonly type = 'whatsapp';
    readonly name = 'WhatsApp';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private socket: any = null;
    private config: ChannelConfig | null = null;
    private connected: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private accountId: string | null = null;

    async connect(config: ChannelConfig): Promise<void> {
        this.config = config;
        this.accountId = (config.settings?.accountId as string) ?? null;
        this.maxReconnectAttempts = Number(config.settings?.maxReconnectAttempts ?? 5);

        // Graceful dynamic import of Baileys (use variable to prevent bundler resolution)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let makeWASocket: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let useMultiFileAuthState: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let DisconnectReason: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fetchLatestBaileysVersion: any;

        try {
            const pkg = '@whiskeysockets/baileys';
            const baileys = await import(/* webpackIgnore: true */ pkg);
            makeWASocket = baileys.default;
            useMultiFileAuthState = baileys.useMultiFileAuthState;
            DisconnectReason = baileys.DisconnectReason;
            fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
        } catch {
            throw new Error(
                'WhatsApp integration requires @whiskeysockets/baileys. Install it with: npm install @whiskeysockets/baileys'
            );
        }

        // Resolve auth state directory with path traversal protection
        const baseDir = process.cwd();
        const authDir = config.credentials.authDir
            ? path.resolve(baseDir, config.credentials.authDir)
            : path.resolve(baseDir, DEFAULT_AUTH_DIR);

        // Prevent path traversal - authDir must be within the project directory
        if (!authDir.startsWith(baseDir)) {
            throw new Error('WhatsApp authDir must be within the project directory. Path traversal detected.');
        }

        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();

        // Suppress Baileys' verbose pino JSON logging
        const logger = {
            level: 'silent',
            info: () => {},
            debug: () => {},
            warn: (...args: unknown[]) => console.warn('[Baileys]', ...args),
            error: (...args: unknown[]) => console.error('[Baileys]', ...args),
            fatal: (...args: unknown[]) => console.error('[Baileys FATAL]', ...args),
            trace: () => {},
            child: () => logger,
        };

        this.socket = makeWASocket({
            version,
            auth: state,
            logger,
            browser: [
                (config.settings?.browserName as string) ?? 'Maiachat',
                'Chrome',
                '22.0',
            ],
            generateHighQualityLinkPreview: true,
        });

        // Handle connection updates (QR code, connection state, reconnection)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.socket.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                if (this.accountId) {
                    // Expose QR to frontend via pairing state
                    setPairingQR(this.accountId, qr);
                    console.log(`[WhatsApp] QR code updated for account ${this.accountId}`);
                } else {
                    // Fallback: terminal QR for programmatic/CLI usage
                    console.log('\n╔══════════════════════════════════════════════╗');
                    console.log('║  WHATSAPP QR CODE — Scan with your phone!   ║');
                    console.log('╚══════════════════════════════════════════════╝');
                    qrcodeTerminal.generate(qr, { small: true });
                    console.log('');
                }
            }

            if (connection === 'close') {
                this.connected = false;
                const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;

                // Don't reconnect on logout (401) or conflict/replaced (440)
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                const isConflict = statusCode === 440 || statusCode === DisconnectReason.connectionReplaced;
                const shouldReconnect = !isLoggedOut && !isConflict;

                console.log(
                    `[WhatsApp] Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`
                );

                if (isConflict) {
                    console.log('[WhatsApp] Session replaced by another connection. Stopping.');
                    if (this.accountId) setPairingError(this.accountId, 'Session replaced by another connection');
                    this.onError?.(
                        new Error('WhatsApp session was replaced by another connection. Disconnect the other session and try again.')
                    );
                } else if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                    console.log(
                        `[WhatsApp] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
                    );
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    // Remove old socket listeners before reconnecting to prevent duplicates
                    if (this.socket) {
                        this.socket.ev.removeAllListeners('connection.update');
                        this.socket.ev.removeAllListeners('creds.update');
                        this.socket.ev.removeAllListeners('messages.upsert');
                        this.socket.ev.removeAllListeners('messages.update');
                    }
                    await this.connect(config);
                } else if (isLoggedOut) {
                    console.log('[WhatsApp] Logged out. Not reconnecting.');
                    if (this.accountId) setPairingError(this.accountId, 'Session logged out');
                    this.onError?.(
                        new Error('WhatsApp session logged out. Please re-authenticate by scanning the QR code.')
                    );
                } else {
                    console.error('[WhatsApp] Max reconnection attempts reached.');
                    if (this.accountId) setPairingError(this.accountId, 'Max reconnection attempts reached');
                    this.onError?.(
                        new Error(`WhatsApp connection failed after ${this.maxReconnectAttempts} reconnection attempts.`)
                    );
                }
            } else if (connection === 'open') {
                this.connected = true;
                this.reconnectAttempts = 0;
                if (this.accountId) setPairingConnected(this.accountId);
                console.log('[WhatsApp] Connection established');
            }
        });

        // Persist auth credentials on update
        this.socket.ev.on('creds.update', saveCreds);

        // Handle incoming messages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.socket.ev.on('messages.upsert', async ({ messages, type }: any) => {
            // Only process new messages (not history sync)
            if (type !== 'notify') return;

            for (const msg of messages) {
                // Skip messages sent by ourselves
                if (msg.key.fromMe) continue;
                // Skip status broadcast messages
                if (msg.key.remoteJid === 'status@broadcast') continue;
                if (!msg.message) continue;

                const channelMessage = this.convertMessage(msg);
                if (channelMessage) {
                    await this.onMessage?.(channelMessage);
                }
            }
        });

        // Handle message edits (protocol messages with edit info)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.socket.ev.on('messages.update', async (updates: any[]) => {
            for (const update of updates) {
                if (update.update?.message) {
                    const editedContent = this.extractTextContent(update.update.message);
                    if (editedContent && update.key.remoteJid) {
                        const channelMessage: ChannelMessage = {
                            id: update.key.id ?? `edited-${Date.now()}`,
                            channelType: 'whatsapp',
                            channelId: update.key.remoteJid,
                            content: editedContent,
                            contentType: 'text',
                            sender: {
                                id: update.key.participant ?? jidToNumber(update.key.remoteJid),
                                name: update.key.participant
                                    ? jidToNumber(update.key.participant)
                                    : jidToNumber(update.key.remoteJid),
                            },
                            timestamp: new Date(),
                        };
                        await this.onMessageEdit?.(channelMessage);
                    }
                }
            }
        });
    }

    async disconnect(): Promise<void> {
        if (this.socket) {
            if (this.accountId) clearPairingState(this.accountId);
            this.socket.end(undefined);
            this.socket = null;
            this.connected = false;
            this.reconnectAttempts = 0;
            console.log('[WhatsApp] Disconnected');
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    async sendMessage(
        channelId: string,
        content: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.socket || !this.connected) {
            throw new Error('WhatsApp not connected — scan the QR code first');
        }

        const jid = normalizeJid(channelId);

        // Split long messages into WhatsApp-safe chunks
        const chunks = splitMessage(content);
        let lastMessageId = '';

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const isFirst = i === 0;

            // Add part indicator for multi-part messages
            const partLabel = chunks.length > 1 ? `[${i + 1}/${chunks.length}]\n` : '';
            const messageContent = chunks.length > 1 && !isFirst ? partLabel + chunk : chunk;

            const result = await this.socket.sendMessage(jid, {
                text: messageContent,
            }, {
                quoted: isFirst && options?.replyTo ? {
                    key: {
                        remoteJid: jid,
                        id: options.replyTo,
                    },
                    message: {},
                } as any : undefined,
            });

            lastMessageId = result?.key?.id ?? `sent-${Date.now()}-${i}`;

            // Small delay between chunks to maintain order
            if (i < chunks.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }

        if (chunks.length > 1) {
            console.log(
                `[WhatsApp] Split message into ${chunks.length} chunks (${content.length} chars total)`
            );
        }

        return lastMessageId;
    }

    async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
        if (!this.socket) throw new Error('Not connected');

        const jid = normalizeJid(channelId);

        await this.socket.sendMessage(jid, {
            text: content,
            edit: {
                remoteJid: jid,
                id: messageId,
                fromMe: true,
            } as any,
        });
    }

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        if (!this.socket) throw new Error('Not connected');

        const jid = normalizeJid(channelId);

        await this.socket.sendMessage(jid, {
            delete: {
                remoteJid: jid,
                id: messageId,
                fromMe: true,
            },
        });
    }

    // =========================================================================
    // WhatsApp-specific methods
    // =========================================================================

    /**
     * Send an image message
     */
    async sendImage(
        channelId: string,
        imageUrl: string,
        caption?: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.socket) throw new Error('Not connected');

        const jid = normalizeJid(channelId);

        const result = await this.socket.sendMessage(jid, {
            image: { url: imageUrl },
            caption,
        }, {
            quoted: options?.replyTo ? {
                key: { remoteJid: jid, id: options.replyTo },
                message: {},
            } as any : undefined,
        });

        return result?.key?.id ?? `img-${Date.now()}`;
    }

    /**
     * Send a document/file message
     */
    async sendDocument(
        channelId: string,
        documentUrl: string,
        filename: string,
        mimetype?: string,
        caption?: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.socket) throw new Error('Not connected');

        const jid = normalizeJid(channelId);

        const result = await this.socket.sendMessage(jid, {
            document: { url: documentUrl },
            fileName: filename,
            mimetype: mimetype ?? 'application/octet-stream',
            caption,
        }, {
            quoted: options?.replyTo ? {
                key: { remoteJid: jid, id: options.replyTo },
                message: {},
            } as any : undefined,
        });

        return result?.key?.id ?? `doc-${Date.now()}`;
    }

    /**
     * Send an audio message
     */
    async sendAudio(
        channelId: string,
        audioUrl: string,
        ptt: boolean = false,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.socket) throw new Error('Not connected');

        const jid = normalizeJid(channelId);

        const result = await this.socket.sendMessage(jid, {
            audio: { url: audioUrl },
            ptt, // push-to-talk (voice note) mode
            mimetype: 'audio/ogg; codecs=opus',
        }, {
            quoted: options?.replyTo ? {
                key: { remoteJid: jid, id: options.replyTo },
                message: {},
            } as any : undefined,
        });

        return result?.key?.id ?? `audio-${Date.now()}`;
    }

    /**
     * Send a typing/recording presence indicator
     */
    async sendPresenceUpdate(
        channelId: string,
        presence: 'composing' | 'recording' | 'paused'
    ): Promise<void> {
        if (!this.socket) throw new Error('Not connected');

        const jid = normalizeJid(channelId);
        await this.socket.presenceSubscribe(jid);
        await this.socket.sendPresenceUpdate(presence, jid);
    }

    /**
     * Mark messages as read
     */
    async markAsRead(channelId: string, messageIds: string[]): Promise<void> {
        if (!this.socket) throw new Error('Not connected');

        const jid = normalizeJid(channelId);
        await this.socket.readMessages(
            messageIds.map((id) => ({
                remoteJid: jid,
                id,
            }))
        );
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Convert a Baileys WAMessage to a ChannelMessage.
     */
    private convertMessage(msg: any): ChannelMessage | null {
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) return null;

        const messageContent = msg.message;
        if (!messageContent) return null;

        // Determine content type and extract text/attachments
        let content = '';
        let contentType: ChannelMessage['contentType'] = 'text';
        let attachments: ChannelAttachment[] | undefined;

        if (messageContent.conversation) {
            // Plain text message
            content = messageContent.conversation;
            contentType = 'text';
        } else if (messageContent.extendedTextMessage) {
            // Extended text (with link previews, quotes, etc.)
            content = messageContent.extendedTextMessage.text ?? '';
            contentType = 'text';
        } else if (messageContent.imageMessage) {
            // Image message
            content = messageContent.imageMessage.caption ?? '';
            contentType = 'image';
            attachments = [{
                type: 'image',
                url: messageContent.imageMessage.url ?? '',
                name: 'image.jpg',
                size: messageContent.imageMessage.fileLength
                    ? Number(messageContent.imageMessage.fileLength)
                    : 0,
                mimeType: messageContent.imageMessage.mimetype ?? 'image/jpeg',
            }];
        } else if (messageContent.audioMessage) {
            // Audio/voice message
            content = '';
            contentType = 'voice';
            attachments = [{
                type: 'audio',
                url: messageContent.audioMessage.url ?? '',
                name: messageContent.audioMessage.ptt ? 'voice-note.ogg' : 'audio.ogg',
                size: messageContent.audioMessage.fileLength
                    ? Number(messageContent.audioMessage.fileLength)
                    : 0,
                mimeType: messageContent.audioMessage.mimetype ?? 'audio/ogg; codecs=opus',
            }];
        } else if (messageContent.documentMessage) {
            // Document/file message
            content = messageContent.documentMessage.caption ?? '';
            contentType = 'file';
            attachments = [{
                type: 'file',
                url: messageContent.documentMessage.url ?? '',
                name: messageContent.documentMessage.fileName ?? 'document',
                size: messageContent.documentMessage.fileLength
                    ? Number(messageContent.documentMessage.fileLength)
                    : 0,
                mimeType: messageContent.documentMessage.mimetype ?? 'application/octet-stream',
            }];
        } else if (messageContent.videoMessage) {
            // Video message
            content = messageContent.videoMessage.caption ?? '';
            contentType = 'file';
            attachments = [{
                type: 'video',
                url: messageContent.videoMessage.url ?? '',
                name: 'video.mp4',
                size: messageContent.videoMessage.fileLength
                    ? Number(messageContent.videoMessage.fileLength)
                    : 0,
                mimeType: messageContent.videoMessage.mimetype ?? 'video/mp4',
            }];
        } else {
            // Unsupported message type - skip
            return null;
        }

        // Determine sender info
        // In groups, participant holds the sender JID; in DMs, remoteJid is the sender
        const senderJid = msg.key.participant || remoteJid;
        const senderId = jidToNumber(senderJid);
        const pushName = msg.pushName ?? senderId;

        // Determine if this is a group chat
        const isGroup = remoteJid.endsWith('@g.us');

        return {
            id: msg.key.id ?? `wa-${Date.now()}`,
            channelType: 'whatsapp',
            channelId: remoteJid,
            content,
            contentType,
            attachments,
            sender: {
                id: senderId,
                name: pushName,
            },
            timestamp: new Date((msg.messageTimestamp ?? Math.floor(Date.now() / 1000)) * 1000),
            replyTo: messageContent.extendedTextMessage?.contextInfo?.stanzaId
                ?? messageContent.imageMessage?.contextInfo?.stanzaId
                ?? messageContent.documentMessage?.contextInfo?.stanzaId
                ?? messageContent.audioMessage?.contextInfo?.stanzaId
                ?? messageContent.videoMessage?.contextInfo?.stanzaId
                ?? undefined,
            metadata: {
                isGroup,
                ...(isGroup ? { groupJid: remoteJid } : {}),
                pushName: msg.pushName,
            },
        };
    }

    /**
     * Extract text content from a Baileys message object.
     * Used for message edit events.
     */
    private extractTextContent(message: any): string | null {
        if (!message) return null;
        if (message.conversation) return message.conversation;
        if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message.imageMessage?.caption) return message.imageMessage.caption;
        if (message.documentMessage?.caption) return message.documentMessage.caption;
        if (message.videoMessage?.caption) return message.videoMessage.caption;
        return null;
    }
}
