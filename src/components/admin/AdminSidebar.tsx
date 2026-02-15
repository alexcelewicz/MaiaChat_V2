"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    LayoutDashboard,
    Users,
    Activity,
    BarChart3,
    Server,
    Flag,
    Settings,
    ArrowLeft,
    Shield,
    Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    {
        title: "Dashboard",
        href: "/admin",
        icon: LayoutDashboard,
    },
    {
        title: "Users",
        href: "/admin/users",
        icon: Users,
    },
    {
        title: "Activity Logs",
        href: "/admin/logs",
        icon: Activity,
    },
    {
        title: "Analytics",
        href: "/admin/analytics",
        icon: BarChart3,
    },
    {
        title: "Visitors",
        href: "/admin/visitors",
        icon: Globe,
    },
    {
        title: "System Health",
        href: "/admin/system",
        icon: Server,
    },
    {
        title: "Tool Logs",
        href: "/admin/tool-logs",
        icon: Shield,
    },
    {
        title: "Feature Flags",
        href: "/admin/features",
        icon: Flag,
    },
    {
        title: "Settings",
        href: "/admin/settings",
        icon: Settings,
    },
];

export function AdminSidebar() {
    const pathname = usePathname();

    return (
        <div className="w-64 border-r bg-card flex flex-col">
            {/* Header */}
            <div className="p-4 border-b">
                <div className="flex items-center gap-2">
                    <Shield className="h-6 w-6 text-primary" />
                    <span className="font-bold text-lg">Admin Panel</span>
                </div>
            </div>

            {/* Navigation */}
            <ScrollArea className="flex-1">
                <nav className="p-2 space-y-1">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href || 
                            (item.href !== "/admin" && pathname?.startsWith(item.href));
                        
                        return (
                            <Link key={item.href} href={item.href}>
                                <Button
                                    variant={isActive ? "secondary" : "ghost"}
                                    className={cn(
                                        "w-full justify-start",
                                        isActive && "bg-secondary"
                                    )}
                                >
                                    <item.icon className="mr-2 h-4 w-4" />
                                    {item.title}
                                </Button>
                            </Link>
                        );
                    })}
                </nav>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t">
                <Link href="/chat">
                    <Button variant="outline" className="w-full">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to App
                    </Button>
                </Link>
            </div>
        </div>
    );
}
