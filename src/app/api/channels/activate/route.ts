/**
 * POST /api/channels/activate - Start all active channel bots for the current user
 *
 * This activates the channel connectors (Telegram, Slack, etc.) so they can
 * receive and respond to messages. Bots run persistently via the background service.
 */

import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { getBackgroundService } from '@/lib/channels/background-service';
import { getChannelManager } from '@/lib/channels/manager';
import '@/lib/channels'; // Register all connectors

export async function POST() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use background service for persistent operation
        const service = getBackgroundService();
        const channelStates = await service.startUserChannels(userId);

        // Get running channels info
        const runningChannels = channelStates.filter(s => s.running);
        const firstRunning = runningChannels[0];

        return NextResponse.json({
            success: true,
            message: `Activated ${runningChannels.length} channel(s)${firstRunning ? ` using ${firstRunning.model}` : ''}`,
            channels: runningChannels.map(s => ({
                type: s.channelType,
                channelId: s.channelAccountId,
                model: s.model,
                provider: s.provider,
            })),
            model: firstRunning?.model,
            provider: firstRunning?.provider,
            persistent: true, // Indicates bots will keep running after sign out
        });
    } catch (error) {
        console.error('[API] Channel activation error:', error);
        return NextResponse.json({ error: 'Failed to activate channels' }, { status: 500 });
    }
}

/**
 * GET /api/channels/activate - Check which channels are currently active
 */
export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use background service for status
        const service = getBackgroundService();
        const userChannels = service.getUserChannels(userId);
        const runningChannels = userChannels.filter(s => s.running);

        // Also check channel manager for connected status
        const channelManager = getChannelManager();
        const connectedChannels = channelManager.getConnectedChannels(userId);

        return NextResponse.json({
            active: runningChannels.length > 0,
            channels: runningChannels.map(s => ({
                type: s.channelType,
                channelId: s.channelAccountId,
                running: s.running,
                connected: s.connected,
                model: s.model,
                provider: s.provider,
                lastError: s.lastError,
            })),
            serviceRunning: service.isRunning(),
            legacyConnected: connectedChannels, // For backwards compatibility
        });
    } catch (error) {
        console.error('[API] Channel status error:', error);
        return NextResponse.json({ error: 'Failed to get channel status' }, { status: 500 });
    }
}
