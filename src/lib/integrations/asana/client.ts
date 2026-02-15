/**
 * Asana API Client
 *
 * Provides project management capabilities via Asana REST API v1.
 * Uses the Asana OAuth credentials from oauth.ts.
 */

import { getValidAsanaCredentials } from "./oauth";

const ASANA_API_BASE = "https://app.asana.com/api/1.0";

// ============================================================================
// Types
// ============================================================================

export interface AsanaWorkspace {
    gid: string;
    name: string;
    resource_type: string;
}

export interface AsanaProject {
    gid: string;
    name: string;
    resource_type: string;
    archived: boolean;
    color?: string;
    notes?: string;
    workspace?: { gid: string; name: string };
    created_at?: string;
    modified_at?: string;
}

export interface AsanaTask {
    gid: string;
    name: string;
    resource_type: string;
    completed: boolean;
    completed_at?: string;
    assignee?: { gid: string; name: string };
    due_on?: string;
    due_at?: string;
    notes?: string;
    projects?: Array<{ gid: string; name: string }>;
    tags?: Array<{ gid: string; name: string }>;
    created_at?: string;
    modified_at?: string;
}

export interface AsanaStory {
    gid: string;
    resource_type: string;
    text: string;
    created_at: string;
    created_by?: { gid: string; name: string };
    type: string;
}

// ============================================================================
// Authenticated Fetch Helper
// ============================================================================

/**
 * Make an authenticated request to the Asana API
 */
async function asanaFetch(
    userId: string,
    path: string,
    options?: RequestInit
): Promise<Response> {
    const credentials = await getValidAsanaCredentials(userId);
    if (!credentials) {
        throw new Error(
            "Asana not connected. Please connect your Asana account in Settings > Integrations."
        );
    }

    const url = path.startsWith("http")
        ? path
        : `${ASANA_API_BASE}${path}`;

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
            `Asana API error (${response.status}): ${errorText}`
        );
    }

    return response;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * List all workspaces accessible by the user
 */
export async function listWorkspaces(userId: string): Promise<AsanaWorkspace[]> {
    const response = await asanaFetch(userId, "/workspaces");
    const data = await response.json();
    return data.data || [];
}

/**
 * List projects in a workspace
 */
export async function listProjects(
    userId: string,
    workspaceGid: string
): Promise<AsanaProject[]> {
    const params = new URLSearchParams({
        workspace: workspaceGid,
        opt_fields: "name,archived,color,notes,created_at,modified_at",
    });

    const response = await asanaFetch(userId, `/projects?${params}`);
    const data = await response.json();
    return data.data || [];
}

/**
 * List tasks in a project
 */
export async function listTasks(
    userId: string,
    projectGid: string
): Promise<AsanaTask[]> {
    const params = new URLSearchParams({
        project: projectGid,
        opt_fields: "name,completed,completed_at,assignee,assignee.name,due_on,due_at,notes,tags,tags.name,created_at,modified_at",
    });

    const response = await asanaFetch(userId, `/tasks?${params}`);
    const data = await response.json();
    return data.data || [];
}

/**
 * Get a single task by GID
 */
export async function getTask(
    userId: string,
    taskGid: string
): Promise<AsanaTask> {
    const params = new URLSearchParams({
        opt_fields: "name,completed,completed_at,assignee,assignee.name,due_on,due_at,notes,projects,projects.name,tags,tags.name,created_at,modified_at",
    });

    const response = await asanaFetch(userId, `/tasks/${encodeURIComponent(taskGid)}?${params}`);
    const data = await response.json();
    return data.data;
}

/**
 * Create a new task
 */
export async function createTask(
    userId: string,
    data: {
        name: string;
        notes?: string;
        due_on?: string;
        assignee?: string;
        projects?: string[];
        workspace?: string;
    }
): Promise<AsanaTask> {
    const response = await asanaFetch(userId, "/tasks", {
        method: "POST",
        body: JSON.stringify({ data }),
    });

    const result = await response.json();
    return result.data;
}

/**
 * Update an existing task
 */
export async function updateTask(
    userId: string,
    taskGid: string,
    data: {
        name?: string;
        notes?: string;
        due_on?: string;
        assignee?: string;
        completed?: boolean;
    }
): Promise<AsanaTask> {
    const response = await asanaFetch(userId, `/tasks/${encodeURIComponent(taskGid)}`, {
        method: "PUT",
        body: JSON.stringify({ data }),
    });

    const result = await response.json();
    return result.data;
}

/**
 * Mark a task as complete
 */
export async function completeTask(
    userId: string,
    taskGid: string
): Promise<AsanaTask> {
    return updateTask(userId, taskGid, { completed: true });
}

/**
 * Add a comment (story) to a task
 */
export async function addComment(
    userId: string,
    taskGid: string,
    text: string
): Promise<AsanaStory> {
    const response = await asanaFetch(
        userId,
        `/tasks/${encodeURIComponent(taskGid)}/stories`,
        {
            method: "POST",
            body: JSON.stringify({
                data: { text },
            }),
        }
    );

    const result = await response.json();
    return result.data;
}

/**
 * Search tasks in a workspace
 */
export async function searchTasks(
    userId: string,
    workspaceGid: string,
    query: string
): Promise<AsanaTask[]> {
    const params = new URLSearchParams({
        "text": query,
        "opt_fields": "name,completed,completed_at,assignee,assignee.name,due_on,due_at,notes,projects,projects.name,created_at,modified_at",
    });

    const response = await asanaFetch(
        userId,
        `/workspaces/${encodeURIComponent(workspaceGid)}/tasks/search?${params}`
    );

    const data = await response.json();
    return data.data || [];
}
