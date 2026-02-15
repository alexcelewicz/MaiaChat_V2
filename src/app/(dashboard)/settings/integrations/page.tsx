"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    Mail,
    Calendar,
    Loader2,
    ExternalLink,
    Unlink,
    CheckCircle2,
    Shield,
    RefreshCw,
    Plug,
    AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface GoogleConnectionStatus {
    enabled?: boolean;
    connected: boolean;
    email?: string;
    scopes?: string[];
    expiresAt?: string;
    lastRefreshed?: string;
    message?: string;
}

// Google-specific brand colors
const GOOGLE_COLORS = {
    blue: "#4285F4",
    red: "#EA4335",
    yellow: "#FBBC05",
    green: "#34A853",
};

// Permission descriptions for display
const SCOPE_INFO: Record<string, { name: string; icon: React.ElementType; description: string }> = {
    "gmail.readonly": {
        name: "Read Email",
        icon: Mail,
        description: "View your email messages and settings",
    },
    "gmail.send": {
        name: "Send Email",
        icon: Mail,
        description: "Send email on your behalf",
    },
    "gmail.modify": {
        name: "Modify Email",
        icon: Mail,
        description: "Read, compose, send, and permanently delete email",
    },
    "calendar.readonly": {
        name: "View Calendar",
        icon: Calendar,
        description: "View your calendars and events",
    },
    "calendar.events": {
        name: "Manage Events",
        icon: Calendar,
        description: "View and edit events on your calendars",
    },
};

// Google "G" Logo as SVG
function GoogleLogo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className}>
            <path
                fill={GOOGLE_COLORS.blue}
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
                fill={GOOGLE_COLORS.green}
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
                fill={GOOGLE_COLORS.yellow}
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
                fill={GOOGLE_COLORS.red}
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
        </svg>
    );
}

