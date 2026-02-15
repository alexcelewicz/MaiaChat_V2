/**
 * Gateway Module
 *
 * Exports for the MaiaChat gateway client and utilities.
 */

// Types
export * from './types';

// Client
export {
    GatewayClient,
    getGatewayClient,
    createGatewayClient,
    type GatewayClientState,
} from './client';

// Token service (server-side only)
export {
    generateGatewayToken,
    verifyGatewayToken,
    revokeGatewayToken,
    revokeAllGatewayTokens,
    type GatewayTokenPayload,
    type GatewayTokenResult,
} from './token';

// React hook (client-side only)
export { useGateway, type UseGatewayOptions, type UseGatewayReturn } from './useGateway';

// Session store (server-side only)
export {
    createGatewaySession,
    getGatewaySession,
    getGatewaySessionByKey,
    getUserActiveSessions,
    updateGatewaySession,
    disconnectGatewaySession,
    recordSessionActivity,
    storeSessionSnapshot,
    getSessionSnapshot,
    deleteSessionSnapshot,
    cleanupStaleSessions,
    type GatewaySessionData,
    type CreateSessionOptions,
    type UpdateSessionOptions,
} from './sessions';
