/**
 * Soul File Loader
 *
 * Loads the 7 soul/personality files from disk, strips frontmatter,
 * caches results, and auto-initializes defaults on first run.
 * Modeled after clawdbot's loadWorkspaceBootstrapFiles().
 */

import fs from "fs/promises";
import path from "path";

// ── File names (same order as clawdbot workspace.ts:195-221) ─────────────────

const SOUL_FILES = [
    "SOUL.md",
    "IDENTITY.md",
    "USER.md",
    "AGENTS.md",
    "TOOLS.md",
    "HEARTBEAT.md",
    "BOOTSTRAP.md",
] as const;

export type SoulFileName = (typeof SOUL_FILES)[number];

export interface SoulFile {
    name: SoulFileName;
    content: string;
    missing: boolean;
    path: string;
}

export interface SoulContext {
    files: SoulFile[];
    totalChars: number;
    loadedAt: number;
}

// ── Directory resolution ─────────────────────────────────────────────────────

function getSoulDir(): string {
    return process.env.MAIACHAT_SOUL_DIR || path.join(process.cwd(), "data", "soul");
}

function getDefaultsDir(): string {
    return path.join(process.cwd(), "config", "soul-defaults");
}

// ── Frontmatter stripping (clawdbot workspace.ts:35-43) ─────────────────────

function stripFrontMatter(content: string): string {
    if (!content.startsWith("---")) return content;
    const endIndex = content.indexOf("\n---", 3);
    if (endIndex === -1) return content;
    return content.slice(endIndex + 4).replace(/^\s+/, "");
}

// ── Default initialization ───────────────────────────────────────────────────

let initPromise: Promise<void> | null = null;

async function initializeSoulDefaults(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = doInitializeSoulDefaults();
    return initPromise;
}

async function doInitializeSoulDefaults(): Promise<void> {

    const soulDir = getSoulDir();

    try {
        await fs.access(soulDir);
        // Directory exists — check if it has at least SOUL.md
        try {
            await fs.access(path.join(soulDir, "SOUL.md"));
            return; // Already has files
        } catch {
            // Directory exists but no SOUL.md — populate from defaults
        }
    } catch {
        // Directory doesn't exist — create it
        await fs.mkdir(soulDir, { recursive: true });
    }

    const defaultsDir = getDefaultsDir();

    for (const fileName of SOUL_FILES) {
        const src = path.join(defaultsDir, fileName);
        const dest = path.join(soulDir, fileName);
        try {
            // Don't overwrite existing files
            await fs.access(dest);
        } catch {
            try {
                await fs.copyFile(src, dest);
                console.log(`[Soul] Initialized default: ${fileName}`);
            } catch {
                console.warn(`[Soul] Default template not found: ${fileName}`);
            }
        }
    }

    console.log(`[Soul] Soul files directory: ${soulDir}`);
}

// ── Cache ────────────────────────────────────────────────────────────────────

let cachedContext: SoulContext | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

export function invalidateSoulCache(): void {
    cachedContext = null;
    cacheTimestamp = 0;
}

// ── Main loader ──────────────────────────────────────────────────────────────

export async function loadSoulFiles(): Promise<SoulContext> {
    const now = Date.now();
    if (cachedContext && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedContext;
    }

    await initializeSoulDefaults();

    const soulDir = getSoulDir();
    const files: SoulFile[] = [];

    for (const name of SOUL_FILES) {
        const filePath = path.join(soulDir, name);
        try {
            const raw = await fs.readFile(filePath, "utf-8");
            const body = stripFrontMatter(raw).trim();
            files.push({ name, content: body, missing: false, path: filePath });
        } catch {
            files.push({ name, content: "", missing: true, path: filePath });
        }
    }

    const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
    const context: SoulContext = { files, totalChars, loadedAt: now };

    cachedContext = context;
    cacheTimestamp = now;

    return context;
}
