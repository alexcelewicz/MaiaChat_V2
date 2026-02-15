/**
 * GitHub Integration Tool
 *
 * Provides GitHub capabilities to AI agents via GitHub REST API.
 * Supports: list_repos, get_repo, list_issues, create_issue, list_prs,
 *           get_pr, create_pr_comment, search_code, get_user
 */

import { z } from "zod";
import type { Tool, ToolId, ToolResult } from "./types";

// ============================================================================
// Tool Schema
// ============================================================================

const githubIntegrationToolSchema = z.object({
    action: z.enum([
        "list_repos",
        "get_repo",
        "list_issues",
        "create_issue",
        "list_prs",
        "get_pr",
        "create_pr_comment",
        "search_code",
        "get_user",
    ]),

    // Repository identification (alphanumeric, hyphens, dots, underscores only)
    owner: z.string().regex(/^[a-zA-Z0-9._-]+$/, "Invalid owner format").optional(),
    repo: z.string().regex(/^[a-zA-Z0-9._-]+$/, "Invalid repo format").optional(),

    // Issue / PR identification
    issueNumber: z.number().optional(),
    prNumber: z.number().optional(),

    // Create issue / PR comment fields
    title: z.string().optional(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),

    // Search / query
    query: z.string().optional(),

    // Filtering
    state: z.enum(["open", "closed", "all"]).optional(),

    // Pagination
    per_page: z.number().min(1).max(100).optional(),
});

type GitHubIntegrationToolInput = z.infer<typeof githubIntegrationToolSchema>;

// ============================================================================
// Constants
// ============================================================================

const GITHUB_API_BASE = "https://api.github.com";

// ============================================================================
// Tool Definition
// ============================================================================

export const githubIntegrationTool: Tool = {
    id: "github_integration" as ToolId,
    name: "GitHub",
    description: `Interact with GitHub repositories, issues, and pull requests.

Actions:
- list_repos: List repositories for the authenticated user
- get_repo: Get details of a specific repository (requires owner, repo)
- list_issues: List issues for a repository (requires owner, repo)
- create_issue: Create a new issue (requires owner, repo, title)
- list_prs: List pull requests for a repository (requires owner, repo)
- get_pr: Get details of a specific pull request (requires owner, repo, prNumber)
- create_pr_comment: Add a comment to a pull request (requires owner, repo, prNumber, body)
- search_code: Search code across GitHub (requires query)
- get_user: Get the authenticated user's profile

Requires a GitHub Personal Access Token configured in settings.`,
    category: "integration",
    icon: "Github",
    schema: githubIntegrationToolSchema,
    execute: async (params, context) => {
        const token = context?.apiKeys?.github;
        if (!token) {
            return {
                success: false,
                error: "GitHub Personal Access Token not configured. Please add your token in Settings > Integrations.",
            };
        }
        return executeGitHubTool(params as GitHubIntegrationToolInput, { token });
    },
};

// ============================================================================
// GitHub API Helper
// ============================================================================

async function githubFetch(
    endpoint: string,
    token: string,
    options: RequestInit = {}
): Promise<Response> {
    const url = endpoint.startsWith("http") ? endpoint : `${GITHUB_API_BASE}${endpoint}`;

    return fetch(url, {
        ...options,
        headers: {
            Accept: "application/vnd.github.v3+json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "Maiachat-v2-GitHub-Tool",
            ...((options.headers as Record<string, string>) || {}),
        },
    });
}

// ============================================================================
// Tool Execution
// ============================================================================

