"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    getHumanizerPreview,
    HUMANIZER_CATEGORIES,
    CATEGORY_LABELS,
    CATEGORY_DESCRIPTIONS,
    LEVEL_LABELS,
    LEVEL_DESCRIPTIONS,
    getActiveRuleCount,
} from "@/lib/ai/humanizer";
import type { HumanizerLevel, HumanizerCategory } from "@/lib/ai/humanizer";

// ============================================================================
// Constants
// ============================================================================

const SAMPLE_TEXT =
    "Great question! That's a wonderful area to delve into. Furthermore, it's worth noting that we should utilize comprehensive and robust approaches to leverage cutting-edge innovations \u2014 in order to facilitate streamlined processes.";

// ============================================================================
// Component
// ============================================================================

export function HumanizerSettings() {
    const [enabled, setEnabled] = useState(false);
    const [level, setLevel] = useState<HumanizerLevel>("moderate");
    const [categories, setCategories] = useState<HumanizerCategory[]>([...HUMANIZER_CATEGORIES]);
    const [mounted, setMounted] = useState(false);
    const [saving, setSaving] = useState(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load settings from API on mount
    useEffect(() => {
        fetch("/api/settings/humanizer")
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data) {
                    setEnabled(data.enabled ?? false);
                    if (["light", "moderate", "aggressive"].includes(data.level)) {
                        setLevel(data.level);
                    }
                    if (Array.isArray(data.categories) && data.categories.length > 0) {
                        setCategories(
                            data.categories.filter((c: string): c is HumanizerCategory =>
                                HUMANIZER_CATEGORIES.includes(c as HumanizerCategory),
                            ),
                        );
                    }
                }
            })
            .catch(() => {
                // Ignore fetch errors on mount
            })
            .finally(() => setMounted(true));
    }, []);

    // Debounced save to API whenever settings change
    const saveToApi = useCallback(
        (e: boolean, l: HumanizerLevel, cats: HumanizerCategory[]) => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(async () => {
                setSaving(true);
                try {
                    await fetch("/api/settings/humanizer", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ enabled: e, level: l, categories: cats }),
                    });
                } catch {
                    // Silent fail - settings will be retried next change
                } finally {
                    setSaving(false);
                }
            }, 500);
        },
        [],
    );

    // Persist changes via API
    useEffect(() => {
        if (!mounted) return;
        saveToApi(enabled, level, categories);
    }, [enabled, level, categories, mounted, saveToApi]);

    // Category toggle handler
    const toggleCategory = useCallback((cat: HumanizerCategory) => {
        setCategories((prev) => {
            if (prev.includes(cat)) {
                // Don't allow removing the last category
                if (prev.length <= 1) return prev;
                return prev.filter((c) => c !== cat);
            }
            return [...prev, cat];
        });
    }, []);

    // Preview computation
    const preview = useMemo(() => {
        if (!enabled) {
            return { before: SAMPLE_TEXT, after: SAMPLE_TEXT, changesCount: 0 };
        }
        return getHumanizerPreview(SAMPLE_TEXT, level, categories);
    }, [enabled, level, categories]);

    const activeRules = useMemo(
        () => (enabled ? getActiveRuleCount(level, categories) : 0),
        [enabled, level, categories],
    );

    // Don't render anything meaningful until hydrated (avoids hydration mismatch)
    if (!mounted) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Content Humanizer</CardTitle>
                    <CardDescription>Loading settings...</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Content Humanizer</CardTitle>
                <CardDescription>
                    Remove AI-sounding patterns from generated text to make responses feel more natural.
                    {saving && <span className="text-xs text-muted-foreground ml-2">Saving...</span>}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="humanizer-toggle">Enable Humanizer</Label>
                        <p className="text-muted-foreground text-xs">
                            Automatically process AI responses before displaying them
                        </p>
                    </div>
                    <Switch
                        id="humanizer-toggle"
                        checked={enabled}
                        onCheckedChange={setEnabled}
                    />
                </div>

                {/* Level Selector */}
                <div className="space-y-2">
                    <Label>Intensity Level</Label>
                    <Select
                        value={level}
                        onValueChange={(v) => setLevel(v as HumanizerLevel)}
                        disabled={!enabled}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                        <SelectContent>
                            {(["light", "moderate", "aggressive"] as HumanizerLevel[]).map((l) => (
                                <SelectItem key={l} value={l}>
                                    <span className="flex flex-col">
                                        <span>{LEVEL_LABELS[l]}</span>
                                        <span className="text-muted-foreground text-xs">
                                            {LEVEL_DESCRIPTIONS[l]}
                                        </span>
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Category Toggles */}
                <div className="space-y-3">
                    <Label>Categories</Label>
                    <div className="space-y-2">
                        {HUMANIZER_CATEGORIES.map((cat) => (
                            <div
                                key={cat}
                                className="flex items-center justify-between rounded-md border p-3"
                            >
                                <div className="space-y-0.5">
                                    <span className="text-sm font-medium">
                                        {CATEGORY_LABELS[cat]}
                                    </span>
                                    <p className="text-muted-foreground text-xs">
                                        {CATEGORY_DESCRIPTIONS[cat]}
                                    </p>
                                </div>
                                <Switch
                                    checked={categories.includes(cat)}
                                    onCheckedChange={() => toggleCategory(cat)}
                                    disabled={!enabled}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Active Rules Count */}
                {enabled && (
                    <p className="text-muted-foreground text-xs">
                        {activeRules} rule{activeRules !== 1 ? "s" : ""} active
                    </p>
                )}

                {/* Live Preview */}
                <div className="space-y-2">
                    <Label>Live Preview</Label>
                    <div className="grid gap-3 md:grid-cols-2">
                        {/* Before */}
                        <div className="space-y-1">
                            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                                Before
                            </span>
                            <div className="bg-muted rounded-md p-3 text-sm leading-relaxed">
                                {preview.before}
                            </div>
                        </div>

                        {/* After */}
                        <div className="space-y-1">
                            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                                After
                                {preview.changesCount > 0 && (
                                    <span className="text-primary ml-2">
                                        ({preview.changesCount} change{preview.changesCount !== 1 ? "s" : ""})
                                    </span>
                                )}
                            </span>
                            <div className="bg-muted rounded-md p-3 text-sm leading-relaxed">
                                {enabled ? (
                                    <HighlightedDiff before={preview.before} after={preview.after} />
                                ) : (
                                    <span className="text-muted-foreground">{preview.after}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================================================
// Diff Highlighter
// ============================================================================

/**
 * Renders the "after" text with changed words highlighted.
 * Uses a simple word-level diff approach.
 */
function HighlightedDiff({ before, after }: { before: string; after: string }) {
    const segments = useMemo(() => {
        const beforeWords = before.split(/(\s+)/);
        const afterWords = after.split(/(\s+)/);
        const result: { text: string; changed: boolean }[] = [];

        let ai = 0;
        let bi = 0;

        while (ai < afterWords.length) {
            const afterWord = afterWords[ai];

            if (bi < beforeWords.length && afterWord === beforeWords[bi]) {
                // Same word, no highlight
                result.push({ text: afterWord, changed: false });
                ai++;
                bi++;
            } else if (afterWord && afterWord.trim() === "") {
                // Whitespace token - pass through
                result.push({ text: afterWord, changed: false });
                ai++;
                // Also advance before if it's whitespace
                if (bi < beforeWords.length && beforeWords[bi]?.trim() === "") {
                    bi++;
                }
            } else {
                // Different word - highlight it
                result.push({ text: afterWord, changed: true });
                ai++;
                bi++;
            }
        }

        return result;
    }, [before, after]);

    return (
        <span>
            {segments.map((seg, i) =>
                seg.changed ? (
                    <mark
                        key={i}
                        className="bg-primary/20 text-primary rounded-sm px-0.5"
                    >
                        {seg.text}
                    </mark>
                ) : (
                    <span key={i}>{seg.text}</span>
                ),
            )}
        </span>
    );
}
