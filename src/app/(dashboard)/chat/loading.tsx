import { Loader2 } from "lucide-react";

export default function ChatLoading() {
    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.16))]">
            {/* Header skeleton */}
            <div className="border-b px-4 py-3 flex items-center justify-between">
                <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                <div className="flex gap-2">
                    <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                    <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                </div>
            </div>

            {/* Messages skeleton */}
            <div className="flex-1 p-4 space-y-4 max-w-4xl mx-auto w-full overflow-hidden">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className={`flex gap-3 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}
                    >
                        <div className="h-8 w-8 bg-muted animate-pulse rounded-full flex-shrink-0" />
                        <div className={`space-y-2 ${i % 2 === 0 ? "items-end" : ""}`}>
                            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                            <div className="h-4 w-64 bg-muted animate-pulse rounded" />
                            {i === 1 && <div className="h-4 w-40 bg-muted animate-pulse rounded" />}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input skeleton */}
            <div className="border-t p-4 max-w-4xl mx-auto w-full">
                <div className="h-12 bg-muted animate-pulse rounded-lg" />
            </div>
        </div>
    );
}
