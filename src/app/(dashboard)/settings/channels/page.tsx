"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageSquare, Loader2, ExternalLink, Trash2, AlertCircle, CheckCircle2, Play, Radio, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { ManualConnectDialog } from "@/components/channels/ManualConnectDialog";
import { ChannelSettingsPanel } from "@/components/channels/ChannelSettingsPanel";

interface ChannelAccount {
    id: string;
    channelType: string;
    channelId: string;
    displayName: string | null;
    avatarUrl: string | null;
    isActive: boolean;
    lastSyncAt: string | null;
    createdAt: string;
}

const CHANNEL_INFO: Record<string, { name: string; icon: string; color: string; description: string }> = {
    telegram: {
        name: "Telegram",
        icon: "✈️",
        color: "bg-blue-500",
        description: "Set up a Telegram bot for messaging",
    },
    webchat: {
        name: "WebChat",
        icon: "🌐",
        color: "bg-gray-500",
        description: "Embed chat widget on your website",
    },
    slack: {
        name: "Slack",
        icon: "💬",
        color: "bg-purple-500",
        description: "Connect your Slack workspace to chat with AI",
    },
    discord: {
        name: "Discord",
        icon: "🎮",
        color: "bg-indigo-500",
        description: "Add the bot to your Discord server",
    },
    teams: {
        name: "Microsoft Teams",
        icon: "👥",
        color: "bg-blue-600",
        description: "Integrate with Microsoft Teams",
    },
    whatsapp: {
        name: "WhatsApp",
        icon: "📱",
        color: "bg-green-500",
        description: "Connect via QR code pairing",
    },
    signal: {
        name: "Signal",
        icon: "🔒",
        color: "bg-blue-500",
        description: "Connect via signal-cli for private messaging",
    },
    matrix: {
        name: "Matrix",
        icon: "🔗",
        color: "bg-green-500",
        description: "Connect via Matrix protocol",
    },
};

// Channels that support OAuth
const OAUTH_CHANNELS = ["slack", "discord"];

// Channels that require manual setup
const MANUAL_CHANNELS = ["telegram", "webchat", "teams", "whatsapp", "signal"];

// Channels not yet available
const COMING_SOON_CHANNELS = ["matrix"];

