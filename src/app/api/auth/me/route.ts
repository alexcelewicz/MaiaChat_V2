import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json(
                { error: "Not authenticated", code: "NOT_AUTHENTICATED" },
                { status: 401 }
            );
        }

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: (user.preferences as Record<string, unknown>)?.name || "User",
            },
        });
    } catch (error) {
        console.error("Get user error:", error);

        return NextResponse.json(
            { error: "Failed to get user", code: "GET_USER_FAILED" },
            { status: 500 }
        );
    }
}
