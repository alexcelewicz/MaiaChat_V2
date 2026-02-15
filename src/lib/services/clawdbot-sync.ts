/**
 * Clawdbot Sync Service
 *
 * Fetches skills directly from GitHub API - no git required.
 * Auto-syncs on startup and daily.
 *
 * @see UNIFIED_ROADMAP.md Phase 6
 */

import { db } from "@/lib/db";
import { skills } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_REPO_OWNER = "openclaw";
const GITHUB_REPO_NAME = "openclaw";
const GITHUB_SKILLS_PATH = "skills";
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";

// Local directory for companion files (scripts, configs, etc.)
const SKILLS_DATA_DIR = process.env.MAIACHAT_SKILLS_DATA_DIR
    || path.join(process.cwd(), "skills-data");

export function getSkillDataDir(slug: string): string {
    return path.join(SKILLS_DATA_DIR, slug);
}

// Cache sync status
let lastSyncTime: Date | null = null;
let syncInProgress = false;

// ============================================================================
// Types
// ============================================================================

export interface SkillMetadata {
    slug: string;
    name: string;
    description?: string;
    version?: string;
    author?: string;
    icon?: string;
    category?: string;
    homepage?: string;
    permissions?: string[];
    requires?: {
        bins?: string[];
        env?: string[];
        platforms?: string[];
    };
    content?: string;
}

export interface SyncStatus {
    lastSyncTime: string | null;
    syncInProgress: boolean;
    skillsCount: number;
    source: string;
}

export interface SyncResult {
    success: boolean;
    message: string;
    skillsAdded: number;
    skillsUpdated: number;
    skillsTotal: number;
}

interface GitHubContent {
    name: string;
    path: string;
    type: "file" | "dir";
    download_url?: string;
}

// ============================================================================
// GitHub API Functions
// ============================================================================

/**
 * Fetch directory contents from GitHub API
 */
