/**
 * Google Calendar Integration
 *
 * Provides Calendar capabilities via Google Calendar API v3.
 * Uses the shared Google OAuth credentials from oauth.ts.
 */

import { getValidCredentials } from "./oauth";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

// ============================================================================
// Types
// ============================================================================

export interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    status: string;
    htmlLink: string;
    creator?: { email: string };
    organizer?: { email: string; displayName?: string };
    attendees?: Array<{
        email: string;
        responseStatus?: string;
        displayName?: string;
    }>;
    recurrence?: string[];
    recurringEventId?: string;
    created: string;
    updated: string;
}

export interface CalendarList {
    id: string;
    summary: string;
    description?: string;
    primary?: boolean;
    backgroundColor?: string;
    timeZone?: string;
    accessRole: string;
}

export interface CalendarEventCreateInput {
    summary: string;
    description?: string;
    location?: string;
    startTime: string; // ISO 8601
    endTime: string; // ISO 8601
    timeZone?: string;
    attendees?: string[]; // email addresses
    recurrence?: string[]; // RRULE strings
}

// ============================================================================
// Authenticated Fetch Helper
// ============================================================================

/**
 * Make an authenticated request to the Google Calendar API
 */
async function calendarFetch(
    userId: string,
    path: string,
    options?: RequestInit
): Promise<Response> {
    const credentials = await getValidCredentials(userId);
    if (!credentials) {
        throw new Error(
            "Google Calendar not connected. Please connect your Google account in Settings > Integrations."
        );
    }

    const url = path.startsWith("http")
        ? path
        : `${CALENDAR_API_BASE}${path}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
            ...options?.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Calendar API error (${response.status}): ${errorText}`
        );
    }

    return response;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * List all calendars accessible by the user
 */
export async function listCalendars(userId: string): Promise<CalendarList[]> {
    const response = await calendarFetch(userId, "/users/me/calendarList");
    const data = await response.json();
    return (data.items || []).map((cal: any) => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description,
        primary: cal.primary || false,
        backgroundColor: cal.backgroundColor,
        timeZone: cal.timeZone,
        accessRole: cal.accessRole,
    }));
}

/**
 * List events from a calendar with optional filtering
 */
export async function listEvents(
    userId: string,
    options?: {
        calendarId?: string;
        timeMin?: string;
        timeMax?: string;
        maxResults?: number;
        query?: string;
        singleEvents?: boolean;
        orderBy?: string;
    }
): Promise<CalendarEvent[]> {
    const calendarId = encodeURIComponent(
        options?.calendarId || "primary"
    );
    const params = new URLSearchParams();

    if (options?.timeMin) params.set("timeMin", options.timeMin);
    if (options?.timeMax) params.set("timeMax", options.timeMax);
    if (options?.maxResults)
        params.set("maxResults", options.maxResults.toString());
    if (options?.query) params.set("q", options.query);
    if (options?.singleEvents !== false) params.set("singleEvents", "true");
    if (options?.orderBy) params.set("orderBy", options.orderBy);
    else params.set("orderBy", "startTime");

    const queryString = params.toString();
    const path = `/calendars/${calendarId}/events${queryString ? `?${queryString}` : ""}`;

    const response = await calendarFetch(userId, path);
    const data = await response.json();
    return data.items || [];
}

/**
 * Get a single event by ID
 */
export async function getEvent(
    userId: string,
    eventId: string,
    calendarId?: string
): Promise<CalendarEvent> {
    const calId = encodeURIComponent(calendarId || "primary");
    const response = await calendarFetch(
        userId,
        `/calendars/${calId}/events/${encodeURIComponent(eventId)}`
    );
    return await response.json();
}

/**
 * Create a new event on a calendar
 */