export default function IntegrationsPage() {
    const [status, setStatus] = useState<GoogleConnectionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const searchParams = useSearchParams();

    // HubSpot state
    const [hubspotStatus, setHubspotStatus] = useState<{ connected: boolean; portalId?: string } | null>(null);
    const [hubspotLoading, setHubspotLoading] = useState(true);
    const [hubspotDisconnecting, setHubspotDisconnecting] = useState(false);

    // Asana state
    const [asanaStatus, setAsanaStatus] = useState<{ connected: boolean; workspaceId?: string } | null>(null);
    const [asanaLoading, setAsanaLoading] = useState(true);
    const [asanaDisconnecting, setAsanaDisconnecting] = useState(false);

    useEffect(() => {
        fetchStatus();
        fetchHubspotStatus();
        fetchAsanaStatus();

        // Handle OAuth callback results
        const success = searchParams.get("success") || searchParams.get("google_success");
        const error = searchParams.get("error") || searchParams.get("google_error");
        const email = searchParams.get("email");
        const hubspotSuccess = searchParams.get("hubspot_success");
        const asanaSuccess = searchParams.get("asana_success");

        if (success === "true" || success === "google_connected") {
            toast.success(email ? `Google account connected: ${decodeURIComponent(email)}` : "Google account connected successfully!");
            window.history.replaceState({}, "", "/settings/integrations");
        } else if (hubspotSuccess === "true") {
            toast.success("HubSpot account connected successfully!");
            window.history.replaceState({}, "", "/settings/integrations");
            fetchHubspotStatus();
        } else if (asanaSuccess === "true") {
            toast.success("Asana account connected successfully!");
            window.history.replaceState({}, "", "/settings/integrations");
            fetchAsanaStatus();
        } else if (error) {
            toast.error(`Connection failed: ${decodeURIComponent(error)}`);
            window.history.replaceState({}, "", "/settings/integrations");
        }
    }, [searchParams]);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/integrations/google");
            if (!response.ok) throw new Error("Failed to fetch status");
            const data = await response.json();
            setStatus(data);
        } catch (error) {
            console.error("Fetch status error:", error);
            setStatus({ connected: false });
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async () => {
        try {
            setConnecting(true);
            const response = await fetch("/api/integrations/google", {
                method: "POST",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to start connection");
            }

            const { authUrl } = await response.json();
            window.location.href = authUrl;
        } catch (error) {
            console.error("Connect error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to connect");
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            setDisconnecting(true);
            const response = await fetch("/api/integrations/google", {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to disconnect");
            }

            setStatus({ connected: false });
            toast.success("Google account disconnected");
        } catch (error) {
            console.error("Disconnect error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to disconnect");
        } finally {
            setDisconnecting(false);
        }
    };

    const fetchHubspotStatus = async () => {
        try {
            setHubspotLoading(true);
            const response = await fetch("/api/integrations/hubspot");
            if (response.ok) {
                setHubspotStatus(await response.json());
            } else {
                setHubspotStatus({ connected: false });
            }
        } catch {
            setHubspotStatus({ connected: false });
        } finally {
            setHubspotLoading(false);
        }
    };

    const handleHubspotDisconnect = async () => {
        try {
            setHubspotDisconnecting(true);
            const response = await fetch("/api/integrations/hubspot", { method: "DELETE" });
            if (response.ok) {
                setHubspotStatus({ connected: false });
                toast.success("HubSpot account disconnected");
            } else {
                toast.error("Failed to disconnect HubSpot");
            }
        } catch {
            toast.error("Failed to disconnect HubSpot");
        } finally {
            setHubspotDisconnecting(false);
        }
    };

    const fetchAsanaStatus = async () => {
        try {
            setAsanaLoading(true);
            const response = await fetch("/api/integrations/asana");
            if (response.ok) {
                setAsanaStatus(await response.json());
            } else {
                setAsanaStatus({ connected: false });
            }
        } catch {
            setAsanaStatus({ connected: false });
        } finally {
            setAsanaLoading(false);
        }
    };

    const handleAsanaDisconnect = async () => {
        try {
            setAsanaDisconnecting(true);
            const response = await fetch("/api/integrations/asana", { method: "DELETE" });
            if (response.ok) {
                setAsanaStatus({ connected: false });
                toast.success("Asana account disconnected");
            } else {
                toast.error("Failed to disconnect Asana");
            }
        } catch {
            toast.error("Failed to disconnect Asana");
        } finally {
            setAsanaDisconnecting(false);
        }
    };

    const getScopeShortName = (scope: string): string => {
        // Extract the scope name from full URL or short format
        const match = scope.match(/\/auth\/(.+)$/) || scope.match(/^https:\/\/www\.googleapis\.com\/auth\/(.+)$/);
        return match ? match[1] : scope;
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
                <p className="text-muted-foreground mt-1">
                    Connect external services to enhance your AI assistant
                </p>
            </div>

            {/* Google Integration Card */}
            <Card className="overflow-hidden">
                <CardHeader className="border-b bg-gradient-to-r from-blue-500/5 via-red-500/5 to-green-500/5">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-900 border shadow-sm flex items-center justify-center">
                                <GoogleLogo className="w-7 h-7" />
                            </div>
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    Google
                                    {status?.connected && (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Connected
                                        </Badge>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    Connect Gmail and Calendar for email management and scheduling
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : status?.enabled === false ? (
                        /* Integration Not Enabled State */
                        <div className="text-center py-8 space-y-6">
                            <div className="flex justify-center">
                                <div className="w-20 h-20 rounded-2xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
                                    <AlertCircle className="w-10 h-10 text-amber-600" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-lg">Google Integration Not Enabled</h3>
                                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                                    The Google integration needs to be enabled in the system configuration before you can connect your account.
                                </p>
                            </div>

                            {/* How to Enable */}
                            <div className="text-left max-w-md mx-auto space-y-3 p-4 rounded-lg border bg-muted/30">
                                <h4 className="font-medium text-sm">How to enable:</h4>
                                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                                    <li>Go to <strong>Admin Settings</strong> → <strong>Configuration</strong></li>
                                    <li>Find the <code className="bg-muted px-1 rounded">integrations.google.enabled</code> setting</li>
                                    <li>Set it to <code className="bg-muted px-1 rounded">true</code></li>
                                    <li>Save the configuration</li>
                                </ol>
                                <p className="text-xs text-muted-foreground pt-2 border-t">
                                    You will also need to set <code className="bg-muted px-1 rounded">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
                                    <code className="bg-muted px-1 rounded">GOOGLE_OAUTH_CLIENT_SECRET</code> environment variables.
                                </p>
                            </div>

                            <div className="flex justify-center gap-3">
                                <Button variant="outline" asChild>
                                    <a href="/admin/settings">
                                        Go to Admin Settings
                                    </a>
                                </Button>
                                <Button variant="ghost" onClick={fetchStatus}>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Refresh Status
                                </Button>
                            </div>
                        </div>
                    ) : status?.connected ? (
                        <>
                            {/* Connected Account Info */}
                            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center text-white font-medium">
                                        {status.email?.charAt(0).toUpperCase() || "G"}
                                    </div>
                                    <div>
                                        <div className="font-medium">{status.email}</div>
                                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                                            <Shield className="h-3 w-3" />
                                            Authorized via OAuth 2.0
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={fetchStatus}
                                        disabled={loading}
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                                                <Unlink className="h-4 w-4 mr-2" />
                                                Disconnect
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Disconnect Google Account</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Are you sure you want to disconnect your Google account? The AI assistant will no longer be able to access your Gmail or Calendar.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={handleDisconnect}
                                                    disabled={disconnecting}
                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                >
                                                    {disconnecting ? (
                                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    ) : null}
                                                    Disconnect
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>

                            {/* Permissions */}
                            {status.scopes && status.scopes.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium flex items-center gap-2">
                                        <Shield className="h-4 w-4 text-muted-foreground" />
                                        Granted Permissions
                                    </h3>
                                    <div className="grid gap-2">
                                        {status.scopes.map((scope) => {
                                            const shortScope = getScopeShortName(scope);
                                            const info = SCOPE_INFO[shortScope];
                                            const Icon = info?.icon || Shield;

                                            return (
                                                <div
                                                    key={scope}
                                                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
                                                        <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-sm">
                                                            {info?.name || shortScope}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {info?.description || scope}
                                                        </div>
                                                    </div>
                                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Token Info */}
                            {status.lastRefreshed && (
                                <div className="text-xs text-muted-foreground pt-2 border-t">
                                    Token last refreshed: {new Date(status.lastRefreshed).toLocaleString()}
                                </div>
                            )}
                        </>
                    ) : (
                        /* Not Connected State */
                        <div className="text-center py-8 space-y-6">
                            <div className="flex justify-center">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-green-100 dark:from-blue-950/50 dark:to-green-950/50 flex items-center justify-center">
                                    <GoogleLogo className="w-10 h-10" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-lg">Connect your Google Account</h3>
                                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                                    Allow your AI assistant to read and send emails, manage drafts, and view your calendar on your behalf.
                                </p>
                            </div>

                            {/* Features Preview */}
                            <div className="grid sm:grid-cols-2 gap-4 max-w-md mx-auto text-left">
                                <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                                    <Mail className="h-5 w-5 text-blue-500 mt-0.5" />
                                    <div>
                                        <div className="font-medium text-sm">Gmail</div>
                                        <div className="text-xs text-muted-foreground">Read, send, and organize emails</div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                                    <Calendar className="h-5 w-5 text-green-500 mt-0.5" />
                                    <div>
                                        <div className="font-medium text-sm">Calendar</div>
                                        <div className="text-xs text-muted-foreground">View events and schedules</div>
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={handleConnect}
                                disabled={connecting}
                                size="lg"
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {connecting ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Plug className="h-4 w-4 mr-2" />
                                )}
                                Connect Google Account
                                <ExternalLink className="h-3 w-3 ml-2" />
                            </Button>

                            <p className="text-xs text-muted-foreground">
                                You will be redirected to Google to authorize access
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Security Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Security & Privacy
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                        • We use OAuth 2.0 with PKCE for secure authentication
                    </p>
                    <p>
                        • Your credentials are never stored - only encrypted access tokens
                    </p>
                    <p>
                        • Tokens are automatically refreshed and securely stored
                    </p>
                    <p>
                        • You can revoke access at any time from this page or from{" "}
                        <a
                            href="https://myaccount.google.com/permissions"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                            Google Account Settings
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    </p>
                    <p>
                        • Only the permissions listed above are requested
                    </p>
                </CardContent>
            </Card>

            {/* HubSpot Integration Card */}
            <Card className="overflow-hidden">
                <CardHeader className="border-b bg-gradient-to-r from-orange-500/5 to-orange-500/10">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-950/50 border shadow-sm flex items-center justify-center text-2xl font-bold text-orange-600">
                                H
                            </div>
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    HubSpot
                                    {hubspotStatus?.connected && (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Connected
                                        </Badge>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    Connect HubSpot CRM for contacts, deals, and companies management
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    {hubspotLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : hubspotStatus?.connected ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    <div>
                                        <div className="font-medium">HubSpot Connected</div>
                                        {hubspotStatus.portalId && (
                                            <div className="text-sm text-muted-foreground">Portal ID: {hubspotStatus.portalId}</div>
                                        )}
                                    </div>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                                            <Unlink className="h-4 w-4 mr-2" />
                                            Disconnect
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Disconnect HubSpot</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Are you sure? The AI assistant will no longer be able to manage your HubSpot CRM data.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={handleHubspotDisconnect}
                                                disabled={hubspotDisconnecting}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            >
                                                {hubspotDisconnecting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Disconnect
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Sync contacts with your CRM, manage deals, and track your sales pipeline via AI
                            </p>
                            <Button
                                onClick={() => {
                                    fetch("/api/integrations/hubspot", { method: "POST" })
                                        .then(r => r.json())
                                        .then(data => { if (data.authUrl) window.location.href = data.authUrl; })
                                        .catch(() => toast.error("Failed to start HubSpot connection"));
                                }}
                                className="bg-orange-600 hover:bg-orange-700"
                            >
                                <Plug className="h-4 w-4 mr-2" />
                                Connect HubSpot
                                <ExternalLink className="h-3 w-3 ml-2" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Asana Integration Card */}
            <Card className="overflow-hidden">
                <CardHeader className="border-b bg-gradient-to-r from-pink-500/5 to-pink-500/10">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-pink-100 dark:bg-pink-950/50 border shadow-sm flex items-center justify-center text-2xl font-bold text-pink-600">
                                A
                            </div>
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    Asana
                                    {asanaStatus?.connected && (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Connected
                                        </Badge>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    Connect Asana for project and task management via AI
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    {asanaLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : asanaStatus?.connected ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    <div>
                                        <div className="font-medium">Asana Connected</div>
                                        {asanaStatus.workspaceId && (
                                            <div className="text-sm text-muted-foreground">Workspace: {asanaStatus.workspaceId}</div>
                                        )}
                                    </div>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                                            <Unlink className="h-4 w-4 mr-2" />
                                            Disconnect
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Disconnect Asana</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Are you sure? The AI assistant will no longer be able to manage your Asana tasks and projects.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={handleAsanaDisconnect}
                                                disabled={asanaDisconnecting}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            >
                                                {asanaDisconnecting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Disconnect
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Create tasks, manage projects, track progress, and collaborate - all through chat
                            </p>
                            <Button
                                onClick={() => {
                                    fetch("/api/integrations/asana", { method: "POST" })
                                        .then(r => r.json())
                                        .then(data => { if (data.authUrl) window.location.href = data.authUrl; })
                                        .catch(() => toast.error("Failed to start Asana connection"));
                                }}
                                className="bg-pink-600 hover:bg-pink-700"
                            >
                                <Plug className="h-4 w-4 mr-2" />
                                Connect Asana
                                <ExternalLink className="h-3 w-3 ml-2" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Twitter/X Integration Card */}
            <Card className="overflow-hidden">
                <CardHeader className="border-b bg-gradient-to-r from-gray-500/5 to-gray-500/10">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 border shadow-sm flex items-center justify-center text-xl font-bold text-gray-800 dark:text-gray-200">
                                X
                            </div>
                            <div>
                                <CardTitle>Twitter / X</CardTitle>
                                <CardDescription>
                                    Search tweets, get user profiles, and analyze content with tiered API access
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground space-y-2 py-4">
                        <p>Twitter uses tiered API access. Configure API keys in Admin Settings:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                            <li><strong>Tier 1 (Free):</strong> FXTwitter - single tweet lookup</li>
                            <li><strong>Tier 2 ($):</strong> Twitterapi.io - search + profiles</li>
                            <li><strong>Tier 3 ($$):</strong> X API v2 - full access</li>
                            <li><strong>Tier 4 ($$$):</strong> xAI/Grok - deep analysis</li>
                            <li>Per-tier toggles: <code className="bg-muted px-1 rounded">tier1Enabled..tier4Enabled</code></li>
                        </ul>
                        <p className="text-xs pt-2">
                            Configure in Admin Settings → Configuration → integrations.twitter
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Google Drive Enhancement Card */}
            <Card className="overflow-hidden">
                <CardHeader className="border-b bg-gradient-to-r from-yellow-500/5 to-green-500/5">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-900 border shadow-sm flex items-center justify-center">
                                <GoogleLogo className="w-7 h-7" />
                            </div>
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    Google Drive
                                    {status?.connected && (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Available
                                        </Badge>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    Upload, search, and manage Drive files via AI. Requires Google connection above.
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground py-4">
                        <p>
                            {status?.connected
                                ? "Google Drive is available through your Google connection. Ask the AI to search, upload, or share files."
                                : "Connect your Google account above to enable Drive file management."}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* HTTP Request Tool Card */}
            <Card className="overflow-hidden">
                <CardHeader className="border-b bg-gradient-to-r from-cyan-500/5 to-cyan-500/10">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-cyan-100 dark:bg-cyan-950/50 border shadow-sm flex items-center justify-center">
                                <ExternalLink className="w-6 h-6 text-cyan-600" />
                            </div>
                            <div>
                                <CardTitle>HTTP Requests</CardTitle>
                                <CardDescription>
                                    Allow the AI to make HTTP requests to external APIs and services
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground space-y-3 py-4">
                        <p>
                            The HTTP Request tool allows the AI to fetch data from external APIs. Configure allowed domains in Admin Settings.
                        </p>
                        <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
                            <h4 className="font-medium text-sm text-foreground">Configuration</h4>
                            <ul className="text-xs space-y-1 list-disc list-inside">
                                <li>Enable/disable: <code className="bg-muted px-1 rounded">integrations.httpRequest.enabled</code></li>
                                <li>Domain allowlist: <code className="bg-muted px-1 rounded">integrations.httpRequest.allowedDomains</code></li>
                                <li>Use <code className="bg-muted px-1 rounded">*</code> explicitly to allow all domains</li>
                            </ul>
                        </div>
                        <p className="text-xs">
                            Configure in Admin Settings → Configuration → integrations.httpRequest
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
