/**
 * CLI Bridge
 *
 * Manages interactive CLI sessions, detecting when the CLI is waiting for input
 * and either answering autonomously or escalating to the user.
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import { getConfig } from "@/lib/config";

// ============================================================================
// Types
// ============================================================================

export interface CLIQuestion {
    id: string;
    question: string;
    type: "yes_no" | "selection" | "text" | "confirmation";
    options?: string[];
    context: string;
    timestamp: Date;
}

export interface CLISession {
    id: string;
    cli: "claude" | "gemini";
    task: string;
    workingDirectory: string;
    status: "running" | "waiting_input" | "completed" | "failed";
    startTime: Date;
    pendingQuestion?: CLIQuestion;
    output: string;
    process?: ChildProcess;
}

export interface AnswerResult {
    success: boolean;
    continued: boolean;
    error?: string;
}

// ============================================================================
// Question Detection Patterns
// ============================================================================

const QUESTION_PATTERNS = [
    // Yes/No questions
    { pattern: /\[y\/n\]/i, type: "yes_no" as const },
    { pattern: /\(y\/n\)/i, type: "yes_no" as const },
    { pattern: /\(yes\/no\)/i, type: "yes_no" as const },
    { pattern: /continue\?/i, type: "yes_no" as const },
    { pattern: /proceed\?/i, type: "yes_no" as const },

    // Confirmation
    { pattern: /press enter to continue/i, type: "confirmation" as const },
    { pattern: /hit enter/i, type: "confirmation" as const },

    // Selection (numbered options)
    { pattern: /\d+\)\s+.+/i, type: "selection" as const },
    { pattern: /\[\d+\]\s+.+/i, type: "selection" as const },

    // General input prompts
    { pattern: /enter.*:/i, type: "text" as const },
    { pattern: /input.*:/i, type: "text" as const },
    { pattern: /specify.*:/i, type: "text" as const },
    { pattern: />$/m, type: "text" as const },
];

// ============================================================================
// CLI Bridge Class
// ============================================================================

export class CLIBridge extends EventEmitter {
    private sessions: Map<string, CLISession> = new Map();
    private questionHandlers: Map<string, (answer: string) => void> = new Map();

    /**
     * Start a new interactive CLI session
     */
    async startSession(
        cli: "claude" | "gemini",
        task: string,
        options: {
            workingDirectory?: string;
            onOutput?: (output: string) => void;
            onQuestion?: (question: CLIQuestion) => Promise<string | null>;
            timeout?: number;
        } = {}
    ): Promise<CLISession> {
        const config = await getConfig();
        const sessionId = crypto.randomUUID();

        // Determine working directory
        let workDir = options.workingDirectory;
        if (!workDir) {
            workDir = config.cli.workspaceRoot;
            if (!path.isAbsolute(workDir)) {
                workDir = path.join(process.cwd(), workDir);
            }
        }

        // Ensure directory exists
        if (!fs.existsSync(workDir)) {
            fs.mkdirSync(workDir, { recursive: true });
        }

        const session: CLISession = {
            id: sessionId,
            cli,
            task,
            workingDirectory: workDir,
            status: "running",
            startTime: new Date(),
            output: "",
        };

        this.sessions.set(sessionId, session);

        // Build command
        const command = cli === "claude" ? "claude" : "gemini";
        const args = cli === "claude"
            ? ["--message", task]
            : [task];

        // Spawn process
        const proc = spawn(command, args, {
            cwd: workDir,
            shell: true,
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                TERM: "xterm-256color", // Enable interactive mode
            },
        });

        session.process = proc;

        let outputBuffer = "";
        let lastOutputTime = Date.now();

        // Handle stdout
        proc.stdout?.on("data", async (data) => {
            const text = data.toString();
            session.output += text;
            outputBuffer += text;
            lastOutputTime = Date.now();

            options.onOutput?.(text);
            this.emit("output", { sessionId, text });

            // Check for questions after a brief pause
            setTimeout(async () => {
                if (Date.now() - lastOutputTime >= 500) {
                    const question = this.detectQuestion(outputBuffer, sessionId);
                    if (question) {
                        session.status = "waiting_input";
                        session.pendingQuestion = question;
                        this.emit("question", { sessionId, question });

                        // Try to get an answer
                        if (options.onQuestion) {
                            const answer = await options.onQuestion(question);
                            if (answer !== null) {
                                await this.answerQuestion(sessionId, answer);
                            }
                        }
                        outputBuffer = "";
                    }
                }
            }, 500);
        });

        // Handle stderr
        proc.stderr?.on("data", (data) => {
            const text = data.toString();
            session.output += text;
            options.onOutput?.(text);
            this.emit("error", { sessionId, text });
        });

        // Handle close
        proc.on("close", (code) => {
            session.status = code === 0 ? "completed" : "failed";
            this.emit("close", { sessionId, code });
        });

        // Set timeout
        if (options.timeout) {
            setTimeout(() => {
                if (session.status === "running" || session.status === "waiting_input") {
                    proc.kill();
                    session.status = "failed";
                    this.emit("timeout", { sessionId });
                }
            }, options.timeout);
        }

        return session;
    }

    /**
     * Detect if the output contains a question
     */
    private detectQuestion(output: string, sessionId: string): CLIQuestion | null {
        // Get last few lines of output
        const lines = output.trim().split("\n").slice(-10);
        const lastText = lines.join("\n");

        for (const { pattern, type } of QUESTION_PATTERNS) {
            if (pattern.test(lastText)) {
                // Extract options for selection type
                let options: string[] | undefined;
                if (type === "selection") {
                    options = this.extractOptions(lastText);
                }

                return {
                    id: crypto.randomUUID(),
                    question: lines.slice(-3).join("\n"), // Last 3 lines as question
                    type,
                    options,
                    context: lastText,
                    timestamp: new Date(),
                };
            }
        }

        return null;
    }

    /**
     * Extract numbered options from text
     */
    private extractOptions(text: string): string[] {
        const options: string[] = [];
        const lines = text.split("\n");

        for (const line of lines) {
            // Match patterns like "1) Option" or "[1] Option"
            const match = line.match(/^[\s]*(?:\d+\)|\[\d+\])\s*(.+)$/);
            if (match) {
                options.push(match[1].trim());
            }
        }

        return options;
    }

    /**
     * Answer a pending question
     */
    async answerQuestion(sessionId: string, answer: string): Promise<AnswerResult> {
        const session = this.sessions.get(sessionId);

        if (!session) {
            return { success: false, continued: false, error: "Session not found" };
        }

        if (!session.process || session.status !== "waiting_input") {
            return { success: false, continued: false, error: "No pending question" };
        }

        try {
            session.process.stdin?.write(answer + "\n");
            session.status = "running";
            session.pendingQuestion = undefined;

            this.emit("answered", { sessionId, answer });

            return { success: true, continued: true };
        } catch (error) {
            return {
                success: false,
                continued: false,
                error: error instanceof Error ? error.message : "Failed to send answer",
            };
        }
    }

    /**
     * Get session by ID
     */
    getSession(sessionId: string): CLISession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * List all active sessions
     */
    listSessions(): CLISession[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Kill a session
     */
    killSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (session?.process) {
            session.process.kill();
            session.status = "failed";
            return true;
        }
        return false;
    }

    /**
     * Try to autonomously answer a question
     */
    async tryAutoAnswer(question: CLIQuestion, context: string): Promise<string | null> {
        // Simple heuristics for common questions
        switch (question.type) {
            case "yes_no":
                // Default to "yes" for continue/proceed questions
                if (/continue|proceed|confirm/i.test(question.question)) {
                    return "y";
                }
                // Default to "no" for destructive operations
                if (/delete|remove|overwrite|destroy/i.test(question.question)) {
                    return null; // Escalate to user
                }
                return "y"; // Default yes for other cases

            case "confirmation":
                return ""; // Just press enter

            case "selection":
                // Pick first option if only one, otherwise escalate
                if (question.options && question.options.length === 1) {
                    return "1";
                }
                return null; // Escalate for multiple options

            case "text":
                return null; // Always escalate text input
        }
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const cliBridge = new CLIBridge();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Run a CLI task with automatic question handling
 */
export async function runInteractiveCLI(
    cli: "claude" | "gemini",
    task: string,
    options: {
        workingDirectory?: string;
        timeout?: number;
        onOutput?: (output: string) => void;
        escalateQuestion?: (question: CLIQuestion) => Promise<string>;
    } = {}
): Promise<{
    success: boolean;
    output: string;
    error?: string;
    workingDirectory: string;
}> {
    return new Promise(async (resolve) => {
        const session = await cliBridge.startSession(cli, task, {
            workingDirectory: options.workingDirectory,
            timeout: options.timeout || 300000,
            onOutput: options.onOutput,
            onQuestion: async (question) => {
                // Try auto-answer first
                const autoAnswer = await cliBridge.tryAutoAnswer(question, session.output);
                if (autoAnswer !== null) {
                    return autoAnswer;
                }

                // Escalate to user if provided
                if (options.escalateQuestion) {
                    return options.escalateQuestion(question);
                }

                // Default: just press enter for confirmations, skip others
                if (question.type === "confirmation") {
                    return "";
                }

                return null;
            },
        });

        // Wait for completion
        cliBridge.once("close", ({ sessionId, code }) => {
            if (sessionId === session.id) {
                resolve({
                    success: code === 0,
                    output: session.output,
                    error: code !== 0 ? `Process exited with code ${code}` : undefined,
                    workingDirectory: session.workingDirectory,
                });
            }
        });

        cliBridge.once("timeout", ({ sessionId }) => {
            if (sessionId === session.id) {
                resolve({
                    success: false,
                    output: session.output,
                    error: "Session timed out",
                    workingDirectory: session.workingDirectory,
                });
            }
        });
    });
}
