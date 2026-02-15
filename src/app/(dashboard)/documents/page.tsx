"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Files,
    Upload,
    Loader2,
    FileText,
    FileSpreadsheet,
    FileJson,
    MoreVertical,
    Trash2,
    RefreshCw,
    Eye,
    CheckCircle,
    XCircle,
    Clock,
    AlertCircle,
    Sparkles,
    Database,
    FolderPlus,
} from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/documents/FileUpload";
import { StoreManager } from "@/components/gemini/StoreManager";
import { StoreSelector, type GeminiStore } from "@/components/gemini/StoreSelector";
import { cn } from "@/lib/utils";

interface Document {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    status: "uploaded" | "processing" | "processed" | "failed";
    chunkCount?: number;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getFileIcon(mimeType: string) {
    if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) {
        return FileSpreadsheet;
    }
    if (mimeType.includes("json")) {
        return FileJson;
    }
    return FileText;
}

function getStatusBadge(status: Document["status"]) {
    switch (status) {
        case "processed":
            return (
                <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Processed
                </Badge>
            );
        case "processing":
            return (
                <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Processing
                </Badge>
            );
        case "failed":
            return (
                <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30">
                    <XCircle className="w-3 h-3 mr-1" />
                    Failed
                </Badge>
            );
        case "uploaded":
        default:
            return (
                <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30">
                    <Clock className="w-3 h-3 mr-1" />
                    Uploaded
                </Badge>
            );
    }
}

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [geminiStatus, setGeminiStatus] = useState<Record<string, { state?: string; expirationTime?: string; hasGeminiFile: boolean }>>({});
    const [addToStoreDocId, setAddToStoreDocId] = useState<string | null>(null);
    const [addToStoreIds, setAddToStoreIds] = useState<string[]>([]);
    const [addingToStore, setAddingToStore] = useState(false);

    useEffect(() => {
        fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/documents");
            if (!response.ok) throw new Error("Failed to fetch documents");
            const data = await response.json();
            setDocuments(data.documents || []);
        } catch (error) {
            console.error("Fetch documents error:", error);
            toast.error("Failed to load documents");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (documentId: string) => {
        try {
            const response = await fetch(`/api/documents/${documentId}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete document");

            toast.success("Document deleted");
            fetchDocuments();
        } catch (error) {
            console.error("Delete document error:", error);
            toast.error("Failed to delete document");
        }
    };

    const handleUploadComplete = () => {
        setIsUploadOpen(false);
        fetchDocuments();
    };

    const handleUploadToGemini = async (documentId: string) => {
        try {
            const response = await fetch(`/api/documents/${documentId}/gemini`, {
                method: "POST",
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to upload to Gemini");
            }

            toast.success("Uploaded to Gemini", {
                description: "Gemini file search can now use this document.",
            });
            fetchDocuments();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gemini upload failed");
        }
    };

    const handleGeminiStatus = async (documentId: string) => {
        try {
            const response = await fetch(`/api/documents/${documentId}/gemini`);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to fetch Gemini status");
            }

            setGeminiStatus((prev) => ({
                ...prev,
                [documentId]: {
                    hasGeminiFile: Boolean(data.hasGeminiFile),
                    state: data.geminiFile?.state,
                    expirationTime: data.geminiFile?.expirationTime,
                },
            }));

            toast.success("Gemini status updated", {
                description: data.hasGeminiFile
                    ? `Status: ${data.geminiFile?.state || "unknown"}`
                    : "No Gemini file found.",
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gemini status check failed");
        }
    };

    const handleRemoveGemini = async (documentId: string) => {
        try {
            const response = await fetch(`/api/documents/${documentId}/gemini`, {
                method: "DELETE",
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to remove Gemini file");
            }

            toast.success("Gemini file removed");
            setGeminiStatus((prev) => {
                const updated = { ...prev };
                delete updated[documentId];
                return updated;
            });
            fetchDocuments();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gemini delete failed");
        }
    };

    const handleAddToStore = async () => {
        if (!addToStoreDocId || addToStoreIds.length === 0) return;
        try {
            setAddingToStore(true);
            const res = await fetch(`/api/gemini/stores/${addToStoreIds[0]}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId: addToStoreDocId }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to add to store");
            }

            toast.success("Document added to Gemini store");
            setAddToStoreDocId(null);
            setAddToStoreIds([]);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add to store");
        } finally {
            setAddingToStore(false);
        }
    };

    return (
        <div className="container max-w-6xl mx-auto py-8 px-4 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
                    <p className="text-muted-foreground mt-1">
                        Upload and manage documents for RAG-powered conversations
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={fetchDocuments}>
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </Button>
                    <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Upload className="mr-2 h-4 w-4" />
                                Upload Document
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Upload Document</DialogTitle>
                                <DialogDescription>
                                    Upload a document to use in your conversations
                                </DialogDescription>
                            </DialogHeader>
                            <FileUpload onUploadComplete={handleUploadComplete} />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Tabs defaultValue="documents" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="documents" className="gap-2">
                        <Files className="h-4 w-4" />
                        Documents
                    </TabsTrigger>
                    <TabsTrigger value="gemini-stores" className="gap-2">
                        <Database className="h-4 w-4" />
                        Gemini Stores
                    </TabsTrigger>
                </TabsList>

                {/* Documents Tab */}
                <TabsContent value="documents" className="space-y-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : documents.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <Files className="h-12 w-12 text-muted-foreground mb-4" />
                                <CardTitle className="text-xl mb-2">No Documents Yet</CardTitle>
                                <CardDescription className="mb-4 max-w-md">
                                    Upload documents to use them in your conversations with AI.
                                    Supported formats: PDF, DOCX, TXT, MD, CSV, XLSX, JSON.
                                </CardDescription>
                                <Button onClick={() => setIsUploadOpen(true)}>
                                    <Upload className="mr-2 h-4 w-4" />
                                    Upload Your First Document
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {documents.map((doc) => {
                                const FileIcon = getFileIcon(doc.mimeType);
                                const geminiFile = (doc.metadata as Record<string, unknown> | null)?.geminiFile as { name?: string; expirationTime?: string } | undefined;
                                const hasGemini = Boolean(geminiFile?.name);
                                const status = geminiStatus[doc.id];

                                return (
                                    <Card key={doc.id} className="relative">
                                        <CardHeader className="pb-3">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-muted">
                                                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <CardTitle className="text-sm font-medium truncate max-w-[180px]">
                                                            {doc.filename}
                                                        </CardTitle>
                                                        <CardDescription className="text-xs">
                                                            {formatFileSize(doc.size)}
                                                        </CardDescription>
                                                    </div>
                                                </div>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setAddToStoreDocId(doc.id);
                                                                setAddToStoreIds([]);
                                                            }}
                                                        >
                                                            <FolderPlus className="mr-2 h-4 w-4" />
                                                            Add to Gemini Store
                                                        </DropdownMenuItem>
                                                        {hasGemini && (
                                                            <DropdownMenuItem onClick={() => handleGeminiStatus(doc.id)}>
                                                                <Sparkles className="mr-2 h-4 w-4" />
                                                                Check Legacy Gemini Status
                                                            </DropdownMenuItem>
                                                        )}
                                                        {hasGemini && (
                                                            <DropdownMenuItem
                                                                onClick={() => handleRemoveGemini(doc.id)}
                                                                className="text-destructive"
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Remove Legacy Gemini File
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem>
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <DropdownMenuItem
                                                                    onSelect={(e) => e.preventDefault()}
                                                                    className="text-destructive"
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Delete
                                                                </DropdownMenuItem>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        Are you sure you want to delete &quot;{doc.filename}&quot;?
                                                                        This will also remove all associated chunks and embeddings.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction
                                                                        onClick={() => handleDelete(doc.id)}
                                                                        className="bg-destructive text-destructive-foreground"
                                                                    >
                                                                        Delete
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0 space-y-3">
                                            <div className="flex items-center justify-between">
                                                {getStatusBadge(doc.status)}
                                                {doc.chunkCount !== undefined && doc.chunkCount > 0 && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {doc.chunkCount} chunks
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Uploaded {formatDate(doc.createdAt)}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* Gemini Stores Tab */}
                <TabsContent value="gemini-stores">
                    <StoreManager />
                </TabsContent>
            </Tabs>

            {/* Add to Gemini Store Dialog */}
            <Dialog
                open={addToStoreDocId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setAddToStoreDocId(null);
                        setAddToStoreIds([]);
                    }
                }}
            >
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Add to Gemini Store</DialogTitle>
                        <DialogDescription>
                            Select a Gemini File Search Store to add this document to.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <StoreSelector
                            selectedStoreIds={addToStoreIds}
                            onStoreChange={setAddToStoreIds}
                            multiSelect={false}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setAddToStoreDocId(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAddToStore}
                            disabled={addToStoreIds.length === 0 || addingToStore}
                        >
                            {addingToStore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add to Store
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
