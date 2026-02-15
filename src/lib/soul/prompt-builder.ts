/**
 * Soul Prompt Builder
 *
 * Composes loaded soul files into a system prompt section.
 * Follows clawdbot's buildBootstrapContextFiles() pattern
 * from system-prompt.ts:511-528.
 */

import { getConfigSection } from "@/lib/config";
import { loadSoulFiles } from "./loader";

const DEFAULT_MAX_CHARS_PER_FILE = 20_000;

// ── Content trimming (clawdbot bootstrap.ts:91-124) ─────────────────────────

const HEAD_RATIO = 0.7;
const TAIL_RATIO = 0.2;

function trimContent(content: string, fileName: string, maxChars: number): string {
    const trimmed = content.trimEnd();
    if (trimmed.length <= maxChars) return trimmed;

    const headChars = Math.floor(maxChars * HEAD_RATIO);
    const tailChars = Math.floor(maxChars * TAIL_RATIO);
    const head = trimmed.slice(0, headChars);
    const tail = trimmed.slice(-tailChars);

    return `${head}\n\n[...truncated ${fileName}: kept ${headChars}+${tailChars} of ${trimmed.length} chars...]\n\n${tail}`;
}

// ── Main builder ─────────────────────────────────────────────────────────────

export async function buildSoulSystemPrompt(): Promise<string | null> {
    let soulConfig;
    try {
        soulConfig = await getConfigSection("soul");
    } catch {
        // Config section not available yet (e.g., during build)
        return null;
    }

    if (!soulConfig?.enabled) return null;

    const maxCharsPerFile = soulConfig.maxCharsPerFile ?? DEFAULT_MAX_CHARS_PER_FILE;

    const soulContext = await loadSoulFiles();

    // Filter out missing and empty files
    const presentFiles = soulContext.files.filter(f => !f.missing && f.content.length > 0);
    if (presentFiles.length === 0) return null;

    const lines: string[] = [];

    // Header (matches clawdbot "# Project Context")
    lines.push("# Soul Context");
    lines.push("");
    lines.push("The following personality and context files define who you are:");

    // Special SOUL.md instruction (clawdbot system-prompt.ts:519-522)
    const hasSoulFile = presentFiles.some(f => f.name === "SOUL.md");
    if (hasSoulFile) {
        lines.push(
            "If SOUL.md is present, embody its persona and tone. " +
                "Avoid stiff, generic replies; follow its guidance unless " +
                "higher-priority instructions override it.",
        );
    }
    lines.push("");

    // Each file as a section (clawdbot system-prompt.ts:525-527)
    for (const file of presentFiles) {
        const content = trimContent(file.content, file.name, maxCharsPerFile);
        lines.push(`## ${file.name}`, "", content, "");
    }

    return lines.join("\n");
}
