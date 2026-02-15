"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    MoreHorizontal,
    Star,
    Pencil,
    Trash2,
    FolderInput,
    Share2,
    Copy,
    Download,
    GripVertical,
} from "lucide-react";
import type { ConversationPreview } from "@/lib/hooks/useConversations";
import type { Folder } from "@/types/api";

interface ConversationItemProps {
    conversation: ConversationPreview;
    folders?: Folder[];
    onRename?: (id: string) => void;
    onDelete?: (id: string) => void;
    onToggleFavorite?: (id: string, currentStatus: boolean) => void;
    onMoveToFolder?: (id: string, folderId: string | null) => void;
    onShare?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    onExport?: (id: string, title: string) => void;
    isDraggable?: boolean;
}

export const ConversationItem = memo(function ConversationItem({
    conversation,
    folders = [],
    onRename,
    onDelete,
    onToggleFavorite,
    onMoveToFolder,
    onShare,
    onDuplicate,
    onExport,
    isDraggable = true,
}: ConversationItemProps) {
    const pathname = usePathname();
    const isActive = pathname === `/chat/${conversation.id}`;
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Drag-and-drop setup
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `conversation-${conversation.id}`,
        data: {
            type: "conversation",
            conversation,
        },
        disabled: !isDraggable,
    });

    const style = transform
        ? {
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group relative rounded-md transition-colors w-full overflow-hidden",
                isActive
                    ? "bg-accent"
                    : "hover:bg-accent/50",
                isDragging && "opacity-50 z-50 shadow-lg"
            )}
        >
            <div className="flex items-center min-w-0">
                {/* Drag handle - only takes space on hover via w-0/w-5 toggle */}
                {isDraggable && (
                    <div
                        {...attributes}
                        {...listeners}
                        className="flex-shrink-0 w-0 group-hover:w-5 overflow-hidden transition-all cursor-grab active:cursor-grabbing pl-1"
                    >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </div>
                )}

                <Link
                    href={`/chat/${conversation.id}`}
                    className={cn("flex-1 min-w-0 truncate py-2 pr-8 text-sm", isDraggable ? "pl-2" : "px-3")}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        {conversation.isFavorite && (
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                        )}
                        <span className="truncate">{conversation.title}</span>
                    </div>
                    {conversation.tags && conversation.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                            {conversation.tags.slice(0, 3).map((tag) => (
                                <span
                                    key={tag.id}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                                >
                                    {tag.tag}
                                </span>
                            ))}
                            {conversation.tags.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">+{conversation.tags.length - 3}</span>
                            )}
                        </div>
                    )}
                </Link>
            </div>

            {/* Menu button - absolutely positioned so it never gets clipped */}
            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 transition-opacity",
                            isActive || isMenuOpen
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100"
                        )}
                    >
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onToggleFavorite?.(conversation.id, conversation.isFavorite)}>
                        <Star className={cn("mr-2 h-4 w-4", conversation.isFavorite && "fill-yellow-400 text-yellow-400")} />
                        {conversation.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={() => onRename?.(conversation.id)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Rename
                    </DropdownMenuItem>

                    {folders.length > 0 && (
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <FolderInput className="mr-2 h-4 w-4" />
                                Move to folder
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={() => onMoveToFolder?.(conversation.id, null)}>
                                    No folder
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {folders.map((folder) => (
                                    <DropdownMenuItem
                                        key={folder.id}
                                        onClick={() => onMoveToFolder?.(conversation.id, folder.id)}
                                    >
                                        <div
                                            className="mr-2 h-3 w-3 rounded-sm"
                                            style={{ backgroundColor: folder.color }}
                                        />
                                        {folder.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    )}

                    <DropdownMenuSeparator />

                    <DropdownMenuItem onClick={() => onDuplicate?.(conversation.id)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={() => onShare?.(conversation.id)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={() => onExport?.(conversation.id, conversation.title)}>
                        <Download className="mr-2 h-4 w-4" />
                        Export
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete?.(conversation.id)}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
});
