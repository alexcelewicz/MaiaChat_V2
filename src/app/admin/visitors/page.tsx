export const dynamic = 'force-dynamic';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { pageVisits, users } from "@/lib/db/schema";
import { getAdminSettings } from "@/lib/admin/settings";
import { desc, eq, gte, sql } from "drizzle-orm";

async function getVisitorData() {
    const settings = await getAdminSettings();
    const retentionDays = Math.max(30, settings.visitorRetentionDays || 30);
    const since = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const [summary] = await db
        .select({
            totalVisits: sql<number>`count(*)`,
            uniqueIps: sql<number>`count(distinct ip_address)`,
            uniqueUsers: sql<number>`count(distinct user_id)`
        })
        .from(pageVisits)
        .where(gte(pageVisits.createdAt, since));

    const recentVisits = await db
        .select({
            id: pageVisits.id,
            path: pageVisits.path,
            ipAddress: pageVisits.ipAddress,
            country: pageVisits.country,
            region: pageVisits.region,
            city: pageVisits.city,
            userAgent: pageVisits.userAgent,
            referer: pageVisits.referer,
            isBot: pageVisits.isBot,
            createdAt: pageVisits.createdAt,
            userEmail: users.email,
        })
        .from(pageVisits)
        .leftJoin(users, eq(pageVisits.userId, users.id))
        .orderBy(desc(pageVisits.createdAt))
        .limit(200);

    const topPaths = await db
        .select({
            path: pageVisits.path,
            count: sql<number>`count(*)`,
        })
        .from(pageVisits)
        .where(gte(pageVisits.createdAt, since))
        .groupBy(pageVisits.path)
        .orderBy(desc(sql`count(*)`))
        .limit(5);

    const topCountries = await db
        .select({
            country: pageVisits.country,
            count: sql<number>`count(*)`,
        })
        .from(pageVisits)
        .where(gte(pageVisits.createdAt, since))
        .groupBy(pageVisits.country)
        .orderBy(desc(sql`count(*)`))
        .limit(5);

    return {
        retentionDays,
        summary: {
            totalVisits: Number(summary?.totalVisits || 0),
            uniqueIps: Number(summary?.uniqueIps || 0),
            uniqueUsers: Number(summary?.uniqueUsers || 0),
        },
        recentVisits,
        topPaths,
        topCountries,
    };
}

export default async function AdminVisitorsPage() {
    const data = await getVisitorData();

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Visitors</h1>
                <p className="text-muted-foreground mt-1">
                    Page visits and traffic sources (last {data.retentionDays} days)
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.summary.totalVisits.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Unique IPs</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.summary.uniqueIps.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Logged-in Users</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.summary.uniqueUsers.toLocaleString()}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Top Pages</CardTitle>
                        <CardDescription>Most visited routes</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {data.topPaths.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No visit data yet.</p>
                        ) : (
                            data.topPaths.map((item) => (
                                <div key={item.path} className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{item.path}</span>
                                    <Badge variant="secondary">{Number(item.count).toLocaleString()}</Badge>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Top Countries</CardTitle>
                        <CardDescription>Geo distribution</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {data.topCountries.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No geo data yet.</p>
                        ) : (
                            data.topCountries.map((item) => (
                                <div key={item.country || "unknown"} className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{item.country || "Unknown"}</span>
                                    <Badge variant="secondary">{Number(item.count).toLocaleString()}</Badge>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Visits</CardTitle>
                    <CardDescription>Latest 200 requests</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Path</TableHead>
                                <TableHead>IP</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Agent</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.recentVisits.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                                        No visit data yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                data.recentVisits.map((visit) => (
                                    <TableRow key={visit.id}>
                                        <TableCell className="whitespace-nowrap">
                                            {new Date(visit.createdAt).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="max-w-[220px] truncate">
                                            {visit.path}
                                            {visit.isBot ? (
                                                <Badge variant="outline" className="ml-2">Bot</Badge>
                                            ) : null}
                                        </TableCell>
                                        <TableCell className="font-mono">{visit.ipAddress || "—"}</TableCell>
                                        <TableCell>
                                            {[visit.city, visit.region, visit.country].filter(Boolean).join(", ") || "—"}
                                        </TableCell>
                                        <TableCell>{visit.userEmail || "Anonymous"}</TableCell>
                                        <TableCell className="max-w-[240px] truncate">
                                            {visit.userAgent || "—"}
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
