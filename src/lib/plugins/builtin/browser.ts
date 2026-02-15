import { Plugin, PluginManifest, PluginContext, PluginExecutionResult } from '../runtime';
import { browserService } from '@/lib/tools/browser/service';

export class BrowserPlugin extends Plugin {
    manifest: PluginManifest = {
        name: 'Browser Automation',
        slug: 'browser',
        version: '1.0.0',
        description: 'Control a web browser to navigate, click, and extract information',
        category: 'utility',
        permissions: ['browser_automation'],
        tools: [
            {
                name: 'open',
                description: 'Open a new browser session',
                parameters: { type: 'object', properties: {} },
            },
            {
                name: 'navigate',
                description: 'Navigate to a URL',
                parameters: {
                    type: 'object',
                    properties: {
                        sessionId: { type: 'string' },
                        url: { type: 'string' },
                    },
                    required: ['sessionId', 'url'],
                },
            },
            {
                name: 'screenshot',
                description: 'Take a screenshot of the current page',
                parameters: {
                    type: 'object',
                    properties: { sessionId: { type: 'string' } },
                    required: ['sessionId'],
                },
            },
            {
                name: 'click',
                description: 'Click an element by selector',
                parameters: {
                    type: 'object',
                    properties: {
                        sessionId: { type: 'string' },
                        selector: { type: 'string' },
                    },
                    required: ['sessionId', 'selector'],
                },
            },
            {
                name: 'type',
                description: 'Type text into an input field',
                parameters: {
                    type: 'object',
                    properties: {
                        sessionId: { type: 'string' },
                        selector: { type: 'string' },
                        text: { type: 'string' },
                    },
                    required: ['sessionId', 'selector', 'text'],
                },
            },
            {
                name: 'extract',
                description: 'Extract text content from the page',
                parameters: {
                    type: 'object',
                    properties: { sessionId: { type: 'string' } },
                    required: ['sessionId'],
                },
            },
            {
                name: 'close',
                description: 'Close the browser session',
                parameters: {
                    type: 'object',
                    properties: { sessionId: { type: 'string' } },
                    required: ['sessionId'],
                },
            },
        ],
    };

    async execute(
        toolName: string,
        args: Record<string, unknown>,
        context: PluginContext
    ): Promise<PluginExecutionResult> {
        try {
            switch (toolName) {
                case 'open': {
                    const sessionId = await browserService.createSession(context.userId);
                    return { success: true, output: `Browser session created: ${sessionId}`, metadata: { sessionId } };
                }

                case 'navigate': {
                    const result = await browserService.navigate(
                        args.sessionId as string,
                        args.url as string
                    );
                    return { success: true, output: `Navigated to: ${result.title}`, metadata: result };
                }

                case 'screenshot': {
                    const buffer = await browserService.screenshot(args.sessionId as string);
                    const base64 = buffer.toString('base64');
                    return {
                        success: true,
                        output: 'Screenshot captured',
                        metadata: { image: `data:image/png;base64,${base64}` },
                    };
                }

                case 'click': {
                    await browserService.click(args.sessionId as string, args.selector as string);
                    return { success: true, output: `Clicked: ${args.selector}` };
                }

                case 'type': {
                    await browserService.type(
                        args.sessionId as string,
                        args.selector as string,
                        args.text as string
                    );
                    return { success: true, output: `Typed into: ${args.selector}` };
                }

                case 'extract': {
                    const content = await browserService.getContent(args.sessionId as string);
                    // Extract text only, strip HTML
                    const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    return { success: true, output: textContent.slice(0, 5000) };
                }

                case 'close': {
                    await browserService.closeSession(args.sessionId as string);
                    return { success: true, output: 'Browser session closed' };
                }

                default:
                    return { success: false, error: `Unknown tool: ${toolName}` };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Browser operation failed',
            };
        }
    }
}
