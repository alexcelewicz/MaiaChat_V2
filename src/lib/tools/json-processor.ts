import { z } from "zod";
import type { Tool, ToolResult } from "./types";

const schema = z.object({
    data: z.string().describe("JSON string to process"),
    operation: z.enum([
        "parse",
        "stringify",
        "query",
        "transform",
        "validate",
        "flatten",
        "unflatten",
    ]).describe("Operation to perform on the JSON"),
    path: z.string().optional().describe("JSONPath query (for query operation)"),
    schema: z.string().optional().describe("JSON Schema for validation"),
});

type JsonProcessorParams = z.infer<typeof schema>;

async function execute(rawParams: Record<string, unknown>): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        const params = schema.parse(rawParams) as JsonProcessorParams;
        let result: unknown;

        switch (params.operation) {
            case "parse":
                result = JSON.parse(params.data);
                break;

            case "stringify":
                const parsed = JSON.parse(params.data);
                result = JSON.stringify(parsed, null, 2);
                break;

            case "query":
                if (!params.path) {
                    throw new Error("Path required for query operation");
                }
                result = queryJson(JSON.parse(params.data), params.path);
                break;

            case "transform":
                result = transformJson(JSON.parse(params.data));
                break;

            case "validate":
                const jsonData = JSON.parse(params.data);
                const validationResult = validateJson(jsonData);
                result = validationResult;
                break;

            case "flatten":
                result = flattenJson(JSON.parse(params.data));
                break;

            case "unflatten":
                result = unflattenJson(JSON.parse(params.data));
                break;

            default:
                throw new Error(`Unknown operation: ${params.operation}`);
        }

        return {
            success: true,
            data: {
                operation: params.operation,
                result,
            },
            metadata: {
                executionTime: Date.now() - startTime,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "JSON processing failed",
            metadata: {
                executionTime: Date.now() - startTime,
            },
        };
    }
}

// Simple JSONPath-like query (supports dot notation and array indices)
function queryJson(data: unknown, path: string): unknown {
    const parts = path.split(/\.|\[|\]/).filter(Boolean);
    let current: unknown = data;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }

        if (typeof current === "object") {
            current = (current as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }

    return current;
}

// Get statistics about JSON structure
function transformJson(data: unknown): Record<string, unknown> {
    const stats: Record<string, unknown> = {
        type: Array.isArray(data) ? "array" : typeof data,
    };

    if (Array.isArray(data)) {
        stats.length = data.length;
        stats.elementTypes = [...new Set(data.map(item => 
            Array.isArray(item) ? "array" : typeof item
        ))];
    } else if (typeof data === "object" && data !== null) {
        const keys = Object.keys(data);
        stats.keyCount = keys.length;
        stats.keys = keys;
        stats.depth = getJsonDepth(data);
    }

    return stats;
}

function getJsonDepth(obj: unknown, current = 1): number {
    if (typeof obj !== "object" || obj === null) {
        return current;
    }

    const depths = Object.values(obj).map(value =>
        getJsonDepth(value, current + 1)
    );

    return Math.max(current, ...depths);
}

function validateJson(data: unknown): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    function validate(obj: unknown, path: string): void {
        if (obj === undefined) {
            issues.push(`Undefined value at ${path}`);
            return;
        }

        if (typeof obj === "number") {
            if (!Number.isFinite(obj)) {
                issues.push(`Invalid number (Infinity/NaN) at ${path}`);
            }
        }

        if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
                validate(item, `${path}[${index}]`);
            });
        } else if (typeof obj === "object" && obj !== null) {
            for (const [key, value] of Object.entries(obj)) {
                validate(value, `${path}.${key}`);
            }
        }
    }

    validate(data, "$");

    return {
        valid: issues.length === 0,
        issues,
    };
}

function flattenJson(
    obj: unknown,
    prefix: string = "",
    result: Record<string, unknown> = {}
): Record<string, unknown> {
    if (typeof obj !== "object" || obj === null) {
        result[prefix] = obj;
        return result;
    }

    if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            flattenJson(item, prefix ? `${prefix}[${index}]` : `[${index}]`, result);
        });
    } else {
        for (const [key, value] of Object.entries(obj)) {
            flattenJson(value, prefix ? `${prefix}.${key}` : key, result);
        }
    }

    return result;
}

function unflattenJson(obj: Record<string, unknown>): unknown {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        const parts = key.split(/\.|\[|\]/).filter(Boolean);
        let current = result;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            const nextPart = parts[i + 1];
            const isNextArray = /^\d+$/.test(nextPart);

            if (!(part in current)) {
                current[part] = isNextArray ? [] : {};
            }

            current = current[part] as Record<string, unknown>;
        }

        const lastPart = parts[parts.length - 1];
        current[lastPart] = value;
    }

    return result;
}

export const jsonProcessorTool: Tool = {
    id: "json_processor",
    name: "JSON Processor",
    description: "Parse, query, transform, and validate JSON data",
    category: "data",
    icon: "Braces",
    schema,
    execute,
};
