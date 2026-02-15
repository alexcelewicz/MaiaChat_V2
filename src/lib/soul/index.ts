/**
 * Soul Personality System
 *
 * Loads markdown personality files from disk and composes them
 * into system prompt context for every conversation.
 */

export { buildSoulSystemPrompt } from "./prompt-builder";
export { loadSoulFiles, invalidateSoulCache } from "./loader";
export type { SoulFile, SoulContext, SoulFileName } from "./loader";
