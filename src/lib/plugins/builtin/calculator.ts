/**
 * Calculator Plugin
 *
 * Provides mathematical calculation capabilities.
 */

import { Plugin, PluginManifest, PluginContext, PluginExecutionResult } from '../runtime';

export class CalculatorPlugin extends Plugin {
    manifest: PluginManifest = {
        name: 'Calculator',
        slug: 'calculator',
        version: '1.0.0',
        description: 'Perform mathematical calculations',
        author: 'MaiaChat',
        icon: '🧮',
        category: 'utility',
        permissions: [],
        tools: [
            {
                name: 'calculate',
                description: 'Evaluate a mathematical expression. Supports basic arithmetic, exponents, parentheses, and common math functions.',
                parameters: {
                    type: 'object',
                    properties: {
                        expression: {
                            type: 'string',
                            description: 'The mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(pi/2)")',
                        },
                    },
                    required: ['expression'],
                },
            },
            {
                name: 'convert',
                description: 'Convert between units of measurement',
                parameters: {
                    type: 'object',
                    properties: {
                        value: {
                            type: 'number',
                            description: 'The value to convert',
                        },
                        fromUnit: {
                            type: 'string',
                            description: 'The source unit (e.g., "km", "miles", "celsius", "fahrenheit")',
                        },
                        toUnit: {
                            type: 'string',
                            description: 'The target unit',
                        },
                    },
                    required: ['value', 'fromUnit', 'toUnit'],
                },
            },
        ],
    };

    async execute(
        toolName: string,
        args: Record<string, unknown>,
        context: PluginContext
    ): Promise<PluginExecutionResult> {
        switch (toolName) {
            case 'calculate':
                return this.calculate(args.expression as string);
            case 'convert':
                return this.convert(
                    args.value as number,
                    args.fromUnit as string,
                    args.toUnit as string
                );
            default:
                return { success: false, error: `Unknown tool: ${toolName}` };
        }
    }

