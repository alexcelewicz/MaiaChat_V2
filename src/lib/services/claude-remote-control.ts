/**
 * Claude Code Remote Control Session Manager
 *
 * Manages `claude remote-control` child processes so users can start
 * Remote Control sessions from MaiaChat channels (e.g. Telegram) and
 * continue them on their phone via claude.ai/code.
 *
 * Local-only feature — requires Claude Code CLI installed and authenticated
 * on the same machine running MaiaChat.
 */

import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { enhancedPATH, isCLIAvailable } from '@/lib/tools/coding-cli';

// ============================================================================
// Types
// ============================================================================

type SessionStatus = 'starting' | 'ready' | 'stopped' | 'failed';

interface RemoteControlSession {
  proc: ChildProcess;
  url: string | null;
  cwd: string;
  startedAt: Date;
  status: SessionStatus;
  stderrBuffer: string;
}

export interface SessionInfo {
  sessionUrl: string;
  pid: number | undefined;
  cwd: string;
  startedAt: Date;
}

// ============================================================================
// Session Manager (Singleton)
// ============================================================================

class ClaudeRemoteControlManager {
  private static instance: ClaudeRemoteControlManager | null = null;
  private activeSessions = new Map<string, RemoteControlSession>();

  private constructor() {}

  static getInstance(): ClaudeRemoteControlManager {
    if (!ClaudeRemoteControlManager.instance) {
      ClaudeRemoteControlManager.instance = new ClaudeRemoteControlManager();
    }
    return ClaudeRemoteControlManager.instance;
  }

  /**
   * Start a Remote Control session for a user.
   * Kills any existing session for that user first.
   */
  async startSession(userId: string, options?: { cwd?: string }): Promise<SessionInfo> {
    // Check Claude Code CLI availability
    const available = await isCLIAvailable('claude');
    if (!available) {
      throw new Error(
        'Claude Code CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code'
      );
    }

    // Resolve working directory
    const cwd = this.resolveWorkingDirectory(options?.cwd);

    // Kill existing session for this user
    const existing = this.activeSessions.get(userId);
    if (existing) {
      console.log(`[RemoteControl] Stopping existing session for user ${userId}`);
      await this.stopSession(userId);
    }

    // Spawn claude remote-control
    const args = ['remote-control'];
    if (cwd) {
      args.push('--cwd', cwd);
    }

    const proc = spawn('claude', args, {
      cwd: cwd || process.cwd(),
      shell: true,
      stdio: 'pipe',
      env: {
        ...process.env,
        PATH: enhancedPATH(),
        TERM: process.env.TERM || 'xterm-256color',
      },
    });

    const session: RemoteControlSession = {
      proc,
      url: null,
      cwd: cwd || process.cwd(),
      startedAt: new Date(),
      status: 'starting',
      stderrBuffer: '',
    };

    this.activeSessions.set(userId, session);

    // Wait for session URL or timeout
    return new Promise<SessionInfo>((resolve, reject) => {
      const URL_PATTERN = /https:\/\/claude\.ai\/code\S+/;
      const TIMEOUT_MS = 30_000;
      let settled = false;

      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
      };

      // Watch stdout for the session URL
      let stdoutBuffer = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const match = stdoutBuffer.match(URL_PATTERN);
        if (match && !settled) {
          session.url = match[0];
          session.status = 'ready';
          settle();
          resolve({
            sessionUrl: match[0],
            pid: proc.pid,
            cwd: session.cwd,
            startedAt: session.startedAt,
          });
        }
      });

