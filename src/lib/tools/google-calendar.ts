/**
 * Google Calendar Tool
 *
 * Provides calendar capabilities to AI agents via Google Calendar API.
 * Supports: list_calendars, list_events, get_event, create_event,
 *           update_event, delete_event, find_free_time, get_today, get_upcoming
 */

import { z } from "zod";
import type { Tool, ToolId, ToolResult } from "./types";
import {
    listCalendars,
    listEvents,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    getFreeBusy,
    getTodayEvents,
    getUpcomingEvents,
} from "@/lib/integrations/google/calendar";
import { hasValidCredentials } from "@/lib/integrations/google/oauth";

// ============================================================================
// Tool Schema
// ============================================================================

const googleCalendarToolSchema = z.object({
    action: z.enum([
        "list_calendars",
        "list_events",
        "get_event",
        "create_event",
        "update_event",
        "delete_event",
        "find_free_time",
        "get_today",
        "get_upcoming",
    ]),

    // Calendar selection
    calendarId: z.string().optional(),

    // Event identification
    eventId: z.string().optional(),

    // Search / query
    query: z.string().optional(),

    // Time range
    timeMin: z.string().optional(), // ISO 8601
    timeMax: z.string().optional(), // ISO 8601

    // Create / update fields
    summary: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    startTime: z.string().optional(), // ISO 8601
    endTime: z.string().optional(),   // ISO 8601
    timeZone: z.string().optional(),
    attendees: z.array(z.string()).optional(),

    // Pagination / limits
    maxResults: z.number().min(1).max(250).optional(),

    // Upcoming window
    hours: z.number().min(1).max(168).optional(),
});

type GoogleCalendarToolInput = z.infer<typeof googleCalendarToolSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const googleCalendarTool: Tool = {
    id: "google_calendar" as ToolId,
    name: "Google Calendar",
    description: `Manage Google Calendar events and schedules.

Actions:
- list_calendars: List all calendars accessible by the user
- list_events: List events from a calendar with optional time range and query
- get_event: Get details of a specific event by eventId
- create_event: Create a new calendar event with summary, start/end times, etc.
- update_event: Update an existing event's details
- delete_event: Delete an event by eventId
- find_free_time: Find free/busy information for a time range
- get_today: Get all events for today
- get_upcoming: Get upcoming events within a given number of hours (default 24)

Requires Google account to be connected in settings.`,
    category: "integration",
    icon: "Calendar",
    schema: googleCalendarToolSchema,
    execute: async (params, context) => {
        if (!context?.userId) {
            return { success: false, error: "User context required for calendar actions" };
        }
        return executeCalendarTool(params as GoogleCalendarToolInput, { userId: context.userId });
    },
};

// ============================================================================
// Tool Execution
// ============================================================================

