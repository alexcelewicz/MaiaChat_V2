/**
 * DateTime Plugin
 *
 * Provides date and time utilities.
 */

import { Plugin, PluginManifest, PluginContext, PluginExecutionResult } from '../runtime';

export class DateTimePlugin extends Plugin {
    manifest: PluginManifest = {
        name: 'Date & Time',
        slug: 'datetime',
        version: '1.0.0',
        description: 'Get current time, convert timezones, and calculate date differences',
        author: 'MaiaChat',
        icon: '🕐',
        category: 'utility',
        permissions: [],
        configSchema: {
            defaultTimezone: {
                type: 'string',
                label: 'Default Timezone',
                description: 'Your preferred timezone (e.g., "America/New_York")',
                default: 'UTC',
            },
            dateFormat: {
                type: 'select',
                label: 'Date Format',
                options: [
                    { value: 'iso', label: 'ISO 8601 (2024-01-15)' },
                    { value: 'us', label: 'US (01/15/2024)' },
                    { value: 'eu', label: 'EU (15/01/2024)' },
                    { value: 'long', label: 'Long (January 15, 2024)' },
                ],
                default: 'iso',
            },
        },
        tools: [
            {
                name: 'current_time',
                description: 'Get the current date and time',
                parameters: {
                    type: 'object',
                    properties: {
                        timezone: {
                            type: 'string',
                            description: 'Timezone (e.g., "America/New_York", "Europe/London", "Asia/Tokyo"). Defaults to UTC.',
                        },
                    },
                    required: [],
                },
            },
            {
                name: 'convert_timezone',
                description: 'Convert a datetime from one timezone to another',
                parameters: {
                    type: 'object',
                    properties: {
                        datetime: {
                            type: 'string',
                            description: 'The datetime to convert (ISO format or natural language)',
                        },
                        fromTimezone: {
                            type: 'string',
                            description: 'Source timezone',
                        },
                        toTimezone: {
                            type: 'string',
                            description: 'Target timezone',
                        },
                    },
                    required: ['datetime', 'fromTimezone', 'toTimezone'],
                },
            },
            {
                name: 'date_difference',
                description: 'Calculate the difference between two dates',
                parameters: {
                    type: 'object',
                    properties: {
                        date1: {
                            type: 'string',
                            description: 'First date (ISO format or natural language)',
                        },
                        date2: {
                            type: 'string',
                            description: 'Second date (ISO format or natural language). Defaults to now.',
                        },
                        unit: {
                            type: 'string',
                            description: 'Unit for the difference',
                            enum: ['days', 'weeks', 'months', 'years', 'hours', 'minutes'],
                            default: 'days',
                        },
                    },
                    required: ['date1'],
                },
            },
            {
                name: 'add_time',
                description: 'Add or subtract time from a date',
                parameters: {
                    type: 'object',
                    properties: {
                        date: {
                            type: 'string',
                            description: 'Starting date (ISO format or "now")',
                        },
                        amount: {
                            type: 'number',
                            description: 'Amount to add (negative to subtract)',
                        },
                        unit: {
                            type: 'string',
                            description: 'Unit of time',
                            enum: ['days', 'weeks', 'months', 'years', 'hours', 'minutes'],
                        },
                    },
                    required: ['date', 'amount', 'unit'],
                },
            },
        ],
    };

    async execute(
        toolName: string,
        args: Record<string, unknown>,
        context: PluginContext
    ): Promise<PluginExecutionResult> {
        let defaultTz = (context.config.defaultTimezone as string) || '';
        if (!defaultTz) {
            try {
                defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
            } catch {
                defaultTz = 'UTC';
            }
        }
        const dateFormat = (context.config.dateFormat as string) || 'iso';

        switch (toolName) {
            case 'current_time':
                return this.getCurrentTime(
                    (args.timezone as string) || defaultTz,
                    dateFormat
                );
            case 'convert_timezone':
                return this.convertTimezone(
                    args.datetime as string,
                    args.fromTimezone as string,
                    args.toTimezone as string,
                    dateFormat
                );
            case 'date_difference':
                return this.dateDifference(
                    args.date1 as string,
                    args.date2 as string | undefined,
                    (args.unit as string) || 'days'
                );
            case 'add_time':
                return this.addTime(
                    args.date as string,
                    args.amount as number,
                    args.unit as string,
                    dateFormat
                );
            default:
                return { success: false, error: `Unknown tool: ${toolName}` };
        }
    }

