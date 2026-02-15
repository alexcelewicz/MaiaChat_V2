/**
 * POST /api/channels/manual/[type] - Manual channel connection for token-based channels
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channelAccounts } from '@/lib/db/schema';
import { encrypt } from '@/lib/crypto';
import { manualConnectSchemas } from '@/lib/channels/manual-schema';
import { ZodError } from 'zod';

const MANUAL_CHANNELS = new Set(['telegram', 'matrix', 'webchat', 'teams', 'whatsapp', 'signal', 'slack', 'discord']);

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ type: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { type } = await params;
        if (!MANUAL_CHANNELS.has(type)) {
            return NextResponse.json({ error: 'Unsupported channel type' }, { status: 400 });
        }

        const schema = manualConnectSchemas[type as keyof typeof manualConnectSchemas];
        if (!schema) {
            return NextResponse.json({ error: 'Unsupported channel type' }, { status: 400 });
        }

        const payload = schema.parse(await request.json());

        // Auto-generate channelId for types that don't need user-provided ones
        let channelId = payload.channelId;
        if (!channelId) {
            switch (type) {
                case 'webchat':
                    channelId = `webchat:${userId}`;
                    break;
                case 'whatsapp':
                    channelId = `whatsapp:${userId}`;
                    break;
                case 'signal': {
                    const phone = (payload as { phoneNumber?: string }).phoneNumber;
                    channelId = phone ? `signal:${phone}` : `signal:${userId}`;
                    break;
                }
            }
        }

        if (!channelId) {
            return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
        }

        // Extract access token based on channel type
        let accessToken: string | undefined;
        if ('accessToken' in payload) {
            accessToken = payload.accessToken as string;
        } else if ('botToken' in payload) {
            accessToken = (payload as { botToken: string }).botToken;
        }

        // Extract config based on channel type
        let config: Record<string, unknown> | null;
        switch (type) {
            case 'matrix':
                config = {
                    homeserverUrl: (payload as { homeserverUrl: string }).homeserverUrl,
                    userId: (payload as { userId: string }).userId,
                };
                break;
            case 'slack':
                config = {
                    signingSecret: (payload as { signingSecret?: string }).signingSecret || null,
                    appToken: (payload as { appToken?: string }).appToken || null,
                };
                break;
            case 'whatsapp':
                config = {
                    authDir: (payload as { authDir?: string }).authDir || null,
                    autoReplyEnabled: false,
                };
                break;
            case 'signal':
                config = {
                    phoneNumber: (payload as { phoneNumber: string }).phoneNumber,
                    signalCliPath: (payload as { signalCliPath?: string }).signalCliPath || null,
                };
                break;
            case 'teams':
                config = {
                    appId: (payload as { appId: string }).appId,
                    appPassword: (payload as { appPassword: string }).appPassword,
                };
                break;
            default:
                config = payload.config || null;
        }

        const accountId = type === 'matrix'
            ? (payload as { userId: string }).userId
            : 'bot';

        const displayName = payload.displayName || channelId;

        const [account] = await db.insert(channelAccounts)
            .values({
                userId,
                channelType: type,
                channelId,
                accountId,
                accessToken: accessToken ? encrypt(accessToken) : null,
                refreshToken: null,
                config,
                displayName,
                isActive: true,
            })
            .onConflictDoUpdate({
                target: [channelAccounts.userId, channelAccounts.channelType, channelAccounts.channelId],
                set: {
                    accessToken: accessToken ? encrypt(accessToken) : null,
                    refreshToken: null,
                    config,
                    displayName,
                    isActive: true,
                    updatedAt: new Date(),
                },
            })
            .returning({
                id: channelAccounts.id,
                channelType: channelAccounts.channelType,
                channelId: channelAccounts.channelId,
                displayName: channelAccounts.displayName,
                isActive: channelAccounts.isActive,
            });

        // Auto-start the channel connector in the background
        try {
            const { getBackgroundService } = await import('@/lib/channels/background-service');
            const service = getBackgroundService();
            // Fire-and-forget: don't block the response on connector startup
            service.startChannel(userId, account.id).catch((startErr) => {
                console.warn('[API] Channel auto-start failed:', startErr);
            });
        } catch (importErr) {
            console.warn('[API] Could not import background service:', importErr);
        }

        return NextResponse.json({ account }, { status: 201 });
    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json({
                error: 'Invalid payload',
                details: error.flatten(),
            }, { status: 400 });
        }

        console.error('[API] Manual channel connect error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
