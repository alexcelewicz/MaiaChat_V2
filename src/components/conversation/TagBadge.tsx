import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface TagBadgeProps {
    tag: string;
    onRemove?: (tag: string) => void;
    className?: string;
}

export function TagBadge({ tag, onRemove, className }: TagBadgeProps) {
    return (
        <Badge variant="secondary" className={className}>
            {tag}
            {onRemove && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove(tag);
                    }}
                    className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Remove {tag}</span>
                </button>
            )}
        </Badge>
    );
}
