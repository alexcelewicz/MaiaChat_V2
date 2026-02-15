/**
 * Autonomous Task System
 *
 * Provides Claude Code/Gemini CLI-like autonomous operation where the agent
 * works continuously on a task until completion without requiring user prompts.
 *
 * Phase 5: Agent Continuation adds:
 * - Session persistence (tasks survive restarts)
 * - Cross-task messaging
 * - Sub-task spawning
 */

export * from "./types";
export * from "./loop";
export * from "./session-manager";
