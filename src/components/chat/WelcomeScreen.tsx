"use client";

import { useUser } from "@/lib/hooks/useUser";
import {
    Brain,
    MessageSquare,
    Sparkles,
    Key,
    Search,
    Mic,
    Clock,
    FileText,
    Zap,
    Globe,
    Bot,
    Workflow
} from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
    {
        icon: Brain,
        title: "Unlimited Memory",
        description: "Never forget a conversation. Full context across all your chats.",
        gradient: "from-violet-500 to-purple-600",
    },
    {
        icon: Sparkles,
        title: "20+ AI Skills",
        description: "Web search, code execution, image generation, and more.",
        gradient: "from-amber-500 to-orange-600",
    },
    {
        icon: Key,
        title: "Bring Your Own Keys",
        description: "OpenAI, Anthropic, Google, xAI - use your own API keys.",
        gradient: "from-emerald-500 to-teal-600",
    },
    {
        icon: MessageSquare,
        title: "Multi-Channel",
        description: "Chat via Telegram, Discord, Slack, or right here on the web.",
        gradient: "from-blue-500 to-cyan-600",
    },
    {
        icon: Search,
        title: "Gemini File Search",
        description: "RAG-powered search across your uploaded documents.",
        gradient: "from-pink-500 to-rose-600",
    },
    {
        icon: Mic,
        title: "Voice Mode",
        description: "Speak naturally with real-time voice input and output.",
        gradient: "from-indigo-500 to-violet-600",
    },
    {
        icon: Clock,
        title: "Scheduled Tasks",
        description: "Automate AI tasks on any schedule. Wake up to insights.",
        gradient: "from-orange-500 to-red-600",
    },
    {
        icon: FileText,
        title: "Document Analysis",
        description: "Upload PDFs, Word docs, Excel files - AI understands them all.",
        gradient: "from-cyan-500 to-blue-600",
    },
];

const quickFeatures = [
    { icon: Bot, label: "Multi-Agent Orchestration" },
    { icon: Workflow, label: "Tool Calling" },
    { icon: Globe, label: "Real-time Web Access" },
    { icon: Zap, label: "Background Agents" },
];

function FeatureCard({
    icon: Icon,
    title,
    description,
    gradient,
    index
}: {
    icon: typeof Brain;
    title: string;
    description: string;
    gradient: string;
    index: number;
}) {
    return (
        <div
            className={cn(
                "group relative p-4 rounded-xl border bg-card/50 backdrop-blur-sm",
                "hover:bg-card hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20",
                "transition-all duration-300 ease-out",
                "animate-in fade-in slide-in-from-bottom-4"
            )}
            style={{ animationDelay: `${index * 75}ms`, animationFillMode: "backwards" }}
        >
            {/* Gradient orb background */}
            <div
                className={cn(
                    "absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-0",
                    "group-hover:opacity-10 transition-opacity duration-500",
                    "bg-gradient-to-br blur-2xl",
                    gradient
                )}
            />

            <div className="relative flex items-start gap-3">
                <div className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                    "bg-gradient-to-br shadow-sm",
                    gradient
                )}>
                    <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-foreground mb-0.5">
                        {title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function WelcomeScreen() {
    const { isAuthenticated, isLoading: isAuthLoading } = useUser();

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] py-8 px-4">
            {/* Hero Section */}
            <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Logo/Brand */}
                <div className="inline-flex items-center justify-center mb-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-violet-500/20 blur-xl rounded-full" />
                        <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/25">
                            <span className="text-primary-foreground font-bold text-2xl">M</span>
                        </div>
                    </div>
                </div>

                <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2 tracking-tight">
                    Welcome to{" "}
                    <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
                        MAIAChat
                    </span>
                </h1>
                <p className="text-muted-foreground text-base max-w-md mx-auto">
                    Your multi-agent AI assistant with unlimited memory, powerful skills,
                    and seamless multi-channel integration.
                </p>
            </div>

            {/* Quick Feature Pills */}
            <div
                className="flex flex-wrap justify-center gap-2 mb-8 animate-in fade-in slide-in-from-bottom-3 duration-500"
                style={{ animationDelay: "150ms", animationFillMode: "backwards" }}
            >
                {quickFeatures.map(({ icon: Icon, label }) => (
                    <div
                        key={label}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 border text-xs font-medium text-muted-foreground"
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </div>
                ))}
            </div>

            {/* Feature Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl w-full mb-8">
                {features.map((feature, index) => (
                    <FeatureCard key={feature.title} {...feature} index={index} />
                ))}
            </div>

            {/* Call to Action */}
            <div
                className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500"
                style={{ animationDelay: "600ms", animationFillMode: "backwards" }}
            >
                <p className="text-muted-foreground text-sm mb-2">
                    Type a message below to start chatting
                </p>
                {!isAuthLoading && !isAuthenticated && (
                    <p className="text-xs text-muted-foreground/70">
                        <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Guest mode
                        </span>
                        {" · "}
                        <span
                            className="text-primary hover:underline cursor-pointer"
                            onClick={() => window.location.href = "/register"}
                        >
                            Create an account
                        </span>
                        {" to unlock all features"}
                    </p>
                )}
            </div>
        </div>
    );
}
