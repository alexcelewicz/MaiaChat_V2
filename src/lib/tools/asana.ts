/**
 * Asana Tool
 *
 * Provides Asana project management capabilities to AI agents.
 * Supports: list_projects, list_tasks, create_task, update_task,
 *           complete_task, get_task, add_comment, search_tasks
 */

import { z } from "zod";
import type { Tool, ToolId, ToolResult } from "./types";
import {
    listWorkspaces,
    listProjects,
    listTasks,
    getTask,
    createTask,
    updateTask,
    completeTask,
    addComment,
    searchTasks,
} from "@/lib/integrations/asana/client";
import { hasValidAsanaCredentials } from "@/lib/integrations/asana/oauth";

// ============================================================================
// Tool Schema
// ============================================================================

const asanaToolSchema = z.object({
    action: z.enum([
        "list_projects",
        "list_tasks",
        "create_task",
        "update_task",
        "complete_task",
        "get_task",
        "add_comment",
        "search_tasks",
    ]),

    // Workspace / project identification
    workspaceGid: z.string().optional(),
    projectGid: z.string().optional(),

    // Task identification
    taskGid: z.string().optional(),

    // Search
    query: z.string().optional(),

    // Task create/update fields
    name: z.string().optional(),
    notes: z.string().optional(),
    dueOn: z.string().optional(), // YYYY-MM-DD
    assignee: z.string().optional(), // Asana user GID
    projects: z.array(z.string()).optional(), // Project GIDs

    // Comment
    comment: z.string().optional(),
});

type AsanaToolInput = z.infer<typeof asanaToolSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const asanaTool: Tool = {
    id: "asana" as ToolId,
    name: "Asana",
    description: `Manage Asana projects and tasks.

Actions:
- list_projects: List projects in a workspace (requires workspaceGid)
- list_tasks: List tasks in a project (requires projectGid)
- get_task: Get details of a specific task by taskGid
- create_task: Create a new task (requires name; optional: notes, dueOn, assignee, projects, workspaceGid)
- update_task: Update a task's details (requires taskGid)
- complete_task: Mark a task as complete (requires taskGid)
- add_comment: Add a comment to a task (requires taskGid and comment)
- search_tasks: Search tasks in a workspace (requires workspaceGid and query)

If workspaceGid is not provided for actions that need it, the first available workspace will be used.
Requires Asana account to be connected in settings.`,
    category: "integration",
    icon: "CheckSquare",
    schema: asanaToolSchema,
    execute: async (params, context) => {
        if (!context?.userId) {
            return { success: false, error: "User context required for Asana actions" };
        }
        return executeAsanaTool(params as AsanaToolInput, { userId: context.userId });
    },
};

// ============================================================================
// Tool Execution
// ============================================================================

