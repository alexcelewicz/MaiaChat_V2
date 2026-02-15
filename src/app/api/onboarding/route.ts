import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { userOnboarding } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [record] = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId)).limit(1);

        if (!record) {
            return NextResponse.json({
                completedSteps: [],
                currentStep: "welcome",
                isComplete: false,
                skippedAt: null,
            });
        }

        return NextResponse.json({
            completedSteps: record.completedSteps || [],
            currentStep: record.currentStep,
            isComplete: record.isComplete,
            skippedAt: record.skippedAt,
        });
    } catch (error) {
        console.error("[Onboarding] GET error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const schema = z.object({
            completedSteps: z.array(z.string()).optional(),
            currentStep: z.string().max(50).optional(),
            isComplete: z.boolean().optional(),
            skipped: z.boolean().optional(),
        });

        const validation = schema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: "Invalid input" }, { status: 400 });
        }

        const { completedSteps, currentStep, isComplete, skipped } = validation.data;

        const [existing] = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId)).limit(1);

        const data = {
            completedSteps: completedSteps || [],
            currentStep: currentStep || "welcome",
            isComplete: isComplete || false,
            skippedAt: skipped ? new Date() : null,
            completedAt: isComplete ? new Date() : null,
            updatedAt: new Date(),
        };

        if (existing) {
            await db.update(userOnboarding).set(data).where(eq(userOnboarding.userId, userId));
        } else {
            await db.insert(userOnboarding).values({ userId, ...data });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Onboarding] POST error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
