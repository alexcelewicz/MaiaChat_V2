export const dynamic = 'force-dynamic';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { activityLogs, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

async function getActivityLogs() {
    return db
        .select({
            id: activityLogs.id,
            action: activityLogs.action,
            resource: activityLogs.resource,
            resourceId: activityLogs.resourceId,
            ipAddress: activityLogs.ipAddress,
            userAgent: activityLogs.userAgent,
            createdAt: activityLogs.createdAt,
            userEmail: users.email,
        })
        .from(activityLogs)
        .leftJoin(users, eq(activityLogs.userId, users.id))
        .orderBy(desc(activityLogs.createdAt))
        .limit(200);
}

function formatAction(action: string) {
    const parts = action.split(".");
    if (parts.length === 1) return action;
    return `${parts[0]}:${parts.slice(1).join(".")}`;
}

export default async function AdminLogsPage() {
    const logs = await getActivityLogs();

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Activity Logs</h1>
                <p className="text-muted-foreground mt-1">
                    Recent admin and user actions (latest 200)
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>System-wide actions and events</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Resource</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>IP</TableHead>
                                <TableHead>Agent</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                                        No activity logged yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="whitespace-nowrap">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                            <Badge variant="secondary">{formatAction(log.action)}</Badge>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {log.resource || "—"}
                                            {log.resourceId ? (
                                                <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                                    {log.resourceId}
                                                </div>
                                            ) : null}
                                        </TableCell>
                                        <TableCell>{log.userEmail || "System"}</TableCell>
                                        <TableCell className="font-mono text-xs">{log.ipAddress || "—"}</TableCell>
                                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                                            {log.userAgent || "—"}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
