import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatPageClient } from "./ChatPageClient";

export const metadata: Metadata = {
    alternates: {
        canonical: "/chat",
    },
};

export default function ChatPage() {
    return (
        <Suspense>
            <ChatPageClient />
        </Suspense>
    );
}