async function fetchGitHubDirectory(path: string): Promise<GitHubContent[]> {
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}`;

    const response = await fetch(url, {
        headers: {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "MaiaChat-SkillSync",
        },
    });

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Fetch raw file content from GitHub
 */
async function fetchGitHubFile(path: string): Promise<string> {
    const url = `${GITHUB_RAW_BASE}/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/main/${path}`;

    const response = await fetch(url, {
        headers: {
            "User-Agent": "MaiaChat-SkillSync",
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
    }

    return response.text();
}

/**
 * Parse SKILL.md frontmatter (simple YAML parser)
 */
function parseSkillMd(content: string, dirname: string): SkillMetadata | null {
    try {
        // Check for frontmatter
        if (!content.startsWith("---")) {
            return {
                slug: dirname,
                name: dirname,
                content,
            };
        }

        const endIndex = content.indexOf("---", 3);
        if (endIndex === -1) {
            return {
                slug: dirname,
                name: dirname,
                content,
            };
        }

        const frontmatter = content.slice(3, endIndex).trim();
        const body = content.slice(endIndex + 3).trim();

        // Simple YAML parsing (key: value)
        const metadata: Record<string, string> = {};
        const lines = frontmatter.split("\n");

        for (const line of lines) {
            const colonIndex = line.indexOf(":");
            if (colonIndex > 0) {
                const key = line.slice(0, colonIndex).trim();
                let value = line.slice(colonIndex + 1).trim();
                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                metadata[key] = value;
            }
        }

        return {
            slug: metadata.slug || dirname,
            name: metadata.name || dirname,
            description: metadata.description,
            version: metadata.version,
            author: metadata.author,
            icon: metadata.icon || metadata.emoji,
            category: metadata.category,
            homepage: metadata.homepage,
            content: body,
        };
    } catch (error) {
        console.error(`[ClawdbotSync] Failed to parse SKILL.md for ${dirname}:`, error);
        return null;
    }
}

// ============================================================================
// Sync Functions
// ============================================================================

/**
 * Download companion files (scripts, configs, etc.) for a skill from GitHub.
 * Skips SKILL.md since it's already stored in the database.
 * Failures here don't block the overall sync.
 */
async function syncSkillCompanionFiles(slug: string, githubDirPath: string): Promise<number> {
    let count = 0;
    try {
        const entries = await fetchGitHubDirectory(githubDirPath);

        for (const entry of entries) {
            if (entry.type === "file") {
                // Skip SKILL.md — already handled by DB storage
                if (entry.name === "SKILL.md") continue;

                try {
                    const content = await fetchGitHubFile(entry.path);
                    const localPath = path.join(getSkillDataDir(slug), path.relative(`${GITHUB_SKILLS_PATH}/${slug}`, entry.path));
                    await fs.mkdir(path.dirname(localPath), { recursive: true });
                    await fs.writeFile(localPath, content, "utf-8");
                    count++;
                } catch (error) {
                    console.error(`[ClawdbotSync] Failed to download ${entry.path}:`, error);
                }
            } else if (entry.type === "dir") {
                // Recurse into subdirectories
                count += await syncSkillCompanionFiles(slug, entry.path);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    } catch (error) {
        console.error(`[ClawdbotSync] Failed to sync companion files for ${slug}:`, error);
    }
    return count;
}

/**
 * Sync skills from GitHub to database
 */
export async function syncSkillsFromGitHub(): Promise<SyncResult> {
    if (syncInProgress) {
        return {
            success: false,
            message: "Sync already in progress",
            skillsAdded: 0,
            skillsUpdated: 0,
            skillsTotal: 0,
        };
    }

    syncInProgress = true;
    let skillsAdded = 0;
    let skillsUpdated = 0;

    try {
        console.log("[ClawdbotSync] Starting sync from GitHub...");

        // Fetch list of skill directories
        const skillDirs = await fetchGitHubDirectory(GITHUB_SKILLS_PATH);
        const directories = skillDirs.filter(item => item.type === "dir");

        console.log(`[ClawdbotSync] Found ${directories.length} skill directories`);

        for (const dir of directories) {
            try {
                // Fetch SKILL.md content
                const skillMdPath = `${GITHUB_SKILLS_PATH}/${dir.name}/SKILL.md`;
                const content = await fetchGitHubFile(skillMdPath);

                const metadata = parseSkillMd(content, dir.name);
                if (!metadata) continue;

                // Check if skill exists in database
                const [existing] = await db.select()
                    .from(skills)
                    .where(eq(skills.slug, metadata.slug))
                    .limit(1);

                if (existing) {
                    // Update existing skill
                    await db.update(skills)
                        .set({
                            name: metadata.name,
                            description: metadata.description || null,
                            version: metadata.version || "1.0.0",
                            icon: metadata.icon || null,
                            category: metadata.category || "community",
                            sourceUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/tree/main/skills/${metadata.slug}`,
                            toolDefinitions: metadata.content ? { prompt: metadata.content } : null,
                            updatedAt: new Date(),
                        })
                        .where(eq(skills.id, existing.id));
                    skillsUpdated++;
                } else {
                    // Insert new skill
                    await db.insert(skills).values({
                        slug: metadata.slug,
                        name: metadata.name,
                        description: metadata.description || null,
                        version: metadata.version || "1.0.0",
                        icon: metadata.icon || null,
                        category: metadata.category || "community",
                        isBuiltin: false,
                        sourceType: "marketplace",
                        sourceUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/tree/main/skills/${metadata.slug}`,
                        permissions: [],
                        configSchema: null,
                        toolDefinitions: metadata.content ? { prompt: metadata.content } : null,
                    });
                    skillsAdded++;
                }

                // Download companion files (scripts, configs, etc.)
                const companionFiles = await syncSkillCompanionFiles(metadata.slug, `${GITHUB_SKILLS_PATH}/${dir.name}`);
                if (companionFiles > 0) {
                    console.log(`[ClawdbotSync] Downloaded ${companionFiles} companion files for ${metadata.slug}`);
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`[ClawdbotSync] Failed to sync skill ${dir.name}:`, error);
                // Continue with other skills
            }
        }

        lastSyncTime = new Date();
        console.log(`[ClawdbotSync] Sync complete. Added: ${skillsAdded}, Updated: ${skillsUpdated}`);

        return {
            success: true,
            message: `Synced ${skillsAdded + skillsUpdated} skills from GitHub`,
            skillsAdded,
            skillsUpdated,
            skillsTotal: directories.length,
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[ClawdbotSync] Sync failed:", message);
        return {
            success: false,
            message: `Sync failed: ${message}`,
            skillsAdded,
            skillsUpdated,
            skillsTotal: 0,
        };
    } finally {
        syncInProgress = false;
    }
}

/**
 * Get current sync status
 */
export async function getSyncStatus(): Promise<SyncStatus> {
    // Count skills from community category
    const allSkills = await db.select().from(skills);
    const communitySkills = allSkills.filter(s => s.category === "community" || !s.isBuiltin);

    return {
        lastSyncTime: lastSyncTime?.toISOString() || null,
        syncInProgress,
        skillsCount: communitySkills.length,
        source: `github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
    };
}

/**
 * Check if sync is needed (more than 24 hours since last sync)
 */
export function shouldAutoSync(): boolean {
    if (!lastSyncTime) return true;

    const hoursSinceSync = (Date.now() - lastSyncTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceSync >= 24;
}

/**
 * Auto-sync if needed (called on startup)
 */
export async function autoSyncIfNeeded(): Promise<void> {
    if (shouldAutoSync()) {
        console.log("[ClawdbotSync] Auto-sync triggered");
        await syncSkillsFromGitHub();
    }
}

// ============================================================================
// Skill Types and Functions for API compatibility
// ============================================================================

export interface SkillInfo extends SkillMetadata {
    directory: string;
    filePath: string;
    isEnabled: boolean;
    compatibility: {
        compatible: boolean;
        missingBins: string[];
        missingEnv: string[];
        unsupportedPlatform: boolean;
    };
}

export async function listClawdbotSkills(): Promise<SkillInfo[]> {
    const allSkills = await db.select().from(skills);

    return allSkills
        .filter(s => !s.isBuiltin)
        .map(s => ({
            slug: s.slug,
            name: s.name,
            description: s.description || undefined,
            version: s.version,
            icon: s.icon || undefined,
            category: s.category || undefined,
            directory: s.slug,
            filePath: `github:${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/skills/${s.slug}/SKILL.md`,
            isEnabled: s.isEnabled ?? true,
            compatibility: {
                compatible: true,
                missingBins: [],
                missingEnv: [],
                unsupportedPlatform: false,
            },
        }));
}

export async function getSkillBySlug(slug: string): Promise<SkillInfo | null> {
    const allSkills = await listClawdbotSkills();
    return allSkills.find(s => s.slug === slug || s.directory === slug) || null;
}

export async function enableSkill(slug: string): Promise<{ success: boolean; error?: string }> {
    try {
        await db.update(skills).set({ isEnabled: true, updatedAt: new Date() })
            .where(eq(skills.slug, slug));
        console.log(`[ClawdbotSync] Enabled skill: ${slug}`);
        return { success: true };
    } catch (error) {
        console.error(`[ClawdbotSync] Failed to enable skill ${slug}:`, error);
        return { success: false, error: String(error) };
    }
}

export async function disableSkill(slug: string): Promise<{ success: boolean; error?: string }> {
    try {
        await db.update(skills).set({ isEnabled: false, updatedAt: new Date() })
            .where(eq(skills.slug, slug));
        console.log(`[ClawdbotSync] Disabled skill: ${slug}`);
        return { success: true };
    } catch (error) {
        console.error(`[ClawdbotSync] Failed to disable skill ${slug}:`, error);
        return { success: false, error: String(error) };
    }
}

export async function updateEnabledSkills(slugs: string[]): Promise<{ success: boolean; error?: string }> {
    try {
        // Disable all marketplace skills first
        await db.update(skills).set({ isEnabled: false, updatedAt: new Date() })
            .where(eq(skills.sourceType, 'marketplace'));
        // Enable the specified slugs
        for (const slug of slugs) {
            await db.update(skills).set({ isEnabled: true, updatedAt: new Date() })
                .where(eq(skills.slug, slug));
        }
        console.log(`[ClawdbotSync] Updated enabled skills: ${slugs.length} enabled`);
        return { success: true };
    } catch (error) {
        console.error(`[ClawdbotSync] Failed to update enabled skills:`, error);
        return { success: false, error: String(error) };
    }
}

export async function getSkillsByCategory(): Promise<Record<string, SkillInfo[]>> {
    const allSkills = await listClawdbotSkills();
    const categories: Record<string, SkillInfo[]> = {};

    for (const skill of allSkills) {
        const category = skill.category || "other";
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(skill);
    }

    return categories;
}

export async function getCompatibleSkills(): Promise<SkillInfo[]> {
    const allSkills = await listClawdbotSkills();
    return allSkills.filter(s => s.compatibility.compatible);
}

export async function getSkillStats(): Promise<{
    total: number;
    compatible: number;
    incompatible: number;
    enabled: number;
    byCategory: Record<string, number>;
}> {
    const allSkills = await db.select().from(skills);
    const communitySkills = allSkills.filter(s => !s.isBuiltin);

    const byCategory: Record<string, number> = {};
    for (const skill of communitySkills) {
        const cat = skill.category || "other";
        byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    return {
        total: communitySkills.length,
        compatible: communitySkills.length,
        incompatible: 0,
        enabled: communitySkills.length,
        byCategory,
    };
}
