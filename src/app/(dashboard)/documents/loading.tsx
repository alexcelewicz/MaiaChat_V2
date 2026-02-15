export default function DocumentsLoading() {
    return (
        <div className="container max-w-6xl py-8 space-y-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-40 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-64 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-10 w-32 bg-muted animate-pulse rounded" />
            </div>

            {/* Search and filters skeleton */}
            <div className="flex gap-4">
                <div className="h-10 flex-1 bg-muted animate-pulse rounded" />
                <div className="h-10 w-32 bg-muted animate-pulse rounded" />
            </div>

            {/* Documents grid skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                        key={i}
                        className="h-40 bg-muted animate-pulse rounded-lg"
                    />
                ))}
            </div>
        </div>
    );
}
