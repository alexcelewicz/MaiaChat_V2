import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// AES-256-GCM encryption for API keys
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment
function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error("ENCRYPTION_KEY environment variable is required");
    }
    // Support both hex format (64 chars) and plain text (32+ chars)
    if (key.length >= 64 && /^[0-9a-fA-F]+$/.test(key)) {
        // Hex format
        return Buffer.from(key.slice(0, 64), "hex");
    }
    // Plain text - use first 32 bytes (256 bits)
    if (key.length < 32) {
        throw new Error("ENCRYPTION_KEY must be at least 32 characters");
    }
    return Buffer.from(key.slice(0, 32), "utf8");
}

/**
 * Encrypt an API key using AES-256-GCM
 * @param plaintext The API key to encrypt
 * @returns Base64 encoded encrypted string (iv + authTag + ciphertext)
 */
export function encryptApiKey(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    
    const cipher = createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    const authTag = cipher.getAuthTag();
    
    // Combine iv + authTag + ciphertext
    const combined = Buffer.concat([
        iv,
        authTag,
        Buffer.from(encrypted, "hex"),
    ]);
    
    return combined.toString("base64");
}

/**
 * Decrypt an API key using AES-256-GCM
 * @param encryptedBase64 Base64 encoded encrypted string
 * @returns Decrypted API key
 */
export function decryptApiKey(encryptedBase64: string): string {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedBase64, "base64");
    
    // Extract iv, authTag, and ciphertext
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext.toString("hex"), "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
}

/**
 * Get the last 4 characters of an API key for display
 * @param apiKey The full API key
 * @returns Masked key hint (e.g., "sk-...abc1")
 */
export function getKeyHint(apiKey: string): string {
    if (apiKey.length < 4) return "****";
    const last4 = apiKey.slice(-4);
    const prefix = apiKey.slice(0, Math.min(3, apiKey.indexOf("-") + 1)) || "***";
    return `${prefix}...${last4}`;
}

/**
 * Generate a random encryption key (for initial setup)
 * @returns 64 character hex string
 */
export function generateEncryptionKey(): string {
    return randomBytes(32).toString("hex");
}

// Aliases for channel token encryption (same AES-256-GCM encryption)
export const encrypt = encryptApiKey;
export const decrypt = decryptApiKey;
