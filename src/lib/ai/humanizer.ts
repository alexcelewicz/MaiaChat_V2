/**
 * Content Humanizer - Rule engine that removes "AI smell" from text.
 *
 * Applies regex/string replacement patterns organized by category and
 * intensity level to make AI-generated text sound more natural.
 */

// ============================================================================
// Types
// ============================================================================

export type HumanizerLevel = "light" | "moderate" | "aggressive";

export type HumanizerCategory =
    | "punctuation"
    | "word_choice"
    | "sycophantic"
    | "structural"
    | "filler";

export interface HumanizerRule {
    /** Pattern to match - string for literal replacement, RegExp for regex */
    pattern: string | RegExp;
    /** Replacement string or function. Strings support $1, $2 for regex captures. */
    replacement: string | ((...args: string[]) => string);
    /** Which category this rule belongs to */
    category: HumanizerCategory;
    /** Minimum intensity level required to apply this rule */
    level: HumanizerLevel;
}

// ============================================================================
// Level Hierarchy
// ============================================================================

const LEVEL_ORDER: Record<HumanizerLevel, number> = {
    light: 0,
    moderate: 1,
    aggressive: 2,
};

function levelIncludes(active: HumanizerLevel, ruleLevel: HumanizerLevel): boolean {
    return LEVEL_ORDER[active] >= LEVEL_ORDER[ruleLevel];
}

// ============================================================================
// Rules
// ============================================================================

