"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Upload,
    File,
    FileText,
    FileSpreadsheet,
    FileJson,
    X,
    Loader2,
    CheckCircle,
    AlertCircle,
    Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StoreSelector, type GeminiStore } from "@/components/gemini/StoreSelector";

interface FileUploadProps {
    onUploadComplete?: (document: UploadedDocument) => void;
    maxSize?: number; // in bytes
    className?: string;
}

interface UploadedDocument {
    id: string;
    filename: string;
    size: number;
    status: string;
    chunkCount?: number;
    error?: string;
}

interface FileWithPreview {
    file: File;
    preview: string;
}

const SUPPORTED_TYPES = [
    { ext: ".pdf", mime: "application/pdf", icon: FileText, label: "PDF" },
    { ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", icon: FileText, label: "Word" },
    { ext: ".txt", mime: "text/plain", icon: FileText, label: "Text" },
    { ext: ".md", mime: "text/markdown", icon: FileText, label: "Markdown" },
    { ext: ".csv", mime: "text/csv", icon: FileSpreadsheet, label: "CSV" },
    { ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", icon: FileSpreadsheet, label: "Excel" },
    { ext: ".json", mime: "application/json", icon: FileJson, label: "JSON" },
];

const ACCEPT_STRING = SUPPORTED_TYPES.map(t => t.mime).join(",");

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(filename: string) {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
    const type = SUPPORTED_TYPES.find(t => t.ext === ext);
    return type?.icon || File;
}

export function FileUpload({
    onUploadComplete,
    maxSize = 50 * 1024 * 1024,
    className,
}: FileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
    const [chunkingStrategy, setChunkingStrategy] = useState<string>("recursive");
    const [processImmediately, setProcessImmediately] = useState(true);
    const [uploadDestination, setUploadDestination] = useState<"rag" | "gemini" | "both">("rag");
    const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateFile = useCallback((file: File): string | null => {
        // Check size
        if (file.size > maxSize) {
            return `File too large. Maximum size is ${formatFileSize(maxSize)}`;
        }

        // Check type
        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
        const isSupported = SUPPORTED_TYPES.some(t => t.ext === ext || t.mime === file.type);
        if (!isSupported) {
            return "Unsupported file type";
        }

        return null;
    }, [maxSize]);

    const handleFileSelect = useCallback((file: File) => {
        const error = validateFile(file);
        if (error) {
            toast.error(error);
            return;
        }

        setSelectedFile({
            file,
            preview: file.name,
        });
        setUploadStatus("idle");
    }, [validateFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    }, [handleFileSelect]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    }, [handleFileSelect]);

    const handleUpload = async () => {
        if (!selectedFile) return;

        // Validate Gemini destination has a store selected
        if ((uploadDestination === "gemini" || uploadDestination === "both") && selectedStoreIds.length === 0) {
            toast.error("Please select a Gemini store");
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);
        setUploadStatus("idle");

        try {
            // Step 1: Always upload to S3 (for backup and processing)
            const formData = new FormData();
            formData.append("file", selectedFile.file);
            formData.append("processImmediately", (processImmediately && uploadDestination !== "gemini").toString());
            formData.append("chunkingStrategy", chunkingStrategy);

            const progressInterval = setInterval(() => {
                setUploadProgress(prev => Math.min(prev + 10, uploadDestination === "rag" ? 90 : 50));
            }, 200);

            const response = await fetch("/api/documents/upload", {
                method: "POST",
                body: formData,
            });

            clearInterval(progressInterval);

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Upload failed");
            }

            const documentId = data.document?.id;

            // Step 2: If destination includes Gemini, push to Gemini store
            if ((uploadDestination === "gemini" || uploadDestination === "both") && documentId && selectedStoreIds[0]) {
                setUploadProgress(60);
                const storeRes = await fetch(`/api/gemini/stores/${selectedStoreIds[0]}/documents`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ documentId }),
                });

                if (!storeRes.ok) {
                    const storeData = await storeRes.json();
                    console.error("Gemini store upload failed:", storeData.error);
                    toast.warning("File saved but Gemini store upload failed: " + (storeData.error || "Unknown error"));
                }
            }

            setUploadProgress(100);
            setUploadStatus("success");
            toast.success("Document uploaded successfully");

            if (onUploadComplete) {
                onUploadComplete(data.document);
            }

            setTimeout(() => {
                setSelectedFile(null);
                setUploadProgress(0);
                setUploadStatus("idle");
            }, 2000);
        } catch (error) {
            setUploadStatus("error");
            toast.error(error instanceof Error ? error.message : "Upload failed");
        } finally {
            setIsUploading(false);
        }
    };

    const handleClear = () => {
        setSelectedFile(null);
        setUploadProgress(0);
        setUploadStatus("idle");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const FileIcon = selectedFile ? getFileIcon(selectedFile.file.name) : File;

    return (
        <div className={cn("space-y-4", className)}>
            {/* Drop Zone */}
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                    "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
                    isDragging
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50",
                    selectedFile && "border-primary"
                )}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_STRING}
                    onChange={handleInputChange}
                    className="hidden"
                />

                {selectedFile ? (
                    <div className="flex items-center justify-center gap-4">
                        <div className="p-3 rounded-lg bg-primary/10">
                            <FileIcon className="h-8 w-8 text-primary" />
                        </div>
                        <div className="text-left">
                            <p className="font-medium truncate max-w-[200px]">
                                {selectedFile.file.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {formatFileSize(selectedFile.file.size)}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleClear();
                            }}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <>
                        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">
                            Drop your file here or click to browse
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Supports PDF, DOCX, TXT, MD, CSV, XLSX, JSON (max {formatFileSize(maxSize)})
                        </p>
                    </>
                )}
            </div>

            {/* Upload Options */}
            {selectedFile && !isUploading && uploadStatus === "idle" && (
                <Card>
                    <CardContent className="pt-4 space-y-4">
                        {/* Destination Selector */}
                        <div className="space-y-2">
                            <Label>Upload Destination</Label>
                            <div className="flex gap-1 p-1 bg-muted rounded-lg">
                                {[
                                    { value: "rag" as const, label: "RAG (Embeddings)" },
                                    { value: "gemini" as const, label: "Gemini Store" },
                                    { value: "both" as const, label: "Both" },
                                ].map((dest) => (
                                    <button
                                        key={dest.value}
                                        type="button"
                                        onClick={() => setUploadDestination(dest.value)}
                                        className={cn(
                                            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                            uploadDestination === dest.value
                                                ? "bg-background shadow-sm text-foreground"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {dest.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Gemini Store Selector */}
                        {(uploadDestination === "gemini" || uploadDestination === "both") && (
                            <div className="space-y-2">
                                <Label>Gemini Store</Label>
                                <StoreSelector
                                    selectedStoreIds={selectedStoreIds}
                                    onStoreChange={setSelectedStoreIds}
                                    multiSelect={false}
                                />
                            </div>
                        )}

                        {/* RAG Processing Options */}
                        {uploadDestination !== "gemini" && (
                            <>
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="process-switch">Process Immediately</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Extract text and create chunks for RAG
                                        </p>
                                    </div>
                                    <Switch
                                        id="process-switch"
                                        checked={processImmediately}
                                        onCheckedChange={setProcessImmediately}
                                    />
                                </div>

                                {processImmediately && (
                                    <div className="space-y-2">
                                        <Label>Chunking Strategy</Label>
                                        <Select
                                            value={chunkingStrategy}
                                            onValueChange={setChunkingStrategy}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="recursive">
                                                    Recursive (Recommended)
                                                </SelectItem>
                                                <SelectItem value="semantic">
                                                    Semantic (By Paragraphs)
                                                </SelectItem>
                                                <SelectItem value="fixed">
                                                    Fixed Size
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Progress */}
            {isUploading && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span>Uploading...</span>
                        <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} />
                </div>
            )}

            {/* Status */}
            {uploadStatus === "success" && (
                <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span>Upload complete!</span>
                </div>
            )}

            {uploadStatus === "error" && (
                <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    <span>Upload failed</span>
                </div>
            )}

            {/* Upload Button */}
            {selectedFile && !isUploading && uploadStatus === "idle" && (
                <Button onClick={handleUpload} className="w-full">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Document
                </Button>
            )}
        </div>
    );
}
