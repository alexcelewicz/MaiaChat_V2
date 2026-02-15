export default function SettingsLoading() {
    return (
        <div className="container max-w-4xl py-8 space-y-8">
            {/* Header skeleton */}
            <div className="space-y-2">
                <div className="h-8 w-32 bg-muted animate-pulse rounded" />
                <div className="h-4 w-56 bg-muted animate-pulse rounded" />
            </div>

            {/* API Keys section skeleton */}
            <div className="space-y-4">
                <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                <div className="grid gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="flex items-center justify-between p-4 border rounded-lg"
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-muted animate-pulse rounded" />
                                <div className="space-y-2">
                                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                                    <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                                </div>
                            </div>
                            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Preferences section skeleton */}
            <div className="space-y-4">
                <div className="h-6 w-28 bg-muted animate-pulse rounded" />
                <div className="space-y-4">
                    {[1, 2].map((i) => (
                        <div
                            key={i}
                            className="flex items-center justify-between p-4 border rounded-lg"
                        >
                            <div className="space-y-2">
                                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                                <div className="h-3 w-48 bg-muted animate-pulse rounded" />
                            </div>
                            <div className="h-6 w-12 bg-muted animate-pulse rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
