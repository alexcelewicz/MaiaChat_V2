import { z } from "zod";
import type { Tool, ToolResult } from "./types";

const schema = z.object({
    expression: z.string().min(1).max(200).describe("Mathematical expression to evaluate"),
});

type CalculatorParams = z.infer<typeof schema>;

// Safe math expression evaluator (no eval!)
function evaluateExpression(expr: string): number {
    // Remove whitespace
    expr = expr.replace(/\s/g, "");
    
    // Tokenize
    const tokens = tokenize(expr);
    
    // Parse and evaluate using shunting-yard algorithm
    return evaluate(tokens);
}

interface Token {
    type: "number" | "operator" | "function" | "lparen" | "rparen";
    value: string;
}

function tokenize(expr: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    
    const operators = new Set(["+", "-", "*", "/", "^", "%"]);
    const functions = ["sin", "cos", "tan", "sqrt", "abs", "log", "ln", "exp", "floor", "ceil", "round"];
    
    while (i < expr.length) {
        const char = expr[i];
        
        // Number (including decimals)
        if (/[0-9.]/.test(char)) {
            let num = "";
            while (i < expr.length && /[0-9.]/.test(expr[i])) {
                num += expr[i];
                i++;
            }
            tokens.push({ type: "number", value: num });
            continue;
        }
        
        // Operator
        if (operators.has(char)) {
            tokens.push({ type: "operator", value: char });
            i++;
            continue;
        }
        
        // Parentheses
        if (char === "(") {
            tokens.push({ type: "lparen", value: "(" });
            i++;
            continue;
        }
        if (char === ")") {
            tokens.push({ type: "rparen", value: ")" });
            i++;
            continue;
        }
        
        // Function or constant
        if (/[a-zA-Z]/.test(char)) {
            let name = "";
            while (i < expr.length && /[a-zA-Z]/.test(expr[i])) {
                name += expr[i];
                i++;
            }
            
            // Check for constants
            if (name.toLowerCase() === "pi") {
                tokens.push({ type: "number", value: String(Math.PI) });
            } else if (name.toLowerCase() === "e") {
                tokens.push({ type: "number", value: String(Math.E) });
            } else if (functions.includes(name.toLowerCase())) {
                tokens.push({ type: "function", value: name.toLowerCase() });
            } else {
                throw new Error(`Unknown identifier: ${name}`);
            }
            continue;
        }
        
        throw new Error(`Unexpected character: ${char}`);
    }
    
    return tokens;
}

function evaluate(tokens: Token[]): number {
    const output: number[] = [];
    const operators: Token[] = [];
    
    const precedence: Record<string, number> = {
        "+": 1,
        "-": 1,
        "*": 2,
        "/": 2,
        "%": 2,
        "^": 3,
    };
    
    const applyOperator = (op: string, b: number, a: number): number => {
        switch (op) {
            case "+": return a + b;
            case "-": return a - b;
            case "*": return a * b;
            case "/": 
                if (b === 0) throw new Error("Division by zero");
                return a / b;
            case "%": return a % b;
            case "^": return Math.pow(a, b);
            default: throw new Error(`Unknown operator: ${op}`);
        }
    };
    
    const applyFunction = (fn: string, x: number): number => {
        switch (fn) {
            case "sin": return Math.sin(x);
            case "cos": return Math.cos(x);
            case "tan": return Math.tan(x);
            case "sqrt": return Math.sqrt(x);
            case "abs": return Math.abs(x);
            case "log": return Math.log10(x);
            case "ln": return Math.log(x);
            case "exp": return Math.exp(x);
            case "floor": return Math.floor(x);
            case "ceil": return Math.ceil(x);
            case "round": return Math.round(x);
            default: throw new Error(`Unknown function: ${fn}`);
        }
    };
    
    for (const token of tokens) {
        if (token.type === "number") {
            output.push(parseFloat(token.value));
        } else if (token.type === "function") {
            operators.push(token);
        } else if (token.type === "operator") {
            while (
                operators.length > 0 &&
                operators[operators.length - 1].type === "operator" &&
                precedence[operators[operators.length - 1].value] >= precedence[token.value]
            ) {
                const op = operators.pop()!;
                const b = output.pop()!;
                const a = output.pop()!;
                output.push(applyOperator(op.value, b, a));
            }
            operators.push(token);
        } else if (token.type === "lparen") {
            operators.push(token);
        } else if (token.type === "rparen") {
            while (operators.length > 0 && operators[operators.length - 1].type !== "lparen") {
                const op = operators.pop()!;
                if (op.type === "operator") {
                    const b = output.pop()!;
                    const a = output.pop()!;
                    output.push(applyOperator(op.value, b, a));
                }
            }
            if (operators.length > 0 && operators[operators.length - 1].type === "lparen") {
                operators.pop(); // Remove left paren
            }
            // Check if there's a function before the parentheses
            if (operators.length > 0 && operators[operators.length - 1].type === "function") {
                const fn = operators.pop()!;
                const x = output.pop()!;
                output.push(applyFunction(fn.value, x));
            }
        }
    }
    
    // Process remaining operators
    while (operators.length > 0) {
        const op = operators.pop()!;
        if (op.type === "operator") {
            const b = output.pop()!;
            const a = output.pop()!;
            output.push(applyOperator(op.value, b, a));
        }
    }
    
    return output[0];
}

async function execute(rawParams: Record<string, unknown>): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        const params = schema.parse(rawParams) as CalculatorParams;
        const result = evaluateExpression(params.expression);

        return {
            success: true,
            data: {
                expression: params.expression,
                result,
                formattedResult: formatNumber(result),
            },
            metadata: {
                executionTime: Date.now() - startTime,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Calculation failed",
            metadata: {
                executionTime: Date.now() - startTime,
            },
        };
    }
}

function formatNumber(num: number): string {
    if (Number.isInteger(num)) {
        return num.toLocaleString();
    }
    // Round to 10 decimal places to avoid floating point issues
    return parseFloat(num.toPrecision(10)).toLocaleString(undefined, {
        maximumFractionDigits: 10,
    });
}

export const calculatorTool: Tool = {
    id: "calculator",
    name: "Calculator",
    description: "Evaluate mathematical expressions including functions like sin, cos, sqrt, log",
    category: "utility",
    icon: "Calculator",
    schema,
    execute,
};
