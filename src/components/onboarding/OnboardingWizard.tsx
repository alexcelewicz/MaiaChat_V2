"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    MessageSquare, Key, Bot, Radio, Wrench, CheckCircle,
    ArrowRight, ArrowLeft, SkipForward, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    content: React.ReactNode;
}

export function OnboardingWizard() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<string[]>([]);

    // Load onboarding state from API
    useEffect(() => {
        fetch("/api/onboarding", { credentials: "include" })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.completedSteps) {
                    setCompletedSteps(data.completedSteps);
                }
                if (data?.currentStep) {
                    const idx = steps.findIndex(s => s.id === data.currentStep);
                    if (idx >= 0) setCurrentStep(idx);
                }
            })
            .catch(() => {});
    }, []);

    const steps: OnboardingStep[] = [
        {
            id: "welcome",
            title: "Welcome to MAIAChat",
            description: "Your multi-agent AI assistant platform",
            icon: <Sparkles className="h-8 w-8 text-primary" />,
            content: (
                <div className="space-y-4">
                    <p className="text-muted-foreground">
                        MAIAChat is a powerful AI assistant that can help you with:
                    </p>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> Chat with 40+ AI models from 8 providers</li>
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> Search the web, manage emails, and browse calendars</li>
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> Upload documents and ask questions about them (RAG)</li>
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> Connect to Telegram, Slack, Discord, WhatsApp & more</li>
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> Automate tasks with scheduled jobs and workflows</li>
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> Browse websites and automate actions</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-4">
                        Let&apos;s get you set up in just a few steps!
                    </p>
                </div>
            ),
        },
        {
            id: "api_keys",
            title: "Set Up AI Provider",
            description: "Connect at least one AI model provider",
            icon: <Key className="h-8 w-8 text-primary" />,
            content: (
                <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                        To start chatting, you need an API key from at least one provider:
                    </p>
                    <div className="grid gap-2">
                        {[
                            { name: "Anthropic (Claude)", desc: "Best for reasoning and code" },
                            { name: "OpenAI (GPT-4)", desc: "Best all-around model" },
                            { name: "Google (Gemini)", desc: "Best for grounding and file search" },
                            { name: "xAI (Grok)", desc: "Great for real-time information" },
                            { name: "OpenRouter", desc: "Access 100+ models with one key" },
                        ].map(provider => (
                            <div key={provider.name} className="flex items-center justify-between border rounded-md p-3">
                                <div>
                                    <p className="text-sm font-medium">{provider.name}</p>
                                    <p className="text-xs text-muted-foreground">{provider.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => router.push("/settings")}>
                        <Key className="mr-2 h-4 w-4" />
                        Go to Settings to Add API Keys
                    </Button>
                </div>
            ),
        },
        {
            id: "first_chat",
            title: "Start Your First Chat",
            description: "Try talking to an AI model",
            icon: <MessageSquare className="h-8 w-8 text-primary" />,
            content: (
                <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                        Here are some things you can try:
                    </p>
                    <div className="space-y-2">
                        {[
                            "Summarize this article for me: [paste URL]",
                            "Write a Python function that sorts a list of objects by date",
                            "What are the key differences between React and Vue?",
                            "Help me draft an email to my team about the project deadline",
                            "Search the web for the latest news about AI",
                        ].map((prompt, i) => (
                            <div key={i} className="border rounded-md p-2 text-sm cursor-pointer hover:bg-accent transition-colors"
                                onClick={() => {
                                    navigator.clipboard.writeText(prompt);
                                    toast.success("Copied to clipboard!");
                                }}>
                                {prompt}
                            </div>
                        ))}
                    </div>
                    <Button className="w-full" onClick={() => router.push("/chat")}>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Open Chat
                    </Button>
                </div>
            ),
        },
        {
            id: "channels",
            title: "Connect Messaging Channels",
            description: "Chat with your AI from Telegram, Slack, and more",
            icon: <Radio className="h-8 w-8 text-primary" />,
            content: (
                <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                        Connect your favorite messaging apps to chat with AI from anywhere:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { name: "Telegram", icon: "\u2708\uFE0F", color: "bg-blue-500" },
                            { name: "Slack", icon: "\uD83D\uDCAC", color: "bg-purple-500" },
                            { name: "Discord", icon: "\uD83C\uDFAE", color: "bg-indigo-500" },
                            { name: "WhatsApp", icon: "\uD83D\uDCF1", color: "bg-green-600" },
                            { name: "Teams", icon: "\uD83D\uDC65", color: "bg-blue-600" },
                            { name: "WebChat", icon: "\uD83C\uDF10", color: "bg-gray-500" },
                        ].map(channel => (
                            <div key={channel.name} className="flex items-center gap-2 border rounded-md p-3">
                                <div className={`h-8 w-8 rounded-md ${channel.color} flex items-center justify-center text-white text-lg`}>
                                    {channel.icon}
                                </div>
                                <span className="text-sm font-medium">{channel.name}</span>
                            </div>
                        ))}
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => router.push("/channels")}>
                        <Radio className="mr-2 h-4 w-4" />
                        Set Up Channels
                    </Button>
                </div>
            ),
        },
        {
            id: "tools",
            title: "Explore AI Tools",
            description: "Your AI can search, email, manage calendars, and more",
            icon: <Wrench className="h-8 w-8 text-primary" />,
            content: (
                <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                        Enable powerful tools to make your AI assistant more capable:
                    </p>
                    <div className="grid gap-2">
                        {[
                            { name: "Web Search", desc: "Search the internet in real-time", icon: "\uD83D\uDD0D" },
                            { name: "Email (Gmail)", desc: "Read, send, and manage emails", icon: "\uD83D\uDCE7" },
                            { name: "Google Calendar", desc: "View and manage calendar events", icon: "\uD83D\uDCC5" },
                            { name: "GitHub", desc: "Manage repos, issues, and PRs", icon: "\uD83D\uDC19" },
                            { name: "Browser Automation", desc: "Navigate websites and fill forms", icon: "\uD83C\uDF10" },
                            { name: "Document RAG", desc: "Ask questions about your documents", icon: "\uD83D\uDCC4" },
                            { name: "File System", desc: "Read, write, and manage files", icon: "\uD83D\uDCC1" },
                            { name: "Shell Commands", desc: "Execute terminal commands", icon: "\uD83D\uDCBB" },
                        ].map(tool => (
                            <div key={tool.name} className="flex items-center gap-3 border rounded-md p-2">
                                <span className="text-lg">{tool.icon}</span>
                                <div>
                                    <p className="text-sm font-medium">{tool.name}</p>
                                    <p className="text-xs text-muted-foreground">{tool.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            id: "complete",
            title: "You're All Set!",
            description: "Start using MAIAChat to its full potential",
            icon: <CheckCircle className="h-8 w-8 text-green-500" />,
            content: (
                <div className="space-y-4 text-center">
                    <div className="py-4">
                        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                        <p className="text-lg font-medium">Congratulations!</p>
                        <p className="text-muted-foreground text-sm mt-2">
                            You&apos;re ready to use MAIAChat. Here are your next steps:
                        </p>
                    </div>
                    <div className="grid gap-2 text-left">
                        <Button className="w-full justify-start" onClick={() => router.push("/chat")}>
                            <MessageSquare className="mr-2 h-4 w-4" /> Start a Chat
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={() => router.push("/documents")}>
                            <Wrench className="mr-2 h-4 w-4" /> Upload Documents
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={() => router.push("/scheduled-tasks")}>
                            <Bot className="mr-2 h-4 w-4" /> Create Scheduled Tasks
                        </Button>
                    </div>
                </div>
            ),
        },
    ];

    const markStepComplete = async (stepId: string) => {
        const newCompleted = [...new Set([...completedSteps, stepId])];
        setCompletedSteps(newCompleted);

        const nextStepId = steps[currentStep + 1]?.id || "complete";

        try {
            await fetch("/api/onboarding", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    completedSteps: newCompleted,
                    currentStep: nextStepId,
                    isComplete: currentStep === steps.length - 1,
                }),
            });
        } catch (error) {
            console.error("[Onboarding] Failed to save step progress:", error);
        }
    };

    const handleNext = () => {
        markStepComplete(steps[currentStep].id);
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSkip = async () => {
        try {
            await fetch("/api/onboarding", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    completedSteps,
                    currentStep: "complete",
                    isComplete: true,
                    skipped: true,
                }),
            });
        } catch (error) {
            console.error("[Onboarding] Failed to save skip status:", error);
        }
        router.push("/chat");
    };

    const step = steps[currentStep];

    return (
        <div className="max-w-2xl mx-auto">
            {/* Progress bar */}
            <div className="flex items-center gap-1 mb-6">
                {steps.map((s, i) => (
                    <div key={s.id} className="flex-1">
                        <div className={`h-1.5 rounded-full transition-colors ${
                            i < currentStep ? "bg-primary" :
                            i === currentStep ? "bg-primary/60" :
                            "bg-muted"
                        }`} />
                    </div>
                ))}
            </div>

            <Card>
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-2">{step.icon}</div>
                    <CardTitle className="text-xl">{step.title}</CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                </CardHeader>
                <CardContent>
                    {step.content}
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                    {currentStep > 0 && (
                        <Button variant="outline" onClick={handlePrev}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={handleSkip}>
                        <SkipForward className="mr-2 h-4 w-4" /> Skip Setup
                    </Button>
                    {currentStep < steps.length - 1 ? (
                        <Button onClick={handleNext}>
                            Next <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    ) : (
                        <Button onClick={() => { markStepComplete("complete"); router.push("/chat"); }}>
                            Get Started <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-4">
                Step {currentStep + 1} of {steps.length}
            </p>
        </div>
    );
}
