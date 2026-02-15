/**
 * Background Agent Heartbeat API
 *
 * GET - Health check endpoint for monitoring
 */

import { NextRequest, NextResponse } from "next/server";
import { backgroundDaemon, getHeartbeatStatus, getDaemonInfo } from "@/lib/background";

// ============================================================================
// GET - Health check
// ============================================================================

export async function GET(request: NextRequest) {
    try {
        const daemonInfo = await getDaemonInfo();
        const heartbeatStatus = await getHeartbeatStatus("main");

        const isHealthy =
            daemonInfo.status === "running" &&
            heartbeatStatus.isHealthy &&
            !heartbeatStatus.isStale;

        return NextResponse.json(
            {
                status: isHealthy ? "healthy" : "unhealthy",
                daemon: {
                    status: daemonInfo.status,
                    uptime: daemonInfo.uptime,
                    lastHeartbeat: daemonInfo.lastHeartbeat,
                },
                heartbeat: {
                    isHealthy: heartbeatStatus.isHealthy,
                    isStale: heartbeatStatus.isStale,
                    lastBeat: heartbeatStatus.lastBeat,
                    missedBeats: heartbeatStatus.missedBeats,
                },
                timestamp: new Date().toISOString(),
            },
            {
                status: isHealthy ? 200 : 503,
            }
        );
    } catch (error) {
        console.error("[API] Heartbeat check error:", error);
        return NextResponse.json(
            {
                status: "error",
                error: "Failed to check heartbeat",
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
