"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Search,
    MoreVertical,
    Shield,
    ShieldOff,
    Ban,
    CheckCircle,
    Loader2,
    RefreshCw,
    UserCog,
} from "lucide-react";
import { toast } from "sonner";

interface User {
    id: string;
    email: string;
    role: string;
    localAccessEnabled?: boolean;
    createdAt: string;
    updatedAt: string;
    conversationCount?: number;
    messageCount?: number;
}

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [actionType, setActionType] = useState<"promote" | "demote" | "suspend" | null>(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/admin/users");
            if (!response.ok) throw new Error("Failed to fetch users");
            const data = await response.json();
            setUsers(data.users || []);
        } catch (error) {
            console.error("Fetch users error:", error);
            toast.error("Failed to load users");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = async () => {
        if (!selectedUser || !actionType) return;

        try {
            const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: actionType }),
            });

            if (!response.ok) throw new Error("Action failed");

            toast.success(`User ${actionType}d successfully`);
            fetchUsers();
        } catch (error) {
            console.error("Action error:", error);
            toast.error(`Failed to ${actionType} user`);
        } finally {
            setSelectedUser(null);
            setActionType(null);
        }
    };

    const handleLocalAccessAction = async (user: User, enable: boolean) => {
        try {
            const response = await fetch(`/api/admin/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: enable ? "grant_local_access" : "revoke_local_access" }),
            });

            if (!response.ok) throw new Error("Action failed");

            toast.success(enable ? "Local access granted" : "Local access revoked");
            fetchUsers();
        } catch (error) {
            console.error("Action error:", error);
            toast.error(enable ? "Failed to grant local access" : "Failed to revoke local access");
        }
    };

    const filteredUsers = users.filter(user =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage user accounts and permissions
                    </p>
                </div>
                <Button variant="outline" onClick={fetchUsers}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search users..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Users Table */}
            <Card>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Local Access</TableHead>
                                    <TableHead>Joined</TableHead>
                                    <TableHead>Conversations</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No users found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">
                                                {user.email}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={user.role === "admin" ? "default" : "secondary"}
                                                >
                                                    {user.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {user.role === "admin" ? (
                                                    <Badge variant={user.localAccessEnabled ? "default" : "outline"}>
                                                        {user.localAccessEnabled ? "Allowed" : "Blocked"}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">N/A</span>
                                                )}
                                            </TableCell>
                                            <TableCell>{formatDate(user.createdAt)}</TableCell>
                                            <TableCell>
                                                {user.conversationCount || 0}
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem>
                                                            <UserCog className="mr-2 h-4 w-4" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        {user.role !== "admin" ? (
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    setSelectedUser(user);
                                                                    setActionType("promote");
                                                                }}
                                                            >
                                                                <Shield className="mr-2 h-4 w-4" />
                                                                Promote to Admin
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    setSelectedUser(user);
                                                                    setActionType("demote");
                                                                }}
                                                            >
                                                                <ShieldOff className="mr-2 h-4 w-4" />
                                                                Remove Admin
                                                            </DropdownMenuItem>
                                                        )}
                                                        {user.role === "admin" && (
                                                            <>
                                                                <DropdownMenuSeparator />
                                                                {user.localAccessEnabled ? (
                                                                    <DropdownMenuItem
                                                                        onClick={() => handleLocalAccessAction(user, false)}
                                                                    >
                                                                        <Ban className="mr-2 h-4 w-4" />
                                                                        Revoke Local Access
                                                                    </DropdownMenuItem>
                                                                ) : (
                                                                    <DropdownMenuItem
                                                                        onClick={() => handleLocalAccessAction(user, true)}
                                                                    >
                                                                        <CheckCircle className="mr-2 h-4 w-4" />
                                                                        Grant Local Access
                                                                    </DropdownMenuItem>
                                                                )}
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Action Confirmation */}
            <AlertDialog open={!!selectedUser && !!actionType} onOpenChange={() => {
                setSelectedUser(null);
                setActionType(null);
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {actionType === "promote" && "Promote to Admin"}
                            {actionType === "demote" && "Remove Admin Role"}
                            {actionType === "suspend" && "Suspend User"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {actionType === "promote" && `Are you sure you want to make ${selectedUser?.email} an admin? They will have full access to the admin panel.`}
                            {actionType === "demote" && `Are you sure you want to remove admin privileges from ${selectedUser?.email}?`}
                            {actionType === "suspend" && `Are you sure you want to suspend ${selectedUser?.email}? They will not be able to access the application.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleAction}>
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
