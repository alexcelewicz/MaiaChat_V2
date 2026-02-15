/**
 * Configuration Validation API Route
 *
 * POST - Validate configuration without applying
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { validateConfig } from "@/lib/config/schema";

/**
 * POST /api/admin/config/validate
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
                error: "Configuration validation failed",
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
        console.error("[Config Validate API] Error:", error);
        return NextResponse.json(
            {
                valid: false,
                error: error instanceof Error ? error.message : "Validation failed",
            },
            { status: 500 }
        );
    }
}