export default function ChannelsPage() {
    const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState<string | null>(null);
    const [manualChannelType, setManualChannelType] = useState<string | null>(null);
    const [activating, setActivating] = useState(false);
    const [botsActive, setBotsActive] = useState(false);
    const [settingsChannel, setSettingsChannel] = useState<ChannelAccount | null>(null);
    const searchParams = useSearchParams();

    useEffect(() => {
        fetchAccounts();

        // Handle OAuth callbacks
        const success = searchParams.get("success");
        const error = searchParams.get("error");

        if (success === "true") {
            toast.success("Channel connected successfully!");
        } else if (error) {
            toast.error(`Connection failed: ${error}`);
        }
    }, [searchParams]);

    const fetchAccounts = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/channels");
            if (!response.ok) throw new Error("Failed to fetch channels");
            const data = await response.json();
            setAccounts(data.accounts || []);
        } catch (error) {
            console.error("Fetch channels error:", error);
            toast.error("Failed to load connected channels");
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async (type: string) => {
        if (MANUAL_CHANNELS.includes(type)) {
            setManualChannelType(type);
            return;
        }

        if (!OAUTH_CHANNELS.includes(type)) {
            toast.info(`${CHANNEL_INFO[type]?.name || type} is not available yet`);
            return;
        }

        try {
            setConnecting(type);
            const response = await fetch(`/api/channels/connect/${type}`);
            if (!response.ok) throw new Error("Failed to start connection");

            const { authUrl } = await response.json();
            window.location.href = authUrl;
        } catch (error) {
            console.error("Connect error:", error);
            toast.error("Failed to start connection");
            setConnecting(null);
        }
    };

    const handleToggle = async (id: string, isActive: boolean) => {
        try {
            const response = await fetch(`/api/channels/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive }),
            });

            if (!response.ok) throw new Error("Failed to update channel");

            setAccounts((prev) =>
                prev.map((a) => (a.id === id ? { ...a, isActive } : a))
            );

            toast.success(isActive ? "Channel enabled" : "Channel disabled");
        } catch (error) {
            console.error("Toggle error:", error);
            toast.error("Failed to update channel");
        }
    };

    const handleDisconnect = async (id: string) => {
        try {
            const response = await fetch(`/api/channels/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to disconnect");

            setAccounts((prev) => prev.filter((a) => a.id !== id));
            toast.success("Channel disconnected");
        } catch (error) {
            console.error("Disconnect error:", error);
            toast.error("Failed to disconnect channel");
        }
    };

    const connectedTypes = accounts.map((a) => a.channelType);

    const handleActivateBots = async () => {
        try {
            setActivating(true);
            const response = await fetch("/api/channels/activate", { method: "POST" });

            if (!response.ok) {
                throw new Error("Failed to activate bots");
            }

            const data = await response.json();
            setBotsActive(true);
            toast.success(data.message || "Bots activated successfully!");
        } catch (error) {
            console.error("Activate error:", error);
            toast.error("Failed to activate bots");
        } finally {
            setActivating(false);
        }
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            {manualChannelType && (
                <ManualConnectDialog
                    channelType={manualChannelType}
                    isOpen={!!manualChannelType}
                    onOpenChange={(open) => !open && setManualChannelType(null)}
                    onConnected={fetchAccounts}
                />
            )}

            {settingsChannel && (
                <ChannelSettingsPanel
                    channelId={settingsChannel.id}
                    channelType={settingsChannel.channelType}
                    channelName={settingsChannel.displayName || CHANNEL_INFO[settingsChannel.channelType]?.name || settingsChannel.channelType}
                    isOpen={!!settingsChannel}
                    onClose={() => setSettingsChannel(null)}
                    onSave={fetchAccounts}
                />
            )}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Connected Channels</h1>
                    <p className="text-muted-foreground mt-1">
                        Connect messaging platforms to chat with AI across all channels
                    </p>
                </div>
                {accounts.some((a) => a.isActive) && (
                    <Button
                        onClick={handleActivateBots}
                        disabled={activating || botsActive}
                        className="gap-2"
                    >
                        {activating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : botsActive ? (
                            <Radio className="h-4 w-4 text-green-400" />
                        ) : (
                            <Play className="h-4 w-4" />
                        )}
                        {activating ? "Starting..." : botsActive ? "Bots Running" : "Start Bots"}
                    </Button>
                )}
            </div>

            {/* Connected Channels */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        Your Channels
                    </CardTitle>
                    <CardDescription>
                        Manage your connected messaging platforms
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : accounts.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No channels connected yet.</p>
                            <p className="text-sm">Connect a channel below to get started.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {accounts.map((account) => {
                                const info = CHANNEL_INFO[account.channelType];
                                return (
                                    <div
                                        key={account.id}
                                        className="flex items-center justify-between p-4 rounded-lg border bg-muted/30"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div
                                                className={`w-10 h-10 rounded-lg ${info?.color || "bg-gray-500"} flex items-center justify-center text-white text-xl`}
                                            >
                                                {info?.icon || "📱"}
                                            </div>
                                            <div>
                                                <div className="font-medium flex items-center gap-2">
                                                    {account.displayName || info?.name || account.channelType}
                                                    {account.isActive && (
                                                        <Badge variant="outline" className="text-green-600 text-xs">
                                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                                            Active
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {info?.name}
                                                    {account.lastSyncAt && (
                                                        <span>
                                                            {" "}· Last active{" "}
                                                            {new Date(account.lastSyncAt).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setSettingsChannel(account)}
                                                            className="text-muted-foreground hover:text-foreground"
                                                        >
                                                            <Settings2 className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Configure AI settings</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <Switch
                                                checked={account.isActive}
                                                onCheckedChange={(checked) => handleToggle(account.id, checked)}
                                            />
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="text-destructive">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Disconnect Channel</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Are you sure you want to disconnect this channel? You will need to reconnect it to receive messages.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDisconnect(account.id)}
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        >
                                                            Disconnect
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Available Channels */}
            <Card>
                <CardHeader>
                    <CardTitle>Available Channels</CardTitle>
                    <CardDescription>
                        Connect new messaging platforms
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(CHANNEL_INFO).map(([type, info]) => {
                            const isConnected = connectedTypes.includes(type);
                            const isOAuth = OAUTH_CHANNELS.includes(type);
                            const isManual = MANUAL_CHANNELS.includes(type);
                            const isComingSoon = COMING_SOON_CHANNELS.includes(type);
                            const disableConnect = isConnected || isComingSoon;

                            return (
                                <div
                                    key={type}
                                    className={`flex items-center justify-between p-4 rounded-lg border ${
                                        isConnected ? "opacity-60" : ""
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className={`w-10 h-10 rounded-lg ${info.color} flex items-center justify-center text-white text-xl`}
                                        >
                                            {info.icon}
                                        </div>
                                        <div>
                                            <div className="font-medium">{info.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {info.description}
                                            </div>
                                            {isConnected && (
                                                <Badge variant="secondary" className="text-xs mt-1">
                                                    Connected
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => handleConnect(type)}
                                        disabled={disableConnect || connecting === type}
                                        variant={isOAuth ? "default" : "outline"}
                                    >
                                        {connecting === type ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : isComingSoon ? (
                                            "Coming soon"
                                        ) : isOAuth ? (
                                            <>
                                                Connect
                                                <ExternalLink className="h-3 w-3 ml-1" />
                                            </>
                                        ) : (
                                            isManual ? "Configure" : "Learn more"
                                        )}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">About Channels</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>• OAuth channels (Slack, Discord) connect with one click</p>
                    <p>• Telegram requires creating a bot via @BotFather</p>
                    <p>• All messages are encrypted and stored securely</p>
                    <p>• Auto-reply can be configured per channel in Settings → Auto-Reply</p>
                    <p>• Disable a channel to pause AI responses without disconnecting</p>
                </CardContent>
            </Card>
        </div>
    );
}
