"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ArrowRight,
    CheckCircle2,
    Loader2,
    ExternalLink,
    Copy,
    AlertCircle,
    Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

// ============================================================================
// Types
// ============================================================================

interface ManualConnectDialogProps {
    channelType: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConnected: () => void;
}

interface ChannelConfig {
    name: string;
    icon: string;
    color: string;
    gradient: string;
    fields: FieldConfig[];
    instructions: string[];
    documentationUrl?: string;
}

interface FieldConfig {
    key: string;
    label: string;
    type: "text" | "password" | "textarea";
    placeholder: string;
    description?: string;
    required?: boolean;
}

// ============================================================================
// Channel Configurations
// ============================================================================

const CHANNEL_CONFIGS: Record<string, ChannelConfig> = {
    telegram: {
        name: "Telegram",
        icon: "✈️",
        color: "text-blue-500",
        gradient: "from-blue-500 to-blue-600",
        fields: [
            {
                key: "accessToken",
                label: "Bot Token",
                type: "password",
                placeholder: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
                description: "Get this from @BotFather on Telegram",
                required: true,
            },
            {
                key: "channelId",
                label: "Bot Username",
                type: "text",
                placeholder: "YourBotName",
                description: "The username you set for your bot (without @)",
                required: true,
            },
            {
                key: "displayName",
                label: "Display Name",
                type: "text",
                placeholder: "My Support Bot",
                description: "A friendly name for this connection",
            },
        ],
        instructions: [
            "Open Telegram and search for @BotFather",
            "Send /newbot and follow the prompts",
            "Copy the bot token provided",
            "Paste it here and we'll handle the rest!",
        ],
        documentationUrl: "https://core.telegram.org/bots#6-botfather",
    },
    matrix: {
        name: "Matrix",
        icon: "🔗",
        color: "text-green-500",
        gradient: "from-green-500 to-green-600",
        fields: [
            {
                key: "homeserverUrl",
                label: "Homeserver URL",
                type: "text",
                placeholder: "https://matrix.org",
                description: "Your Matrix homeserver address",
                required: true,
            },
            {
                key: "userId",
                label: "User ID",
                type: "text",
                placeholder: "@bot:matrix.org",
                description: "The Matrix user ID for your bot",
                required: true,
            },
            {
                key: "channelId",
                label: "Room ID",
                type: "text",
                placeholder: "!room:matrix.org",
                description: "The room to monitor (or leave blank for all rooms)",
                required: true,
            },
            {
                key: "accessToken",
                label: "Access Token",
                type: "password",
                placeholder: "syt_...",
                description: "Access token for authentication",
                required: true,
            },
            {
                key: "displayName",
                label: "Display Name",
                type: "text",
                placeholder: "Matrix Bot",
                description: "A friendly name for this connection",
            },
        ],
        instructions: [
            "Create a Matrix account for your bot",
            "Get an access token via Settings → Security",
            "Enter your homeserver and credentials",
            "Invite the bot to rooms you want to monitor",
        ],
        documentationUrl: "https://matrix.org/docs/develop/",
    },
    webchat: {
        name: "WebChat",
        icon: "🌐",
        color: "text-gray-600",
        gradient: "from-gray-500 to-gray-600",
        fields: [
            {
                key: "displayName",
                label: "Widget Name",
                type: "text",
                placeholder: "My Support Chat",
                description: "Display name shown in the chat widget",
                required: true,
            },
            {
                key: "welcomeMessage",
                label: "Welcome Message",
                type: "textarea",
                placeholder: "Hi! How can I help you today?",
                description: "First message shown to visitors",
            },
            {
                key: "domains",
                label: "Allowed Domains",
                type: "text",
                placeholder: "example.com, app.example.com",
                description: "Comma-separated list of domains where the widget can be embedded",
            },
        ],
        instructions: [
            "Configure your widget settings",
            "Copy the embed code after setup",
            "Add it to your website's HTML",
            "Start receiving messages instantly!",
        ],
    },
    teams: {
        name: "Microsoft Teams",
        icon: "👥",
        color: "text-blue-600",
        gradient: "from-blue-600 to-blue-700",
        fields: [
            {
                key: "channelId",
                label: "Bot Name",
                type: "text",
                placeholder: "MyTeamsBot",
                description: "A unique identifier for your Teams bot",
                required: true,
            },
            {
                key: "appId",
                label: "App ID",
                type: "text",
                placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                description: "From Azure Bot registration",
                required: true,
            },
            {
                key: "appPassword",
                label: "App Password",
                type: "password",
                placeholder: "Your app secret",
                description: "Client secret from Azure AD",
                required: true,
            },
            {
                key: "displayName",
                label: "Display Name",
                type: "text",
                placeholder: "Teams Support Bot",
                description: "A friendly name for this connection",
            },
        ],
        instructions: [
            "Create a Bot registration in Azure Portal",
            "Configure the messaging endpoint",
            "Add the Microsoft Teams channel",
            "Install the bot in your Teams tenant",
        ],
        documentationUrl: "https://learn.microsoft.com/en-us/microsoftteams/platform/bots/",
    },
    slack: {
        name: "Slack",
        icon: "💬",
        color: "text-purple-500",
        gradient: "from-purple-500 to-purple-600",
        fields: [
            {
                key: "channelId",
                label: "App Name",
                type: "text",
                placeholder: "MaiaChat Bot",
                description: "A unique identifier for your Slack app",
                required: true,
            },
            {
                key: "botToken",
                label: "Bot Token",
                type: "password",
                placeholder: "xoxb-...",
                description: "Bot User OAuth Token from your Slack app settings",
                required: true,
            },
            {
                key: "appToken",
                label: "App Token",
                type: "password",
                placeholder: "xapp-...",
                description: "App-level token for Socket Mode (generate under Basic Information)",
            },
            {
                key: "signingSecret",
                label: "Signing Secret",
                type: "password",
                placeholder: "Your signing secret",
                description: "Found in Basic Information → App Credentials",
            },
            {
                key: "displayName",
                label: "Display Name",
                type: "text",
                placeholder: "Slack Bot",
                description: "A friendly name for this connection",
            },
        ],
        instructions: [
            "Create a new app at api.slack.com/apps",
            "Enable Socket Mode and generate an App Token",
            "Add Bot Token Scopes (chat:write, etc.)",
            "Install the app to your workspace and copy the Bot Token",
        ],
        documentationUrl: "https://api.slack.com/start/quickstart",
    },
    discord: {
        name: "Discord",
        icon: "🎮",
        color: "text-indigo-500",
        gradient: "from-indigo-500 to-indigo-600",
        fields: [
            {
                key: "channelId",
                label: "Bot Name",
                type: "text",
                placeholder: "MaiaChat Bot",
                description: "A unique identifier for your Discord bot",
                required: true,
            },
            {
                key: "botToken",
                label: "Bot Token",
                type: "password",
                placeholder: "Your Discord bot token",
                description: "From Discord Developer Portal → Bot → Token",
                required: true,
            },
            {
                key: "displayName",
                label: "Display Name",
                type: "text",
                placeholder: "Discord Bot",
                description: "A friendly name for this connection",
            },
        ],
        instructions: [
            "Create an application at discord.com/developers",
            "Add a Bot under the application settings",
            "Copy the bot token",
            "Invite the bot to your server using OAuth2 URL Generator",
        ],
        documentationUrl: "https://discord.com/developers/docs/intro",
    },
    whatsapp: {
        name: "WhatsApp",
        icon: "📱",
        color: "text-green-600",
        gradient: "from-green-500 to-green-600",
        fields: [
            {
                key: "displayName",
                label: "Display Name",
                type: "text",
                placeholder: "WhatsApp Bot",
                description: "A friendly name for this connection",
                required: true,
            },
            {
                key: "authDir",
                label: "Auth Directory",
                type: "text",
                placeholder: ".whatsapp-auth",
                description: "Directory for storing WhatsApp session (default: .whatsapp-auth)",
            },
        ],
        instructions: [
            "Enter a display name for this connection",
            "Click Connect — a QR code will appear here",
            "Scan the QR code with WhatsApp on your phone",
            "Messages will start flowing automatically",
        ],
    },
    signal: {
        name: "Signal",
        icon: "🔒",
        color: "text-blue-500",
        gradient: "from-blue-500 to-blue-600",
        fields: [
            {
                key: "phoneNumber",
                label: "Phone Number",
                type: "text",
                placeholder: "+1234567890",
                description: "Signal phone number with country code",
                required: true,
            },
            {
                key: "signalCliPath",
                label: "signal-cli Path",
                type: "text",
                placeholder: "signal-cli",
                description: "Path to signal-cli binary (default: signal-cli)",
            },
            {
                key: "displayName",
                label: "Display Name",
                type: "text",
                placeholder: "Signal Bot",
                description: "A friendly name for this connection",
            },
        ],
        instructions: [
            "Install signal-cli on your server",
            "Register or link a Signal number using signal-cli",
            "Enter the registered phone number here",
            "Messages will be processed via signal-cli daemon",
        ],
        documentationUrl: "https://github.com/AsamK/signal-cli",
    },
};

