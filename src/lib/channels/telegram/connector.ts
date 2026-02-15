/**
 * Telegram Channel Connector
 *
 * Connects to Telegram using the grammY library.
 * Supports both polling and webhook modes.
 */

import {
    ChannelConnector,
    ChannelMessage,
    ChannelConfig,
    SendMessageOptions,
    ChannelAttachment,
} from '../base';

// Lazy import grammy to avoid bundling issues
let Bot: typeof import('grammy').Bot;

async function getGrammyBot() {
    if (!Bot) {
        const grammy = await import('grammy');
        Bot = grammy.Bot;
    }
    return Bot;
}

/** Telegram message character limit */
const TELEGRAM_MAX_LENGTH = 4096;

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
    if (value == null) return fallback;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function shouldDropPendingUpdates(): boolean {
    // Safe-by-default: keep pending updates unless explicitly enabled.
    return parseBooleanEnv(process.env.TELEGRAM_DROP_PENDING_UPDATES, false);
}

/**
 * Split a long message into chunks that fit within Telegram's character limit.
 * Splits at natural breakpoints: paragraphs > newlines > sentences > words.
 */
function splitMessage(text: string, maxLength: number = TELEGRAM_MAX_LENGTH): string[] {
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
 * Sanitize content for Telegram HTML parse mode.
 * Telegram only supports: b, i, u, s, code, pre, a, tg-spoiler, tg-emoji
 * This function escapes invalid HTML-like content and converts markdown.
 */
function sanitizeForTelegramHTML(content: string): string {
    // First, escape all < and > that aren't part of valid Telegram HTML tags
    const validTags = ['b', 'i', 'u', 's', 'code', 'pre', 'a', 'tg-spoiler', 'tg-emoji', 'blockquote'];
    const tagPattern = validTags.map(t => `</?${t}(?:\\s[^>]*)?>|<${t}(?:\\s[^>]*)?/>`).join('|');
    const validTagRegex = new RegExp(`(${tagPattern})`, 'gi');

    // Split by valid tags, escape the rest
    const parts = content.split(validTagRegex);
    const escaped = parts.map((part, index) => {
        // Odd indices are the matched valid tags
        if (index % 2 === 1) {
            return part; // Keep valid tags as-is
        }
        // Even indices are content between tags - escape < and >
        return part
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }).join('');

    // Convert common markdown to Telegram HTML
    const result = escaped
        // Bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/__(.+?)__/g, '<b>$1</b>')
        // Italic: *text* or _text_ (but not inside URLs)
        .replace(/(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, '<i>$1</i>')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>')
        // Strikethrough: ~~text~~
        .replace(/~~(.+?)~~/g, '<s>$1</s>')
        // Inline code: `text`
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Code blocks: ```text```
        .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre>$1</pre>');

    return result;
}

/**
 * Strip all HTML tags for plain text fallback
 */
function stripHtmlTags(content: string): string {
    return content
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

export class TelegramConnector extends ChannelConnector {
    readonly type = 'telegram';
    readonly name = 'Telegram';

    private bot: InstanceType<typeof import('grammy').Bot> | null = null;
    private config: ChannelConfig | null = null;

    async connect(config: ChannelConfig): Promise<void> {
        this.config = config;
        const BotClass = await getGrammyBot();

        this.bot = new BotClass(config.credentials.botToken);

        // Handle text messages
        this.bot.on('message:text', async (ctx) => {
            const message = ctx.message;
            if (!message.text) return;

            const channelMessage: ChannelMessage = {
                id: message.message_id.toString(),
                channelType: 'telegram',
                channelId: message.chat.id.toString(),
                threadId: message.message_thread_id?.toString(),
                content: message.text,
                contentType: 'text',
                sender: {
                    id: message.from?.id.toString() ?? 'unknown',
                    name: this.formatSenderName(message.from),
                    avatarUrl: undefined, // Telegram doesn't provide avatars in messages
                },
                timestamp: new Date(message.date * 1000),
                replyTo: message.reply_to_message?.message_id.toString(),
            };

            await this.onMessage?.(channelMessage);
        });

        // Handle photo messages
        this.bot.on('message:photo', async (ctx) => {
            const message = ctx.message;
            const photo = message.photo?.at(-1); // Get largest photo

            if (!photo) return;

            const file = await ctx.api.getFile(photo.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${config.credentials.botToken}/${file.file_path}`;

            const channelMessage: ChannelMessage = {
                id: message.message_id.toString(),
                channelType: 'telegram',
                channelId: message.chat.id.toString(),
                threadId: message.message_thread_id?.toString(),
                content: message.caption ?? '',
                contentType: 'image',
                attachments: [{
                    type: 'image',
                    url: fileUrl,
                    name: file.file_path?.split('/').pop() ?? 'photo.jpg',
                    size: photo.file_size ?? 0,
                    mimeType: 'image/jpeg',
                }],
                sender: {
                    id: message.from?.id.toString() ?? 'unknown',
                    name: this.formatSenderName(message.from),
                },
                timestamp: new Date(message.date * 1000),
                replyTo: message.reply_to_message?.message_id.toString(),
            };

            await this.onMessage?.(channelMessage);
        });

        // Handle document messages
        this.bot.on('message:document', async (ctx) => {
            const message = ctx.message;
            const doc = message.document;

            if (!doc) return;

            const file = await ctx.api.getFile(doc.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${config.credentials.botToken}/${file.file_path}`;

            const channelMessage: ChannelMessage = {
                id: message.message_id.toString(),
                channelType: 'telegram',
                channelId: message.chat.id.toString(),
                threadId: message.message_thread_id?.toString(),
                content: message.caption ?? '',
                contentType: 'file',
                attachments: [{
                    type: 'file',
                    url: fileUrl,
                    name: doc.file_name ?? 'document',
                    size: doc.file_size ?? 0,
                    mimeType: doc.mime_type,
                }],
                sender: {
                    id: message.from?.id.toString() ?? 'unknown',
                    name: this.formatSenderName(message.from),
                },
                timestamp: new Date(message.date * 1000),
                replyTo: message.reply_to_message?.message_id.toString(),
            };

            await this.onMessage?.(channelMessage);
        });

        // Handle errors
        this.bot.catch((err) => {
            console.error('[Telegram] Bot error:', err);
            this.onError?.(err.error instanceof Error ? err.error : new Error(String(err.error)));
        });

        // Start polling with retry on conflict
        const dropPendingUpdates = shouldDropPendingUpdates();
        try {
            await this.bot.start({
                drop_pending_updates: dropPendingUpdates,
                onStart: () => {
                    console.log(`[Telegram] Bot started (drop_pending_updates=${dropPendingUpdates})`);
                },
            });
        } catch (startError) {
            // Handle 409 conflict (another instance running)
            if (startError instanceof Error && startError.message.includes('409')) {
                console.warn('[Telegram] Bot conflict detected, waiting and retrying...');
                // Wait a moment for the other instance to release
                await new Promise(resolve => setTimeout(resolve, 2000));
                // Try again with same drop_pending_updates setting
                await this.bot.start({
                    drop_pending_updates: dropPendingUpdates,
                    onStart: () => {
                        console.log(`[Telegram] Bot started (after retry, drop_pending_updates=${dropPendingUpdates})`);
                    },
                });
            } else {
                throw startError;
            }
        }
    }

    async disconnect(): Promise<void> {
        if (this.bot) {
            await this.bot.stop();
            this.bot = null;
            console.log('[Telegram] Bot stopped');
        }
    }

    isConnected(): boolean {
        return this.bot !== null;
    }

    async sendMessage(
        channelId: string,
        content: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.bot) throw new Error('Bot not connected');

        // Split long messages into Telegram-safe chunks
        const chunks = splitMessage(content);
        let lastMessageId = '';

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const isFirst = i === 0;

            // Add part indicator for multi-part messages
            const partLabel = chunks.length > 1 ? `[${i + 1}/${chunks.length}]\n` : '';
            const messageContent = chunks.length > 1 && !isFirst ? partLabel + chunk : chunk;

            // Sanitize content for Telegram HTML
            const sanitizedContent = sanitizeForTelegramHTML(messageContent);

            try {
                // Try sending with HTML formatting
                const result = await this.bot.api.sendMessage(channelId, sanitizedContent, {
                    // Only reply to original message on the first chunk
                    reply_to_message_id: isFirst && options?.replyTo ? parseInt(options.replyTo) : undefined,
                    message_thread_id: options?.threadId ? parseInt(options.threadId) : undefined,
                    parse_mode: 'HTML',
                });
                lastMessageId = result.message_id.toString();
            } catch (error) {
                // If HTML parsing fails, fallback to plain text
                console.warn('[Telegram] HTML parse failed, falling back to plain text:', error);
                const plainText = stripHtmlTags(messageContent);
                const result = await this.bot.api.sendMessage(channelId, plainText, {
                    reply_to_message_id: isFirst && options?.replyTo ? parseInt(options.replyTo) : undefined,
                    message_thread_id: options?.threadId ? parseInt(options.threadId) : undefined,
                });
                lastMessageId = result.message_id.toString();
            }

            // Small delay between chunks to maintain order
            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        if (chunks.length > 1) {
            console.log(`[Telegram] Split message into ${chunks.length} chunks (${content.length} chars total)`);
        }

        return lastMessageId;
    }

    async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
        if (!this.bot) throw new Error('Bot not connected');

        const sanitizedContent = sanitizeForTelegramHTML(content);

        try {
            await this.bot.api.editMessageText(
                channelId,
                parseInt(messageId),
                sanitizedContent,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            // Fallback to plain text
            console.warn('[Telegram] Edit HTML parse failed, falling back to plain text');
            const plainText = stripHtmlTags(content);
            await this.bot.api.editMessageText(
                channelId,
                parseInt(messageId),
                plainText
            );
        }
    }

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        if (!this.bot) throw new Error('Bot not connected');

        await this.bot.api.deleteMessage(channelId, parseInt(messageId));
    }

    /**
     * Send a typing indicator (chat action)
     */
    async sendTypingAction(channelId: string): Promise<void> {
        if (!this.bot) throw new Error('Bot not connected');

        await this.bot.api.sendChatAction(channelId, 'typing');
    }

    /**
     * Send a photo
     */
    async sendPhoto(
        channelId: string,
        photoUrl: string,
        caption?: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.bot) throw new Error('Bot not connected');

        const result = await this.bot.api.sendPhoto(channelId, photoUrl, {
            caption,
            reply_to_message_id: options?.replyTo ? parseInt(options.replyTo) : undefined,
            message_thread_id: options?.threadId ? parseInt(options.threadId) : undefined,
            parse_mode: 'HTML',
        });

        return result.message_id.toString();
    }

    /**
     * Send a document
     */
    async sendDocument(
        channelId: string,
        documentUrl: string,
        caption?: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.bot) throw new Error('Bot not connected');

        const result = await this.bot.api.sendDocument(channelId, documentUrl, {
            caption,
            reply_to_message_id: options?.replyTo ? parseInt(options.replyTo) : undefined,
            message_thread_id: options?.threadId ? parseInt(options.threadId) : undefined,
            parse_mode: 'HTML',
        });

        return result.message_id.toString();
    }

    private formatSenderName(from?: { first_name?: string; last_name?: string; username?: string }): string {
        if (!from) return 'Unknown';
        if (from.first_name) {
            return from.last_name ? `${from.first_name} ${from.last_name}` : from.first_name;
        }
        return from.username ?? 'Unknown';
    }
}