      // Also check stderr (some CLI versions may print there)
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        session.stderrBuffer += text;
        const match = text.match(URL_PATTERN);
        if (match && !settled) {
          session.url = match[0];
          session.status = 'ready';
          settle();
          resolve({
            sessionUrl: match[0],
            pid: proc.pid,
            cwd: session.cwd,
            startedAt: session.startedAt,
          });
        }
      });

      // Clean up if process exits unexpectedly
      proc.on('close', (code) => {
        if (!settled) {
          session.status = 'failed';
          settle();
          const stderrHint = session.stderrBuffer.trim();
          reject(
            new Error(
              `claude remote-control exited with code ${code}` +
                (stderrHint ? `\n${stderrHint}` : '')
            )
          );
        } else {
          // Session was running but process died
          session.status = 'stopped';
        }
        this.activeSessions.delete(userId);
      });

      proc.on('error', (err) => {
        if (!settled) {
          session.status = 'failed';
          settle();
          reject(new Error(`Failed to spawn claude: ${err.message}`));
        }
        this.activeSessions.delete(userId);
      });

      // Timeout: no URL found within 30s
      const timer = setTimeout(() => {
        if (!settled) {
          session.status = 'failed';
          settle();
          // Kill the process since we couldn't get a URL
          try {
            proc.kill('SIGTERM');
          } catch {
            /* ignore */
          }
          this.activeSessions.delete(userId);
          const stderrHint = session.stderrBuffer.trim();
          reject(
            new Error(
              'Timed out waiting for Remote Control session URL (30s)' +
                (stderrHint ? `\n${stderrHint}` : '')
            )
          );
        }
      }, TIMEOUT_MS);
    });
  }

  /**
   * Stop a user's active session.
   */
  async stopSession(userId: string): Promise<boolean> {
    const session = this.activeSessions.get(userId);
    if (!session) return false;

    return new Promise<boolean>((resolve) => {
      const proc = session.proc;
      let killed = false;

      const onExit = () => {
        if (!killed) {
          killed = true;
          session.status = 'stopped';
          this.activeSessions.delete(userId);
          resolve(true);
        }
      };

      proc.once('close', onExit);
      proc.once('error', onExit);

      // SIGTERM first
      try {
        proc.kill('SIGTERM');
      } catch {
        // Already dead
        onExit();
        return;
      }

      // SIGKILL after 3s if still alive
      setTimeout(() => {
        if (!killed) {
          try {
            proc.kill('SIGKILL');
          } catch {
            /* ignore */
          }
          // Give it a moment then force cleanup
          setTimeout(() => {
            if (!killed) {
              killed = true;
              session.status = 'stopped';
              this.activeSessions.delete(userId);
              resolve(true);
            }
          }, 500);
        }
      }, 3000);
    });
  }

  /**
   * Get info about a user's active session.
   */
  getSession(userId: string): SessionInfo | null {
    const session = this.activeSessions.get(userId);
    if (!session || session.status !== 'ready' || !session.url) return null;

    return {
      sessionUrl: session.url,
      pid: session.proc.pid,
      cwd: session.cwd,
      startedAt: session.startedAt,
    };
  }

  /**
   * Stop all active sessions (for graceful shutdown).
   */
  async stopAll(): Promise<void> {
    const userIds = Array.from(this.activeSessions.keys());
    if (userIds.length === 0) return;

    console.log(`[RemoteControl] Stopping ${userIds.length} active session(s)...`);
    await Promise.allSettled(userIds.map((id) => this.stopSession(id)));
    console.log('[RemoteControl] All sessions stopped');
  }

  /**
   * Resolve and validate a working directory path.
   */
  private resolveWorkingDirectory(cwdInput?: string): string {
    if (!cwdInput) return process.cwd();

    // Expand ~ to home directory
    let resolved = cwdInput;
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (resolved.startsWith('~/') || resolved === '~') {
      resolved = path.join(home, resolved.slice(1));
    }

    // Make absolute
    if (!path.isAbsolute(resolved)) {
      resolved = path.resolve(resolved);
    }

    // Validate: must exist and be a directory
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory not found: ${cwdInput}`);
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${cwdInput}`);
    }

    return resolved;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const claudeRemoteControl = ClaudeRemoteControlManager.getInstance();
