"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
    Folder,
    MoreHorizontal,
    Plus,
    Trash2,
    Pencil,
    ChevronRight,
    ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible";
import { useFolders, createFolder, updateFolder, deleteFolder } from "@/lib/hooks/useFolders";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { RenameDialog } from "./RenameDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Folder as FolderType } from "@/types/api";

interface FolderListProps {
    selectedFolderId?: string | null;
    onSelectFolder: (folderId: string | null) => void;
    className?: string;
}

// Droppable folder item component
function DroppableFolderItem({
    folder,
    isSelected,
    onSelect,
    onRename,
    onDelete,
}: {
    folder: FolderType;
    isSelected: boolean;
    onSelect: () => void;
    onRename: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: `folder-${folder.id}`,
        data: {
            type: "folder",
            folderId: folder.id,
        },
    });

    return (
        <div ref={setNodeRef} className="group flex items-center w-full">
            <Button
                variant={isSelected ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                    "flex-1 justify-start pl-8 font-normal truncate transition-all",
                    isOver && "ring-2 ring-primary ring-offset-1 bg-primary/10"
                )}
                onClick={onSelect}
            >
                <div
                    className="mr-2 h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: folder.color }}
                />
                <span className="truncate">{folder.name}</span>
                {isOver && (
                    <span className="ml-auto text-xs text-primary">Drop here</span>
                )}
            </Button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <MoreHorizontal className="h-3 w-3" />
                        <span className="sr-only">Menu</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={onRename}>
                        <Pencil className="mr-2 h-3 w-3" />
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={onDelete}
                    >
                        <Trash2 className="mr-2 h-3 w-3" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

// Droppable "All Conversations" area (remove from folder)
function DroppableAllConversations({
    isSelected,
    onSelect,
}: {
    isSelected: boolean;
    onSelect: () => void;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: "folder-none",
        data: {
            type: "folder",
            folderId: null,
        },
    });

    return (
        <Button
            ref={setNodeRef}
            variant={isSelected ? "secondary" : "ghost"}
            size="sm"
            className={cn(
                "w-full justify-start pl-8 font-normal transition-all",
                isOver && "ring-2 ring-primary ring-offset-1 bg-primary/10"
            )}
            onClick={onSelect}
        >
            <Folder className="mr-2 h-4 w-4" />
            All Conversations
            {isOver && (
                <span className="ml-auto text-xs text-primary">Remove from folder</span>
            )}
        </Button>
    );
}

export function FolderList({ selectedFolderId, onSelectFolder, className }: FolderListProps) {
    const { folders, isLoading } = useFolders();
    const [isExpanded, setIsExpanded] = useState(true);

    // Dialog states
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [targetFolder, setTargetFolder] = useState<FolderType | null>(null);

    // Create form state
    const [newFolderName, setNewFolderName] = useState("");
    const [newFolderColor, setNewFolderColor] = useState("#6366f1");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Color palette for picker
    const colors = [
        "#6366f1", // Indigo
        "#ef4444", // Red
        "#f59e0b", // Amber
        "#10b981", // Emerald
        "#3b82f6", // Blue
        "#8b5cf6", // Violet
        "#ec4899", // Pink
        "#6b7280", // Gray
    ];

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;

        try {
            setIsSubmitting(true);
            await createFolder(newFolderName, newFolderColor);
            setIsCreateOpen(false);
            setNewFolderName("");
            setNewFolderColor("#6366f1");
        } catch (error) {
            console.error("Failed to create folder:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRename = async (newName: string) => {
        if (!targetFolder) return;

        try {
            setIsSubmitting(true);
            await updateFolder(targetFolder.id, { name: newName });
            setIsRenameOpen(false);
            setTargetFolder(null);
        } catch (error) {
            console.error("Failed to update folder:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!targetFolder) return;

        try {
            setIsSubmitting(true);
            await deleteFolder(targetFolder.id);
            if (selectedFolderId === targetFolder.id) {
                onSelectFolder(null);
            }
            setIsDeleteOpen(false);
            setTargetFolder(null);
        } catch (error) {
            console.error("Failed to delete folder:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const openRename = (e: React.MouseEvent, folder: FolderType) => {
        e.stopPropagation();
        setTargetFolder(folder);
        setIsRenameOpen(true);
    };

    const openDelete = (e: React.MouseEvent, folder: FolderType) => {
        e.stopPropagation();
        setTargetFolder(folder);
        setIsDeleteOpen(true);
    };

    if (isLoading) {
        return <div className="p-4 text-sm text-muted-foreground">Loading folders...</div>;
    }

    return (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className={cn("space-y-2", className)}>
            <div className="flex items-center justify-between px-4 py-2">
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent w-full justify-start font-semibold text-xs tracking-tight text-muted-foreground uppercase">
                        {isExpanded ? <ChevronDown className="mr-2 h-3 w-3" /> : <ChevronRight className="mr-2 h-3 w-3" />}
                        Folders
                    </Button>
                </CollapsibleTrigger>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-auto"
                    onClick={() => setIsCreateOpen(true)}
                >
                    <Plus className="h-3 w-3" />
                    <span className="sr-only">New Folder</span>
                </Button>
            </div>

            <CollapsibleContent>
                <ScrollArea className="max-h-[300px]">
                    <div className="space-y-1 px-2">
                        <DroppableAllConversations
                            isSelected={selectedFolderId === null}
                            onSelect={() => onSelectFolder(null)}
                        />

                        {folders.map((folder) => (
                            <DroppableFolderItem
                                key={folder.id}
                                folder={folder}
                                isSelected={selectedFolderId === folder.id}
                                onSelect={() => onSelectFolder(folder.id)}
                                onRename={(e) => openRename(e, folder)}
                                onDelete={(e) => openDelete(e, folder)}
                            />
                        ))}
                    </div>
                </ScrollArea>
            </CollapsibleContent>

            {/* Create Folder Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Folder</DialogTitle>
                        <DialogDescription>Organize your conversations with folders.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate}>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    placeholder="Folder Name"
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Color</Label>
                                <div className="flex flex-wrap gap-2">
                                    {colors.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            className={cn(
                                                "h-6 w-6 rounded-full border border-transparent transition-all hover:scale-110",
                                                newFolderColor === c && "ring-2 ring-primary ring-offset-2"
                                            )}
                                            style={{ backgroundColor: c }}
                                            onClick={() => setNewFolderColor(c)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!newFolderName.trim() || isSubmitting}>
                                {isSubmitting ? "Creating..." : "Create Folder"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <RenameDialog
                isOpen={isRenameOpen}
                onOpenChange={setIsRenameOpen}
                title="Rename Folder"
                initialValue={targetFolder?.name || ""}
                onConfirm={handleRename}
                isLoading={isSubmitting}
            />

            <DeleteConfirmDialog
                isOpen={isDeleteOpen}
                onOpenChange={setIsDeleteOpen}
                title="Delete Folder"
                description={`Are you sure you want to delete "${targetFolder?.name}"? Conversations inside will be kept but removed from this folder.`}
                onConfirm={handleDelete}
                isLoading={isSubmitting}
            />
        </Collapsible>
    );
}
