"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Radio,
    Plus,
    MoreVertical,
    Settings2,
    Trash2,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ExternalLink,
    Zap,
    Globe,
    MessageSquare,
    Send,
    Users,
    Link2,
    Unplug,
    Activity,
    Play,
} from "lucide-react";
import { toast } from "sonner";
import { ManualConnectDialog } from "@/components/channels/ManualConnectDialog";
import { ChannelSettingsPanel } from "@/components/channels/ChannelSettingsPanel";

// ============================================================================
// Types
// ============================================================================

interface ChannelAccount {
    id: string;
    channelType: string;
    channelId: string;
    displayName: string;
    avatarUrl?: string;
    isActive: boolean;
    config: Record<string, unknown>;
    lastSyncAt?: string;
    messageCount?: number;
    createdAt: string;
    updatedAt: string;
}

interface ChannelType {
    id: string;
    name: string;
    icon: string;
    description: string;
    color: string;
    gradient: string;
    available: boolean;
    comingSoon?: boolean;
}

// ============================================================================
// Channel Type Definitions
// ============================================================================

const CHANNEL_TYPES: ChannelType[] = [
    {
        id: "telegram",
        name: "Telegram",
        icon: "Send",
        description: "Connect your Telegram bot for instant messaging",
        color: "text-blue-500",
        gradient: "from-blue-500 to-blue-600",
        available: true,
    },
    {
        id: "webchat",
        name: "WebChat",
        icon: "Globe",
        description: "Embed a chat widget on your website",
        color: "text-gray-600",
        gradient: "from-gray-500 to-gray-600",
        available: true,
    },
    {
        id: "slack",
        name: "Slack",
        icon: "MessageSquare",
        description: "Connect to Slack workspaces via Socket Mode",
        color: "text-purple-500",
        gradient: "from-purple-500 to-purple-600",
        available: true,
    },
    {
        id: "discord",
        name: "Discord",
        icon: "Zap",
        description: "Add your bot to Discord servers",
        color: "text-indigo-500",
        gradient: "from-indigo-500 to-indigo-600",
        available: true,
    },
    {
        id: "teams",
        name: "Microsoft Teams",
        icon: "Users",
        description: "Integrate with Microsoft Teams workspaces",
        color: "text-blue-600",
        gradient: "from-blue-600 to-blue-700",
        available: true,
    },
    {
        id: "whatsapp",
        name: "WhatsApp",
        icon: "MessageSquare",
        description: "Connect via QR code pairing",
        color: "text-green-600",
        gradient: "from-green-500 to-green-600",
        available: true,
    },
    {
        id: "signal",
        name: "Signal",
        icon: "MessageSquare",
        description: "Connect via signal-cli for private messaging",
        color: "text-blue-500",
        gradient: "from-blue-500 to-blue-600",
        available: true,
    },
    {
        id: "matrix",
        name: "Matrix",
        icon: "Link2",
        description: "Connect to Matrix/Element for decentralized chat",
        color: "text-green-500",
        gradient: "from-green-500 to-green-600",
        available: false,
        comingSoon: true,
    },
];

// ============================================================================
// Icon Component
// ============================================================================

function ChannelIcon({ icon, className }: { icon: string; className?: string }) {
    const icons: Record<string, React.ReactNode> = {
        Send: <Send className={className} />,
        Globe: <Globe className={className} />,
        Link2: <Link2 className={className} />,
        Users: <Users className={className} />,
        MessageSquare: <MessageSquare className={className} />,
        Zap: <Zap className={className} />,
    };
    return <>{icons[icon] || <Radio className={className} />}</>;
}

// ============================================================================
// Main Component
// ============================================================================

interface RunningChannel {
    type: string;
    channelId: string;
    running: boolean;
    model?: string;
}

