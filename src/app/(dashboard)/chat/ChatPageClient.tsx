"use client";

import { ChatInterface } from "@/components/chat/ChatInterface";
import { useSearchParams } from "next/navigation";

export function ChatPageClient() {
    const searchParams = useSearchParams();
    // Use search params as key to force remount on each "New Chat" click.
    const chatKey = searchParams.get("new") || "default";
    return <ChatInterface key={chatKey} />;
}
