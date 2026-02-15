/**
 * Configuration API Routes
 *
 * GET  - Export current configuration
 * PUT  - Import configuration
 * POST - Validate configuration without applying
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import {
    getConfig,
    exportConfig,
    importConfig,
    updateConfig,
    loadConfig,
} from "@/lib/config";
import { validateConfig } from "@/lib/config/schema";
import type { PartialMaiaChatConfig } from "@/lib/config/types";

/**
 * GET /api/admin/config
 *
 * Export current configuration
 * Query params:
 * - format: 'json' (default) or 'pretty'
 * - include_sources: 'true' to include source tracking
 */
export async function GET(request: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const searchParams = request.nextUrl.searchParams;
        const format = searchParams.get("format") || "pretty";
        const includeSources = searchParams.get("include_sources") === "true";

        if (includeSources) {
            const result = await loadConfig();
            return NextResponse.json({
                config: result.config,
                sources: result.sources,
                errors: result.errors,
            });
        }

        const configJson = await exportConfig();

        if (format === "json") {
            return new NextResponse(configJson, {
                headers: {
                    "Content-Type": "application/json",
                    "Content-Disposition": "attachment; filename=maiachat-config.json",
                },
            });
        }

        return NextResponse.json(JSON.parse(configJson));
    } catch (error) {
        console.error("[Config API] Export error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Export failed" },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/admin/config
 *
 * Import full configuration (replaces existing)
 */
export async function PUT(request: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.text();
        const result = await importConfig(body);

        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.errors },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Configuration imported successfully",
            config: result.config,
        });
    } catch (error) {
        console.error("[Config API] Import error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Import failed" },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/admin/config
 *
 * Update specific configuration sections
 */
export async function PATCH(request: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const patch = (await request.json()) as PartialMaiaChatConfig;
        const updated = await updateConfig(patch);

        return NextResponse.json({
            success: true,
            message: "Configuration updated",
            config: updated,
        });
    } catch (error) {
        console.error("[Config API] Update error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Update failed" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/config
 *
 * Validate configuration without applying
 */
export async function POST(request: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const validation = validateConfig(body);

        if (!validation.success) {
            return NextResponse.json({
                valid: false,
                errors: validation.errors?.issues.map((e) => ({
                    path: e.path.map(String).join("."),
                    message: e.message,
                })),
            });
        }

        return NextResponse.json({
            valid: true,
            config: validation.data,
        });
    } catch (error) {
        console.error("[Config API] Validation error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Validation failed" },
            { status: 500 }
        );
    }
}
