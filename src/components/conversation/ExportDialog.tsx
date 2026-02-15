"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Download, FileJson, FileText, FileType, File, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

type ExportFormat = "json" | "markdown" | "txt" | "pdf";

interface ExportDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId: string;
    conversationTitle: string;
}

interface ConversationExport {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: {
        id: string;
        role: string;
        content: string;
        createdAt: string;
    }[];
}

export function ExportDialog({
    isOpen,
    onOpenChange,
    conversationId,
    conversationTitle,
}: ExportDialogProps) {
    const [format, setFormat] = useState<ExportFormat>("markdown");
    const [isExporting, setIsExporting] = useState(false);

    const generatePDF = async (data: ConversationExport): Promise<Blob> => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const maxWidth = pageWidth - margin * 2;
        let yPosition = margin;

        // Helper to add text with word wrap
        const addWrappedText = (text: string, fontSize: number, isBold: boolean = false) => {
            doc.setFontSize(fontSize);
            doc.setFont("helvetica", isBold ? "bold" : "normal");
            
            const lines = doc.splitTextToSize(text, maxWidth);
            const lineHeight = fontSize * 0.5;

            for (const line of lines) {
                if (yPosition + lineHeight > pageHeight - margin) {
                    doc.addPage();
                    yPosition = margin;
                }
                doc.text(line, margin, yPosition);
                yPosition += lineHeight;
            }
        };

        // Title
        doc.setTextColor(0, 0, 0);
        addWrappedText(data.title, 18, true);
        yPosition += 5;

        // Metadata
        doc.setTextColor(100, 100, 100);
        addWrappedText(`Created: ${new Date(data.createdAt).toLocaleString()}`, 10);
        addWrappedText(`Last Updated: ${new Date(data.updatedAt).toLocaleString()}`, 10);
        yPosition += 10;

        // Separator
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;

        // Messages
        for (const message of data.messages) {
            // Check if we need a new page
            if (yPosition > pageHeight - 40) {
                doc.addPage();
                yPosition = margin;
            }

            // Role header
            const roleLabel = message.role === "user" ? "User" : "Assistant";
            const roleColor = message.role === "user" ? [59, 130, 246] as const : [34, 197, 94] as const; // Blue for user, green for assistant

            doc.setTextColor(roleColor[0], roleColor[1], roleColor[2]);
            addWrappedText(roleLabel, 12, true);
            
            // Timestamp
            doc.setTextColor(150, 150, 150);
            addWrappedText(new Date(message.createdAt).toLocaleString(), 8);
            yPosition += 2;

            // Content
            doc.setTextColor(0, 0, 0);
            addWrappedText(message.content, 10);
            yPosition += 8;

            // Message separator
            doc.setDrawColor(230, 230, 230);
            doc.line(margin, yPosition, pageWidth - margin, yPosition);
            yPosition += 8;
        }

        // Footer
        yPosition += 5;
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(8);
        doc.text(`Exported from MAIAChat on ${new Date().toLocaleString()}`, margin, yPosition);

        return doc.output("blob");
    };

    const handleExport = async () => {
        try {
            setIsExporting(true);

            if (format === "pdf") {
                // For PDF, first fetch the JSON data, then generate PDF client-side
                const response = await fetch(
                    `/api/conversations/${conversationId}/export?format=json`
                );

                if (!response.ok) {
                    throw new Error("Export failed");
                }

                const data: ConversationExport = await response.json();
                const pdfBlob = await generatePDF(data);

                // Download PDF
                const url = window.URL.createObjectURL(pdfBlob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${sanitizeFilename(conversationTitle)}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                // For other formats, use the API
                const response = await fetch(
                    `/api/conversations/${conversationId}/export?format=${format}`
                );

                if (!response.ok) {
                    throw new Error("Export failed");
                }

                // Get filename from Content-Disposition header or generate one
                const contentDisposition = response.headers.get("Content-Disposition");
                let filename = `${conversationTitle}.${format === "markdown" ? "md" : format}`;
                
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                    if (filenameMatch?.[1]) {
                        filename = filenameMatch[1];
                    }
                }

                // Create blob and download
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }

            toast.success("Conversation exported successfully");
            onOpenChange(false);
        } catch (error) {
            console.error("Export error:", error);
            toast.error("Failed to export conversation");
        } finally {
            setIsExporting(false);
        }
    };

    const sanitizeFilename = (filename: string): string => {
        return filename
            .replace(/[<>:"/\\|?*]/g, "_")
            .replace(/\s+/g, "_")
            .slice(0, 100);
    };

    const formatOptions = [
        {
            value: "markdown",
            label: "Markdown (.md)",
            description: "Best for documentation and readability",
            icon: FileType,
        },
        {
            value: "pdf",
            label: "PDF (.pdf)",
            description: "Professional document format for sharing",
            icon: File,
        },
        {
            value: "json",
            label: "JSON (.json)",
            description: "Machine-readable format with all metadata",
            icon: FileJson,
        },
        {
            value: "txt",
            label: "Plain Text (.txt)",
            description: "Simple text format, universal compatibility",
            icon: FileText,
        },
    ] as const;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Download className="h-5 w-5" />
                        Export Conversation
                    </DialogTitle>
                    <DialogDescription>
                        Export &quot;{conversationTitle}&quot; to a file.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="format">Export Format</Label>
                        <Select
                            value={format}
                            onValueChange={(value) => setFormat(value as ExportFormat)}
                        >
                            <SelectTrigger id="format">
                                <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                            <SelectContent>
                                {formatOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        <div className="flex items-center gap-2">
                                            <option.icon className="h-4 w-4" />
                                            <span>{option.label}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {formatOptions.find((o) => o.value === format)?.description}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isExporting}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleExport} disabled={isExporting}>
                        {isExporting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download className="mr-2 h-4 w-4" />
                                Export
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
