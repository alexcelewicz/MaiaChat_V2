"use client";

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default function OnboardingPage() {
    return (
        <div className="flex-1 p-6 flex items-center justify-center min-h-[calc(100vh-4rem)]">
            <OnboardingWizard />
        </div>
    );
}
