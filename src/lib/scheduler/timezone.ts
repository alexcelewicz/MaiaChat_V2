import { getUserProfile } from "@/lib/memory/user-profile";

export function resolveTimezone(explicit?: string | null): string {
    const trimmed = explicit?.trim();
    if (trimmed) return trimmed;

    try {
        const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return systemTz || "UTC";
    } catch {
        return "UTC";
    }
}

export async function resolveUserTimezone(
    userId: string,
    explicit?: string | null
): Promise<string> {
    const trimmed = explicit?.trim();
    if (trimmed) return trimmed;

    try {
        const profile = await getUserProfile(userId);
        const profileTz = profile.timezone?.trim();
        if (profileTz) return profileTz;
    } catch {
        // Ignore profile lookup failures and fall back to system timezone
    }

    return resolveTimezone(null);
}