// ============================================================================
// Main Component
// ============================================================================

export function ManualConnectDialog({
    channelType,
    isOpen,
    onOpenChange,
    onConnected,
}: ManualConnectDialogProps) {
    const config = CHANNEL_CONFIGS[channelType];
    const [step, setStep] = useState<"form" | "qr" | "success">("form");
    const [loading, setLoading] = useState(false);
    const [values, setValues] = useState<Record<string, string>>({});
    const [embedCode, setEmbedCode] = useState<string | null>(null);

    // WhatsApp QR pairing state
    const [qrAccountId, setQrAccountId] = useState<string | null>(null);
    const [qrValue, setQrValue] = useState<string | null>(null);
    const [qrError, setQrError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                    toast.success(`${config?.name ?? "WhatsApp"} connected successfully!`);
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

        poll();
        pollRef.current = setInterval(poll, 3000);

        timeoutRef.current = setTimeout(() => {
            cleanupPolling();
            setQrError("QR code expired. Please try again.");
            setQrValue(null);
        }, 120_000);

        return cleanupPolling;
    }, [step, qrAccountId, cleanupPolling, config?.name]);

    if (!config) {
        return null;
    }

    const handleSubmit = async () => {
        // Validate required fields
        for (const field of config.fields) {
            if (field.required && !values[field.key]?.trim()) {
                toast.error(`${field.label} is required`);
                return;
            }
        }

        try {
            setLoading(true);

            const response = await fetch(`/api/channels/manual/${channelType}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Connection failed");
            }

            const data = await response.json();

            // WhatsApp: transition to QR step for pairing
            if (channelType === "whatsapp" && data.account?.id) {
                setQrAccountId(data.account.id);
                setQrValue(null);
                setQrError(null);
                setStep("qr");
                return;
            }

            if (channelType === "webchat" && data.embedCode) {
                setEmbedCode(data.embedCode);
            }

            setStep("success");
            toast.success(`${config.name} connected successfully!`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Connection failed");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        cleanupPolling();
        if (step === "success") {
            onConnected();
        }
        setStep("form");
        setValues({});
        setEmbedCode(null);
        setQrAccountId(null);
        setQrValue(null);
        setQrError(null);
        onOpenChange(false);
    };

    const copyEmbedCode = () => {
        if (embedCode) {
            navigator.clipboard.writeText(embedCode);
            toast.success("Embed code copied!");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden">
                {/* Header with gradient */}
                <div className={cn(
                    "relative px-6 py-8 text-white",
                    `bg-gradient-to-br ${config.gradient}`
                )}>
                    {/* Decorative pattern */}
                    <div
                        className="absolute inset-0 opacity-10"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E")`,
                        }}
                    />

                    <DialogHeader className="relative">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-4xl">{config.icon}</span>
                            <div>
                                <DialogTitle className="text-2xl font-bold text-white">
                                    Connect {config.name}
                                </DialogTitle>
                                <DialogDescription className="text-white/80">
                                    {step === "form"
                                        ? "Enter your credentials to connect"
                                        : step === "qr"
                                        ? "Scan with your phone"
                                        : "You're all set!"}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <AnimatePresence mode="wait">
                    {step === "qr" ? (
                        <motion.div
                            key="qr"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="p-6 space-y-6"
                        >
                            <div className="flex flex-col items-center gap-4 py-2">
                                {qrError ? (
                                    <div className="text-center space-y-3">
                                        <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
                                        <p className="text-sm text-destructive">{qrError}</p>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setQrError(null);
                                                setQrValue(null);
                                                setStep("form");
                                                cleanupPolling();
                                            }}
                                        >
                                            Try Again
                                        </Button>
                                    </div>
                                ) : qrValue ? (
                                    <>
                                        <div className="rounded-lg bg-white p-4 shadow-sm">
                                            <QRCodeSVG value={qrValue} size={240} level="M" />
                                        </div>
                                        <p className="text-xs text-muted-foreground text-center max-w-[280px]">
                                            Open WhatsApp on your phone, go to{" "}
                                            <strong>Settings &gt; Linked Devices &gt; Link a Device</strong>,
                                            then scan this code.
                                        </p>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-3 py-8">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        <p className="text-sm text-muted-foreground">Waiting for QR code...</p>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end pt-4 border-t">
                                <Button variant="outline" onClick={handleClose}>
                                    Cancel
                                </Button>
                            </div>
                        </motion.div>
                    ) : step === "form" ? (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="p-6 space-y-6"
                        >
                            {/* Instructions */}
                            <div className="bg-muted/50 rounded-lg p-4">
                                <h4 className="font-medium mb-2 flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-primary" />
                                    Quick Setup
                                </h4>
                                <ol className="text-sm text-muted-foreground space-y-1">
                                    {config.instructions.map((instruction, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                                                {i + 1}
                                            </span>
                                            <span>{instruction}</span>
                                        </li>
                                    ))}
                                </ol>
                                {config.documentationUrl && (
                                    <a
                                        href={config.documentationUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 mt-3 text-sm text-primary hover:underline"
                                    >
                                        View documentation
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                            </div>

                            {/* Form Fields */}
                            <div className="space-y-4">
                                {config.fields.map((field) => (
                                    <div key={field.key} className="space-y-2">
                                        <Label htmlFor={field.key} className="flex items-center gap-1">
                                            {field.label}
                                            {field.required && (
                                                <span className="text-destructive">*</span>
                                            )}
                                        </Label>
                                        {field.type === "textarea" ? (
                                            <Textarea
                                                id={field.key}
                                                placeholder={field.placeholder}
                                                value={values[field.key] || ""}
                                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                                    setValues({ ...values, [field.key]: e.target.value })
                                                }
                                                rows={3}
                                            />
                                        ) : (
                                            <Input
                                                id={field.key}
                                                type={field.type}
                                                placeholder={field.placeholder}
                                                value={values[field.key] || ""}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                    setValues({ ...values, [field.key]: e.target.value })
                                                }
                                            />
                                        )}
                                        {field.description && (
                                            <p className="text-xs text-muted-foreground">
                                                {field.description}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button variant="outline" onClick={handleClose}>
                                    Cancel
                                </Button>
                                <Button onClick={handleSubmit} disabled={loading}>
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : (
                                        <>
                                            Connect
                                            <ArrowRight className="h-4 w-4 ml-2" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-6 space-y-6"
                        >
                            <div className="text-center py-4">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", delay: 0.2 }}
                                    className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4"
                                >
                                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                                </motion.div>
                                <h3 className="text-xl font-semibold mb-2">
                                    {config.name} Connected!
                                </h3>
                                <p className="text-muted-foreground">
                                    Messages will now appear in your unified inbox.
                                </p>
                                {channelType === "whatsapp" && (
                                    <p className="text-sm text-muted-foreground mt-2">
                                        Auto-reply is off by default. Enable it in channel settings to let the AI respond automatically.
                                    </p>
                                )}
                            </div>

                            {embedCode && (
                                <div className="space-y-2">
                                    <Label>Embed Code</Label>
                                    <div className="relative">
                                        <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto">
                                            {embedCode}
                                        </pre>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="absolute top-2 right-2"
                                            onClick={copyEmbedCode}
                                        >
                                            <Copy className="h-4 w-4 mr-1" />
                                            Copy
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        Add this code to your website to enable the chat widget.
                                    </p>
                                </div>
                            )}

                            <div className="flex justify-end pt-4 border-t">
                                <Button onClick={handleClose}>
                                    Done
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    );
}
