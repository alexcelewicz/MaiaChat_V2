/**
 * Signal Channel Connector
 *
 * Connects to Signal using signal-cli (command-line interface for Signal).
 * Requires signal-cli to be installed and a phone number to be registered.
 * See: https://github.com/AsamK/signal-cli
 */

import {
    ChannelConnector,
    ChannelMessage,
    ChannelConfig,
    SendMessageOptions,
    ChannelAttachment,
} from '../base';

// Types for signal-cli JSON output
interface SignalEnvelope {
    envelope?: {
        source?: string;
        sourceName?: string;
        sourceNumber?: string;
        sourceUuid?: string;
        timestamp?: number;
        dataMessage?: {
            timestamp?: number;
            message?: string;
            groupInfo?: {
                groupId?: string;
                type?: string;
            };
            attachments?: Array<{
                contentType?: string;
                filename?: string;
                id?: string;
                size?: number;
            }>;
            quote?: {
                id?: number;
                author?: string;
                text?: string;
            };
        };
        editMessage?: {
            targetSentTimestamp?: number;
            dataMessage?: {
                timestamp?: number;
                message?: string;
            };
        };
        receiptMessage?: {
            type?: string;
            timestamps?: number[];
        };
    };
}

/** Validate channelId to prevent argument injection (must be phone number or group.ID) */
function validateChannelId(channelId: string): void {
    if (channelId.startsWith('-')) {
        throw new Error('Invalid channel ID: must not start with a dash');
    }
    // Phone numbers start with + or digits; group IDs start with "group."
    if (!channelId.startsWith('+') && !channelId.startsWith('group.') && !/^\d/.test(channelId)) {
        throw new Error('Invalid channel ID: must be a phone number or group ID');
    }
}

export class SignalConnector extends ChannelConnector {
    readonly type = 'signal';
    readonly name = 'Signal';

    private daemonProcess: import('child_process').ChildProcess | null = null;
    private config: ChannelConfig | null = null;
    private phoneNumber: string = '';
    private signalCliPath: string = 'signal-cli';
    private connected: boolean = false;

