/**
 * WhatsApp QR Pairing State
 *
 * Module-level in-memory store for WhatsApp QR code pairing state.
 * Keyed by channel account ID so the frontend can poll for QR updates.
 */

export interface PairingState {
    status: 'waiting_qr' | 'connected' | 'error';
    qr: string | null;
    updatedAt: number;
    error?: string;
}

const pairingStates = new Map<string, PairingState>();

export function setPairingQR(accountId: string, qr: string): void {
    pairingStates.set(accountId, {
        status: 'waiting_qr',
        qr,
        updatedAt: Date.now(),
    });
}

export function setPairingConnected(accountId: string): void {
    pairingStates.set(accountId, {
        status: 'connected',
        qr: null,
        updatedAt: Date.now(),
    });

    // Auto-cleanup 60s after connection
    setTimeout(() => {
        const state = pairingStates.get(accountId);
        if (state?.status === 'connected') {
            pairingStates.delete(accountId);
        }
    }, 60_000);
}

export function setPairingError(accountId: string, error: string): void {
    pairingStates.set(accountId, {
        status: 'error',
        qr: null,
        updatedAt: Date.now(),
        error,
    });
}

export function getPairingState(accountId: string): PairingState | undefined {
    return pairingStates.get(accountId);
}

export function clearPairingState(accountId: string): void {
    pairingStates.delete(accountId);
}