async function executeCalendarTool(
    input: GoogleCalendarToolInput,
    context: { userId: string }
): Promise<ToolResult> {
    const { action } = input;
    const { userId } = context;

    // Verify Google credentials before performing any action
    const connected = await hasValidCredentials(userId);
    if (!connected) {
        return {
            success: false,
            error: "Google Calendar not connected. Please connect your Google account in Settings > Integrations.",
        };
    }

    try {
        switch (action) {
            case "list_calendars":
                return await handleListCalendars(userId);

            case "list_events":
                return await handleListEvents(userId, input);

            case "get_event":
                return await handleGetEvent(userId, input);

            case "create_event":
                return await handleCreateEvent(userId, input);

            case "update_event":
                return await handleUpdateEvent(userId, input);

            case "delete_event":
                return await handleDeleteEvent(userId, input);

            case "find_free_time":
                return await handleFindFreeTime(userId, input);

            case "get_today":
                return await handleGetToday(userId, input);

            case "get_upcoming":
                return await handleGetUpcoming(userId, input);

            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`,
                };
        }
    } catch (error) {
        console.error("[Google Calendar Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Calendar operation failed",
        };
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleListCalendars(userId: string): Promise<ToolResult> {
    const calendars = await listCalendars(userId);

    if (!calendars) {
        return { success: false, error: "Failed to list calendars" };
    }

    return {
        success: true,
        data: {
            count: calendars.length,
            calendars,
        },
    };
}

async function handleListEvents(
    userId: string,
    input: GoogleCalendarToolInput
): Promise<ToolResult> {
    const calendarId = input.calendarId || "primary";

    const events = await listEvents(userId, {
        calendarId,
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        query: input.query,
        maxResults: input.maxResults || 25,
    });

    if (!events) {
        return { success: false, error: "Failed to list events" };
    }

    return {
        success: true,
        data: {
            calendarId,
            count: events.length,
            events,
        },
    };
}

async function handleGetEvent(
    userId: string,
    input: GoogleCalendarToolInput
): Promise<ToolResult> {
    if (!input.eventId) {
        return { success: false, error: "eventId is required for get_event action" };
    }

    const calendarId = input.calendarId || "primary";
    const event = await getEvent(userId, input.eventId, calendarId);

    if (!event) {
        return { success: false, error: "Failed to get event or event not found" };
    }

    return {
        success: true,
        data: event,
    };
}

async function handleCreateEvent(
    userId: string,
    input: GoogleCalendarToolInput
): Promise<ToolResult> {
    if (!input.summary || !input.startTime || !input.endTime) {
        return {
            success: false,
            error: "summary, startTime, and endTime are required for create_event action",
        };
    }

    const calendarId = input.calendarId || "primary";

    const event = await createEvent(userId, {
        summary: input.summary,
        description: input.description,
        location: input.location,
        startTime: input.startTime,
        endTime: input.endTime,
        timeZone: input.timeZone,
        attendees: input.attendees,
    }, calendarId);

    if (!event) {
        return { success: false, error: "Failed to create event" };
    }

    return {
        success: true,
        data: {
            ...event,
            message: "Event created successfully",
        },
    };
}

async function handleUpdateEvent(
    userId: string,
    input: GoogleCalendarToolInput
): Promise<ToolResult> {
    if (!input.eventId) {
        return { success: false, error: "eventId is required for update_event action" };
    }

    const calendarId = input.calendarId || "primary";

    const updates: Partial<import("@/lib/integrations/google/calendar").CalendarEventCreateInput> = {};
    if (input.summary !== undefined) updates.summary = input.summary;
    if (input.description !== undefined) updates.description = input.description;
    if (input.location !== undefined) updates.location = input.location;
    if (input.startTime !== undefined) updates.startTime = input.startTime;
    if (input.endTime !== undefined) updates.endTime = input.endTime;
    if (input.timeZone !== undefined) updates.timeZone = input.timeZone;
    if (input.attendees !== undefined) updates.attendees = input.attendees;

    const event = await updateEvent(userId, input.eventId, updates, calendarId);

    if (!event) {
        return { success: false, error: "Failed to update event" };
    }

    return {
        success: true,
        data: {
            ...event,
            message: "Event updated successfully",
        },
    };
}

async function handleDeleteEvent(
    userId: string,
    input: GoogleCalendarToolInput
): Promise<ToolResult> {
    if (!input.eventId) {
        return { success: false, error: "eventId is required for delete_event action" };
    }

    const calendarId = input.calendarId || "primary";
    const success = await deleteEvent(userId, input.eventId, calendarId);

    return {
        success,
        data: success ? { message: "Event deleted successfully" } : undefined,
        error: success ? undefined : "Failed to delete event",
    };
}

async function handleFindFreeTime(
    userId: string,
    input: GoogleCalendarToolInput
): Promise<ToolResult> {
    if (!input.timeMin || !input.timeMax) {
        return {
            success: false,
            error: "timeMin and timeMax are required for find_free_time action",
        };
    }

    const calendarId = input.calendarId || "primary";
    const freeBusy = await getFreeBusy(userId, {
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        calendarIds: [calendarId],
    });

    if (!freeBusy) {
        return { success: false, error: "Failed to retrieve free/busy information" };
    }

    return {
        success: true,
        data: freeBusy,
    };
}

async function handleGetToday(
    userId: string,
    input: GoogleCalendarToolInput
): Promise<ToolResult> {
    const calendarId = input.calendarId || "primary";
    const events = await getTodayEvents(userId, calendarId);

    if (!events) {
        return { success: false, error: "Failed to get today's events" };
    }

    return {
        success: true,
        data: {
            calendarId,
            date: new Date().toISOString().split("T")[0],
            count: events.length,
            events,
        },
    };
}

async function handleGetUpcoming(
    userId: string,
    input: GoogleCalendarToolInput
): Promise<ToolResult> {
    const calendarId = input.calendarId || "primary";
    const hours = input.hours || 24;
    const events = await getUpcomingEvents(userId, hours, 10, calendarId);

    if (!events) {
        return { success: false, error: "Failed to get upcoming events" };
    }

    return {
        success: true,
        data: {
            calendarId,
            hours,
            count: events.length,
            events,
        },
    };
}

export default googleCalendarTool;
