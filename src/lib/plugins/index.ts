/**
 * Plugins Module
 *
 * Main exports for the MaiaChat plugin system.
 */

export {
    Plugin,
    PluginManifestSchema,
    pluginRegistry,
    pluginExecutor,
    initializePlugins,
} from './runtime';

export type {
    PluginManifest,
    PluginContext,
    PluginExecutionResult,
    PluginToolCall,
} from './runtime';

export { buildPluginInputSchema } from './utils';

export * from './builtin';
