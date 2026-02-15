export default function DashboardLoading() {
    return (
        <div className="container max-w-6xl py-8 space-y-8">
            {/* Header skeleton */}
            <div className="space-y-2">
                <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                <div className="h-4 w-64 bg-muted animate-pulse rounded" />
            </div>

            {/* Quick actions skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className="h-24 bg-muted animate-pulse rounded-lg"
                    />
                ))}
            </div>

            {/* Stats skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="h-32 bg-muted animate-pulse rounded-lg"
                    />
                ))}
            </div>

            {/* Recent conversations skeleton */}
            <div className="space-y-4">
                <div className="h-6 w-40 bg-muted animate-pulse rounded" />
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-16 bg-muted animate-pulse rounded-lg"
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
