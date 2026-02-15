"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, pointerWithin } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import {
    LayoutDashboard,
    Files,
    Settings,
    Users,
    Plus,
    Loader2,
    Star,
    Search,
    Trash2,
    Inbox,
    Radio,
    CalendarClock,
    Server,
    Zap,
    Rocket,
    Sparkles,
    ChevronDown,
    ChevronUp,
    ContactRound,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
    useConversations,
    updateConversation,
    deleteConversation,
    deleteAllConversations,
    toggleFavorite,
    moveToFolder
} from "@/lib/hooks/useConversations";
import { useFolders } from "@/lib/hooks/useFolders";
import { useUser } from "@/lib/hooks/useUser";
import { FolderList } from "@/components/conversation/FolderList";
import { ConversationItem } from "@/components/conversation/ConversationItem";
import { RenameDialog } from "@/components/conversation/RenameDialog";
import { DeleteConfirmDialog } from "@/components/conversation/DeleteConfirmDialog";
import { SearchDialog } from "@/components/conversation/SearchDialog";
import { ExportDialog } from "@/components/conversation/ExportDialog";
import { ShareDialog } from "@/components/conversation/ShareDialog";
import { toast } from "sonner";
import type { ConversationPreview } from "@/lib/hooks/useConversations";

export function Sidebar({ className }: { className?: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const [filter, setFilter] = useState<{ type: 'all' | 'folder' | 'favorites', id?: string }>({ type: 'all' });
    const { isAuthenticated } = useUser();

    // Fetch conversations based on filter
    const { conversations, error, isLoading } = useConversations({
        folderId: filter.type === 'folder' && filter.id ? filter.id : undefined,
        favorite: filter.type === 'favorites' ? true : undefined,
    });

    const { folders } = useFolders();

    // Dialog states
    const [renameId, setRenameId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleteAllOpen, setDeleteAllOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [exportData, setExportData] = useState<{ id: string; title: string } | null>(null);
    const [shareData, setShareData] = useState<{ id: string; title: string } | null>(null);

    // Management section collapse state (default open on large screens, closed on smaller)
    const [managementOpen, setManagementOpen] = useState(true);

    // Onboarding completion detection
    const [onboardingDone, setOnboardingDone] = useState(false);
    useEffect(() => {
        if (!isAuthenticated) return;
        fetch("/api/onboarding", { credentials: "include" })
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                if (data && (data.isComplete || data.skippedAt)) {
                    setOnboardingDone(true);
                }
            })
            .catch(() => { /* best-effort */ });
    }, [isAuthenticated]);

    // Drag-and-drop state
    const [activeConversation, setActiveConversation] = useState<ConversationPreview | null>(null);

    // Global keyboard shortcut for search (Ctrl+K or Cmd+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                e.preventDefault();
                setSearchOpen(true);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Handlers - wrapped with useCallback for stable references with memoized children
    const handleRename = useCallback(async (newName: string) => {
        if (!renameId) return;
        try {
            setIsSubmitting(true);
            await updateConversation(renameId, { title: newName });
            setRenameId(null);
            toast.success("Conversation renamed");
        } catch {
            toast.error("Failed to rename conversation");
        } finally {
            setIsSubmitting(false);
        }
    }, [renameId]);

    const handleDelete = useCallback(async () => {
        if (!deleteId) return;
        try {
            setIsSubmitting(true);
            await deleteConversation(deleteId);
            setDeleteId(null);
            toast.success("Conversation deleted");
        } catch {
            toast.error("Failed to delete conversation");
        } finally {
            setIsSubmitting(false);
        }
    }, [deleteId]);

    const handleDeleteAll = useCallback(async () => {
        try {
            setIsSubmitting(true);
            const result = await deleteAllConversations();
            setDeleteAllOpen(false);
            toast.success(`Deleted ${result.deletedCount} conversation(s)`);
        } catch {
            toast.error("Failed to delete all conversations");
        } finally {
            setIsSubmitting(false);
        }
    }, []);

    const handleToggleFavorite = useCallback(async (id: string, currentStatus: boolean) => {
        try {
            await toggleFavorite(id, currentStatus);
            toast.success(currentStatus ? "Removed from favorites" : "Added to favorites");
        } catch {
            toast.error("Failed to update favorite status");
        }
    }, []);

    const handleMoveToFolder = useCallback(async (id: string, folderId: string | null) => {
        try {
            await moveToFolder(id, folderId);
            toast.success(folderId ? "Moved to folder" : "Removed from folder");
        } catch {
            toast.error("Failed to move conversation");
        }
    }, []);

    const handleShare = useCallback((id: string) => {
        const conv = conversations.find(c => c.id === id);
        if (conv) {
            setShareData({ id, title: conv.title });
        }
    }, [conversations]);

    const handleDuplicate = useCallback(async () => {
        toast.info("Duplicate functionality coming soon");
    }, []);

    const handleExport = useCallback((id: string, title: string) => {
        setExportData({ id, title });
    }, []);

    // Stable callbacks for setters - used by memoized ConversationItem
    const handleSetRenameId = useCallback((id: string) => setRenameId(id), []);
    const handleSetDeleteId = useCallback((id: string) => setDeleteId(id), []);

    // Drag-and-drop handlers
    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        if (active.data.current?.type === "conversation") {
            setActiveConversation(active.data.current.conversation);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveConversation(null);

        if (!over) return;

        // Check if dropped on a folder
        if (over.data.current?.type === "folder" && active.data.current?.type === "conversation") {
            const conversationId = active.data.current.conversation.id;
            const folderId = over.data.current.folderId;
            
            try {
                await moveToFolder(conversationId, folderId);
                toast.success(folderId ? "Moved to folder" : "Removed from folder");
            } catch {
                toast.error("Failed to move conversation");
            }
        }
    };

    return (
        <DndContext
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className={cn("pb-12 bg-sidebar border-r border-sidebar-border flex flex-col h-full", className)}>
                <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
                    <div className="px-3 py-2 flex-shrink-0">
                        <div className="flex h-12 items-center px-3 mb-3">
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
                                    <span className="text-primary-foreground font-bold text-sm">M</span>
                                </div>
                                <div className="flex flex-col">
                                    <h2 className="text-base font-semibold tracking-tight text-foreground">MAIAChat</h2>
                                    <span className="text-[10px] text-muted-foreground -mt-0.5">Multi-Agent AI Assistant</span>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Button
                                variant="default"
                                className="w-full justify-start shadow-sm"
                                onClick={() => {
                                    // Use a unique timestamp param to force ChatInterface remount
                                    // even when already on /chat
                                    router.push(`/chat?new=${Date.now()}`);
                                }}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                New Chat
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full justify-between text-muted-foreground hover:text-foreground"
                                onClick={() => setSearchOpen(true)}
                            >
                                <span className="flex items-center">
                                    <Search className="mr-2 h-4 w-4" />
                                    Search...
                                </span>
                                <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                                    <span className="text-xs">⌘</span>K
                                </kbd>
                            </Button>
                        </div>
                    </div>

                    {/* Show these features only for authenticated users */}
                    {isAuthenticated && (
                        <>
                            <div className="px-3 py-2 flex-shrink-0">
                                <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                                    Overview
                                </h2>
                                <div className="space-y-1">
                                    <Button
                                        variant={filter.type === 'favorites' ? "secondary" : "ghost"}
                                        className="w-full justify-start"
                                        onClick={() => setFilter({ type: 'favorites' })}
                                    >
                                        <Star className={cn("mr-2 h-4 w-4", filter.type === 'favorites' ? "fill-current" : "")} />
                                        Favorites
                                    </Button>
                                    <Button asChild variant={pathname === "/dashboard" ? "secondary" : "ghost"} className="w-full justify-start">
                                        <Link href="/dashboard">
                                            <LayoutDashboard className="mr-2 h-4 w-4" />
                                            Dashboard
                                        </Link>
                                    </Button>
                                    <Button asChild variant={pathname === "/documents" ? "secondary" : "ghost"} className="w-full justify-start">
                                        <Link href="/documents">
                                            <Files className="mr-2 h-4 w-4" />
                                            Documents
                                        </Link>
                                    </Button>
                                    <Button asChild variant={pathname === "/inbox" ? "secondary" : "ghost"} className="w-full justify-start">
                                        <Link href="/inbox">
                                            <Inbox className="mr-2 h-4 w-4" />
                                            Inbox
                                        </Link>
                                    </Button>
                                </div>
                            </div>

                            <div className="px-3 py-0 flex-shrink-0">
                                <FolderList
                                    selectedFolderId={filter.type === 'folder' ? filter.id : null}
                                    onSelectFolder={(id) => setFilter(id ? { type: 'folder', id } : { type: 'all' })}
                                />
                            </div>
                        </>
                    )}

                    {/* Show recent chats only for authenticated users */}
                    {isAuthenticated && (
                        <div className="px-3 py-2 flex-1 overflow-hidden flex flex-col min-h-[160px]">
                            <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase flex items-center justify-between">
                                <span>
                                    {filter.type === 'favorites' ? 'Favorites' :
                                        filter.type === 'folder' ? 'Folder Chats' :
                                            'Recent Chats'}
                                </span>
                                <div className="flex items-center gap-1">
                                    {conversations.length > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 rounded-full text-muted-foreground hover:text-destructive"
                                            onClick={() => setDeleteAllOpen(true)}
                                            title="Delete all chats"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    )}
                                    {filter.type !== 'all' && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 rounded-full"
                                            onClick={() => setFilter({ type: 'all' })}
                                            title="Show all"
                                        >
                                            <Users className="h-3 w-3" />
                                        </Button>
                                    )}
                                </div>
                            </h2>

                            <div className="flex-1 w-full overflow-y-auto overflow-x-hidden">
                                <div className="space-y-1 px-1">
                                    {isLoading ? (
                                        <div className="flex justify-center py-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : error ? (
                                        <div className="text-sm text-red-500 px-4 py-2">
                                            Failed to load chats
                                        </div>
                                    ) : conversations.length > 0 ? (
                                        conversations.map((conv) => (
                                            <ConversationItem
                                                key={conv.id}
                                                conversation={conv}
                                                folders={folders}
                                                onRename={handleSetRenameId}
                                                onDelete={handleSetDeleteId}
                                                onToggleFavorite={handleToggleFavorite}
                                                onMoveToFolder={handleMoveToFolder}
                                                onShare={handleShare}
                                                onDuplicate={handleDuplicate}
                                                onExport={handleExport}
                                                isDraggable
                                            />
                                        ))
                                    ) : (
                                        <div className="text-sm text-muted-foreground px-4 py-2 italic text-center">
                                            {filter.type === 'favorites' ? "No favorites yet." :
                                                filter.type === 'folder' ? "No chats in this folder." :
                                                    "No recent chats."}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Empty space for guests - auth buttons are in top nav */}
                    {!isAuthenticated && (
                        <div className="px-3 py-4 flex-1" />
                    )}

                    {/* Management section - collapsible for smaller screens */}
                    {isAuthenticated && (
                        <Collapsible
                            open={managementOpen}
                            onOpenChange={setManagementOpen}
                            className="px-3 py-2 flex-shrink-0 mt-auto"
                        >
                            <CollapsibleTrigger asChild>
                                <button className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase flex items-center justify-between w-full hover:text-foreground transition-colors">
                                    <span>Management</span>
                                    {managementOpen ? (
                                        <ChevronUp className="h-3 w-3" />
                                    ) : (
                                        <ChevronDown className="h-3 w-3" />
                                    )}
                                </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-1">
                                <Button asChild variant={pathname === "/agents" ? "secondary" : "ghost"} className="w-full justify-start">
                                    <Link href="/agents">
                                        <Users className="mr-2 h-4 w-4" />
                                        Agents
                                    </Link>
                                </Button>
                                <Button asChild variant={pathname === "/channels" ? "secondary" : "ghost"} className="w-full justify-start">
                                    <Link href="/channels">
                                        <Radio className="mr-2 h-4 w-4" />
                                        Channels
                                    </Link>
                                </Button>
                                <Button asChild variant={pathname?.startsWith("/crm") ? "secondary" : "ghost"} className="w-full justify-start">
                                    <Link href="/crm">
                                        <ContactRound className="mr-2 h-4 w-4" />
                                        CRM
                                    </Link>
                                </Button>
                                <Button asChild variant={pathname === "/scheduled-tasks" ? "secondary" : "ghost"} className="w-full justify-start">
                                    <Link href="/scheduled-tasks">
                                        <CalendarClock className="mr-2 h-4 w-4" />
                                        Scheduled Tasks
                                    </Link>
                                </Button>
                                <Button asChild variant={pathname === "/event-triggers" ? "secondary" : "ghost"} className="w-full justify-start">
                                    <Link href="/event-triggers">
                                        <Zap className="mr-2 h-4 w-4" />
                                        Event Triggers
                                    </Link>
                                </Button>
                                <Button asChild variant={pathname === "/boot-scripts" ? "secondary" : "ghost"} className="w-full justify-start">
                                    <Link href="/boot-scripts">
                                        <Rocket className="mr-2 h-4 w-4" />
                                        Boot Scripts
                                    </Link>
                                </Button>
                                <Button asChild variant={pathname === "/background" ? "secondary" : "ghost"} className="w-full justify-start">
                                    <Link href="/background">
                                        <Server className="mr-2 h-4 w-4" />
                                        Background Agent
                                    </Link>
                                </Button>
                                {!onboardingDone && (
                                    <Button asChild variant={pathname === "/onboarding" ? "secondary" : "ghost"} className="w-full justify-start">
                                        <Link href="/onboarding">
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            Setup Wizard
                                        </Link>
                                    </Button>
                                )}
                                <Button asChild variant={pathname === "/settings" ? "secondary" : "ghost"} className="w-full justify-start">
                                    <Link href="/settings">
                                        <Settings className="mr-2 h-4 w-4" />
                                        Settings
                                    </Link>
                                </Button>
                            </CollapsibleContent>
                        </Collapsible>
                    )}
                </div>

                <RenameDialog
                    isOpen={!!renameId}
                    onOpenChange={(open) => !open && setRenameId(null)}
                    title="Rename Conversation"
                    initialValue={conversations.find(c => c.id === renameId)?.title || ""}
                    onConfirm={handleRename}
                    isLoading={isSubmitting}
                />

                <DeleteConfirmDialog
                    isOpen={!!deleteId}
                    onOpenChange={(open) => !open && setDeleteId(null)}
                    title="Delete Conversation"
                    description="Are you sure you want to delete this conversation? This action cannot be undone."
                    onConfirm={handleDelete}
                    isLoading={isSubmitting}
                />

                <DeleteConfirmDialog
                    isOpen={deleteAllOpen}
                    onOpenChange={setDeleteAllOpen}
                    title="Delete All Conversations"
                    description={`Are you sure you want to delete all ${conversations.length} conversation(s)? This action cannot be undone.`}
                    onConfirm={handleDeleteAll}
                    isLoading={isSubmitting}
                />

                <SearchDialog
                    open={searchOpen}
                    onOpenChange={setSearchOpen}
                />

                {exportData && (
                    <ExportDialog
                        isOpen={!!exportData}
                        onOpenChange={(open) => !open && setExportData(null)}
                        conversationId={exportData.id}
                        conversationTitle={exportData.title}
                    />
                )}

                {shareData && (
                    <ShareDialog
                        isOpen={!!shareData}
                        onOpenChange={(open) => !open && setShareData(null)}
                        conversationId={shareData.id}
                        conversationTitle={shareData.title}
                    />
                )}
            </div>

            {/* Drag overlay for visual feedback */}
            <DragOverlay>
                {activeConversation && (
                    <div className="bg-background border rounded-md shadow-lg px-3 py-2 text-sm">
                        {activeConversation.title}
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}
