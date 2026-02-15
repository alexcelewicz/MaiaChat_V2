"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Share2, Copy, Check, Loader2, Link2Off, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface ShareDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId: string;
    conversationTitle: string;
}

export function ShareDialog({
    isOpen,
    onOpenChange,
    conversationId,
    conversationTitle,
}: ShareDialogProps) {
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isRevoking, setIsRevoking] = useState(false);
    const [copied, setCopied] = useState(false);

    // Fetch or generate share link when dialog opens
    useEffect(() => {
        if (isOpen && !shareUrl) {
            generateShareLink();
        }
    }, [isOpen]);

    // Reset state when dialog closes
    useEffect(() => {
        if (!isOpen) {
            setShareUrl(null);
            setCopied(false);
        }
    }, [isOpen]);

    const generateShareLink = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`/api/conversations/${conversationId}/share`, {
                method: "POST",
            });

            if (!response.ok) {
                throw new Error("Failed to generate share link");
            }

            const data = await response.json();
            const fullUrl = `${window.location.origin}${data.shareUrl}`;
            setShareUrl(fullUrl);
        } catch (error) {
            console.error("Share error:", error);
            toast.error("Failed to generate share link");
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = async () => {
        if (!shareUrl) return;

        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success("Link copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            toast.error("Failed to copy link");
        }
    };

    const revokeShare = async () => {
        try {
            setIsRevoking(true);
            const response = await fetch(`/api/conversations/${conversationId}/share`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error("Failed to revoke share link");
            }

            setShareUrl(null);
            toast.success("Share link revoked");
            onOpenChange(false);
        } catch (error) {
            console.error("Revoke error:", error);
            toast.error("Failed to revoke share link");
        } finally {
            setIsRevoking(false);
        }
    };

    const openInNewTab = () => {
        if (shareUrl) {
            window.open(shareUrl, "_blank");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="h-5 w-5" />
                        Share Conversation
                    </DialogTitle>
                    <DialogDescription>
                        Share &quot;{conversationTitle}&quot; with anyone via a public link.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">
                                Generating share link...
                            </span>
                        </div>
                    ) : shareUrl ? (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="share-url">Share URL</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="share-url"
                                        value={shareUrl}
                                        readOnly
                                        className="font-mono text-sm"
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={copyToClipboard}
                                        title="Copy link"
                                    >
                                        {copied ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={openInNewTab}
                                        title="Open in new tab"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-lg border bg-muted/50 p-4 text-sm">
                                <p className="text-muted-foreground">
                                    <strong>Note:</strong> Anyone with this link can view this
                                    conversation. They will see the conversation title and all
                                    messages in read-only mode.
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center py-8">
                            <p className="text-muted-foreground">
                                No share link available. Click below to generate one.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    {shareUrl && (
                        <Button
                            variant="destructive"
                            onClick={revokeShare}
                            disabled={isRevoking}
                            className="mr-auto"
                        >
                            {isRevoking ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Link2Off className="mr-2 h-4 w-4" />
                            )}
                            Revoke Link
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    {!shareUrl && !isLoading && (
                        <Button onClick={generateShareLink}>
                            <Share2 className="mr-2 h-4 w-4" />
                            Generate Link
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
