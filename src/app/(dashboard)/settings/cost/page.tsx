"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { DollarSign, TrendingDown, AlertTriangle, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CostManagementPage() {
    const [costOptimizationEnabled, setCostOptimizationEnabled] = useState(false);
    const [monthlyBudget, setMonthlyBudget] = useState(0);
    const [preferCheaperFallback, setPreferCheaperFallback] = useState(false);
    const [alertPercentage, setAlertPercentage] = useState(80);
    const [saving, setSaving] = useState(false);

    // Load settings from config
    useEffect(() => {
        fetch("/api/admin/config", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data?.config?.cost) {
                    const c = data.config.cost;
                    setCostOptimizationEnabled(c.costOptimizationEnabled ?? false);
                    setMonthlyBudget(c.monthlyBudgetUsd ?? 0);
                    setPreferCheaperFallback(c.preferCheaperFallback ?? false);
                    setAlertPercentage(c.alertAtPercentage ?? 80);
                }
            })
            .catch(() => null);
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/config", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cost: {
                        costOptimizationEnabled,
                        monthlyBudgetUsd: monthlyBudget,
                        preferCheaperFallback,
                        alertAtPercentage: alertPercentage,
                    },
                }),
            });
            if (res.ok) {
                toast.success("Cost settings saved");
            } else {
                toast.error("Failed to save cost settings");
            }
        } catch {
            toast.error("Failed to save cost settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Cost Management</h1>
                <p className="text-muted-foreground mt-1">
                    Set budgets, enable cost-aware model routing, and track API spending
                </p>
            </div>

            {/* Cost Optimization Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingDown className="h-5 w-5" />
                        Cost Optimization
                    </CardTitle>
                    <CardDescription>
                        Automatically route to cheaper models when approaching budget limits
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                        <div className="space-y-1">
                            <Label htmlFor="cost-opt">Enable Cost Optimization</Label>
                            <p className="text-sm text-muted-foreground">
                                When enabled, the system will automatically prefer cheaper model alternatives when budget is tight
                            </p>
                        </div>
                        <Switch
                            id="cost-opt"
                            checked={costOptimizationEnabled}
                            onCheckedChange={setCostOptimizationEnabled}
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                        <div className="space-y-1">
                            <Label htmlFor="cheaper-fallback">Prefer Cheaper Fallbacks</Label>
                            <p className="text-sm text-muted-foreground">
                                Sort fallback models by cost (cheapest first) instead of capability matching
                            </p>
                        </div>
                        <Switch
                            id="cheaper-fallback"
                            checked={preferCheaperFallback}
                            onCheckedChange={setPreferCheaperFallback}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Budget Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        Monthly Budget
                    </CardTitle>
                    <CardDescription>
                        Set a monthly spending limit. Set to 0 for unlimited.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="budget">Monthly Budget (USD)</Label>
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">$</span>
                            <Input
                                id="budget"
                                type="number"
                                min={0}
                                step={1}
                                value={monthlyBudget}
                                onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                                className="w-40"
                            />
                            {monthlyBudget === 0 && (
                                <Badge variant="secondary">Unlimited</Badge>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label>Alert Threshold: {alertPercentage}%</Label>
                        <p className="text-sm text-muted-foreground">
                            Receive alerts when spending reaches this percentage of your budget
                        </p>
                        <Slider
                            value={[alertPercentage]}
                            onValueChange={([v]) => setAlertPercentage(v)}
                            min={50}
                            max={100}
                            step={5}
                            className="w-full max-w-md"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Usage Overview Placeholder */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Usage Overview
                    </CardTitle>
                    <CardDescription>
                        Current month API usage and cost breakdown
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p>Usage tracking data will appear here once cost optimization is enabled.</p>
                        <p className="text-sm mt-1">Cost data is aggregated from all API calls across providers.</p>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Cost Settings
                </Button>
            </div>
        </div>
    );
}