export default function ChannelsPage() {
    const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [connectDialog, setConnectDialog] = useState<string | null>(null);
    const [activating, setActivating] = useState(false);
    const [botsActive, setBotsActive] = useState(false);
    const [runningChannels, setRunningChannels] = useState<RunningChannel[]>([]);
    const [startingChannel, setStartingChannel] = useState<string | null>(null);
    const [settingsAccount, setSettingsAccount] = useState<ChannelAccount | null>(null);
    const [detailsAccount, setDetailsAccount] = useState<ChannelAccount | null>(null);

    // Fetch connected accounts and check bot status
    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await fetch("/api/channels");
                if (response.ok) {
                    const data = await response.json();
                    setAccounts(data.accounts || []);
                } else {
                    setAccounts([]);
                }
            } catch {
                setAccounts([]);
            } finally {
                setLoading(false);
            }
        };

        const checkBotStatus = async () => {
            try {
                const response = await fetch("/api/channels/activate");
                if (response.ok) {
                    const data = await response.json();
                    setBotsActive(data.active || false);
                    setRunningChannels(data.channels || []);
                }
            } catch {
                // Ignore errors
            }
        };

        fetchAccounts();
        checkBotStatus();
    }, []);

    const handleToggleChannel = async (id: string, isActive: boolean) => {
        try {
            // Optimistic update
            setAccounts((prev) =>
                prev.map((a) => (a.id === id ? { ...a, isActive } : a))
            );

            const response = await fetch(`/api/channels/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive }),
            });

            if (!response.ok) {
                throw new Error("Failed to update channel");
            }

            toast.success(isActive ? "Channel enabled" : "Channel disabled");
        } catch {
            // Revert on error
            setAccounts((prev) =>
                prev.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a))
            );
            toast.error("Failed to update channel");
        }
    };

    const handleDisconnect = async (id: string) => {
        try {
            const response = await fetch(`/api/channels/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error("Failed to disconnect");
            }

            setAccounts((prev) => prev.filter((a) => a.id !== id));
            toast.success("Channel disconnected");
        } catch {
            toast.error("Failed to disconnect channel");
        }
    };

    const handleConnected = () => {
        // Refresh accounts list
        setLoading(true);
        fetch("/api/channels")
            .then((r) => r.json())
            .then((data) => setAccounts(data.accounts || []))
            .catch(() => setAccounts([]))
            .finally(() => setLoading(false));
    };

    const getChannelType = (id: string) =>
        CHANNEL_TYPES.find((t) => t.id === id);

    const handleActivateBots = async () => {
        try {
            setActivating(true);
            const response = await fetch("/api/channels/activate", { method: "POST" });

            if (!response.ok) {
                throw new Error("Failed to activate bots");
            }

            const data = await response.json();
            setBotsActive(true);
            setRunningChannels(data.channels || []);
            toast.success(data.message || "Bots activated! Messages will now receive AI responses.");
        } catch (error) {
            console.error("Activate error:", error);
            toast.error("Failed to activate bots");
        } finally {
            setActivating(false);
        }
    };

    // Check if a specific channel is running
    const isChannelRunning = (channelType: string) => {
        return runningChannels.some((c) => c.type === channelType && c.running);
    };

    const formatLastActivity = (date: string) => {
        const diff = Date.now() - new Date(date).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    return (
        <div className="min-h-screen">
            {/* Hero Header */}
            <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/5 via-background to-accent/5">
                {/* Decorative grid */}
                <div
                    className="absolute inset-0 opacity-[0.015]"
                    style={{
                        backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
                            linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
                        backgroundSize: "60px 60px",
                    }}
                />

                {/* Floating orbs */}
                <div className="absolute top-20 left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-20 right-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

                <div className="relative container mx-auto px-6 py-12">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-3xl"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 rounded-xl bg-primary/10 backdrop-blur-sm border border-primary/20">
                                <Radio className="h-6 w-6 text-primary" />
                            </div>
                            <Badge variant="secondary" className="font-mono text-xs">
                                Multi-Channel
                            </Badge>
                        </div>

                        <h1 className="text-4xl font-bold tracking-tight mb-3">
                            Channel Connections
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-xl">
                            Connect your messaging platforms to receive and respond to messages
                            from a unified inbox with AI-powered assistance.
                        </p>

                        {/* Quick stats */}
                        <div className="flex items-center gap-6 mt-6">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-sm text-muted-foreground">
                                    {accounts.filter((a) => a.isActive).length} active
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                    {accounts.reduce((sum, a) => sum + (a.messageCount || 0), 0).toLocaleString()} messages
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            <div className="container mx-auto px-6 py-8 space-y-8">
                {/* Connected Channels */}
                <section>
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-semibold">Connected Channels</h2>
                            <p className="text-sm text-muted-foreground">
                                Manage your active channel integrations
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {accounts.some((a) => a.isActive) && (
                                <Button
                                    size="sm"
                                    onClick={handleActivateBots}
                                    disabled={activating || botsActive}
                                    className="gap-2"
                                >
                                    {activating ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : botsActive ? (
                                        <Radio className="h-4 w-4 text-green-400 animate-pulse" />
                                    ) : (
                                        <Play className="h-4 w-4" />
                                    )}
                                    {activating ? "Starting..." : botsActive ? "Bots Running" : "Start Bots"}
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleConnected()}
                                disabled={loading}
                            >
                                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                                Refresh
                            </Button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : accounts.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                    <Unplug className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <h3 className="text-lg font-medium mb-2">No channels connected</h3>
                                <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                                    Connect your first channel to start receiving messages in your unified inbox.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            <AnimatePresence mode="popLayout">
                                {accounts.map((account, index) => {
                                    const channelType = getChannelType(account.channelType);
                                    return (
                                        <motion.div
                                            key={account.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ delay: index * 0.05 }}
                                        >
                                            <Card className="group hover:shadow-lg transition-all duration-300">
                                                <CardHeader className="pb-3">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className={cn(
                                                                    "w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg",
                                                                    `bg-gradient-to-br ${channelType?.gradient || "from-gray-500 to-gray-600"}`
                                                                )}
                                                            >
                                                                <ChannelIcon
                                                                    icon={channelType?.icon || "Radio"}
                                                                    className="h-6 w-6"
                                                                />
                                                            </div>
                                                            <div>
                                                                <CardTitle className="text-base">
                                                                    {account.displayName}
                                                                </CardTitle>
                                                                <CardDescription className="flex items-center gap-2">
                                                                    <span className={channelType?.color}>
                                                                        {channelType?.name}
                                                                    </span>
                                                                    {account.isActive ? (
                                                                        isChannelRunning(account.channelType) ? (
                                                                            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30">
                                                                                <Radio className="h-3 w-3 mr-1 animate-pulse" />
                                                                                Running
                                                                            </Badge>
                                                                        ) : (
                                                                            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                                                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                                                Ready
                                                                            </Badge>
                                                                        )
                                                                    ) : (
                                                                        <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30">
                                                                            Inactive
                                                                        </Badge>
                                                                    )}
                                                                </CardDescription>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Switch
                                                                checked={account.isActive}
                                                                onCheckedChange={(checked) =>
                                                                    handleToggleChannel(account.id, checked)
                                                                }
                                                            />
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                        <MoreVertical className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem onClick={() => setSettingsAccount(account)}>
                                                                        <Settings2 className="h-4 w-4 mr-2" />
                                                                        Configure AI
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleConnected()}>
                                                                        <RefreshCw className="h-4 w-4 mr-2" />
                                                                        Reconnect
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem
                                                                        className="text-destructive"
                                                                        onClick={() => handleDisconnect(account.id)}
                                                                    >
                                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                                        Disconnect
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-4 text-muted-foreground">
                                                            <span className="flex items-center gap-1">
                                                                <MessageSquare className="h-3.5 w-3.5" />
                                                                {account.messageCount?.toLocaleString() || 0}
                                                            </span>
                                                            {account.lastSyncAt && (
                                                                <span>
                                                                    Last: {formatLastActivity(account.lastSyncAt)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 text-xs"
                                                            onClick={() => setDetailsAccount(account)}
                                                        >
                                                            View Details
                                                            <ExternalLink className="h-3 w-3 ml-1" />
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </section>

                {/* Available Channels */}
                <section>
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold">Add Channel</h2>
                        <p className="text-sm text-muted-foreground">
                            Connect a new messaging platform
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {CHANNEL_TYPES.map((channel, index) => {
                            const isConnected = accounts.some(
                                (a) => a.channelType === channel.id
                            );

                            return (
                                <motion.div
                                    key={channel.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 + index * 0.05 }}
                                >
                                    <Card
                                        className={cn(
                                            "group cursor-pointer transition-all duration-300",
                                            channel.available && !channel.comingSoon
                                                ? "hover:shadow-lg hover:border-primary/50"
                                                : "opacity-60 cursor-not-allowed"
                                        )}
                                        onClick={() =>
                                            channel.available &&
                                            !channel.comingSoon &&
                                            setConnectDialog(channel.id)
                                        }
                                    >
                                        <CardHeader>
                                            <div className="flex items-center justify-between">
                                                <div
                                                    className={cn(
                                                        "w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-110",
                                                        `bg-gradient-to-br ${channel.gradient}`
                                                    )}
                                                >
                                                    <ChannelIcon icon={channel.icon} className="h-6 w-6" />
                                                </div>
                                                {channel.comingSoon ? (
                                                    <Badge variant="secondary">Coming Soon</Badge>
                                                ) : isConnected ? (
                                                    <Badge variant="outline" className="text-green-600">
                                                        Connected
                                                    </Badge>
                                                ) : (
                                                    <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                                )}
                                            </div>
                                            <CardTitle className="text-base mt-4">
                                                {channel.name}
                                            </CardTitle>
                                            <CardDescription>{channel.description}</CardDescription>
                                        </CardHeader>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>
            </div>

            {/* Manual Connect Dialog */}
            {connectDialog && (
                <ManualConnectDialog
                    channelType={connectDialog}
                    isOpen={!!connectDialog}
                    onOpenChange={(open) => !open && setConnectDialog(null)}
                    onConnected={handleConnected}
                />
            )}

            {/* Channel Settings Panel */}
            {settingsAccount && (
                <ChannelSettingsPanel
                    channelId={settingsAccount.id}
                    channelType={settingsAccount.channelType}
                    channelName={settingsAccount.displayName || getChannelType(settingsAccount.channelType)?.name || settingsAccount.channelType}
                    isOpen={!!settingsAccount}
                    onClose={() => setSettingsAccount(null)}
                    onSave={() => handleConnected()}
                />
            )}

            {/* Channel Details Dialog */}
            <Dialog open={!!detailsAccount} onOpenChange={(open) => !open && setDetailsAccount(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {detailsAccount && (
                                <>
                                    <ChannelIcon
                                        icon={getChannelType(detailsAccount.channelType)?.icon || "MessageSquare"}
                                        className={cn("h-5 w-5", getChannelType(detailsAccount.channelType)?.color)}
                                    />
                                    {detailsAccount.displayName || detailsAccount.channelType}
                                </>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            Connection details for this channel
                        </DialogDescription>
                    </DialogHeader>
                    {detailsAccount && (
                        <div className="space-y-4">
                            <div className="grid gap-3">
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-sm text-muted-foreground">Channel Type</span>
                                    <span className="text-sm font-medium capitalize">{detailsAccount.channelType}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-sm text-muted-foreground">Display Name</span>
                                    <span className="text-sm font-medium">{detailsAccount.displayName || "—"}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-sm text-muted-foreground">Status</span>
                                    <Badge variant={detailsAccount.isActive ? "default" : "outline"}>
                                        {detailsAccount.isActive ? "Active" : "Inactive"}
                                    </Badge>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-sm text-muted-foreground">Messages</span>
                                    <span className="text-sm font-medium">{detailsAccount.messageCount?.toLocaleString() || 0}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-sm text-muted-foreground">Created</span>
                                    <span className="text-sm font-medium">
                                        {new Date(detailsAccount.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                {detailsAccount.lastSyncAt && (
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm text-muted-foreground">Last Activity</span>
                                        <span className="text-sm font-medium">
                                            {new Date(detailsAccount.lastSyncAt).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                {detailsAccount.config && Object.keys(detailsAccount.config).length > 0 && (
                                    <div className="pt-2">
                                        <span className="text-sm text-muted-foreground block mb-2">Configuration</span>
                                        <div className="bg-muted rounded-md p-3 space-y-2">
                                            {Object.entries(detailsAccount.config).map(([key, value]) => {
                                                // Don't show sensitive tokens in full
                                                const displayValue = key.toLowerCase().includes("token") ||
                                                    key.toLowerCase().includes("secret") ||
                                                    key.toLowerCase().includes("password")
                                                    ? typeof value === "string" && value.length > 8
                                                        ? `${value.slice(0, 4)}...${value.slice(-4)}`
                                                        : "••••••••"
                                                    : String(value);

                                                return (
                                                    <div key={key} className="flex justify-between items-center text-xs">
                                                        <span className="text-muted-foreground capitalize">
                                                            {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
                                                        </span>
                                                        <span className="font-mono">{displayValue}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                        setDetailsAccount(null);
                                        setSettingsAccount(detailsAccount);
                                    }}
                                >
                                    <Settings2 className="h-4 w-4 mr-2" />
                                    Configure AI
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
