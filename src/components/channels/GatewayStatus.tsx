"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Radio,
    CheckCircle2,
    AlertCircle,
    Loader2,
    RefreshCw,
    Zap,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

type ConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

interface GatewayState {
    status: ConnectionStatus;
    latency?: number;
    lastConnected?: Date;
    activeChannels: number;
    messageQueueSize: number;
}

// ============================================================================
// Main Component
// ============================================================================

export function GatewayStatus() {
    const [state, setState] = useState<GatewayState>({
        status: "disconnected",
        activeChannels: 0,
        messageQueueSize: 0,
    });
    const [isOpen, setIsOpen] = useState(false);

    // Simulated gateway status check
    const checkStatus = useCallback(async () => {
        try {
            setState((prev) => ({ ...prev, status: "connecting" }));

            // In production, this would check the actual gateway WebSocket status
            const response = await fetch("/api/gateway/status");

            if (response.ok) {
                const data = await response.json();
                setState({
                    status: data.status === "connected" ? "connected" : "disconnected",
                    latency: data.latency || undefined,
                    lastConnected: new Date(),
                    activeChannels: data.activeChannels || 0,
                    messageQueueSize: data.messageQueueSize || 0,
                });
            } else {
                throw new Error("Gateway unavailable");
            }
        } catch {
            setState({
                status: "disconnected",
                activeChannels: 0,
                messageQueueSize: 0,
            });
        }
    }, []);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, [checkStatus]);

    const getStatusColor = () => {
        switch (state.status) {
            case "connected":
                return "bg-green-500";
            case "connecting":
                return "bg-yellow-500";
            case "disconnected":
                return "bg-gray-400";
            case "error":
                return "bg-red-500";
            default:
                return "bg-gray-400";
        }
    };

    const getStatusIcon = () => {
        switch (state.status) {
            case "connected":
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case "connecting":
                return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
            case "error":
                return <AlertCircle className="h-4 w-4 text-red-500" />;
            default:
                return <Radio className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const formatLatency = (ms?: number) => {
        if (!ms) return "—";
        if (ms < 100) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-8 w-8"
                    title="Gateway Status"
                >
                    <Radio className="h-4 w-4" />
                    {/* Status dot */}
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={cn(
                            "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
                            getStatusColor()
                        )}
                    />
                    {state.status === "connected" && (
                        <motion.span
                            animate={{ scale: [1, 1.5, 1] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className={cn(
                                "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full",
                                getStatusColor(),
                                "opacity-50"
                            )}
                        />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
                <div className="p-4 border-b">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {getStatusIcon()}
                            <span className="font-medium capitalize">
                                {state.status === "connected"
                                    ? "Gateway Online"
                                    : state.status}
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={checkStatus}
                            disabled={state.status === "connecting"}
                        >
                            <RefreshCw
                                className={cn(
                                    "h-4 w-4",
                                    state.status === "connecting" && "animate-spin"
                                )}
                            />
                        </Button>
                    </div>
                </div>

                <div className="p-4 space-y-3">
                    <AnimatePresence mode="wait">
                        {state.status === "connected" ? (
                            <motion.div
                                key="connected"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-3"
                            >
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Latency</span>
                                    <span className="font-mono text-green-600 dark:text-green-400">
                                        {formatLatency(state.latency)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Active Channels</span>
                                    <span className="font-medium">{state.activeChannels}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Message Queue</span>
                                    <span
                                        className={cn(
                                            "font-medium",
                                            state.messageQueueSize > 0 && "text-yellow-600"
                                        )}
                                    >
                                        {state.messageQueueSize}
                                    </span>
                                </div>
                            </motion.div>
                        ) : state.status === "connecting" ? (
                            <motion.div
                                key="connecting"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex items-center justify-center py-4"
                            >
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="disconnected"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-4"
                            >
                                <p className="text-sm text-muted-foreground mb-3">
                                    Gateway is not connected
                                </p>
                                <Button size="sm" onClick={checkStatus}>
                                    <Zap className="h-4 w-4 mr-2" />
                                    Reconnect
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {state.lastConnected && state.status === "connected" && (
                    <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
                        Connected since{" "}
                        {state.lastConnected.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
