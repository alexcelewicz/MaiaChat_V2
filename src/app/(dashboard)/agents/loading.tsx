import { Loader2 } from "lucide-react";

export default function AgentsLoading() {
    return (
        <div className="container max-w-6xl py-8">
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        </div>
    );
}