async function executeAsanaTool(
    input: AsanaToolInput,
    context: { userId: string }
): Promise<ToolResult> {
    const { action } = input;
    const { userId } = context;

    // Verify Asana credentials
    const connected = await hasValidAsanaCredentials(userId);
    if (!connected) {
        return {
            success: false,
            error: "Asana not connected. Please connect your Asana account in Settings > Integrations.",
        };
    }

    try {
        switch (action) {
            case "list_projects":
                return await handleListProjects(userId, input);

            case "list_tasks":
                return await handleListTasks(userId, input);

            case "get_task":
                return await handleGetTask(userId, input);

            case "create_task":
                return await handleCreateTask(userId, input);

            case "update_task":
                return await handleUpdateTask(userId, input);

            case "complete_task":
                return await handleCompleteTask(userId, input);

            case "add_comment":
                return await handleAddComment(userId, input);

            case "search_tasks":
                return await handleSearchTasks(userId, input);

            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`,
                };
        }
    } catch (error) {
        console.error("[Asana Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Asana operation failed",
        };
    }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve workspace GID - use provided or fetch the first available
 */
async function resolveWorkspaceGid(userId: string, providedGid?: string): Promise<string> {
    if (providedGid) return providedGid;

    const workspaces = await listWorkspaces(userId);
    if (workspaces.length === 0) {
        throw new Error("No Asana workspaces found. Ensure your Asana account has at least one workspace.");
    }

    return workspaces[0].gid;
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleListProjects(
    userId: string,
    input: AsanaToolInput
): Promise<ToolResult> {
    const workspaceGid = await resolveWorkspaceGid(userId, input.workspaceGid);
    const projects = await listProjects(userId, workspaceGid);

    return {
        success: true,
        data: {
            workspaceGid,
            count: projects.length,
            projects,
        },
    };
}

async function handleListTasks(
    userId: string,
    input: AsanaToolInput
): Promise<ToolResult> {
    if (!input.projectGid) {
        return { success: false, error: "projectGid is required for list_tasks action" };
    }

    const tasks = await listTasks(userId, input.projectGid);

    return {
        success: true,
        data: {
            projectGid: input.projectGid,
            count: tasks.length,
            tasks,
        },
    };
}

async function handleGetTask(
    userId: string,
    input: AsanaToolInput
): Promise<ToolResult> {
    if (!input.taskGid) {
        return { success: false, error: "taskGid is required for get_task action" };
    }

    const task = await getTask(userId, input.taskGid);

    return {
        success: true,
        data: task,
    };
}

async function handleCreateTask(
    userId: string,
    input: AsanaToolInput
): Promise<ToolResult> {
    if (!input.name) {
        return { success: false, error: "name is required for create_task action" };
    }

    const taskData: {
        name: string;
        notes?: string;
        due_on?: string;
        assignee?: string;
        projects?: string[];
        workspace?: string;
    } = {
        name: input.name,
    };

    if (input.notes) taskData.notes = input.notes;
    if (input.dueOn) taskData.due_on = input.dueOn;
    if (input.assignee) taskData.assignee = input.assignee;
    if (input.projects) taskData.projects = input.projects;
    if (input.workspaceGid && !input.projects) {
        taskData.workspace = input.workspaceGid;
    }

    const task = await createTask(userId, taskData);

    return {
        success: true,
        data: {
            ...task,
            message: "Task created successfully",
        },
    };
}

async function handleUpdateTask(
    userId: string,
    input: AsanaToolInput
): Promise<ToolResult> {
    if (!input.taskGid) {
        return { success: false, error: "taskGid is required for update_task action" };
    }

    const updates: {
        name?: string;
        notes?: string;
        due_on?: string;
        assignee?: string;
    } = {};

    if (input.name !== undefined) updates.name = input.name;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.dueOn !== undefined) updates.due_on = input.dueOn;
    if (input.assignee !== undefined) updates.assignee = input.assignee;

    const task = await updateTask(userId, input.taskGid, updates);

    return {
        success: true,
        data: {
            ...task,
            message: "Task updated successfully",
        },
    };
}

async function handleCompleteTask(
    userId: string,
    input: AsanaToolInput
): Promise<ToolResult> {
    if (!input.taskGid) {
        return { success: false, error: "taskGid is required for complete_task action" };
    }

    const task = await completeTask(userId, input.taskGid);

    return {
        success: true,
        data: {
            ...task,
            message: "Task marked as complete",
        },
    };
}

async function handleAddComment(
    userId: string,
    input: AsanaToolInput
): Promise<ToolResult> {
    if (!input.taskGid) {
        return { success: false, error: "taskGid is required for add_comment action" };
    }
    if (!input.comment) {
        return { success: false, error: "comment text is required for add_comment action" };
    }

    const story = await addComment(userId, input.taskGid, input.comment);

    return {
        success: true,
        data: {
            ...story,
            message: "Comment added successfully",
        },
    };
}

async function handleSearchTasks(
    userId: string,
    input: AsanaToolInput
): Promise<ToolResult> {
    if (!input.query) {
        return { success: false, error: "query is required for search_tasks action" };
    }

    const workspaceGid = await resolveWorkspaceGid(userId, input.workspaceGid);
    const tasks = await searchTasks(userId, workspaceGid, input.query);

    return {
        success: true,
        data: {
            workspaceGid,
            query: input.query,
            count: tasks.length,
            tasks,
        },
    };
}

export default asanaTool;