    private getCurrentTime(timezone: string, format: string): PluginExecutionResult {
        try {
            const now = new Date();
            const formatted = this.formatDateTime(now, timezone, format);

            return {
                success: true,
                output: `Current time in ${timezone}: ${formatted}`,
                data: {
                    iso: now.toISOString(),
                    timezone,
                    formatted,
                    timestamp: now.getTime(),
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get current time',
            };
        }
    }

    private convertTimezone(
        datetime: string,
        fromTz: string,
        toTz: string,
        format: string
    ): PluginExecutionResult {
        try {
            const date = this.parseDate(datetime);

            // Get offset difference and adjust
            const fromFormatted = this.formatDateTime(date, fromTz, format);
            const toFormatted = this.formatDateTime(date, toTz, format);

            return {
                success: true,
                output: `${datetime} in ${fromTz} is ${toFormatted} in ${toTz}`,
                data: {
                    original: datetime,
                    fromTimezone: fromTz,
                    toTimezone: toTz,
                    result: toFormatted,
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Conversion failed',
            };
        }
    }

    private dateDifference(
        date1Str: string,
        date2Str: string | undefined,
        unit: string
    ): PluginExecutionResult {
        try {
            const date1 = this.parseDate(date1Str);
            const date2 = date2Str ? this.parseDate(date2Str) : new Date();

            const diffMs = date2.getTime() - date1.getTime();
            let diff: number;
            let unitLabel: string;

            switch (unit) {
                case 'minutes':
                    diff = diffMs / (1000 * 60);
                    unitLabel = 'minutes';
                    break;
                case 'hours':
                    diff = diffMs / (1000 * 60 * 60);
                    unitLabel = 'hours';
                    break;
                case 'days':
                    diff = diffMs / (1000 * 60 * 60 * 24);
                    unitLabel = 'days';
                    break;
                case 'weeks':
                    diff = diffMs / (1000 * 60 * 60 * 24 * 7);
                    unitLabel = 'weeks';
                    break;
                case 'months':
                    diff = (date2.getFullYear() - date1.getFullYear()) * 12 +
                        (date2.getMonth() - date1.getMonth()) +
                        (date2.getDate() - date1.getDate()) / 30;
                    unitLabel = 'months';
                    break;
                case 'years':
                    diff = (date2.getFullYear() - date1.getFullYear()) +
                        (date2.getMonth() - date1.getMonth()) / 12;
                    unitLabel = 'years';
                    break;
                default:
                    diff = diffMs / (1000 * 60 * 60 * 24);
                    unitLabel = 'days';
            }

            const formatted = diff.toFixed(2).replace(/\.?0+$/, '');
            const direction = diff >= 0 ? 'after' : 'before';

            return {
                success: true,
                output: `Difference: ${Math.abs(Number(formatted))} ${unitLabel} (${date2Str || 'now'} is ${direction} ${date1Str})`,
                data: {
                    date1: date1.toISOString(),
                    date2: date2.toISOString(),
                    difference: Number(formatted),
                    unit: unitLabel,
                    direction,
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Calculation failed',
            };
        }
    }

    private addTime(
        dateStr: string,
        amount: number,
        unit: string,
        format: string
    ): PluginExecutionResult {
        try {
            const date = dateStr.toLowerCase() === 'now'
                ? new Date()
                : this.parseDate(dateStr);

            const result = new Date(date);

            switch (unit) {
                case 'minutes':
                    result.setMinutes(result.getMinutes() + amount);
                    break;
                case 'hours':
                    result.setHours(result.getHours() + amount);
                    break;
                case 'days':
                    result.setDate(result.getDate() + amount);
                    break;
                case 'weeks':
                    result.setDate(result.getDate() + amount * 7);
                    break;
                case 'months':
                    result.setMonth(result.getMonth() + amount);
                    break;
                case 'years':
                    result.setFullYear(result.getFullYear() + amount);
                    break;
                default:
                    throw new Error(`Unknown unit: ${unit}`);
            }

            const formatted = this.formatDateTime(result, 'UTC', format);
            const action = amount >= 0 ? 'Adding' : 'Subtracting';

            return {
                success: true,
                output: `${action} ${Math.abs(amount)} ${unit} to ${dateStr}: ${formatted}`,
                data: {
                    original: date.toISOString(),
                    result: result.toISOString(),
                    formatted,
                    amount,
                    unit,
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Calculation failed',
            };
        }
    }

    private parseDate(str: string): Date {
        // Try ISO format first
        const isoDate = new Date(str);
        if (!isNaN(isoDate.getTime())) {
            return isoDate;
        }

        // Try natural language
        const lower = str.toLowerCase();

        if (lower === 'now' || lower === 'today') {
            return new Date();
        }
        if (lower === 'tomorrow') {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            return d;
        }
        if (lower === 'yesterday') {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return d;
        }

        throw new Error(`Could not parse date: ${str}`);
    }

    private formatDateTime(date: Date, timezone: string, format: string): string {
        try {
            const options: Intl.DateTimeFormatOptions = {
                timeZone: timezone,
                year: 'numeric',
                month: format === 'long' ? 'long' : '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: format === 'us',
            };

            const formatted = new Intl.DateTimeFormat('en-US', options).format(date);

            if (format === 'iso') {
                return date.toISOString();
            }

            return formatted;
        } catch {
            return date.toISOString();
        }
    }
}
