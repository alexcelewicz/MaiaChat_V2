"use client";

import { useState } from "react";
import {
    Sparkles, Mail, Calendar, Globe, FileText, Code,
    Brain, MessageSquare, BarChart3, Search
} from "lucide-react";

interface QuickAction {
    title: string;
    description: string;
    prompt: string;
    icon: React.ReactNode;
    category: string;
}

const QUICK_ACTIONS: QuickAction[] = [
    {
        title: "Morning Briefing",
        description: "Get a summary of emails, calendar, and tasks",
        prompt: "Give me a morning briefing. Check my recent emails and summarize the important ones. List my calendar events for today. Highlight any urgent items that need my attention.",
        icon: <Sparkles className="h-4 w-4" />,
        category: "productivity",
    },
    {
        title: "Summarize a Document",
        description: "Upload or paste a document to summarize",
        prompt: "I'd like you to summarize a document for me. Please wait for me to paste the content or upload a file.",
        icon: <FileText className="h-4 w-4" />,
        category: "productivity",
    },
    {
        title: "Draft an Email",
        description: "Compose a professional email",
        prompt: "Help me draft a professional email. I'll give you the context and recipient details.",
        icon: <Mail className="h-4 w-4" />,
        category: "communication",
    },
    {
        title: "Schedule a Meeting",
        description: "Find a time and create a calendar event",
        prompt: "Help me schedule a meeting. Check my calendar for available slots this week and suggest good times. I'll tell you who needs to attend.",
        icon: <Calendar className="h-4 w-4" />,
        category: "productivity",
    },
    {
        title: "Research a Topic",
        description: "Search the web and compile findings",
        prompt: "I need you to research a topic for me. Search the web for the latest information and compile a comprehensive summary. The topic is:",
        icon: <Search className="h-4 w-4" />,
        category: "research",
    },
    {
        title: "Code Review",
        description: "Review code for bugs and improvements",
        prompt: "I'd like you to review some code. I'll paste it below. Please check for bugs, security issues, performance problems, and suggest improvements.",
        icon: <Code className="h-4 w-4" />,
        category: "development",
    },
    {
        title: "Explain a Concept",
        description: "Get a clear explanation of any topic",
        prompt: "Explain the following concept to me in simple terms, using analogies where helpful:",
        icon: <Brain className="h-4 w-4" />,
        category: "learning",
    },
    {
        title: "Brainstorm Ideas",
        description: "Generate creative ideas on any topic",
        prompt: "Let's brainstorm ideas together. I'll give you the context and constraints, and you generate creative suggestions.",
        icon: <MessageSquare className="h-4 w-4" />,
        category: "creative",
    },
    {
        title: "Analyze Data",
        description: "Help analyze and visualize data",
        prompt: "Help me analyze some data. I'll share the dataset or describe it, and you provide insights, patterns, and suggestions for visualization.",
        icon: <BarChart3 className="h-4 w-4" />,
        category: "research",
    },
    {
        title: "Web Scraping",
        description: "Extract information from a website",
        prompt: "I need to extract information from a website. Please fetch and analyze the content from this URL:",
        icon: <Globe className="h-4 w-4" />,
        category: "research",
    },
];

interface QuickActionsProps {
    onSelectAction: (prompt: string) => void;
}

export function QuickActions({ onSelectAction }: QuickActionsProps) {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const categories = [...new Set(QUICK_ACTIONS.map(a => a.category))];
    const filteredActions = selectedCategory
        ? QUICK_ACTIONS.filter(a => a.category === selectedCategory)
        : QUICK_ACTIONS;

    return (
        <div className="w-full max-w-3xl mx-auto px-4">
            <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-foreground">What can I help you with?</h2>
                <p className="text-sm text-muted-foreground mt-1">Choose a quick action or type your own message</p>
            </div>

            {/* Category filter */}
            <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
                <button
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        !selectedCategory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                    onClick={() => setSelectedCategory(null)}
                >
                    All
                </button>
                {categories.map(cat => (
                    <button
                        key={cat}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                            selectedCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                        onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Action grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredActions.map((action, i) => (
                    <button
                        key={i}
                        className="flex items-start gap-3 border rounded-lg p-3 text-left hover:bg-accent/50 hover:border-primary/30 transition-all group"
                        onClick={() => onSelectAction(action.prompt)}
                    >
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                            {action.icon}
                        </div>
                        <div>
                            <p className="text-sm font-medium">{action.title}</p>
                            <p className="text-xs text-muted-foreground">{action.description}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
