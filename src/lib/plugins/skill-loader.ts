/**
 * SKILL.md Filesystem Loader
 *
 * Loads ClawdBot-style SKILL.md files from disk and registers them
 * as plugins. Supports:
 * - Local skills directory (./skills/)
 * - Clawdbot source directory (configurable)
 * - Filtering by enabled skills list
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { Plugin } from "./runtime";
import type { PluginManifest, PluginContext, PluginExecutionResult } from "./runtime";
import { isLocalMode } from "@/lib/admin/settings";
import { getConfig } from "@/lib/config";

interface SkillMdFrontmatter {
    name?: string;
    slug?: string;
    version?: string;
    description?: string;
    author?: string;
    icon?: string;
    category?: string;
    permissions?: string[];
}

/**
 * A Plugin backed by a SKILL.md file on disk.
 * Exposes a single `get_instructions` tool that returns the markdown body.
 */
export class SkillMdPlugin extends Plugin {
    manifest: PluginManifest;
    private instructions: string;

    constructor(dirname: string, frontmatter: SkillMdFrontmatter, body: string) {
        super();
        this.sourceType = "custom";
        const slug = frontmatter.slug || `skillmd-${dirname}`;

        this.instructions = body;
        this.manifest = {
            name: frontmatter.name || dirname,
            slug,
            version: frontmatter.version || "1.0.0",
            description: frontmatter.description,
            author: frontmatter.author,
            icon: frontmatter.icon,
            category: (frontmatter.category as PluginManifest["category"]) || "other",
            permissions: (frontmatter.permissions as PluginManifest["permissions"]) || [],
            tools: [
                {
                    name: "get_instructions",
                    description: `Get the instructions/knowledge for the "${frontmatter.name || dirname}" skill`,
                    parameters: {
                        type: "object" as const,
                        properties: {},
                    },
                },
            ],
        };
    }

    async execute(
        toolName: string,
        _args: Record<string, unknown>,
        _context: PluginContext
    ): Promise<PluginExecutionResult> {
        if (toolName === "get_instructions") {
            return {
                success: true,
                output: this.instructions,
                data: { instructions: this.instructions },
            };
        }

        return {
            success: false,
            error: `Unknown tool: ${toolName}`,
        };
    }
}

/**
 * Parse a single SKILL.md file and return a SkillMdPlugin.
 */
function parseSkillMd(filePath: string, dirname: string): SkillMdPlugin | null {
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const { data, content: body } = matter(content);
        return new SkillMdPlugin(dirname, data as SkillMdFrontmatter, body.trim());
    } catch (error) {
        console.error(`[SkillLoader] Failed to parse ${filePath}:`, error);
        return null;
    }
}

/**
 * Scan directories for SKILL.md files and return an array of SkillMdPlugin instances.
 * Each subdirectory with a SKILL.md is loaded as a separate skill.
 *
 * @param directories - Array of directory paths to scan
 * @param enabledSkills - Optional list of skill slugs to load (empty = all)
 * @returns Array of SkillMdPlugin instances
 */
export function loadSkillMdFiles(
    directories: string[],
    enabledSkills?: string[]
): SkillMdPlugin[] {
    if (!isLocalMode()) {
        return [];
    }

    const plugins: SkillMdPlugin[] = [];
    const enabledSet = enabledSkills?.length ? new Set(enabledSkills) : null;

    for (const dir of directories) {
        if (!fs.existsSync(dir)) {
            continue;
        }

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const skillMdPath = path.join(dir, entry.name, "SKILL.md");
                if (fs.existsSync(skillMdPath)) {
                    const plugin = parseSkillMd(skillMdPath, entry.name);
                    if (plugin) {
                        // Check if this skill is enabled (if filter provided)
                        if (enabledSet && !enabledSet.has(plugin.manifest.slug) && !enabledSet.has(entry.name)) {
                            continue;
                        }
                        plugins.push(plugin);
                        console.log(`[SkillLoader] Loaded skill: ${plugin.manifest.slug} from ${skillMdPath}`);
                    }
                }
            }
        } catch (error) {
            console.error(`[SkillLoader] Failed to scan directory ${dir}:`, error);
        }
    }

    return plugins;
}

/**
 * Get the list of directories to scan for SKILL.md files.
 */
export function getSkillDirectories(): string[] {
    const dirs: string[] = [];

    // From environment variable
    if (process.env.MAIACHAT_SKILLS_DIR) {
        dirs.push(process.env.MAIACHAT_SKILLS_DIR);
    }

    // Default: ./skills/ relative to project root
    const defaultDir = path.join(process.cwd(), "skills");
    if (!dirs.includes(defaultDir)) {
        dirs.push(defaultDir);
    }

    return dirs;
}

/**
 * Get skill directories based on unified config
 */
export async function getSkillDirectoriesFromConfig(): Promise<string[]> {
    const dirs = getSkillDirectories();

    try {
        const config = await getConfig();

        // Add Clawdbot source directory if enabled
        if (config.skills.clawdbotSkillsEnabled) {
            let clawdbotPath = config.skills.clawdbotSourcePath;

            // Handle relative paths
            if (!path.isAbsolute(clawdbotPath)) {
                clawdbotPath = path.join(process.cwd(), clawdbotPath);
            }

            const skillsDir = path.join(clawdbotPath, "skills");
            if (fs.existsSync(skillsDir) && !dirs.includes(skillsDir)) {
                dirs.push(skillsDir);
                console.log(`[SkillLoader] Added Clawdbot skills directory: ${skillsDir}`);
            }
        }
    } catch (error) {
        console.warn("[SkillLoader] Error loading config:", error);
    }

    return dirs;
}

/**
 * Load skills using unified config (async version)
 */
export async function loadSkillsFromConfig(): Promise<SkillMdPlugin[]> {
    if (!isLocalMode()) {
        return [];
    }

    try {
        const config = await getConfig();
        const directories = await getSkillDirectoriesFromConfig();
        const enabledSkills = config.skills.enabledSkills.length > 0
            ? config.skills.enabledSkills
            : undefined;

        return loadSkillMdFiles(directories, enabledSkills);
    } catch (error) {
        console.error("[SkillLoader] Error loading skills from config:", error);
        return loadSkillMdFiles(getSkillDirectories());
    }
}

/**
 * List available skills without loading them
 */
export async function listAvailableSkills(): Promise<Array<{
    slug: string;
    name: string;
    description?: string;
    directory: string;
    isEnabled: boolean;
}>> {
    const config = await getConfig();
    const directories = await getSkillDirectoriesFromConfig();
    const enabledSet = new Set(config.skills.enabledSkills);
    const skills: Array<{
        slug: string;
        name: string;
        description?: string;
        directory: string;
        isEnabled: boolean;
    }> = [];

    for (const dir of directories) {
        if (!fs.existsSync(dir)) continue;

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const skillMdPath = path.join(dir, entry.name, "SKILL.md");
                if (fs.existsSync(skillMdPath)) {
                    try {
                        const content = fs.readFileSync(skillMdPath, "utf-8");
                        const { data } = matter(content);
                        const fm = data as SkillMdFrontmatter;
                        const slug = fm.slug || `skillmd-${entry.name}`;

                        skills.push({
                            slug,
                            name: fm.name || entry.name,
                            description: fm.description,
                            directory: dir,
                            isEnabled: enabledSet.size === 0 || enabledSet.has(slug) || enabledSet.has(entry.name),
                        });
                    } catch {
                        // Skip invalid files
                    }
                }
            }
        } catch {
            // Skip inaccessible directories
        }
    }

    return skills;
}