const RULES: HumanizerRule[] = [
    // ---- Punctuation (light) ------------------------------------------------
    {
        pattern: /\u2014/g,
        replacement: "-",
        category: "punctuation",
        level: "light",
    },
    {
        pattern: /\u2013/g,
        replacement: "-",
        category: "punctuation",
        level: "light",
    },
    {
        pattern: /\u201C/g, // left double curly quote
        replacement: '"',
        category: "punctuation",
        level: "light",
    },
    {
        pattern: /\u201D/g, // right double curly quote
        replacement: '"',
        category: "punctuation",
        level: "light",
    },
    {
        pattern: /\u2018/g, // left single curly quote
        replacement: "'",
        category: "punctuation",
        level: "light",
    },
    {
        pattern: /\u2019/g, // right single curly quote
        replacement: "'",
        category: "punctuation",
        level: "light",
    },
    {
        pattern: /\u2026/g, // ellipsis character
        replacement: "...",
        category: "punctuation",
        level: "light",
    },

    // ---- Word Choice (light) ------------------------------------------------
    {
        pattern: /\butilize\b/gi,
        replacement: "use",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\butilizing\b/gi,
        replacement: "using",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\butilization\b/gi,
        replacement: "use",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bfurthermore\b/gi,
        replacement: "also",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bmoreover\b/gi,
        replacement: "also",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bdelve(?:s)?\b/gi,
        replacement: "look",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bdelving\b/gi,
        replacement: "looking",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bleverage\b/gi,
        replacement: "use",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bleveraging\b/gi,
        replacement: "using",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bwhilst\b/gi,
        replacement: "while",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bendeavou?r(?:s)?\b/gi,
        replacement: "try",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bcommence\b/gi,
        replacement: "start",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bcommencing\b/gi,
        replacement: "starting",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bfacilitate\b/gi,
        replacement: "help",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bfacilitating\b/gi,
        replacement: "helping",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\boptimize\b/gi,
        replacement: "improve",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\boptimizing\b/gi,
        replacement: "improving",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bstreamline\b/gi,
        replacement: "simplify",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bstreamlining\b/gi,
        replacement: "simplifying",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bstreamlined\b/gi,
        replacement: "simplified",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\brobust\b/gi,
        replacement: "strong",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bcomprehensive\b/gi,
        replacement: "thorough",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\binnovative\b/gi,
        replacement: "new",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\binnovations\b/gi,
        replacement: "ideas",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\binnovation\b/gi,
        replacement: "idea",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bcutting[- ]edge\b/gi,
        replacement: "modern",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bpivotal\b/gi,
        replacement: "important",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bseamlessly\b/gi,
        replacement: "smoothly",
        category: "word_choice",
        level: "light",
    },
    {
        pattern: /\bseamless\b/gi,
        replacement: "smooth",
        category: "word_choice",
        level: "light",
    },

    // ---- Sycophantic Openers (moderate) -------------------------------------
    {
        pattern: /^Great question!\s*/gm,
        replacement: "",
        category: "sycophantic",
        level: "moderate",
    },
    {
        pattern: /^That's a (?:wonderful|great|excellent|fantastic)\s+/gm,
        replacement: "That ",
        category: "sycophantic",
        level: "moderate",
    },
    {
        pattern: /^Absolutely!\s*/gm,
        replacement: "",
        category: "sycophantic",
        level: "moderate",
    },
    {
        pattern: /^Of course!\s*/gm,
        replacement: "",
        category: "sycophantic",
        level: "moderate",
    },
    {
        pattern: /^Certainly!\s*/gm,
        replacement: "",
        category: "sycophantic",
        level: "moderate",
    },
    {
        pattern: /^I'd be happy to\s*/gm,
        replacement: "",
        category: "sycophantic",
        level: "moderate",
    },
    {
        pattern: /^That's an excellent point[.!]?\s*/gm,
        replacement: "",
        category: "sycophantic",
        level: "moderate",
    },
    {
        pattern: /^What a (?:great|wonderful|excellent|fantastic) question[.!]?\s*/gm,
        replacement: "",
        category: "sycophantic",
        level: "moderate",
    },
    {
        pattern: /^I'm glad you asked[.!]?\s*/gm,
        replacement: "",
        category: "sycophantic",
        level: "moderate",
    },

    // ---- Filler Phrases (moderate) ------------------------------------------
    {
        pattern: /\bIt's worth noting that\s*/gi,
        replacement: "",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bIt is worth noting that\s*/gi,
        replacement: "",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bIn terms of\s+/gi,
        replacement: "For ",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bAt the end of the day,?\s*/gi,
        replacement: "",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bIn order to\b/gi,
        replacement: "To",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bIt is important to note(?:\s+that)?\s*/gi,
        replacement: "",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bAs a matter of fact,?\s*/gi,
        replacement: "Actually, ",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bIt should be noted that\s*/gi,
        replacement: "",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bNeedless to say,?\s*/gi,
        replacement: "",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bWith that (?:being )?said,?\s*/gi,
        replacement: "",
        category: "filler",
        level: "moderate",
    },
    {
        pattern: /\bHaving said that,?\s*/gi,
        replacement: "",
        category: "filler",
        level: "moderate",
    },

    // ---- Structural (aggressive) --------------------------------------------
    {
        // Remove excessive "## " headers when there are 4+ in a row within short text
        pattern: /(?:^## .+\n){4,}/gm,
        replacement: (match: string) => {
            // Keep only the first two headers, convert the rest to bold text
            const lines = match.trim().split("\n");
            const kept = lines.slice(0, 2).join("\n");
            const converted = lines
                .slice(2)
                .map((l: string) => l.replace(/^## /, "**") + "**")
                .join("\n");
            return kept + "\n" + converted + "\n";
        },
        category: "structural",
        level: "aggressive",
    },
    {
        // Collapse runs of 6+ bullet points into the first 4 + a summary note
        pattern: /(?:^[-*] .+\n){6,}/gm,
        replacement: (match: string) => {
            const lines = match.trim().split("\n");
            return lines.slice(0, 4).join("\n") + "\n";
        },
        category: "structural",
        level: "aggressive",
    },
    {
        // Remove triple+ blank lines down to double
        pattern: /\n{4,}/g,
        replacement: "\n\n\n",
        category: "structural",
        level: "aggressive",
    },
    {
        // Remove "In conclusion" / "To summarize" wrapper sentences
        pattern: /^(?:In conclusion|To summarize|In summary),?\s*/gim,
        replacement: "",
        category: "structural",
        level: "aggressive",
    },
];

// ============================================================================
// Core Engine
// ============================================================================

/**
 * Apply humanizer rules to the given text.
 *
 * @param text      - Source text to humanize
 * @param level     - Intensity level ("light" | "moderate" | "aggressive")
 * @param categories - Optional subset of categories to apply. Omit to apply all.
 * @returns The humanized text
 */
export function humanize(
    text: string,
    level: HumanizerLevel,
    categories?: HumanizerCategory[],
): string {
    let result = text;

    for (const rule of RULES) {
        // Skip rules above the selected intensity
        if (!levelIncludes(level, rule.level)) continue;

        // Skip rules outside the selected categories (if filtering)
        if (categories && categories.length > 0 && !categories.includes(rule.category)) continue;

        if (typeof rule.pattern === "string") {
            // Literal string replacement (all occurrences)
            const rep = rule.replacement;
            if (typeof rep === "string") {
                result = result.split(rule.pattern).join(rep);
            }
        } else if (typeof rule.replacement === "function") {
            result = result.replace(rule.pattern, rule.replacement as (...args: string[]) => string);
        } else {
            result = result.replace(rule.pattern, rule.replacement);
        }
    }

    // Clean up artefacts: double spaces, leading spaces on lines
    result = result.replace(/ {2,}/g, " ");
    result = result.replace(/^ +/gm, (match, offset) => {
        // Preserve indentation that looks intentional (code blocks, lists)
        if (offset > 0 && result[offset - 1] === "\n") return match;
        return match;
    });

    return result.trim();
}

// ============================================================================
// Preview
// ============================================================================

/**
 * Generate a before/after preview with a count of changes made.
 */
export function getHumanizerPreview(
    text: string,
    level: HumanizerLevel,
    categories?: HumanizerCategory[],
): { before: string; after: string; changesCount: number } {
    const after = humanize(text, level, categories);

    // Count changes by diffing words
    const beforeWords = text.split(/\s+/);
    const afterWords = after.split(/\s+/);

    let changesCount = 0;
    const maxLen = Math.max(beforeWords.length, afterWords.length);
    for (let i = 0; i < maxLen; i++) {
        if (beforeWords[i] !== afterWords[i]) {
            changesCount++;
        }
    }

    return { before: text, after, changesCount };
}

// ============================================================================
// Utility Exports
// ============================================================================

/** Get all available categories */
export const HUMANIZER_CATEGORIES: HumanizerCategory[] = [
    "punctuation",
    "word_choice",
    "sycophantic",
    "structural",
    "filler",
];

/** Human-readable labels for each category */
export const CATEGORY_LABELS: Record<HumanizerCategory, string> = {
    punctuation: "Punctuation",
    word_choice: "Word Choice",
    sycophantic: "Sycophantic Openers",
    structural: "Structural",
    filler: "Filler Phrases",
};

/** Human-readable descriptions for each category */
export const CATEGORY_DESCRIPTIONS: Record<HumanizerCategory, string> = {
    punctuation: "Replace em-dashes, curly quotes, and special characters",
    word_choice: "Swap overused AI vocabulary for simpler alternatives",
    sycophantic: "Remove flattering opener phrases like \"Great question!\"",
    structural: "Simplify excessive headers, bullet lists, and whitespace",
    filler: "Strip filler phrases that add no meaning",
};

/** Human-readable labels for levels */
export const LEVEL_LABELS: Record<HumanizerLevel, string> = {
    light: "Light",
    moderate: "Moderate",
    aggressive: "Aggressive",
};

/** Description for each level */
export const LEVEL_DESCRIPTIONS: Record<HumanizerLevel, string> = {
    light: "Punctuation and word choice only",
    moderate: "Also removes sycophantic openers and filler phrases",
    aggressive: "Full cleanup including structural simplification",
};

/** Get the count of rules that will be applied for a given level and categories */
export function getActiveRuleCount(
    level: HumanizerLevel,
    categories?: HumanizerCategory[],
): number {
    return RULES.filter((rule) => {
        if (!levelIncludes(level, rule.level)) return false;
        if (categories && categories.length > 0 && !categories.includes(rule.category)) return false;
        return true;
    }).length;
}