    private calculate(expression: string): PluginExecutionResult {
        try {
            // Sanitize and prepare expression
            let sanitized = expression
                .toLowerCase()
                .replace(/\s+/g, '')
                // Replace common math functions and constants
                .replace(/pi/g, String(Math.PI))
                .replace(/e(?![a-z])/g, String(Math.E))
                .replace(/sqrt\(/g, 'Math.sqrt(')
                .replace(/sin\(/g, 'Math.sin(')
                .replace(/cos\(/g, 'Math.cos(')
                .replace(/tan\(/g, 'Math.tan(')
                .replace(/log\(/g, 'Math.log(')
                .replace(/log10\(/g, 'Math.log10(')
                .replace(/abs\(/g, 'Math.abs(')
                .replace(/ceil\(/g, 'Math.ceil(')
                .replace(/floor\(/g, 'Math.floor(')
                .replace(/round\(/g, 'Math.round(')
                .replace(/pow\(/g, 'Math.pow(')
                .replace(/\^/g, '**');

            // Validate: only allow safe characters
            if (!/^[\d\.\+\-\*\/\(\)\s\,Math\.a-z]+$/.test(sanitized)) {
                return { success: false, error: 'Invalid characters in expression' };
            }

            // Evaluate using Function constructor (safer than eval)
            const fn = new Function(`return ${sanitized}`);
            const result = fn();

            if (typeof result !== 'number' || !isFinite(result)) {
                return { success: false, error: 'Invalid result' };
            }

            // Format result
            const formatted = Number.isInteger(result)
                ? result.toString()
                : result.toFixed(10).replace(/\.?0+$/, '');

            return {
                success: true,
                output: `${expression} = ${formatted}`,
                data: { expression, result },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Calculation error',
            };
        }
    }

    private convert(value: number, fromUnit: string, toUnit: string): PluginExecutionResult {
        const from = fromUnit.toLowerCase();
        const to = toUnit.toLowerCase();

        try {
            let result: number;
            let category: string;

            // Temperature conversions
            if (this.isTemperature(from) && this.isTemperature(to)) {
                result = this.convertTemperature(value, from, to);
                category = 'temperature';
            }
            // Length conversions
            else if (this.isLength(from) && this.isLength(to)) {
                result = this.convertLength(value, from, to);
                category = 'length';
            }
            // Weight conversions
            else if (this.isWeight(from) && this.isWeight(to)) {
                result = this.convertWeight(value, from, to);
                category = 'weight';
            }
            // Volume conversions
            else if (this.isVolume(from) && this.isVolume(to)) {
                result = this.convertVolume(value, from, to);
                category = 'volume';
            }
            else {
                return {
                    success: false,
                    error: `Cannot convert between ${from} and ${to}`,
                };
            }

            const formatted = Number.isInteger(result)
                ? result.toString()
                : result.toFixed(6).replace(/\.?0+$/, '');

            return {
                success: true,
                output: `${value} ${fromUnit} = ${formatted} ${toUnit}`,
                data: { value, fromUnit, toUnit, result, category },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Conversion error',
            };
        }
    }

    private isTemperature(unit: string): boolean {
        return ['c', 'celsius', 'f', 'fahrenheit', 'k', 'kelvin'].includes(unit);
    }

    private isLength(unit: string): boolean {
        return ['m', 'meter', 'meters', 'km', 'kilometer', 'kilometers', 'cm', 'centimeter', 'centimeters',
            'mm', 'millimeter', 'millimeters', 'mi', 'mile', 'miles', 'ft', 'foot', 'feet',
            'in', 'inch', 'inches', 'yd', 'yard', 'yards'].includes(unit);
    }

    private isWeight(unit: string): boolean {
        return ['kg', 'kilogram', 'kilograms', 'g', 'gram', 'grams', 'mg', 'milligram', 'milligrams',
            'lb', 'lbs', 'pound', 'pounds', 'oz', 'ounce', 'ounces'].includes(unit);
    }

    private isVolume(unit: string): boolean {
        return ['l', 'liter', 'liters', 'ml', 'milliliter', 'milliliters',
            'gal', 'gallon', 'gallons', 'qt', 'quart', 'quarts',
            'pt', 'pint', 'pints', 'cup', 'cups', 'floz', 'fl oz'].includes(unit);
    }

    private convertTemperature(value: number, from: string, to: string): number {
        // Convert to Celsius first
        let celsius: number;
        if (['c', 'celsius'].includes(from)) {
            celsius = value;
        } else if (['f', 'fahrenheit'].includes(from)) {
            celsius = (value - 32) * 5 / 9;
        } else if (['k', 'kelvin'].includes(from)) {
            celsius = value - 273.15;
        } else {
            throw new Error(`Unknown temperature unit: ${from}`);
        }

        // Convert from Celsius to target
        if (['c', 'celsius'].includes(to)) {
            return celsius;
        } else if (['f', 'fahrenheit'].includes(to)) {
            return celsius * 9 / 5 + 32;
        } else if (['k', 'kelvin'].includes(to)) {
            return celsius + 273.15;
        } else {
            throw new Error(`Unknown temperature unit: ${to}`);
        }
    }

    private convertLength(value: number, from: string, to: string): number {
        const toMeters: Record<string, number> = {
            m: 1, meter: 1, meters: 1,
            km: 1000, kilometer: 1000, kilometers: 1000,
            cm: 0.01, centimeter: 0.01, centimeters: 0.01,
            mm: 0.001, millimeter: 0.001, millimeters: 0.001,
            mi: 1609.344, mile: 1609.344, miles: 1609.344,
            ft: 0.3048, foot: 0.3048, feet: 0.3048,
            in: 0.0254, inch: 0.0254, inches: 0.0254,
            yd: 0.9144, yard: 0.9144, yards: 0.9144,
        };

        if (!toMeters[from] || !toMeters[to]) {
            throw new Error('Unknown length unit');
        }

        return value * toMeters[from] / toMeters[to];
    }

    private convertWeight(value: number, from: string, to: string): number {
        const toGrams: Record<string, number> = {
            kg: 1000, kilogram: 1000, kilograms: 1000,
            g: 1, gram: 1, grams: 1,
            mg: 0.001, milligram: 0.001, milligrams: 0.001,
            lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
            oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
        };

        if (!toGrams[from] || !toGrams[to]) {
            throw new Error('Unknown weight unit');
        }

        return value * toGrams[from] / toGrams[to];
    }

    private convertVolume(value: number, from: string, to: string): number {
        const toMilliliters: Record<string, number> = {
            l: 1000, liter: 1000, liters: 1000,
            ml: 1, milliliter: 1, milliliters: 1,
            gal: 3785.41, gallon: 3785.41, gallons: 3785.41,
            qt: 946.353, quart: 946.353, quarts: 946.353,
            pt: 473.176, pint: 473.176, pints: 473.176,
            cup: 236.588, cups: 236.588,
            floz: 29.5735, 'fl oz': 29.5735,
        };

        if (!toMilliliters[from] || !toMilliliters[to]) {
            throw new Error('Unknown volume unit');
        }

        return value * toMilliliters[from] / toMilliliters[to];
    }
}
