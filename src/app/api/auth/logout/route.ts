import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function POST() {
    try {
        await auth.api.signOut({
            headers: await headers(),
        });

        return NextResponse.json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (error) {
        console.error("Logout error:", error);

        // Still return success - user should be treated as logged out
        return NextResponse.json({
            success: true,
            message: "Logged out",
        });
    }
}

// Also support GET for simple logout links
export async function GET() {
    try {
        await auth.api.signOut({
            headers: await headers(),
        });

        return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
    } catch (error) {
        console.error("Logout error:", error);

        return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
    }
}
