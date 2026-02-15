/**
 * Plugin Utilities
 *
 * Shared utilities for the plugin system, used by chat route,
 * channel processor, and multi-agent graph.
 */

import { z } from 'zod';

/**
 * Convert JSON-Schema style plugin parameters to a Zod schema.
 * Used when registering plugin tools with the AI SDK.
 */
export function buildPluginInputSchema(parameters?: {
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; default?: unknown }>;
    required?: string[];
}) {
    if (!parameters?.properties) {
        return z.object({});
    }

    const requiredSet = new Set(parameters.required || []);
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, prop] of Object.entries(parameters.properties)) {
        let schema: z.ZodTypeAny = z.any();
        if (prop?.enum && prop.enum.length > 0) {
            schema = z.enum(prop.enum as [string, ...string[]]);
        } else if (prop?.type === 'string') {
            schema = z.string();
        } else if (prop?.type === 'number') {
            schema = z.number();
        } else if (prop?.type === 'boolean') {
            schema = z.boolean();
        } else if (prop?.type === 'array') {
            schema = z.array(z.any());
        } else if (prop?.type === 'object') {
            schema = z.record(z.string(), z.any());
        }

        // Add description for better tool use by AI models
        if (prop?.description) {
            schema = schema.describe(prop.description);
        }

        if (!requiredSet.has(key)) {
            schema = schema.optional();
        }
        shape[key] = schema;
    }

    return z.object(shape);
}
