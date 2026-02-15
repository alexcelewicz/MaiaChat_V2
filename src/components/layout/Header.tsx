"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sun, Moon, Laptop, LogOut, User, Settings, Menu, LogIn, UserPlus } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useUser, logout } from "@/lib/hooks/useUser";
import { Skeleton } from "@/components/ui/skeleton";
import { GatewayStatus } from "@/components/channels/GatewayStatus";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import Link from "next/link";

export function Header() {
    const { setTheme } = useTheme();
    const { user, isLoading, isAuthenticated } = useUser();

    const handleLogout = async () => {
        await logout();
    };

    // Get user initials for avatar fallback
    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <header className="sticky top-0 z-30 flex h-12 md:h-16 w-full items-center border-b bg-background px-3 md:px-4">
            {/* Mobile Nav Trigger */}
            <div className="md:hidden mr-2">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 min-w-[40px] min-h-[40px]">
                            <Menu className="h-5 w-5" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-[85vw] max-w-[320px]">
                        <Sidebar className="border-none w-full" />
                    </SheetContent>
                </Sheet>
            </div>

            <div className="flex-1 flex items-center justify-between">
                <div className="hidden md:flex font-semibold text-lg">
                    {/* Breadcrumbs or Page Title could go here */}
                </div>

                <div className="ml-auto flex items-center space-x-1 sm:space-x-2">
                    {/* Gateway Status & Notifications - Only show for authenticated users */}
                    {isAuthenticated && (
                        <>
                            <div className="hidden sm:block">
                                <GatewayStatus />
                            </div>
                            <NotificationCenter />
                        </>
                    )}

                    {/* Theme Toggle */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 min-w-[40px] min-h-[40px]">
                                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                                <span className="sr-only">Toggle theme</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setTheme("light")} className="min-h-[44px]">
                                <Sun className="mr-2 h-4 w-4" /> Light
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTheme("dark")} className="min-h-[44px]">
                                <Moon className="mr-2 h-4 w-4" /> Dark
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTheme("system")} className="min-h-[44px]">
                                <Laptop className="mr-2 h-4 w-4" /> System
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* User Menu - Different for authenticated vs guest users */}
                    {isLoading ? (
                        <Skeleton className="h-9 w-9 rounded-full" />
                    ) : isAuthenticated && user ? (
                        // Authenticated User Menu
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-10 w-10 min-w-[40px] min-h-[40px] rounded-full p-0">
                                    <Avatar className="h-9 w-9">
                                        <AvatarImage src="/avatars/01.png" alt={user.name} />
                                        <AvatarFallback>
                                            {getInitials(user.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="end" forceMount>
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium leading-none">
                                            {user.name}
                                        </p>
                                        <p className="text-xs leading-none text-muted-foreground">
                                            {user.email}
                                        </p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild className="min-h-[44px]">
                                    <Link href="/settings">
                                        <User className="mr-2 h-4 w-4" />
                                        Profile
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="min-h-[44px]">
                                    <Link href="/settings">
                                        <Settings className="mr-2 h-4 w-4" />
                                        Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600 cursor-pointer min-h-[44px]"
                                    onClick={handleLogout}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        // Guest User - Show Sign In / Sign Up buttons
                        <div className="flex items-center gap-1 sm:gap-2">
                            <Button variant="ghost" size="sm" asChild className="h-9 min-h-[36px] px-2 sm:px-3">
                                <Link href="/login">
                                    <LogIn className="h-4 w-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Sign In</span>
                                </Link>
                            </Button>
                            <Button size="sm" asChild className="h-9 min-h-[36px] px-2 sm:px-3">
                                <Link href="/register">
                                    <UserPlus className="h-4 w-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Sign Up</span>
                                </Link>
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
