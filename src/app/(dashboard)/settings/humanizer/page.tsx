"use client";

import { HumanizerSettings } from "@/components/settings/HumanizerSettings";

export default function HumanizerPage() {
    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Content Humanizer</h1>
                <p className="text-muted-foreground mt-1">
                    Remove AI-sounding patterns from responses. Configure intensity and categories.
                </p>
            </div>
            <HumanizerSettings />
        </div>
    );
}
