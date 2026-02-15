/**
 * GET /api/channels/webchat/embed - WebChat embed snippet for current user
 */

import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';

export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const wsUrl = process.env.WEBCHAT_PUBLIC_URL || 'ws://localhost:18791';
        const channelId = `webchat:${userId}`;

        const embedSnippet = `<!-- MaiaChat WebChat -->\n<script>\n  window.maiaChat = { wsUrl: '${wsUrl}', channelId: '${channelId}' };\n</script>\n<script src="${appUrl}/webchat/embed.js"></script>`;

        return NextResponse.json({ channelId, wsUrl, embedSnippet });
    } catch (error) {
        console.error('[API] WebChat embed error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
