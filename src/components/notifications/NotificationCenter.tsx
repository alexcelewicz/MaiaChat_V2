"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Notification {
    id: string;
    type: string;
    title: string;
    body?: string;
    link?: string;
    icon?: string;
    isRead: boolean;
    createdAt: string;
}

export function NotificationCenter() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch("/api/notifications", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
                setUnreadCount(data.unreadCount || 0);
            }
        } catch {}
    }, []);

    useEffect(() => {
        fetchNotifications();
        // Poll every 30 seconds
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    const markAsRead = async (id: string) => {
        const prev = notifications;
        const prevCount = unreadCount;
        setNotifications(n => n.map(x => x.id === id ? { ...x, isRead: true } : x));
        setUnreadCount(c => Math.max(0, c - 1));
        try {
            const res = await fetch("/api/notifications", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) throw new Error();
        } catch {
            // Rollback optimistic update on failure
            setNotifications(prev);
            setUnreadCount(prevCount);
        }
    };

    const markAllRead = async () => {
        const prev = notifications;
        const prevCount = unreadCount;
        setNotifications(n => n.map(x => ({ ...x, isRead: true })));
        setUnreadCount(0);
        try {
            const res = await fetch("/api/notifications", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ markAllRead: true }),
            });
            if (!res.ok) throw new Error();
        } catch {
            setNotifications(prev);
            setUnreadCount(prevCount);
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return "just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between p-3 border-b">
                    <h3 className="font-semibold text-sm">Notifications</h3>
                    {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                            <CheckCheck className="mr-1 h-3 w-3" /> Mark all read
                        </Button>
                    )}
                </div>
                <ScrollArea className="max-h-80">
                    {notifications.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            No notifications yet
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map(notif => (
                                <div
                                    key={notif.id}
                                    className={`p-3 hover:bg-accent/50 transition-colors cursor-pointer ${!notif.isRead ? "bg-accent/20" : ""}`}
                                    onClick={() => {
                                        if (!notif.isRead) markAsRead(notif.id);
                                        if (notif.link) {
                                            // Prevent XSS via javascript: protocol URLs
                                            try {
                                                const url = new URL(notif.link, window.location.origin);
                                                if (url.protocol === "http:" || url.protocol === "https:" || url.pathname.startsWith("/")) {
                                                    window.location.href = url.href;
                                                }
                                            } catch {
                                                // Invalid URL, ignore
                                            }
                                        }
                                    }}
                                >
                                    <div className="flex items-start gap-2">
                                        {!notif.isRead && (
                                            <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{notif.title}</p>
                                            {notif.body && (
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                                            )}
                                            <p className="text-xs text-muted-foreground mt-1">{formatTime(notif.createdAt)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
