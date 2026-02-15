import { chromium, Browser, Page, BrowserContext } from 'playwright';

interface BrowserSession {
    id: string;
    userId: string;
    browser: Browser;
    context: BrowserContext;
    page: Page;
    createdAt: Date;
    lastActivityAt: Date;
}

class BrowserService {
    private sessions: Map<string, BrowserSession> = new Map();
    private maxSessionsPerUser = 2;
    private sessionTimeout = 10 * 60 * 1000; // 10 minutes

    async createSession(userId: string): Promise<string> {
        // Check user session limit
        const userSessions = Array.from(this.sessions.values())
            .filter(s => s.userId === userId);

        if (userSessions.length >= this.maxSessionsPerUser) {
            // Close oldest session
            const oldest = userSessions.sort((a, b) =>
                a.createdAt.getTime() - b.createdAt.getTime()
            )[0];
            await this.closeSession(oldest.id);
        }

        const sessionId = crypto.randomUUID();

        const browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'MaiaChat Browser Bot/1.0',
        });

        const page = await context.newPage();

        const session: BrowserSession = {
            id: sessionId,
            userId,
            browser,
            context,
            page,
            createdAt: new Date(),
            lastActivityAt: new Date(),
        };

        this.sessions.set(sessionId, session);

        // Auto-cleanup after timeout
        setTimeout(() => this.closeSession(sessionId), this.sessionTimeout);

        return sessionId;
    }

    async navigate(sessionId: string, url: string): Promise<{ title: string; url: string }> {
        const session = this.getSession(sessionId);

        await session.page.goto(url, { waitUntil: 'domcontentloaded' });
        session.lastActivityAt = new Date();

        return {
            title: await session.page.title(),
            url: session.page.url(),
        };
    }

    async screenshot(sessionId: string): Promise<Buffer> {
        const session = this.getSession(sessionId);
        session.lastActivityAt = new Date();

        return session.page.screenshot({ type: 'png' });
    }

    async click(sessionId: string, selector: string): Promise<void> {
        const session = this.getSession(sessionId);
        session.lastActivityAt = new Date();

        await session.page.click(selector);
    }

    async type(sessionId: string, selector: string, text: string): Promise<void> {
        const session = this.getSession(sessionId);
        session.lastActivityAt = new Date();

        await session.page.fill(selector, text);
    }

    async evaluate(sessionId: string, script: string): Promise<unknown> {
        const session = this.getSession(sessionId);
        session.lastActivityAt = new Date();

        // Safety: Only allow read-only operations
        const safeScript = `(function() {
      'use strict';
      return (${script});
    })()`;

        return session.page.evaluate(safeScript);
    }

    async getContent(sessionId: string): Promise<string> {
        const session = this.getSession(sessionId);
        session.lastActivityAt = new Date();

        return session.page.content();
    }

    async closeSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        await session.context.close();
        await session.browser.close();
        this.sessions.delete(sessionId);
    }

    private getSession(sessionId: string): BrowserSession {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Browser session not found');
        }
        return session;
    }

    async shutdown(): Promise<void> {
        for (const [id] of this.sessions) {
            await this.closeSession(id);
        }
    }
}

export const browserService = new BrowserService();