export async function createEvent(
    userId: string,
    input: CalendarEventCreateInput,
    calendarId?: string
): Promise<CalendarEvent> {
    const calId = encodeURIComponent(calendarId || "primary");

    const body: Record<string, unknown> = {
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: {
            dateTime: input.startTime,
            timeZone: input.timeZone || "UTC",
        },
        end: {
            dateTime: input.endTime,
            timeZone: input.timeZone || "UTC",
        },
    };

    if (input.attendees?.length) {
        body.attendees = input.attendees.map((email) => ({ email }));
    }

    if (input.recurrence?.length) {
        body.recurrence = input.recurrence;
    }

    const response = await calendarFetch(
        userId,
        `/calendars/${calId}/events`,
        {
            method: "POST",
            body: JSON.stringify(body),
        }
    );

    return await response.json();
}

/**
 * Update an existing event (partial update via PATCH)
 */
export async function updateEvent(
    userId: string,
    eventId: string,
    updates: Partial<CalendarEventCreateInput>,
    calendarId?: string
): Promise<CalendarEvent> {
    const calId = encodeURIComponent(calendarId || "primary");

    const body: Record<string, unknown> = {};
    if (updates.summary) body.summary = updates.summary;
    if (updates.description !== undefined)
        body.description = updates.description;
    if (updates.location !== undefined) body.location = updates.location;
    if (updates.startTime)
        body.start = {
            dateTime: updates.startTime,
            timeZone: updates.timeZone || "UTC",
        };
    if (updates.endTime)
        body.end = {
            dateTime: updates.endTime,
            timeZone: updates.timeZone || "UTC",
        };
    if (updates.attendees)
        body.attendees = updates.attendees.map((email) => ({ email }));

    const response = await calendarFetch(
        userId,
        `/calendars/${calId}/events/${encodeURIComponent(eventId)}`,
        {
            method: "PATCH",
            body: JSON.stringify(body),
        }
    );

    return await response.json();
}

/**
 * Delete an event from a calendar
 */
export async function deleteEvent(
    userId: string,
    eventId: string,
    calendarId?: string
): Promise<boolean> {
    const calId = encodeURIComponent(calendarId || "primary");

    const credentials = await getValidCredentials(userId);
    if (!credentials) {
        throw new Error("Google Calendar not connected.");
    }

    const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${calId}/events/${encodeURIComponent(eventId)}`,
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${credentials.accessToken}`,
            },
        }
    );

    return response.ok || response.status === 204;
}

/**
 * Query free/busy information for one or more calendars
 */
export async function getFreeBusy(
    userId: string,
    options: {
        timeMin: string;
        timeMax: string;
        calendarIds?: string[];
    }
): Promise<Record<string, Array<{ start: string; end: string }>>> {
    const body = {
        timeMin: options.timeMin,
        timeMax: options.timeMax,
        items: (options.calendarIds || ["primary"]).map((id) => ({ id })),
    };

    const response = await calendarFetch(userId, "/freeBusy", {
        method: "POST",
        body: JSON.stringify(body),
    });

    const data = await response.json();
    const result: Record<string, Array<{ start: string; end: string }>> = {};

    for (const [calId, calData] of Object.entries(data.calendars || {})) {
        result[calId] = ((calData as any).busy || []).map((slot: any) => ({
            start: slot.start,
            end: slot.end,
        }));
    }

    return result;
}

/**
 * Get upcoming events within a given time window (convenience helper)
 */
export async function getUpcomingEvents(
    userId: string,
    hours: number = 24,
    maxResults: number = 10,
    calendarId?: string
): Promise<CalendarEvent[]> {
    const now = new Date();
    const future = new Date(now.getTime() + hours * 60 * 60 * 1000);

    return listEvents(userId, {
        calendarId,
        timeMin: now.toISOString(),
        timeMax: future.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
    });
}

/**
 * Get all events for today (convenience helper)
 */
export async function getTodayEvents(
    userId: string,
    calendarId?: string
): Promise<CalendarEvent[]> {
    const now = new Date();
    const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return listEvents(userId, {
        calendarId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
    });
}
