/**
 * Plugin Runtime
 *
 * Core plugin system for MaiaChat. Manages plugin registration,
 * execution, and user skill management.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { skills, userSkills } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getUserProfile } from '@/lib/memory/user-profile';
import { getDeploymentMode } from '@/lib/admin/settings';
import path from 'path';

// ============================================================================
// Plugin Manifest Schema
// ============================================================================

export const PluginManifestSchema = z.object({
    name: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    version: z.string(),
    description: z.string().optional(),
    author: z.string().optional(),
    icon: z.string().optional(),
    category: z.enum([
        'productivity',
        'communication',
        'development',
        'utility',
        'search',
        'automation',
        'other'
    ]).optional(),

    // Permissions required by this plugin
    permissions: z.array(z.enum([
        'read_messages',
        'send_messages',
        'web_search',
        'browser_automation',
        'file_access',
        'api_calls',
        'database_access',
    ])).default([]),

    // Configuration schema for user settings
    configSchema: z.record(z.string(), z.object({
        type: z.enum(['string', 'number', 'boolean', 'select', 'secret']),
        label: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional(),
        default: z.unknown().optional(),
        options: z.array(z.object({
            value: z.string(),
            label: z.string(),
        })).optional(),
    })).optional(),

    // Tool definitions exposed to the AI
    tools: z.array(z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.object({
            type: z.literal('object'),
            properties: z.record(z.string(), z.object({
                type: z.string(),
                description: z.string().optional(),
                enum: z.array(z.string()).optional(),
                default: z.unknown().optional(),
            })),
            required: z.array(z.string()).optional(),
        }),
    })).optional(),

    // Trigger definitions
    triggers: z.array(z.object({
        type: z.enum(['keyword', 'regex', 'schedule', 'webhook', 'event']),
        pattern: z.string().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// ============================================================================
// Plugin Types
// ============================================================================

export interface PluginContext {
    userId: string;
    conversationId?: string;
    channelType?: string;
    channelId?: string;
    agentId?: string;
    config: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface PluginExecutionResult {
    success: boolean;
    output?: string;
    data?: unknown;
    error?: string;
    metadata?: Record<string, unknown>;
}

export interface PluginToolCall {
    pluginSlug: string;
    toolName: string;
    arguments: Record<string, unknown>;
}

export interface PluginExecutionOptions {
    autoEnableIfNeeded?: boolean;
}

// ============================================================================
// Plugin Abstract Class
// ============================================================================

export abstract class Plugin {
    abstract manifest: PluginManifest;

    /** Source type: 'builtin' for built-in plugins, 'custom' for SKILL.md loaded */
    sourceType: "builtin" | "marketplace" | "custom" = "builtin";

    /**
     * Initialize the plugin (called once on load)
     */
    async initialize(): Promise<void> {
        // Override in subclass if needed
    }

    /**
     * Cleanup the plugin (called on shutdown)
     */
    async cleanup(): Promise<void> {
        // Override in subclass if needed
    }

    /**
     * Execute a tool
     */
    abstract execute(
        toolName: string,
        args: Record<string, unknown>,
        context: PluginContext
    ): Promise<PluginExecutionResult>;

    /**
     * Validate user configuration
     */
    validateConfig(config: Record<string, unknown>): boolean {
        if (!this.manifest.configSchema) return true;

        for (const [key, schema] of Object.entries(this.manifest.configSchema)) {
            if (schema.required && (config[key] === undefined || config[key] === null)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get tool definitions for AI
     */
    getToolDefinitions(): Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    }> {
        if (!this.manifest.tools) return [];

        return this.manifest.tools.map(tool => ({
            type: 'function' as const,
            function: {
                name: `${this.manifest.slug}__${tool.name}`,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));
    }
}

// ============================================================================
// Marketplace Plugin (DB-backed skills from GitHub sync)
// ============================================================================

/**
 * A Plugin backed by a marketplace skill record in the database.
 * Similar to SkillMdPlugin but loaded from DB instead of filesystem.
 * Exposes a single `get_instructions` tool that returns the prompt content.
 */
class MarketplacePlugin extends Plugin {
    manifest: PluginManifest;
    private instructions: string;

    constructor(record: {
        slug: string;
        name: string;
        description: string | null;
        version: string;
        icon: string | null;
        category: string | null;
        toolDefinitions: unknown;
    }) {
        super();
        this.sourceType = "marketplace";

        // Extract prompt from toolDefinitions (stored as { prompt: "..." } by clawdbot-sync)
        const toolDefs = record.toolDefinitions as { prompt?: string } | null;
        this.instructions = toolDefs?.prompt || "";

        // Resolve {baseDir} placeholder to the local skill data directory
        const skillDataDir = path.join(
            process.env.MAIACHAT_SKILLS_DATA_DIR || path.join(process.cwd(), "skills-data"),
            record.slug
        ).replace(/\\/g, '/');  // Normalize to forward slashes for shell compatibility
        this.instructions = this.instructions.replace(/\{baseDir\}/g, skillDataDir);

        this.manifest = {
            name: record.name,
            slug: record.slug,
            version: record.version || "1.0.0",
            description: record.description || undefined,
            icon: record.icon || undefined,
            category: (record.category as PluginManifest["category"]) || "other",
            permissions: [],
            tools: [
                {
                    name: "get_instructions",
                    description: `Get the instructions/knowledge for the "${record.name}" skill`,
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

// ============================================================================
// Plugin Registry
// ============================================================================

class PluginRegistry {
    private plugins: Map<string, Plugin> = new Map();
    private initialized = false;

    /**
     * Register a plugin
     */
    register(plugin: Plugin): void {
        if (this.plugins.has(plugin.manifest.slug)) {
            console.warn(`[Plugins] Plugin already registered: ${plugin.manifest.slug}`);
            return;
        }
        this.plugins.set(plugin.manifest.slug, plugin);
        console.log(`[Plugins] Registered: ${plugin.manifest.slug} (source=${plugin.sourceType}, tools=${plugin.manifest.tools?.length ?? 0})`);
    }

    /**
     * Unregister a plugin
     */
    unregister(slug: string): void {
        const plugin = this.plugins.get(slug);
        if (plugin) {
            plugin.cleanup().catch(console.error);
            this.plugins.delete(slug);
        }
    }

    /**
     * Get a plugin by slug
     */
    get(slug: string): Plugin | undefined {
        return this.plugins.get(slug);
    }

    /**
     * List all registered plugins
     */
    list(): Plugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Get all tool definitions from all plugins
     */
    getAllToolDefinitions(): Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    }> {
        const tools: Array<{
            type: 'function';
            function: {
                name: string;
                description: string;
                parameters: Record<string, unknown>;
            };
        }> = [];

        for (const plugin of this.plugins.values()) {
            tools.push(...plugin.getToolDefinitions());
        }

        return tools;
    }

    /**
     * Load and initialize all built-in plugins
     */
    async loadBuiltinPlugins(): Promise<void> {
        if (this.initialized) return;

        try {
            const builtins = await import('./builtin');

            for (const [name, PluginClass] of Object.entries(builtins)) {
                if (typeof PluginClass === 'function' && name.endsWith('Plugin')) {
                    try {
                        const instance = new (PluginClass as new () => Plugin)();
                        await instance.initialize();
                        this.register(instance);
                    } catch (error) {
                        console.error(`[Plugins] Failed to load ${name}:`, error);
                    }
                }
            }

            this.initialized = true;
            console.log(`[Plugins] Loaded ${this.plugins.size} built-in plugins`);
        } catch (error) {
            console.error('[Plugins] Failed to load built-in plugins:', error);
        }
    }

    /**
     * Sync plugins to database
     */
    async syncToDatabase(): Promise<void> {
        for (const plugin of this.plugins.values()) {
            // Marketplace plugins are managed by clawdbot-sync, don't overwrite
            if (plugin.sourceType === 'marketplace') {
                continue;
            }
            try {
                // Check if skill exists
                const [existing] = await db.select()
                    .from(skills)
                    .where(eq(skills.slug, plugin.manifest.slug));

                if (existing) {
                    // Update existing skill
                    await db.update(skills)
                        .set({
                            name: plugin.manifest.name,
                            description: plugin.manifest.description || null,
                            version: plugin.manifest.version,
                            icon: plugin.manifest.icon || null,
                            category: plugin.manifest.category || 'other',
                            configSchema: plugin.manifest.configSchema || null,
                            toolDefinitions: plugin.manifest.tools || null,
                            permissions: plugin.manifest.permissions,
                            updatedAt: new Date(),
                        })
                        .where(eq(skills.id, existing.id));
                } else {
                    // Create new skill
                    await db.insert(skills).values({
                        slug: plugin.manifest.slug,
                        name: plugin.manifest.name,
                        description: plugin.manifest.description || null,
                        version: plugin.manifest.version,
                        icon: plugin.manifest.icon || null,
                        category: plugin.manifest.category || 'other',
                        isBuiltin: plugin.sourceType === 'builtin',
                        sourceType: plugin.sourceType,
                        configSchema: plugin.manifest.configSchema || null,
                        toolDefinitions: plugin.manifest.tools || null,
                        permissions: plugin.manifest.permissions,
                    });
                }
            } catch (error) {
                console.error(`[Plugins] Failed to sync ${plugin.manifest.slug}:`, error);
            }
        }
    }

    /**
     * Load SKILL.md plugins from filesystem (local/self-hosted only)
     * Uses unified config system for directories and enabled skills
     */
    async loadSkillMdPlugins(): Promise<void> {
        try {
            const { loadSkillsFromConfig } = await import('./skill-loader');
            const skillPlugins = await loadSkillsFromConfig();

            for (const plugin of skillPlugins) {
                try {
                    await plugin.initialize();
                    this.register(plugin);
                } catch (error) {
                    console.error(`[Plugins] Failed to load SKILL.md plugin ${plugin.manifest.slug}:`, error);
                }
            }

            if (skillPlugins.length > 0) {
                console.log(`[Plugins] Loaded ${skillPlugins.length} SKILL.md plugins`);
            }
        } catch (error) {
            console.error('[Plugins] Failed to load SKILL.md plugins:', error);
        }
    }

    /**
     * Reload SKILL.md plugins (after config change)
     */
    async reloadSkillMdPlugins(): Promise<void> {
        // Unregister existing custom plugins
        for (const plugin of this.plugins.values()) {
            if (plugin.sourceType === 'custom') {
                this.unregister(plugin.manifest.slug);
            }
        }

        // Load fresh from config
        await this.loadSkillMdPlugins();
        await this.syncToDatabase();
    }

    /**
     * Load marketplace skills from database (synced via clawdbot-sync)
     * These are community/marketplace skills stored with sourceType='marketplace'
     * and toolDefinitions containing { prompt: "..." }
     */
    async loadMarketplacePlugins(): Promise<void> {
        try {
            const marketplaceSkills = await db.select()
                .from(skills)
                .where(and(eq(skills.sourceType, 'marketplace'), eq(skills.isEnabled, true)));

            let loaded = 0;
            for (const record of marketplaceSkills) {
                // Skip if already registered (e.g., by builtin or custom loader)
                if (this.plugins.has(record.slug)) {
                    continue;
                }

                // Skip if no prompt content
                const toolDefs = record.toolDefinitions as { prompt?: string } | null;
                if (!toolDefs?.prompt) {
                    continue;
                }

                try {
                    const plugin = new MarketplacePlugin(record);
                    await plugin.initialize();
                    this.register(plugin);
                    loaded++;
                } catch (error) {
                    console.error(`[Plugins] Failed to load marketplace plugin ${record.slug}:`, error);
                }
            }

            if (loaded > 0) {
                console.log(`[Plugins] Loaded ${loaded} marketplace plugins from DB`);
            }
        } catch (error) {
            console.error('[Plugins] Failed to load marketplace plugins:', error);
        }
    }
}

export const pluginRegistry = new PluginRegistry();

// ============================================================================
// Plugin Executor
// ============================================================================

export class PluginExecutor {
    /**
     * Execute a plugin tool
     */
    async execute(
        slug: string,
        toolName: string,
        args: Record<string, unknown>,
        context: PluginContext,
        options?: PluginExecutionOptions
    ): Promise<PluginExecutionResult> {
        const plugin = pluginRegistry.get(slug);
        if (!plugin) {
            return { success: false, error: `Plugin not found: ${slug}` };
        }

        const autoEnableIfNeeded =
            options?.autoEnableIfNeeded ?? getDeploymentMode() !== "hosted";
        const userSkillState = await this.ensureUserSkillEnabled(
            context.userId,
            slug,
            autoEnableIfNeeded
        );
        const userSkill = userSkillState?.userSkill ?? null;

        if (!userSkill) {
            return { success: false, error: `Plugin not enabled for user: ${slug}` };
        }

        // Merge user config
        const mergedContext: PluginContext = {
            ...context,
            config: (userSkill.config as Record<string, unknown>) || {},
        };

        if (slug === 'datetime') {
            const config = { ...(mergedContext.config || {}) } as Record<string, unknown>;
            if (!config.defaultTimezone) {
                try {
                    const profile = await getUserProfile(context.userId);
                    if (profile.timezone) {
                        config.defaultTimezone = profile.timezone;
                    }
                } catch {
                    // Ignore profile errors and fall back to plugin defaults
                }
            }
            mergedContext.config = config;
        }

        try {
            // Execute the tool
            const result = await plugin.execute(toolName, args, mergedContext);

            if (userSkillState?.autoEnabled) {
                result.metadata = {
                    ...(result.metadata ?? {}),
                    autoEnabledSkill: slug,
                };
            }

            // Update usage stats
            await this.recordUsage(userSkill.id);

            return result;
        } catch (error) {
            console.error(`[Plugins] Execution error for ${slug}.${toolName}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Execution failed',
            };
        }
    }

    /**
     * Execute a tool call from AI (format: plugin-slug__tool-name)
     */
    async executeToolCall(
        toolCall: PluginToolCall,
        context: Omit<PluginContext, 'config'>
    ): Promise<PluginExecutionResult> {
        return this.execute(
            toolCall.pluginSlug,
            toolCall.toolName,
            toolCall.arguments,
            { ...context, config: {} }
        );
    }

    /**
     * Parse a tool name from AI format
     */
    parseToolName(fullName: string): { pluginSlug: string; toolName: string } | null {
        const parts = fullName.split('__');
        if (parts.length !== 2) return null;
        return { pluginSlug: parts[0], toolName: parts[1] };
    }

    /**
     * Get user's enabled skill
     */
    private async getUserSkill(userId: string, slug: string, requireEnabled = true) {
        const filters = [
            eq(userSkills.userId, userId),
            eq(skills.slug, slug),
        ];

        if (requireEnabled) {
            filters.push(eq(userSkills.isEnabled, true));
        }

        const [result] = await db.select()
            .from(userSkills)
            .innerJoin(skills, eq(skills.id, userSkills.skillId))
            .where(and(...filters));

        if (!result) return null;
        return result.user_skills;
    }

    private async ensureUserSkillEnabled(
        userId: string,
        slug: string,
        autoEnableIfNeeded: boolean
    ): Promise<{ userSkill: typeof userSkills.$inferSelect; autoEnabled: boolean } | null> {
        const existing = await this.getUserSkill(userId, slug, false);
        if (existing?.isEnabled) {
            return { userSkill: existing, autoEnabled: false };
        }

        if (!autoEnableIfNeeded) {
            return null;
        }

        if (existing && !existing.isEnabled) {
            const [updated] = await db
                .update(userSkills)
                .set({
                    isEnabled: true,
                    updatedAt: new Date(),
                })
                .where(eq(userSkills.id, existing.id))
                .returning();

            if (updated) {
                console.log(`[Plugins] Auto-enabled existing skill "${slug}" for user ${userId}`);
                return { userSkill: updated, autoEnabled: true };
            }
            return null;
        }

        const [skill] = await db
            .select({ id: skills.id })
            .from(skills)
            .where(eq(skills.slug, slug))
            .limit(1);

        if (!skill) {
            return null;
        }

        const [created] = await db
            .insert(userSkills)
            .values({
                userId,
                skillId: skill.id,
                isEnabled: true,
                config: {},
            })
            .onConflictDoUpdate({
                target: [userSkills.userId, userSkills.skillId],
                set: { isEnabled: true, updatedAt: new Date() },
            })
            .returning();

        if (!created) {
            return null;
        }

        console.log(`[Plugins] Auto-enabled new skill "${slug}" for user ${userId}`);
        return { userSkill: created, autoEnabled: true };
    }

    /**
     * Record plugin usage
     */
    private async recordUsage(userSkillId: string): Promise<void> {
        try {
            await db.update(userSkills)
                .set({
                    usageCount: sql`${userSkills.usageCount} + 1`,
                    lastUsedAt: new Date(),
                })
                .where(eq(userSkills.id, userSkillId));
        } catch (error) {
            console.error('[Plugins] Failed to record usage:', error);
        }
    }
}

export const pluginExecutor = new PluginExecutor();

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the plugin system
 */
export async function initializePlugins(): Promise<void> {
    await pluginRegistry.loadBuiltinPlugins();
    await pluginRegistry.loadSkillMdPlugins();
    await pluginRegistry.loadMarketplacePlugins();
    await pluginRegistry.syncToDatabase();

    // Log summary by sourceType
    const summary: Record<string, number> = {};
    for (const plugin of pluginRegistry.list()) {
        summary[plugin.sourceType] = (summary[plugin.sourceType] || 0) + 1;
    }
    console.log(`[Plugins] Initialized ${pluginRegistry.list().length} total plugins:`, summary);
}

// Auto-initialize on import (server-side only)
if (typeof window === 'undefined') {
    initializePlugins().catch(console.error);
}
