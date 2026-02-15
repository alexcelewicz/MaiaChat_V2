/**
 * Gateway Token API
 *
 * POST /api/gateway/token - Generate a gateway authentication token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { generateGatewayToken } from '@/lib/gateway/token';
import type { GatewayTokenRequest, GatewayTokenResponse } from '@/lib/gateway/types';

/**
 * POST /api/gateway/token - Generate a gateway token
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Parse request body
        let body: GatewayTokenRequest = {};
        try {
            body = await request.json();
        } catch {
            // Empty body is fine, use defaults
        }

        // Generate token
        const { token, expiresAt, tokenId } = await generateGatewayToken(userId, {
            conversationId: body.conversationId,
            channelType: body.channelType,
            channelId: body.channelId,
            scopes: body.scopes,
        });

        // Get gateway URL from environment
        const gatewayUrl = process.env.GATEWAY_URL || 'ws://localhost:18789';

        const response: GatewayTokenResponse = {
            token,
            expiresAt,
            gatewayUrl,
            tenant: {
                tenantId: userId,
                userId,
                conversationId: body.conversationId,
            },
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('[API] Gateway token error:', error);
        return NextResponse.json(
            { error: 'Failed to generate gateway token' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/gateway/token - Revoke a gateway token
 */
export async function DELETE(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const tokenId = searchParams.get('tokenId');

        if (!tokenId) {
            return NextResponse.json(
                { error: 'Token ID required' },
                { status: 400 }
            );
        }

        const { revokeGatewayToken } = await import('@/lib/gateway/token');
        const success = await revokeGatewayToken(tokenId);

        return NextResponse.json({ success });
    } catch (error) {
        console.error('[API] Gateway token revoke error:', error);
        return NextResponse.json(
            { error: 'Failed to revoke token' },
            { status: 500 }
        );
    }
}
