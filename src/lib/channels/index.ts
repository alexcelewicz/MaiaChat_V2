/**
 * Channel Connectors Index
 *
 * Exports all channel connectors and registers them with the ChannelManager.
 */

// Base types and classes
export * from './base';

// Manager
export * from './manager';

// Processor
export * from './processor';

// Commands (slash commands for channels)
export * from './commands';

// Background Service
export * from './background-service';

// Individual connectors
export { WebChatConnector } from './webchat/connector';
export { TelegramConnector } from './telegram/connector';
export { SlackConnector } from './slack/connector';
export { DiscordConnector } from './discord/connector';
export { WhatsAppConnector } from './whatsapp/connector';
export { SignalConnector } from './signal/connector';
export { TeamsConnector } from './teams/connector';

// Register connectors with the manager
import { registerConnector } from './manager';
import { WebChatConnector } from './webchat/connector';
import { TelegramConnector } from './telegram/connector';
import { SlackConnector } from './slack/connector';
import { DiscordConnector } from './discord/connector';
import { WhatsAppConnector } from './whatsapp/connector';
import { SignalConnector } from './signal/connector';
import { TeamsConnector } from './teams/connector';
import { startScheduledTaskRunner } from '@/lib/scheduler';
import { maybeStartChannelsOnBoot } from '@/lib/admin/settings';

const nextPhase = process.env.NEXT_PHASE || '';
const lifecycleEvent = process.env.npm_lifecycle_event || '';
const argv = process.argv.join(' ');
const isBuildPhase =
    nextPhase.includes('build') ||
    lifecycleEvent === 'build' ||
    (argv.includes('next') && argv.includes('build'));
const disableAutoStart =
    process.env.MAIACHAT_DISABLE_AUTOSTART === '1' ||
    process.env.MAIACHAT_DISABLE_SCHEDULER_BOOT === '1';

// Registration function - call this at app startup
export function registerAllConnectors(): void {
    registerConnector('webchat', () => new WebChatConnector());
    registerConnector('telegram', () => new TelegramConnector());
    registerConnector('slack', () => new SlackConnector());
    registerConnector('discord', () => new DiscordConnector());
    registerConnector('whatsapp', () => new WhatsAppConnector());
    registerConnector('signal', () => new SignalConnector());
    registerConnector('teams', () => new TeamsConnector());

    console.log('[Channels] Registered all channel connectors (7 channels)');
}

// Auto-register on import (but only on server-side)
if (typeof window === 'undefined') {
    registerAllConnectors();
    if (!isBuildPhase && !disableAutoStart) {
        startScheduledTaskRunner();
        maybeStartChannelsOnBoot().catch((error) => {
            console.error('[Channels] Auto-start failed:', error);
        });
    }
}
