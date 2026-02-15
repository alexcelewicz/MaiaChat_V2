"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

interface ManualConnectDialogProps {
    channelType: string;
    onClose: () => void;
    onConnected: () => void;
}

// Channels that need a user-provided channelId
const NEEDS_CHANNEL_ID = new Set(["telegram", "matrix", "teams", "slack", "discord"]);
// Channels that need an access/bot token
const NEEDS_TOKEN = new Set(["telegram", "matrix", "teams", "slack", "discord"]);
// Channels that auto-generate their channelId
const AUTO_CHANNEL_ID = new Set(["webchat", "whatsapp", "signal"]);

type DialogStep = "form" | "qr" | "success";

export function ManualConnectDialog({
    channelType,
    onClose,
    onConnected,
}: ManualConnectDialogProps) {
    const [channelId, setChannelId] = useState("");
    const [accessToken, setAccessToken] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [embedSnippet, setEmbedSnippet] = useState<string | null>(null);

    // Channel-specific fields
    const [homeserverUrl, setHomeserverUrl] = useState("");
    const [matrixUserId, setMatrixUserId] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [authDir, setAuthDir] = useState("");
    const [signingSecret, setSigningSecret] = useState("");
    const [appToken, setAppToken] = useState("");
    const [appId, setAppId] = useState("");
    const [appPassword, setAppPassword] = useState("");
    const [signalCliPath, setSignalCliPath] = useState("");

    // WhatsApp QR pairing state
    const [step, setStep] = useState<DialogStep>("form");
    const [qrAccountId, setQrAccountId] = useState<string | null>(null);
    const [qrValue, setQrValue] = useState<string | null>(null);
    const [qrError, setQrError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const needsChannelId = NEEDS_CHANNEL_ID.has(channelType);
    const needsToken = NEEDS_TOKEN.has(channelType);

    const cleanupPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    // Poll for QR code updates when in QR step
    useEffect(() => {
        if (step !== "qr" || !qrAccountId) return;

        const poll = async () => {
            try {
                const res = await fetch(`/api/channels/whatsapp/pairing?accountId=${qrAccountId}`);
                if (!res.ok) return;
                const data = await res.json();

                if (data.status === "connected") {
                    cleanupPolling();
                    setStep("success");
                    toast.success("WhatsApp connected!");
                    onConnected();
                } else if (data.status === "error") {
                    cleanupPolling();
                    setQrError(data.error || "Connection failed");
                    setQrValue(null);
                } else if (data.status === "waiting_qr" && data.qr) {
                    setQrValue(data.qr);
                    setQrError(null);
                }
            } catch {
                // Network error — keep polling
            }
        };

        // Initial poll immediately
        poll();
        pollRef.current = setInterval(poll, 3000);

        // 2-minute timeout
        timeoutRef.current = setTimeout(() => {
            cleanupPolling();
            setQrError("QR code expired. Please try again.");
            setQrValue(null);
        }, 120_000);

        return cleanupPolling;
    }, [step, qrAccountId, cleanupPolling, onConnected]);

    const submit = async () => {
        try {
            setIsSubmitting(true);

            // Build payload based on channel type
            const payload: Record<string, unknown> = {
                displayName: displayName || undefined,
            };

            if (needsChannelId) {
                payload.channelId = channelId;
            }

            switch (channelType) {
                case "telegram":
                    payload.accessToken = accessToken;
                    break;
                case "matrix":
                    payload.accessToken = accessToken;
                    payload.homeserverUrl = homeserverUrl;
                    payload.userId = matrixUserId;
                    break;
                case "teams":
                    payload.appId = appId;
                    payload.appPassword = appPassword;
                    break;
                case "slack":
                    payload.botToken = accessToken;
                    if (signingSecret) payload.signingSecret = signingSecret;
                    if (appToken) payload.appToken = appToken;
                    break;
                case "discord":
                    payload.botToken = accessToken;
                    break;
                case "whatsapp":
                    if (authDir) payload.authDir = authDir;
                    break;
                case "signal":
                    payload.phoneNumber = phoneNumber;
                    if (signalCliPath) payload.signalCliPath = signalCliPath;
                    break;
            }

            const response = await fetch(`/api/channels/manual/${channelType}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Connect failed");
            }

            const { account } = await response.json();

            // WhatsApp: transition to QR step for pairing
            if (channelType === "whatsapp") {
                setQrAccountId(account.id);
                setQrValue(null);
                setQrError(null);
                setStep("qr");
                return;
            }

            toast.success("Channel connected");
            onConnected();

            if (channelType === "webchat") {
                const embedResponse = await fetch("/api/channels/webchat/embed");
                const embedData = await embedResponse.json();
                setEmbedSnippet(embedData.embedSnippet || null);
                return;
            }

            onClose();
        } catch (error) {
            console.error("Manual connect error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to connect channel");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        cleanupPolling();
        setStep("form");
        setQrAccountId(null);
        setQrValue(null);
        setQrError(null);
        onClose();
    };

    const handleRetryQR = () => {
        setQrError(null);
        setQrValue(null);
        setStep("form");
        cleanupPolling();
    };

    // Determine if submit should be disabled
    const isFormValid = (() => {
        if (isSubmitting) return false;
        switch (channelType) {
            case "telegram":
                return !!channelId && !!accessToken;
            case "matrix":
                return !!channelId && !!accessToken && !!homeserverUrl && !!matrixUserId;
            case "teams":
                return !!channelId && !!appId && !!appPassword;
            case "slack":
                return !!channelId && !!accessToken;
            case "discord":
                return !!channelId && !!accessToken;
            case "whatsapp":
                return true; // All fields optional
            case "signal":
                return !!phoneNumber;
            case "webchat":
                return true;
            default:
                return !!channelId;
        }
    })();

    const channelLabel = channelType.charAt(0).toUpperCase() + channelType.slice(1);

    // QR step for WhatsApp
    if (step === "qr") {
        return (
            <Dialog open onOpenChange={handleClose}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Scan QR Code with WhatsApp</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4 py-4">
                        {qrError ? (
                            <div className="text-center space-y-3">
                                <p className="text-sm text-destructive">{qrError}</p>
                                <Button variant="outline" onClick={handleRetryQR}>
                                    Try Again
                                </Button>
                            </div>
                        ) : qrValue ? (
                            <>
                                <div className="rounded-lg bg-white p-4">
                                    <QRCodeSVG value={qrValue} size={256} level="M" />
                                </div>
                                <p className="text-xs text-muted-foreground text-center max-w-[280px]">
                                    Open WhatsApp on your phone, go to Settings &gt; Linked Devices &gt; Link a Device, then scan this code.
                                </p>
                            </>
                        ) : (
                            <div className="flex flex-col items-center gap-2 py-8">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                <p className="text-sm text-muted-foreground">Waiting for QR code...</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    // Success step
    if (step === "success") {
        return (
            <Dialog open onOpenChange={handleClose}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>WhatsApp Connected</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-2 py-6">
                        <div className="text-3xl">&#10003;</div>
                        <p className="text-sm text-muted-foreground">
                            WhatsApp has been linked successfully.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleClose}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    // Form step (default)
    return (
        <Dialog open onOpenChange={handleClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Connect {channelLabel}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    {/* Matrix-specific fields */}
                    {channelType === "matrix" && (
                        <>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Homeserver URL</Label>
                                <Input
                                    placeholder="https://matrix.org"
                                    value={homeserverUrl}
                                    onChange={(e) => setHomeserverUrl(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Matrix User ID</Label>
                                <Input
                                    placeholder="@bot:matrix.org"
                                    value={matrixUserId}
                                    onChange={(e) => setMatrixUserId(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {/* Teams-specific fields */}
                    {channelType === "teams" && (
                        <>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">App ID</Label>
                                <Input
                                    placeholder="Teams Bot App ID"
                                    value={appId}
                                    onChange={(e) => setAppId(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">App Password</Label>
                                <Input
                                    placeholder="Teams Bot App Password"
                                    type="password"
                                    value={appPassword}
                                    onChange={(e) => setAppPassword(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {/* Signal-specific fields */}
                    {channelType === "signal" && (
                        <>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Phone Number</Label>
                                <Input
                                    placeholder="+1234567890"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">signal-cli Path (optional)</Label>
                                <Input
                                    placeholder="/usr/local/bin/signal-cli"
                                    value={signalCliPath}
                                    onChange={(e) => setSignalCliPath(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {/* WhatsApp-specific fields */}
                    {channelType === "whatsapp" && (
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Auth Directory (optional)</Label>
                            <Input
                                placeholder="./whatsapp-auth"
                                value={authDir}
                                onChange={(e) => setAuthDir(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Directory to store WhatsApp session state. Leave empty for default.
                            </p>
                        </div>
                    )}

                    {/* Channel/Room ID - only for types that need it */}
                    {needsChannelId && (
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                {channelType === "slack" ? "Channel ID" :
                                 channelType === "discord" ? "Channel ID" :
                                 channelType === "matrix" ? "Room ID" :
                                 "Channel ID"}
                            </Label>
                            <Input
                                placeholder={
                                    channelType === "slack" ? "C0123456789" :
                                    channelType === "discord" ? "123456789012345678" :
                                    channelType === "matrix" ? "!room:matrix.org" :
                                    "Channel or room ID"
                                }
                                value={channelId}
                                onChange={(e) => setChannelId(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Token field - varies by type */}
                    {needsToken && channelType !== "teams" && (
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                {channelType === "slack" ? "Bot Token (xoxb-...)" :
                                 channelType === "discord" ? "Bot Token" :
                                 "Access Token / Bot Token"}
                            </Label>
                            <Input
                                placeholder={
                                    channelType === "slack" ? "xoxb-..." :
                                    channelType === "telegram" ? "123456:ABC-DEF1234" :
                                    "Token"
                                }
                                type="password"
                                value={accessToken}
                                onChange={(e) => setAccessToken(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Slack extras */}
                    {channelType === "slack" && (
                        <>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Signing Secret (optional)</Label>
                                <Input
                                    placeholder="Slack signing secret"
                                    type="password"
                                    value={signingSecret}
                                    onChange={(e) => setSigningSecret(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">App Token for Socket Mode (optional)</Label>
                                <Input
                                    placeholder="xapp-..."
                                    type="password"
                                    value={appToken}
                                    onChange={(e) => setAppToken(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {/* Display name - always shown */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Display Name (optional)</Label>
                        <Input
                            placeholder="My Bot"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                    </div>

                    {embedSnippet && (
                        <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted p-3">
                            {embedSnippet}
                        </pre>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                        Close
                    </Button>
                    <Button onClick={submit} disabled={!isFormValid}>
                        {isSubmitting ? "Connecting..." : "Connect"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
