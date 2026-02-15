import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types";
import { hybridSearch } from "@/lib/rag/search";

const schema = z.object({
    query: z.string().min(1).max(500).describe("The search query for documents"),
    topK: z.number().min(1).max(10).default(5).describe("Number of results to return"),
    documentIds: z.array(z.string().uuid()).optional().describe("Specific document IDs to search in"),
});

type RAGSearchParams = z.infer<typeof schema>;

async function execute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        const params = schema.parse(rawParams) as RAGSearchParams;
        if (!context?.userId) {
            throw new Error("User context required for RAG search");
        }

        const results = await hybridSearch(
            params.query,
            {
                topK: params.topK,
                documentIds: params.documentIds,
                userId: context.userId,
            },
            context.apiKeys?.openai
        );

        // Format results for the agent
        const formattedResults = results.map((r, index) => ({
            rank: index + 1,
            documentId: r.documentId,
            filename: r.documentFilename,
            content: r.content,
            relevanceScore: Math.round(r.score * 100),
        }));

        return {
            success: true,
            data: {
                query: params.query,
                results: formattedResults,
                totalResults: results.length,
            },
            metadata: {
                executionTime: Date.now() - startTime,
                source: "rag",
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "RAG search failed",
            metadata: {
                executionTime: Date.now() - startTime,
            },
        };
    }
}

export const ragSearchTool: Tool = {
    id: "rag_search",
    name: "Document Search",
    description: "Search through uploaded documents using semantic and keyword matching",
    category: "search",
    icon: "FileSearch",
    schema,
    execute,
};