    async connect(config: ChannelConfig): Promise<void> {
        this.config = config;
        this.phoneNumber = config.credentials.phoneNumber;
        // Validate signalCliPath to prevent arbitrary executable injection
        const rawPath = config.credentials.signalCliPath || 'signal-cli';
        const normalizedPath = rawPath.replace(/\\/g, '/');
        const basename = normalizedPath.split('/').pop() || '';
        if (!/^signal-cli(\.exe)?$/.test(basename)) {
            throw new Error('Signal connector: signalCliPath must point to a signal-cli binary');
        }
        this.signalCliPath = rawPath;

        if (!this.phoneNumber) {
            throw new Error('Signal connector requires credentials.phoneNumber (registered Signal phone number)');
        }

        try {
            const { spawn } = await import('child_process');

            // Start signal-cli in daemon mode with JSON output
            this.daemonProcess = spawn(this.signalCliPath, [
                '-u', this.phoneNumber,
                'daemon',
                '--json',
            ]);

            let buffer = '';

            // Parse JSON lines from daemon stdout
            this.daemonProcess.stdout?.on('data', (data: Buffer) => {
                buffer += data.toString();

                // signal-cli outputs one JSON object per line
                const lines = buffer.split('\n');
                // Keep the last incomplete line in the buffer
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    try {
                        const envelope = JSON.parse(trimmed) as SignalEnvelope;
                        this.handleEnvelope(envelope);
                    } catch (parseError) {
                        // Non-JSON output from signal-cli (status messages, etc.)
                        console.log('[Signal] daemon output:', trimmed);
                    }
                }
            });

            // Log stderr output
            this.daemonProcess.stderr?.on('data', (data: Buffer) => {
                const output = data.toString().trim();
                if (output) {
                    console.warn('[Signal] daemon stderr:', output);
                }
            });

            // Handle daemon process exit
            this.daemonProcess.on('close', (code) => {
                console.log(`[Signal] daemon process exited with code ${code}`);
                this.connected = false;
                this.daemonProcess = null;
                if (code !== 0 && code !== null) {
                    this.onError?.(new Error(`signal-cli daemon exited with code ${code}`));
                }
            });

            // Handle daemon process errors
            this.daemonProcess.on('error', (error) => {
                console.error('[Signal] daemon process error:', error);
                this.connected = false;
                this.onError?.(error);
            });

            this.connected = true;
            console.log(`[Signal] daemon started for ${this.phoneNumber}`);
        } catch (error) {
            throw new Error(
                'Signal integration requires signal-cli. Install it from: https://github.com/AsamK/signal-cli'
            );
        }
    }

    async disconnect(): Promise<void> {
        if (this.daemonProcess) {
            const pid = this.daemonProcess.pid;

            // Gracefully terminate the daemon
            this.daemonProcess.kill('SIGTERM');

            // Wait for the process to exit, force kill after timeout
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(async () => {
                    if (this.daemonProcess && pid) {
                        // On Windows, use taskkill to kill the entire process tree.
                        // Node's kill() on Windows doesn't terminate child processes
                        // that signal-cli may have spawned.
                        if (process.platform === 'win32') {
                            try {
                                const { exec } = await import('child_process');
                                exec(`taskkill /pid ${pid} /T /F`, (err) => {
                                    if (err) console.warn('[Signal] taskkill error:', err.message);
                                    resolve();
                                });
                                return;
                            } catch {
                                // Fallback to basic kill
                            }
                        }
                        try {
                            this.daemonProcess.kill('SIGKILL');
                        } catch {
                            this.daemonProcess.kill();
                        }
                    }
                    resolve();
                }, 5000);

                this.daemonProcess?.on('close', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            this.daemonProcess = null;
            this.connected = false;
            console.log('[Signal] daemon stopped');
        }
    }

    isConnected(): boolean {
        return this.connected && this.daemonProcess !== null;
    }

    async sendMessage(
        channelId: string,
        content: string,
        options?: SendMessageOptions
    ): Promise<string> {
        if (!this.isConnected()) throw new Error('Not connected');
        validateChannelId(channelId);

        try {
            const { spawn } = await import('child_process');

            const args = [
                '-u', this.phoneNumber,
                'send',
                '-m', content,
            ];

            // If channelId looks like a group ID, use group send
            if (channelId.startsWith('group.')) {
                args.push('-g', channelId.replace('group.', ''));
            } else {
                // Direct message to a phone number
                args.push(channelId);
            }

            // Handle reply-to (quote)
            if (options?.replyTo) {
                args.push('--quote-timestamp', options.replyTo);
                args.push('--quote-author', channelId);
            }

            await this.execSignalCli(args);

            // signal-cli send returns a timestamp as the message ID
            const timestamp = Date.now().toString();
            console.log(`[Signal] Message sent to ${channelId}`);
            return timestamp;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Signal send failed: ${msg}`);
        }
    }

    async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
        if (!this.isConnected()) throw new Error('Not connected');
        validateChannelId(channelId);

        try {
            // signal-cli does not natively support editing messages via CLI
            // We send a new message indicating an edit
            console.warn('[Signal] Signal protocol has limited edit support via signal-cli');

            const args = [
                '-u', this.phoneNumber,
                'send',
                '-m', `[edited] ${content}`,
            ];

            if (channelId.startsWith('group.')) {
                args.push('-g', channelId.replace('group.', ''));
            } else {
                args.push(channelId);
            }

            await this.execSignalCli(args);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Signal edit failed: ${msg}`);
        }
    }

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        if (!this.isConnected()) throw new Error('Not connected');
        validateChannelId(channelId);

        try {

            const args = [
                '-u', this.phoneNumber,
                'remoteDelete',
                '-t', messageId,
            ];

            if (channelId.startsWith('group.')) {
                args.push('-g', channelId.replace('group.', ''));
            } else {
                args.push(channelId);
            }

            await this.execSignalCli(args);
            console.log(`[Signal] Message ${messageId} deleted from ${channelId}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Signal delete failed: ${msg}`);
        }
    }

    // =========================================================================
    // Signal-specific methods
    // =========================================================================

    /**
     * Send a reaction to a message
     */
    async sendReaction(
        channelId: string,
        messageId: string,
        emoji: string,
        targetAuthor: string
    ): Promise<void> {
        if (!this.isConnected()) throw new Error('Not connected');
        validateChannelId(channelId);

        const args = [
            '-u', this.phoneNumber,
            'sendReaction',
            '-e', emoji,
            '-a', targetAuthor,
            '-t', messageId,
        ];

        if (channelId.startsWith('group.')) {
            args.push('-g', channelId.replace('group.', ''));
        } else {
            args.push(channelId);
        }

        await this.execSignalCli(args);
    }

    /**
     * Send a typing indicator
     */
    async sendTypingIndicator(channelId: string): Promise<void> {
        if (!this.isConnected()) throw new Error('Not connected');
        validateChannelId(channelId);

        const args = [
            '-u', this.phoneNumber,
            'sendTyping',
        ];

        if (channelId.startsWith('group.')) {
            args.push('-g', channelId.replace('group.', ''));
        } else {
            args.push(channelId);
        }

        await this.execSignalCli(args);
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Execute a signal-cli command and return stdout
     */
    private async execSignalCli(args: string[]): Promise<string> {
        const { spawn } = await import('child_process');

        return new Promise<string>((resolve, reject) => {
            const proc = spawn(this.signalCliPath, args);
            let stdout = '';
            let stderr = '';

            proc.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            proc.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout.trim());
                } else {
                    reject(new Error(`signal-cli exited with code ${code}: ${stderr.trim()}`));
                }
            });

            proc.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Handle an incoming envelope from the signal-cli daemon
     */
    private async handleEnvelope(data: SignalEnvelope): Promise<void> {
        const envelope = data.envelope;
        if (!envelope) return;

        // Handle edit messages
        if (envelope.editMessage) {
            await this.handleEditMessage(envelope);
            return;
        }

        // Handle data messages (regular messages)
        if (envelope.dataMessage) {
            await this.handleDataMessage(envelope);
            return;
        }
    }

    /**
     * Handle an incoming data message
     */
    private async handleDataMessage(envelope: NonNullable<SignalEnvelope['envelope']>): Promise<void> {
        const dataMessage = envelope.dataMessage;
        if (!dataMessage?.message) return;

        const sourceNumber = envelope.sourceNumber ?? envelope.source ?? 'unknown';
        const sourceName = envelope.sourceName ?? sourceNumber;

        // Determine channel ID (group or direct)
        const channelId = dataMessage.groupInfo?.groupId
            ? `group.${dataMessage.groupInfo.groupId}`
            : sourceNumber;

        // Parse attachments
        const attachments: ChannelAttachment[] = (dataMessage.attachments ?? []).map(att => ({
            type: att.contentType?.startsWith('image/') ? 'image' as const :
                  att.contentType?.startsWith('audio/') ? 'audio' as const :
                  att.contentType?.startsWith('video/') ? 'video' as const : 'file' as const,
            url: att.id ?? '',
            name: att.filename ?? 'attachment',
            size: att.size ?? 0,
            mimeType: att.contentType,
        }));

        const timestamp = dataMessage.timestamp ?? envelope.timestamp ?? Date.now();

        const channelMessage: ChannelMessage = {
            id: timestamp.toString(),
            channelType: 'signal',
            channelId,
            content: dataMessage.message,
            contentType: attachments.length > 0
                ? (attachments[0].type === 'image' ? 'image' : 'file')
                : 'text',
            attachments: attachments.length > 0 ? attachments : undefined,
            sender: {
                id: envelope.sourceUuid ?? sourceNumber,
                name: sourceName,
            },
            timestamp: new Date(timestamp),
            replyTo: dataMessage.quote?.id?.toString(),
            metadata: {
                sourceNumber,
                groupId: dataMessage.groupInfo?.groupId,
            },
        };

        await this.onMessage?.(channelMessage);
    }

    /**
     * Handle an edited message
     */
    private async handleEditMessage(envelope: NonNullable<SignalEnvelope['envelope']>): Promise<void> {
        const editMessage = envelope.editMessage;
        if (!editMessage?.dataMessage?.message) return;

        const sourceNumber = envelope.sourceNumber ?? envelope.source ?? 'unknown';
        const sourceName = envelope.sourceName ?? sourceNumber;

        const channelMessage: ChannelMessage = {
            id: (editMessage.targetSentTimestamp ?? editMessage.dataMessage.timestamp ?? Date.now()).toString(),
            channelType: 'signal',
            channelId: sourceNumber,
            content: editMessage.dataMessage.message,
            contentType: 'text',
            sender: {
                id: envelope.sourceUuid ?? sourceNumber,
                name: sourceName,
            },
            timestamp: new Date(editMessage.dataMessage.timestamp ?? Date.now()),
        };

        await this.onMessageEdit?.(channelMessage);
    }
}
