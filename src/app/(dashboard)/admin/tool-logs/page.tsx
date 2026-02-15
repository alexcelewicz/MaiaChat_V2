"use client";

import { useState, useEffect, useCallback } from "react";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Loader2 } from "lucide-react";

interface ToolLog {
    id: string;
    userId: string;
    conversationId: string | null;
    toolId: string;
    toolName: string;
    action: string | null;
    result: "success" | "error" | "denied";
    errorMessage: string | null;
    durationMs: number | null;
    createdAt: string;
}

const PAGE_SIZE = 50;

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

function truncateId(id: string): string {
    if (!id) return "—";
    if (id.length <= 12) return id;
    return `${id.slice(0, 8)}...`;
}

function resultBadgeVariant(result: string): "default" | "secondary" | "destructive" | "outline" {
    switch (result) {
        case "success":
            return "default";
        case "error":
            return "destructive";
        case "denied":
            return "outline";
        default:
            return "secondary";
    }
}

export default function ToolLogsPage() {
    const [logs, setLogs] = useState<ToolLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toolFilter, setToolFilter] = useState("");
    const [resultFilter, setResultFilter] = useState("all");
    const [offset, setOffset] = useState(0);

    const fetchLogs = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(offset),
            });
            if (toolFilter.trim()) {
                params.set("toolId", toolFilter.trim());
            }
            if (resultFilter !== "all") {
                params.set("result", resultFilter);
            }

            const response = await fetch(`/api/tool-logs?${params.toString()}`, {
                credentials: "include",
            });
            if (!response.ok) throw new Error("Failed to fetch tool logs");
            const data = await response.json();
            setLogs(data.logs || []);
        } catch (error) {
            console.error("Fetch tool logs error:", error);
            setLogs([]);
        } finally {
            setIsLoading(false);
        }
    }, [offset, toolFilter, resultFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleRefresh = () => {
        setOffset(0);
        fetchLogs();
    };

    const handleFilterChange = () => {
        setOffset(0);
    };

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Tool Execution Logs</h1>
                    <p className="text-muted-foreground mt-1">
                        View tool execution history and results
                    </p>
                </div>
                <Button variant="outline" onClick={handleRefresh}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <Input
                    placeholder="Filter by tool ID..."
                    className="max-w-xs"
                    value={toolFilter}
                    onChange={(e) => {
                        setToolFilter(e.target.value);
                        handleFilterChange();
                    }}
                />
                <Select
                    value={resultFilter}
                    onValueChange={(value) => {
                        setResultFilter(value);
                        handleFilterChange();
                    }}
                >
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Result" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Results</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                        <SelectItem value="denied">Denied</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Logs Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Logs</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Time</TableHead>
                                    <TableHead>Tool</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Result</TableHead>
                                    <TableHead>Duration</TableHead>
                                    <TableHead>User ID</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No tool execution logs found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    logs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                                {formatRelativeTime(log.createdAt)}
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">
                                                {log.toolName}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {log.action || "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={resultBadgeVariant(log.result)}>
                                                    {log.result}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {log.durationMs != null ? `${log.durationMs}ms` : "—"}
                                            </TableCell>
                                            <TableCell
                                                className="font-mono text-xs text-muted-foreground"
                                                title={log.userId}
                                            >
                                                {truncateId(log.userId)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {!isLoading && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {logs.length} log{logs.length !== 1 ? "s" : ""} (offset {offset})
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={offset === 0}
                            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={logs.length < PAGE_SIZE}
                            onClick={() => setOffset(offset + PAGE_SIZE)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