async function executeGitHubTool(
    input: GitHubIntegrationToolInput,
    context: { token: string }
): Promise<ToolResult> {
    const { action } = input;
    const { token } = context;

    try {
        switch (action) {
            case "list_repos":
                return await handleListRepos(token, input);

            case "get_repo":
                return await handleGetRepo(token, input);

            case "list_issues":
                return await handleListIssues(token, input);

            case "create_issue":
                return await handleCreateIssue(token, input);

            case "list_prs":
                return await handleListPRs(token, input);

            case "get_pr":
                return await handleGetPR(token, input);

            case "create_pr_comment":
                return await handleCreatePRComment(token, input);

            case "search_code":
                return await handleSearchCode(token, input);

            case "get_user":
                return await handleGetUser(token);

            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`,
                };
        }
    } catch (error) {
        console.error("[GitHub Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "GitHub operation failed",
        };
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleListRepos(
    token: string,
    input: GitHubIntegrationToolInput
): Promise<ToolResult> {
    const perPage = input.per_page || 30;
    const response = await githubFetch(`/user/repos?sort=updated&per_page=${perPage}`, token);

    if (!response.ok) {
        return { success: false, error: `GitHub API error: ${response.status} ${response.statusText}` };
    }

    const repos = await response.json();

    return {
        success: true,
        data: {
            count: repos.length,
            repositories: repos.map((r: Record<string, unknown>) => ({
                name: r.name,
                full_name: r.full_name,
                description: r.description,
                private: r.private,
                html_url: r.html_url,
                language: r.language,
                stargazers_count: r.stargazers_count,
                forks_count: r.forks_count,
                open_issues_count: r.open_issues_count,
                updated_at: r.updated_at,
            })),
        },
    };
}

async function handleGetRepo(
    token: string,
    input: GitHubIntegrationToolInput
): Promise<ToolResult> {
    if (!input.owner || !input.repo) {
        return { success: false, error: "owner and repo are required for get_repo action" };
    }

    const response = await githubFetch(`/repos/${input.owner}/${input.repo}`, token);

    if (!response.ok) {
        return { success: false, error: `GitHub API error: ${response.status} ${response.statusText}` };
    }

    const repo = await response.json();

    return {
        success: true,
        data: {
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            private: repo.private,
            html_url: repo.html_url,
            clone_url: repo.clone_url,
            language: repo.language,
            stargazers_count: repo.stargazers_count,
            forks_count: repo.forks_count,
            open_issues_count: repo.open_issues_count,
            default_branch: repo.default_branch,
            created_at: repo.created_at,
            updated_at: repo.updated_at,
            topics: repo.topics,
            license: repo.license?.spdx_id,
        },
    };
}

async function handleListIssues(
    token: string,
    input: GitHubIntegrationToolInput
): Promise<ToolResult> {
    if (!input.owner || !input.repo) {
        return { success: false, error: "owner and repo are required for list_issues action" };
    }

    const state = input.state || "open";
    const perPage = input.per_page || 30;
    const response = await githubFetch(
        `/repos/${input.owner}/${input.repo}/issues?state=${state}&per_page=${perPage}`,
        token
    );

    if (!response.ok) {
        return { success: false, error: `GitHub API error: ${response.status} ${response.statusText}` };
    }

    const issues = await response.json();

    return {
        success: true,
        data: {
            count: issues.length,
            state,
            issues: issues.map((i: Record<string, unknown>) => ({
                number: i.number,
                title: i.title,
                state: i.state,
                html_url: i.html_url,
                user: (i.user as Record<string, unknown>)?.login,
                labels: (i.labels as Array<Record<string, unknown>>)?.map((l) => l.name),
                assignees: (i.assignees as Array<Record<string, unknown>>)?.map((a) => a.login),
                created_at: i.created_at,
                updated_at: i.updated_at,
                comments: i.comments,
            })),
        },
    };
}

async function handleCreateIssue(
    token: string,
    input: GitHubIntegrationToolInput
): Promise<ToolResult> {
    if (!input.owner || !input.repo || !input.title) {
        return { success: false, error: "owner, repo, and title are required for create_issue action" };
    }

    const payload: Record<string, unknown> = {
        title: input.title,
    };
    if (input.body) payload.body = input.body;
    if (input.labels) payload.labels = input.labels;
    if (input.assignees) payload.assignees = input.assignees;

    const response = await githubFetch(
        `/repos/${input.owner}/${input.repo}/issues`,
        token,
        {
            method: "POST",
            body: JSON.stringify(payload),
        }
    );

    if (!response.ok) {
        const errorBody = await response.text();
        return { success: false, error: `GitHub API error: ${response.status} ${response.statusText} - ${errorBody}` };
    }

    const issue = await response.json();

    return {
        success: true,
        data: {
            number: issue.number,
            title: issue.title,
            html_url: issue.html_url,
            message: "Issue created successfully",
        },
    };
}

async function handleListPRs(
    token: string,
    input: GitHubIntegrationToolInput
): Promise<ToolResult> {
    if (!input.owner || !input.repo) {
        return { success: false, error: "owner and repo are required for list_prs action" };
    }

    const state = input.state || "open";
    const perPage = input.per_page || 30;
    const response = await githubFetch(
        `/repos/${input.owner}/${input.repo}/pulls?state=${state}&per_page=${perPage}`,
        token
    );

    if (!response.ok) {
        return { success: false, error: `GitHub API error: ${response.status} ${response.statusText}` };
    }

    const prs = await response.json();

    return {
        success: true,
        data: {
            count: prs.length,
            state,
            pullRequests: prs.map((pr: Record<string, unknown>) => ({
                number: pr.number,
                title: pr.title,
                state: pr.state,
                html_url: pr.html_url,
                user: (pr.user as Record<string, unknown>)?.login,
                head: (pr.head as Record<string, unknown>)?.ref,
                base: (pr.base as Record<string, unknown>)?.ref,
                draft: pr.draft,
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                mergeable_state: pr.mergeable_state,
            })),
        },
    };
}

async function handleGetPR(
    token: string,
    input: GitHubIntegrationToolInput
): Promise<ToolResult> {
    if (!input.owner || !input.repo || !input.prNumber) {
        return { success: false, error: "owner, repo, and prNumber are required for get_pr action" };
    }

    const response = await githubFetch(
        `/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}`,
        token
    );

    if (!response.ok) {
        return { success: false, error: `GitHub API error: ${response.status} ${response.statusText}` };
    }

    const pr = await response.json();

    return {
        success: true,
        data: {
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state,
            html_url: pr.html_url,
            user: pr.user?.login,
            head: { ref: pr.head?.ref, sha: pr.head?.sha },
            base: { ref: pr.base?.ref, sha: pr.base?.sha },
            draft: pr.draft,
            merged: pr.merged,
            mergeable: pr.mergeable,
            additions: pr.additions,
            deletions: pr.deletions,
            changed_files: pr.changed_files,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            merged_at: pr.merged_at,
        },
    };
}

async function handleCreatePRComment(
    token: string,
    input: GitHubIntegrationToolInput
): Promise<ToolResult> {
    if (!input.owner || !input.repo || !input.prNumber || !input.body) {
        return {
            success: false,
            error: "owner, repo, prNumber, and body are required for create_pr_comment action",
        };
    }

    const response = await githubFetch(
        `/repos/${input.owner}/${input.repo}/issues/${input.prNumber}/comments`,
        token,
        {
            method: "POST",
            body: JSON.stringify({ body: input.body }),
        }
    );

    if (!response.ok) {
        const errorBody = await response.text();
        return { success: false, error: `GitHub API error: ${response.status} ${response.statusText} - ${errorBody}` };
    }

    const comment = await response.json();

    return {
        success: true,
        data: {
            id: comment.id,
            html_url: comment.html_url,
            message: "Comment added to pull request successfully",
        },
    };
}

async function handleSearchCode(
    token: string,
    input: GitHubIntegrationToolInput
): Promise<ToolResult> {
    if (!input.query) {
        return { success: false, error: "query is required for search_code action" };
    }

    const perPage = input.per_page || 30;
    const encodedQuery = encodeURIComponent(input.query);
    const response = await githubFetch(
        `/search/code?q=${encodedQuery}&per_page=${perPage}`,
        token
    );

    if (!response.ok) {
        return { success: false, error: `GitHub API error: ${response.status} ${response.statusText}` };
    }

    const result = await response.json();

    return {
        success: true,
        data: {
            total_count: result.total_count,
            count: result.items?.length || 0,
            items: result.items?.map((item: Record<string, unknown>) => ({
                name: item.name,
                path: item.path,
                html_url: item.html_url,
                repository: (item.repository as Record<string, unknown>)?.full_name,
                score: item.score,
            })),
        },
    };
}

async function handleGetUser(token: string): Promise<ToolResult> {
    const response = await githubFetch("/user", token);

    if (!response.ok) {
        return { success: false, error: `GitHub API error: ${response.status} ${response.statusText}` };
    }

    const user = await response.json();

    return {
        success: true,
        data: {
            login: user.login,
            name: user.name,
            email: user.email,
            bio: user.bio,
            html_url: user.html_url,
            avatar_url: user.avatar_url,
            public_repos: user.public_repos,
            followers: user.followers,
            following: user.following,
            created_at: user.created_at,
        },
    };
}

export default githubIntegrationTool;
