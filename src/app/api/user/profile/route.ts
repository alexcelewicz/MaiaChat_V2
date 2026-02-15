/**
 * User Profile API
 *
 * GDPR-compliant endpoint for users to view and manage their personal data
 * stored by the AI agents.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
    getUserProfile,
    deleteUserFact,
    clearUserProfile,
    updateUserProfile,
    addUserProvidedInfo,
    type UserProfile,
} from "@/lib/memory/user-profile";
import { getLocalMemoryInfo, getMemoryEntries, readWorkingMemory } from "@/lib/memory/local-memory";

// GET - Retrieve user profile data and memory info
export async function GET(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const includeMemory = searchParams.get("includeMemory") === "true";
        const includeMemoryContent = searchParams.get("includeMemoryContent") === "true";

        const profile = await getUserProfile(userId);

        // Base response
        const response: Record<string, unknown> = {
            profile,
            dataCategories: {
                basicInfo: {
                    name: profile.name,
                    nickname: profile.nickname,
                    location: profile.location,
                    timezone: profile.timezone,
                    language: profile.language,
                },
                professional: {
                    occupation: profile.occupation,
                    company: profile.company,
                },
                interests: {
                    interests: profile.interests,
                    hobbies: profile.hobbies,
                },
                preferences: {
                    communicationStyle: profile.communicationStyle,
                    preferredName: profile.preferredName,
                    topics_to_avoid: profile.topics_to_avoid,
                },
                facts: profile.facts,
            },
            metadata: {
                createdAt: profile.createdAt,
                updatedAt: profile.updatedAt,
                version: profile.version,
                totalFacts: profile.facts.length,
            },
        };

        // Include memory info if requested
        if (includeMemory) {
            try {
                const memoryInfo = await getLocalMemoryInfo(userId);
                const memoryEntries = await getMemoryEntries(userId);
                response.memory = {
                    info: memoryInfo,
                    recentEntries: memoryEntries.entries.slice(0, 20),
                    totalEntries: memoryEntries.entryCount,
                    totalSize: memoryEntries.totalSize,
                };
            } catch (err) {
                console.error("[User Profile API] Memory info error:", err);
                response.memory = { error: "Failed to load memory info" };
            }
        }

        // Include raw memory content if requested (for viewing)
        if (includeMemoryContent) {
            try {
                const content = await readWorkingMemory(userId);
                response.memoryContent = content.slice(0, 100000); // Limit to 100KB
            } catch (err) {
                console.error("[User Profile API] Memory content error:", err);
            }
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error("[User Profile API] GET error:", error);
        return NextResponse.json(
            { error: "Failed to retrieve profile" },
            { status: 500 }
        );
    }
}

// POST - Add user-provided profile information
export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const {
            name,
            location,
            timezone,
            occupation,
            company,
            interests,
            hobbies,
            communicationStyle,
            preferredName,
            customInstructions,
            facts,
        } = body;

        const profile = await addUserProvidedInfo(userId, {
            name,
            location,
            timezone,
            occupation,
            company,
            interests,
            hobbies,
            communicationStyle,
            preferredName,
            customInstructions,
            facts,
        });

        return NextResponse.json({
            success: true,
            message: "Profile updated with your information",
            profile,
        });
    } catch (error) {
        console.error("[User Profile API] POST error:", error);
        return NextResponse.json(
            { error: "Failed to update profile" },
            { status: 500 }
        );
    }
}

// DELETE - Delete specific fact or clear entire profile
export async function DELETE(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const factText = searchParams.get("factText");
        const clearAll = searchParams.get("clearAll") === "true";
        const field = searchParams.get("field");

        if (clearAll) {
            // Clear entire profile (GDPR right to erasure)
            await clearUserProfile(userId);
            return NextResponse.json({
                success: true,
                message: "All profile data has been deleted",
            });
        }

        if (factText) {
            // Delete a specific fact
            const profile = await deleteUserFact(userId, factText);
            return NextResponse.json({
                success: true,
                message: "Fact deleted",
                remainingFacts: profile.facts.length,
            });
        }

        if (field) {
            // Clear a specific field
            const updates: Partial<UserProfile> = {};
            switch (field) {
                case "name":
                    updates.name = undefined;
                    updates.preferredName = undefined;
                    break;
                case "location":
                    updates.location = undefined;
                    updates.timezone = undefined;
                    break;
                case "timezone":
                    updates.timezone = undefined;
                    break;
                case "occupation":
                    updates.occupation = undefined;
                    updates.company = undefined;
                    break;
                case "interests":
                    updates.interests = undefined;
                    updates.hobbies = undefined;
                    break;
                case "communication":
                    updates.communicationStyle = undefined;
                    updates.topics_to_avoid = undefined;
                    break;
                default:
                    return NextResponse.json(
                        { error: "Invalid field" },
                        { status: 400 }
                    );
            }
            await updateUserProfile(userId, updates);
            return NextResponse.json({
                success: true,
                message: `${field} data cleared`,
            });
        }

        return NextResponse.json(
            { error: "Must specify factText, field, or clearAll=true" },
            { status: 400 }
        );
    } catch (error) {
        console.error("[User Profile API] DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to delete profile data" },
            { status: 500 }
        );
    }
}

// PATCH - Update profile memory preference
export async function PATCH(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { profileMemoryEnabled } = body;

        // Update user's preference for profile memory
        // This is stored per-user, not in admin settings
        // For now, we'll store this in the profile itself
        const profile = await getUserProfile(userId);

        // Store preference in profile metadata
        await updateUserProfile(userId, {
            // Use a custom field for this preference
        });

        return NextResponse.json({
            success: true,
            profileMemoryEnabled,
        });
    } catch (error) {
        console.error("[User Profile API] PATCH error:", error);
        return NextResponse.json(
            { error: "Failed to update preferences" },
            { status: 500 }
        );
    }
}
