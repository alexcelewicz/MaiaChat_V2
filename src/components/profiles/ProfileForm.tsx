"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const profileFormSchema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    ragConfig: z.object({
        enabled: z.boolean(),
        topK: z.number().min(1).max(20),
    }),
    orchestrationConfig: z.object({
        mode: z.enum(["single", "sequential", "parallel", "hierarchical", "consensus", "auto"]),
        enableDebug: z.boolean(),
    }),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface Profile {
    id: string;
    name: string;
    ragConfig?: {
        enabled?: boolean;
        topK?: number;
    };
    orchestrationConfig?: {
        mode?: string;
        enableDebug?: boolean;
    };
}

interface ProfileFormProps {
    profile?: Profile;
    onSuccess?: () => void;
}

const ORCHESTRATION_MODES = [
    { value: "single", label: "Single Agent", description: "One agent handles all queries" },
    { value: "sequential", label: "Sequential", description: "Agents work one after another" },
    { value: "parallel", label: "Parallel", description: "Agents work simultaneously" },
    { value: "hierarchical", label: "Hierarchical", description: "Lead agent coordinates others" },
    { value: "consensus", label: "Consensus", description: "Agents vote on responses" },
    { value: "auto", label: "Auto", description: "System selects best mode" },
];

export function ProfileForm({ profile, onSuccess }: ProfileFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            name: profile?.name || "",
            ragConfig: {
                enabled: profile?.ragConfig?.enabled || false,
                topK: profile?.ragConfig?.topK || 5,
            },
            orchestrationConfig: {
                mode: (profile?.orchestrationConfig?.mode as ProfileFormValues["orchestrationConfig"]["mode"]) || "single",
                enableDebug: profile?.orchestrationConfig?.enableDebug || false,
            },
        },
    });

    const onSubmit = async (data: ProfileFormValues) => {
        try {
            setIsSubmitting(true);

            const url = profile ? `/api/profiles/${profile.id}` : "/api/profiles";
            const method = profile ? "PATCH" : "POST";

            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to save profile");
            }

            toast.success(profile ? "Profile updated" : "Profile created");
            onSuccess?.();
        } catch (error) {
            console.error("Save profile error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to save profile");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Name */}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Profile Name</FormLabel>
                            <FormControl>
                                <Input placeholder="My Profile" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Accordion type="single" collapsible defaultValue="orchestration">
                    {/* Orchestration Settings */}
                    <AccordionItem value="orchestration">
                        <AccordionTrigger>Orchestration Settings</AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-4">
                            <FormField
                                control={form.control}
                                name="orchestrationConfig.mode"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Mode</FormLabel>
                                        <Select
                                            value={field.value}
                                            onValueChange={field.onChange}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {ORCHESTRATION_MODES.map((mode) => (
                                                    <SelectItem key={mode.value} value={mode.value}>
                                                        <div>
                                                            <div className="font-medium">{mode.label}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {mode.description}
                                                            </div>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="orchestrationConfig.enableDebug"
                                render={({ field }) => (
                                    <FormItem className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <FormLabel>Debug Mode</FormLabel>
                                            <FormDescription>
                                                Show agent reasoning in responses
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </AccordionContent>
                    </AccordionItem>

                    {/* RAG Settings */}
                    <AccordionItem value="rag">
                        <AccordionTrigger>RAG Settings</AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-4">
                            <FormField
                                control={form.control}
                                name="ragConfig.enabled"
                                render={({ field }) => (
                                    <FormItem className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <FormLabel>Enable RAG</FormLabel>
                                            <FormDescription>
                                                Search your documents for context
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {form.watch("ragConfig.enabled") && (
                                <FormField
                                    control={form.control}
                                    name="ragConfig.topK"
                                    render={({ field }) => (
                                        <FormItem>
                                            <div className="flex items-center justify-between">
                                                <FormLabel>Results per Query</FormLabel>
                                                <span className="text-sm text-muted-foreground">
                                                    {field.value}
                                                </span>
                                            </div>
                                            <FormControl>
                                                <Slider
                                                    value={[field.value]}
                                                    onValueChange={([value]) => field.onChange(value)}
                                                    min={1}
                                                    max={20}
                                                    step={1}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                Number of document chunks to retrieve
                                            </FormDescription>
                                        </FormItem>
                                    )}
                                />
                            )}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Submit */}
                <div className="flex justify-end gap-2">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {profile ? "Update Profile" : "Create Profile"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
