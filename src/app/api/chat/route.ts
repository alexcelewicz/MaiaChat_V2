import {
  streamText,
  convertToModelMessages,
  tool,
  stepCountIs,
  type UIMessage,
  type ModelMessage,
} from 'ai';

// Type alias for backward compatibility
type CoreMessage = ModelMessage;
import { getModelWithKey, getModelConfig } from '@/lib/ai/providers/factory';
import { getModelWithFailover, getFallbackModels } from '@/lib/ai/failover';
import { getAllModels } from '@/lib/ai/models';
import { calculateCost } from '@/lib/ai/providers/types';
import { db } from '@/lib/db';
import {
  messages as messagesTable,
  conversations,
  usageRecords,
  agents,
  documents,
  users,
} from '@/lib/db/schema';
import { getSessionUserId } from '@/lib/auth/session';
import { getUserApiKeys } from '@/lib/ai/get-user-keys';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { generateConversationTitle } from '@/lib/ai/summary';
import {
  checkRateLimit,
  RATE_LIMITS,
  getRateLimitIdentifier,
  rateLimitExceededResponse,
} from '@/lib/rate-limit';
import { z } from 'zod';
import { getRAGContext, type SearchResult } from '@/lib/rag/search';
import { getAllTools, getTool, executeTool, type ToolId, type ToolContext } from '@/lib/tools';
import { getLocalAccessContext } from '@/lib/admin/settings';
// Using the tool() helper function from ai package for proper tool registration
import { pluginRegistry, initializePlugins, pluginExecutor } from '@/lib/plugins';
import { buildPluginInputSchema } from '@/lib/plugins/utils';
import { getUserProfile } from '@/lib/memory/user-profile';
import { resolveTimezone } from '@/lib/scheduler/timezone';
import { summarizeConversation } from '@/lib/memory/summarizer';
import { buildSoulSystemPrompt } from '@/lib/soul';
import { appendToWorkingMemory, type MemoryEntry } from '@/lib/memory/local-memory';
import { uploadFile } from '@/lib/storage/s3';
import { getConfigSection } from '@/lib/config';
import { randomUUID } from 'crypto';

// Get all supported model IDs dynamically
const SUPPORTED_MODEL_IDS = getAllModels().map((m) => m.id);

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

// Minimum messages required before auto-saving memory (2 = 1 exchange)
const MIN_MESSAGES_FOR_MEMORY = 2;

/**
 * Auto-save conversation to memory (fire-and-forget)
 * Similar to channel processor but for web chat
 */
async function autoSaveMemory(
  userId: string,
  conversationId: string,
  title: string | null,
  apiKeys: Record<string, string>
): Promise<void> {
  try {
    // Fetch conversation messages
    const msgs = await db.query.messages.findMany({
      where: eq(messagesTable.conversationId, conversationId),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    });

    // Need at least MIN_MESSAGES_FOR_MEMORY messages (configurable, default 2)
    if (msgs.length < MIN_MESSAGES_FOR_MEMORY) {
      return;
    }

    const formattedMessages = msgs.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content || '',
    }));

    // Summarize conversation
    const result = await summarizeConversation(formattedMessages, apiKeys, {
      conversationId,
      title: title || undefined,
    });

    // Always save to local memory (works with any model)
    const localEntry: MemoryEntry = {
      conversationId,
      title: title || `Conversation ${conversationId.slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      summary: result.summary,
      topics: result.topics,
      keyFacts: result.keyFacts,
    };
    await appendToWorkingMemory(userId, localEntry);
    console.log(
      `[Chat] Auto-saved memory for conversation ${conversationId.slice(0, 8)} (${msgs.length} messages)`
    );
  } catch (error) {
    console.error('[Chat] Memory auto-save failed:', error);
    // Don't throw - this is fire-and-forget
  }
}

// Validation schema for the request
const chatRequestSchema = z.object({
  messages: z.array(z.any()).min(1, 'At least one message is required'),
  conversationId: z.string().uuid().optional(),
  model: z.string().min(1, 'Model is required').optional().default('gpt-4o'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(200000).optional(),
  // Extended thinking (Anthropic)
  thinkingBudget: z.number().min(1024).max(100000).optional(),
  // RAG options
  ragEnabled: z.boolean().optional().default(false),
  ragDocumentIds: z.array(z.string().uuid()).optional(),
  ragTopK: z.number().min(1).max(20).optional().default(5),
  // Retriever options (RAG vs Gemini)
  retrievalMode: z.enum(['off', 'rag', 'gemini', 'both']).optional(),
  geminiFileSearchEnabled: z.boolean().optional(),
  geminiFileIds: z.array(z.string()).optional(),
  geminiStoreIds: z.array(z.string().uuid()).optional(),
  // Tool usage options
  toolsEnabled: z.boolean().optional().default(false),
  enabledTools: z.array(z.string()).optional(),
  // Skills/plugin options
  skillsEnabled: z.boolean().optional().default(false),
  enabledSkills: z.array(z.string()).optional(),
  // Memory options
  memoryEnabled: z.boolean().optional().default(false),
  // Voice mode
  voiceMode: z.boolean().optional().default(false),
  // Image S3 keys (from client-side upload)
  imageS3Keys: z
    .array(
      z.object({
        s3Key: z.string(),
        mediaType: z.string(),
        filename: z.string().optional(),
      })
    )
    .optional(),
});

export async function POST(req: Request) {
  try {
    // 1. Authentication
    const userId = await getSessionUserId();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Rate limiting
    const rateLimitId = getRateLimitIdentifier(req, userId);
    const rateLimitResult = await checkRateLimit(rateLimitId, 'chat', RATE_LIMITS.chat);

    if (!rateLimitResult.success) {
      return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.chat);
    }

    // 3. Parse and validate request body
    const body = await req.json();
    // Body logged at debug level only — avoid leaking user messages in production
    const parseResult = chatRequestSchema.safeParse(body);

    if (!parseResult.success) {
      console.error('Chat validation error:', parseResult.error.flatten());
      return new Response(
        JSON.stringify({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const {
      messages,
      conversationId: requestedConvId,
      model,
      temperature,
      maxTokens,
      thinkingBudget,
      ragEnabled,
      ragDocumentIds,
      ragTopK,
      retrievalMode,
      geminiFileSearchEnabled,
      geminiFileIds,
      geminiStoreIds,
      toolsEnabled,
      enabledTools,
      skillsEnabled,
      enabledSkills,
      memoryEnabled,
      voiceMode,
      imageS3Keys,
    } = parseResult.data;
    const uiMessages = messages as UIMessage[];

    // RAG + Gemini context
    let ragContext: string = '';
    let ragSources: SearchResult[] = [];
    let geminiContext: string = '';

    // 4. Get model configuration
    const modelConfig = getModelConfig(model);
    if (!modelConfig) {
      return new Response(JSON.stringify({ error: 'Model not found', code: 'MODEL_NOT_FOUND' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 5. Resolve Conversation ID
    let conversationId = requestedConvId;

    if (!conversationId) {
      // Get first text content from first message
      const firstMessage = uiMessages[0];
      let firstContent = 'New Conversation';

      if (firstMessage?.parts) {
        for (const part of firstMessage.parts) {
          if (part.type === 'text') {
            firstContent = part.text;
            break;
          }
        }
      }

      const title = firstContent.slice(0, 50) + (firstContent.length > 50 ? '...' : '');

      try {
        const [newConv] = await db
          .insert(conversations)
          .values({
            userId,
            title,
          })
          .returning();

        if (!newConv) {
          throw new Error('Failed to create conversation');
        }
        conversationId = newConv.id;
      } catch (err) {
        console.error('Failed to create conversation:', err);
        return new Response(
          JSON.stringify({ error: 'Failed to create conversation', code: 'DB_ERROR' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Verify ownership with explicit user ID check
      const conv = await db.query.conversations.findFirst({
        where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
      });

      if (!conv) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found', code: 'NOT_FOUND' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5.5-7.5. PARALLELIZED: Run independent operations concurrently
    // This eliminates waterfall pattern - saves 200-500ms

    // Extract user message content for saving and RAG query
    const lastMessage = uiMessages[uiMessages.length - 1];
    let userContent = '';
    let userImageCount = 0;
    if (lastMessage?.role === 'user' && lastMessage.parts) {
      for (const part of lastMessage.parts) {
        if (part.type === 'text') {
          userContent += part.text;
        } else if (
          part.type === 'file' &&
          (part as { mediaType?: string }).mediaType?.startsWith('image/')
        ) {
          userImageCount++;
        }
      }
    }

    const useRag = retrievalMode ? ['rag', 'both'].includes(retrievalMode) : ragEnabled;
    const useGemini = retrievalMode
      ? ['gemini', 'both'].includes(retrievalMode)
      : (geminiFileSearchEnabled ?? false);

    // Build RAG query text
    let ragQueryText = '';
    if (useRag) {
      const lastUserMessage = uiMessages.filter((m) => m.role === 'user').pop();
      if (lastUserMessage?.parts) {
        for (const part of lastUserMessage.parts) {
          if (part.type === 'text') {
            ragQueryText += part.text;
          }
        }
      }
    }

    const geminiFileIdsPromise = useGemini
      ? geminiFileIds?.length
        ? Promise.resolve(geminiFileIds)
        : db
            .select({ metadata: documents.metadata })
            .from(documents)
            .where(and(eq(documents.userId, userId), isNull(documents.deletedAt)))
            .then((rows) =>
              rows
                .map((doc) => {
                  const metadata = doc.metadata as Record<string, unknown> | null;
                  const geminiFile = metadata?.geminiFile as { name?: string } | undefined;
                  return geminiFile?.name;
                })
                .filter((fileId): fileId is string => Boolean(fileId))
            )
      : Promise.resolve([] as string[]);

    // Run all independent operations in parallel
    const [
      userApiKeys,
      conversationAgents,
      modelMessages,
      ragResult,
      resolvedGeminiFileIds,
      costConfig,
    ] = await Promise.all([
      // Get user API keys
      getUserApiKeys(userId),
      // Query agents for this conversation
      conversationId
        ? db.query.agents.findMany({
            where: and(eq(agents.conversationId, conversationId), eq(agents.userId, userId)),
          })
        : Promise.resolve([]),
      // Convert messages to model format
      convertToModelMessages(uiMessages),
      // RAG retrieval if enabled
      useRag && ragQueryText
        ? getRAGContext(ragQueryText, {
            topK: ragTopK,
            documentIds: ragDocumentIds,
            userId,
          }).catch((err) => {
            console.error('RAG retrieval failed:', err);
            return { context: '', sources: [] as SearchResult[] };
          })
        : Promise.resolve({ context: '', sources: [] as SearchResult[] }),
      geminiFileIdsPromise,
      getConfigSection('cost').catch(() => ({
        costOptimizationEnabled: false,
        monthlyBudgetUsd: 0,
        preferCheaperFallback: false,
        alertAtPercentage: 80,
      })),
    ]);

    // Process RAG results
    ragContext = ragResult.context;
    ragSources = ragResult.sources;

    // Gemini Store-based retrieval (persistent stores, preferred path)
    const effectiveGeminiStoreIds = geminiStoreIds?.length ? geminiStoreIds : null;
    if (useGemini && effectiveGeminiStoreIds) {
      try {
        const { searchWithStores } = await import('@/lib/ai/gemini-stores');
        const queryText = ragQueryText || userContent || '';
        if (queryText.trim()) {
          // Look up Gemini resource names from DB
          const { geminiStores } = await import('@/lib/db/schema');
          const stores = await db.query.geminiStores.findMany({
            where: and(
              eq(geminiStores.userId, userId),
              inArray(geminiStores.id, effectiveGeminiStoreIds)
            ),
          });
          const storeNames = stores.map((s) => s.geminiStoreName).filter(Boolean);

          if (storeNames.length > 0) {
            const googleKey = (userApiKeys as Record<string, string>).google;
            if (googleKey) {
              geminiContext = await searchWithStores(queryText, storeNames, googleKey);
            }
          }
        }
      } catch (err) {
        console.error('Gemini store search failed:', err);
      }
    }
    // Legacy: Gemini File API search (files with 48h expiry)
    else if (useGemini && resolvedGeminiFileIds.length > 0) {
      try {
        const { searchGeminiFiles } = await import('@/lib/ai/gemini-files');
        const queryText = ragQueryText || userContent || '';
        if (queryText.trim()) {
          geminiContext = await searchGeminiFiles(
            queryText,
            resolvedGeminiFileIds,
            userApiKeys as Record<string, string>
          );
        }
      } catch (err) {
        console.error('Gemini file search failed:', err);
      }
    }

    // Memory retrieval (if enabled)
    let memoryContext: string = '';
    if (memoryEnabled) {
      try {
        // Import memory modules
        const [{ getLocalMemoryContext, searchAllLocalMemory }, memoryStoreModule] =
          await Promise.all([
            import('@/lib/memory/local-memory'),
            import('@/lib/memory/memory-store'),
          ]);

        const googleKey = (userApiKeys as Record<string, string>).google;
        const trimmedContent = userContent.trim();

        // Run all memory retrievals in parallel
        const [localMemory, searchResults, geminiMemory] = await Promise.all([
          // Get relevant memory based on user's query (RAG-style)
          getLocalMemoryContext(userId, trimmedContent || '', 3000),
          // Search for additional relevant context from archives
          trimmedContent
            ? searchAllLocalMemory(userId, trimmedContent, 5)
            : Promise.resolve([] as string[]),
          // Gemini memory retrieval if Google API key available
          googleKey && trimmedContent
            ? memoryStoreModule
                .retrieveMemories(userId, googleKey, trimmedContent)
                .catch((err: unknown) => {
                  console.error('Gemini memory retrieval failed:', err);
                  return '';
                })
            : Promise.resolve(''),
        ]);

        // Filter out duplicates between local memory and search results
        let localSearchResults = '';
        if (searchResults.length > 0) {
          const uniqueResults = searchResults.filter((r) => !localMemory.includes(r.slice(0, 100)));
          localSearchResults = uniqueResults.slice(0, 3).join('\n---\n');
        }

        // Combine memory sources (local + Gemini)
        const memoryParts = [];
        if (localMemory) {
          memoryParts.push(`## Recent Conversations (Local Memory)\n${localMemory}`);
        }
        if (localSearchResults) {
          memoryParts.push(`## Relevant Past Conversations\n${localSearchResults}`);
        }
        if (geminiMemory) {
          memoryParts.push(`## Memory Search Results\n${geminiMemory}`);
        }
        memoryContext = memoryParts.join('\n\n');

        console.log(
          `[Chat] Memory context: local=${localMemory.length}chars, search=${localSearchResults.length}chars, gemini=${geminiMemory.length}chars`
        );
      } catch (err) {
        console.error('Memory retrieval failed:', err);
      }
    }

    // User Profile Memory (auto-learn and provide user context)
    let userProfileContext = '';
    if (memoryEnabled) {
      try {
        const { getProfileContext, extractAndSaveUserInfo, isProfileMemoryEnabled } =
          await import('@/lib/memory/user-profile');

        // Check if profile memory is enabled
        const profileEnabled = await isProfileMemoryEnabled();

        if (profileEnabled) {
          // Get existing profile context
          userProfileContext = await getProfileContext(userId, 1500);

          // Extract and save user info from the message (fire-and-forget)
          if (userContent.trim()) {
            extractAndSaveUserInfo(userId, userContent, conversationId).catch((err) => {
              console.error('[Chat] User profile extraction failed:', err);
            });
          }

          if (userProfileContext) {
            console.log(`[Chat] User profile context: ${userProfileContext.length}chars`);
          }
        }
      } catch (err) {
        console.error('User profile retrieval failed:', err);
      }
    }

    // Process agents
    let activeAgent: typeof agents.$inferSelect | null = null;
    let agentSystemPrompt: string | null = null;
    let agentModel: string | null = null;

    const activeAgents = conversationAgents.filter((a) => {
      const config = a.config as Record<string, unknown> | null;
      return config?.isActive !== false;
    });

    if (activeAgents.length > 0) {
      activeAgent = activeAgents[0] as typeof agents.$inferSelect;
      agentSystemPrompt = activeAgent.systemPrompt || null;

      const agentModelId = activeAgent.modelId;
      if (agentModelId && SUPPORTED_MODEL_IDS.includes(agentModelId)) {
        agentModel = agentModelId;
      }

      console.log(`Using agent: ${activeAgent.name} (${agentModelId})`);

      // Auto-enable Gemini store retrieval from agent config
      if (!geminiContext) {
        const agentConfig = activeAgent.config as Record<string, unknown> | null;
        const agentStoreIds = (agentConfig?.geminiStoreIds as string[] | undefined) || [];
        if (agentStoreIds.length > 0) {
          try {
            const { searchWithStores } = await import('@/lib/ai/gemini-stores');
            const { geminiStores } = await import('@/lib/db/schema');
            const queryText = ragQueryText || userContent || '';
            if (queryText.trim()) {
              const stores = await db.query.geminiStores.findMany({
                where: and(
                  eq(geminiStores.userId, userId),
                  inArray(geminiStores.id, agentStoreIds)
                ),
              });
              const storeNames = stores.map((s) => s.geminiStoreName).filter(Boolean);
              if (storeNames.length > 0) {
                const googleKey = (userApiKeys as Record<string, string>).google;
                if (googleKey) {
                  geminiContext = await searchWithStores(queryText, storeNames, googleKey);
                }
              }
            }
          } catch (err) {
            console.error('Agent Gemini store search failed:', err);
          }
        }
      }
    }

    // 6. Save User Message (awaited — must be in DB before streaming starts,
    //    so navigating away doesn't lose the user's message)
    if (userContent || userImageCount > 0) {
      const userMsgMetadata: Record<string, unknown> = {};
      if (userImageCount > 0) {
        userMsgMetadata.imageCount = userImageCount;
      }
      if (imageS3Keys && imageS3Keys.length > 0) {
        userMsgMetadata.imageKeys = imageS3Keys;
      }
      try {
        await db.insert(messagesTable).values({
          conversationId,
          role: 'user',
          content: userContent || '(image)',
          metadata: Object.keys(userMsgMetadata).length > 0 ? userMsgMetadata : undefined,
        });
      } catch (err) {
        console.error('Failed to save user message:', err);
      }
    }

    // 7. Get the AI model with user's API key
    const effectiveModel = agentModel || model;
    const effectiveModelConfig = agentModel
      ? getModelConfig(agentModel) || modelConfig
      : modelConfig;

    let aiModel;
    let actualModelId = effectiveModel;
    let usedFallback = false;
    const failoverConfig = {
      costOptimization: Boolean(costConfig.costOptimizationEnabled),
      preferCheaperFallback: Boolean(costConfig.preferCheaperFallback),
    };
    try {
      const requiredProvider = effectiveModelConfig.provider;
      // Local providers (ollama, lmstudio) don't require API keys
      const localProviders = ['ollama', 'lmstudio'];
      const isLocalProvider = localProviders.includes(requiredProvider);

      if (!isLocalProvider && !userApiKeys[requiredProvider]) {
        // Primary provider has no key — try failover to a provider that does
        try {
          const failoverResult = await getModelWithFailover(effectiveModel, failoverConfig);
          aiModel = failoverResult.model;
          actualModelId = failoverResult.modelId;
          usedFallback = actualModelId !== effectiveModel;
          if (usedFallback) {
            console.log(`[Chat] Failover: ${effectiveModel} → ${actualModelId}`);
          }
        } catch {
          return new Response(
            JSON.stringify({
              error: `No API key configured for ${requiredProvider}. Please add your API key in Settings.`,
              code: 'API_KEY_MISSING',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } else {
        aiModel = getModelWithKey(effectiveModel, userApiKeys);
      }
    } catch (err) {
      console.error('Failed to get model:', err);
      // Try failover before giving up
      try {
        const failoverResult = await getModelWithFailover(effectiveModel, failoverConfig);
        aiModel = failoverResult.model;
        actualModelId = failoverResult.modelId;
        usedFallback = actualModelId !== effectiveModel;
        console.log(`[Chat] Failover after error: ${effectiveModel} → ${actualModelId}`);
      } catch {
        return new Response(
          JSON.stringify({
            error: 'Model not available. Check API key configuration.',
            code: 'MODEL_UNAVAILABLE',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    const fallbackModels = getFallbackModels(effectiveModel, failoverConfig).map((m) => m.id);

    // 8. Stream response and save assistant message

    // Start with model messages
    let messagesWithContext: CoreMessage[] = modelMessages as CoreMessage[];

    // Inject soul personality context (always, regardless of agent)
    const soulPrompt = await buildSoulSystemPrompt();
    if (soulPrompt) {
      const soulSystemMessage: CoreMessage = {
        role: 'system',
        content: soulPrompt,
      };
      messagesWithContext = [soulSystemMessage, ...messagesWithContext];
      console.log(`[Chat] Injecting soul personality context (${soulPrompt.length} chars)`);
    }

    // Inject agent system prompt if available (layered after soul)
    if (agentSystemPrompt) {
      const agentSystemMessage: CoreMessage = {
        role: 'system',
        content: agentSystemPrompt,
      };
      // Add agent prompt after soul but before conversation messages
      const systemMessages = messagesWithContext.filter((m) => m.role === 'system');
      const otherMessages = messagesWithContext.filter((m) => m.role !== 'system');
      messagesWithContext = [...systemMessages, agentSystemMessage, ...otherMessages];
      console.log(`[Chat] Injecting agent system prompt for: ${activeAgent?.name}`);
    }

    // Inject RAG context as system message if available
    let messagesWithRAG: CoreMessage[] = messagesWithContext;
    if (ragContext) {
      const ragSystemMessage: CoreMessage = {
        role: 'system',
        content: `Use the following context from documents to help answer the user's question. 
If the context is relevant, incorporate it into your response and cite the sources.
If the context is not relevant, you can ignore it and answer based on your knowledge.

Context:
${ragContext}

---
Remember to cite sources using [Source N] format when using information from the context.`,
      };

      // Add RAG system message after any existing system messages
      const systemMessages = messagesWithRAG.filter((m) => m.role === 'system');
      const otherMessages = messagesWithRAG.filter((m) => m.role !== 'system');
      messagesWithRAG = [...systemMessages, ragSystemMessage, ...otherMessages];
    }

    let messagesWithRetrieval = messagesWithRAG;
    if (geminiContext) {
      const geminiSystemMessage: CoreMessage = {
        role: 'system',
        content: `Gemini File Search context (use only if relevant):\n\n${geminiContext}\n\n---\nIf this context is relevant, incorporate it into your response.`,
      };

      const systemMessages = messagesWithRetrieval.filter((m) => m.role === 'system');
      const otherMessages = messagesWithRetrieval.filter((m) => m.role !== 'system');
      messagesWithRetrieval = [...systemMessages, geminiSystemMessage, ...otherMessages];
    }

    // Inject user profile context (personal information about the user)
    if (userProfileContext) {
      const profileSystemMessage: CoreMessage = {
        role: 'system',
        content: `You know the following about the user you're talking to. Use this information naturally to personalize your responses:\n\n${userProfileContext}`,
      };

      const systemMessages = messagesWithRetrieval.filter((m) => m.role === 'system');
      const otherMessages = messagesWithRetrieval.filter((m) => m.role !== 'system');
      messagesWithRetrieval = [...systemMessages, profileSystemMessage, ...otherMessages];
    }

    // Inject memory context
    if (memoryContext) {
      const memorySystemMessage: CoreMessage = {
        role: 'system',
        content: `You have access to memories from past conversations with this user. Use this context naturally when relevant - don't explicitly mention "memory" unless asked.\n\nPast conversation context:\n${memoryContext}`,
      };

      const systemMessages = messagesWithRetrieval.filter((m) => m.role === 'system');
      const otherMessages = messagesWithRetrieval.filter((m) => m.role !== 'system');
      messagesWithRetrieval = [...systemMessages, memorySystemMessage, ...otherMessages];
    }

    // Inject voice mode system prompt for concise, spoken-friendly responses
    if (voiceMode) {
      const voiceSystemMessage: CoreMessage = {
        role: 'system',
        content: `You are in a live voice conversation. The user is speaking to you and will hear your response read aloud.

Rules for voice mode:
- Keep responses concise: maximum 2-3 short paragraphs
- Use natural, conversational language
- Never use markdown formatting (no **, #, \`, [], etc.)
- Never use bullet points or numbered lists — use flowing sentences instead
- Avoid technical jargon unless asked
- Don't include URLs or code blocks
- Be direct and get to the point quickly`,
      };

      const systemMessages = messagesWithRetrieval.filter((m) => m.role === 'system');
      const otherMessages = messagesWithRetrieval.filter((m) => m.role !== 'system');
      messagesWithRetrieval = [...systemMessages, voiceSystemMessage, ...otherMessages];
    }

    // Build tools and skills
    const localAccess = await getLocalAccessContext(userId);
    // Load user preferences for tool configuration (web search model, etc.)
    let userPrefs: Record<string, unknown> = {};
    try {
      const [prefRow] = await db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      userPrefs = (prefRow?.preferences as Record<string, unknown>) || {};
    } catch (e) {
      console.warn('[Chat] Failed to load user preferences:', e);
    }

    const toolContext: ToolContext = {
      userId,
      conversationId: conversationId || undefined,
      apiKeys: userApiKeys,
      localFileAccessEnabled: localAccess.localFileAccessEnabled,
      commandExecutionEnabled: localAccess.commandExecutionEnabled,
      fileAccessBaseDir: localAccess.fileAccessBaseDir,
      workspaceQuotaMb: localAccess.workspaceQuotaMb,
      hostedSandbox: localAccess.hostedSandbox,
      userPreferences: {
        webSearchModel: userPrefs.webSearchModel as string | undefined,
        deepResearchModel: userPrefs.deepResearchModel as string | undefined,
      },
    };

    // Inject web search configuration context so the AI knows how to help change settings
    const webSearchConfig = userPrefs.webSearchModel || 'auto';
    const deepResearchConfig = userPrefs.deepResearchModel || 'none';
    const hasPerplexityKey = !!userApiKeys.perplexity;
    const webSearchConfigMessage: CoreMessage = {
      role: 'system',
      content: `[Web Search Configuration]
Current web search model: ${webSearchConfig}
Current deep research model: ${deepResearchConfig}
Perplexity API key configured: ${hasPerplexityKey ? 'yes' : 'no'}

Available web search options: auto, perplexity-sonar, perplexity-sonar-pro, gemini, duckduckgo
Available deep research options: none, perplexity-sonar-deep-research, perplexity-sonar-reasoning-pro

If the user asks to change their web search or deep research model, tell them to go to Settings > Web Search Configuration, or use the API: PATCH /api/user/preferences with {"webSearchModel": "...", "deepResearchModel": "..."}
Perplexity models require a Perplexity API key to be configured in Settings.`,
    };
    const sysMessages = messagesWithRetrieval.filter((m) => m.role === 'system');
    const otherMsgs = messagesWithRetrieval.filter((m) => m.role !== 'system');
    messagesWithRetrieval = [...sysMessages, webSearchConfigMessage, ...otherMsgs];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = {};

    // Add built-in tools if enabled
    if (toolsEnabled) {
      const availableTools = getAllTools();
      // enabledTools only gates cloud-safe tools; local-access tools
      // are controlled by admin settings (localFileAccessEnabled, commandExecutionEnabled)
      let enabledToolIds = enabledTools?.length ? enabledTools : availableTools.map((t) => t.id);

      // Always include local-access tools when admin settings allow
      if (localAccess.localFileAccessEnabled) {
        const fileToolIds = availableTools
          .filter((t) => t.category === 'filesystem')
          .map((t) => t.id);
        enabledToolIds = [...new Set([...enabledToolIds, ...fileToolIds])];
      }
      if (localAccess.commandExecutionEnabled) {
        const systemToolIds = availableTools
          .filter((t) => t.category === 'system')
          .map((t) => t.id);
        enabledToolIds = [...new Set([...enabledToolIds, ...systemToolIds])];
      }

      for (const toolId of enabledToolIds) {
        const toolDef = getTool(toolId as ToolId);
        if (!toolDef) continue;
        // Use the tool() helper function from AI SDK v6 for proper type inference and execution
        // AI SDK v6 uses 'inputSchema' (not 'parameters') and execute should return an object (not JSON string)
        tools[toolDef.id] = tool({
          description: toolDef.description,
          inputSchema: toolDef.schema,
          execute: async (params) => {
            console.log(
              `[Chat] Executing tool ${toolDef.id} with params:`,
              JSON.stringify(params).substring(0, 200)
            );
            try {
              const result = await executeTool(
                { toolId: toolDef.id as ToolId, params: params as Record<string, unknown> },
                toolContext
              );
              console.log(`[Chat] Tool ${toolDef.id} result:`, {
                success: result.success,
                hasData: !!result.data,
                dataPreview: result.data ? JSON.stringify(result.data).substring(0, 200) : null,
                error: result.error,
              });
              if (result.success) {
                // Return the data object directly - AI SDK handles serialization
                console.log(`[Chat] Tool ${toolDef.id} returning data object`);
                return result.data;
              }
              return { error: result.error };
            } catch (error) {
              console.error(`[Chat] Tool ${toolDef.id} exception:`, error);
              return { error: error instanceof Error ? error.message : 'Unknown error' };
            }
          },
        });
      }
    }

    // Add plugin/skill tools if enabled
    let profileTimezone: string | undefined;
    try {
      const profile = await getUserProfile(userId);
      const trimmed = profile.timezone?.trim();
      if (trimmed) profileTimezone = trimmed;
    } catch {
      // Ignore profile errors and fall back to system timezone
    }

    const fallbackTimezone = resolveTimezone(null);

    const allowDateTimeWithoutSkills = true;
    const enabledSkillsSet = enabledSkills?.length
      ? new Set(enabledSkills.map((slug) => slug.toLowerCase()))
      : null;
    if (skillsEnabled || allowDateTimeWithoutSkills) {
      // Ensure plugins are loaded (safe to call multiple times - has init guard)
      await initializePlugins();

      for (const plugin of pluginRegistry.list()) {
        const pluginSlug = plugin.manifest.slug.toLowerCase();
        if (!skillsEnabled && plugin.manifest.slug !== 'datetime') {
          continue;
        }
        if (skillsEnabled && enabledSkillsSet && !enabledSkillsSet.has(pluginSlug)) {
          continue;
        }

        for (const pluginTool of plugin.manifest.tools || []) {
          const toolName = `${plugin.manifest.slug}__${pluginTool.name}`;
          // Use the tool() helper function from AI SDK v6 for proper type inference and execution
          // AI SDK v6 uses 'inputSchema' (not 'parameters') and execute should return an object (not JSON string)
          tools[toolName] = tool({
            description: pluginTool.description,
            inputSchema: buildPluginInputSchema(pluginTool.parameters),
            execute: async (params) => {
              console.log(
                `[Chat] Executing skill ${toolName} with params:`,
                JSON.stringify(params).substring(0, 200)
              );
              try {
                const result = await pluginExecutor.execute(
                  plugin.manifest.slug,
                  pluginTool.name,
                  params as Record<string, unknown>,
                  {
                    userId,
                    conversationId,
                    // Pass user API keys so plugins can use them
                    // (e.g., web-search plugin uses Google key for Gemini grounding)
                    config: {
                      googleApiKey: userApiKeys.google,
                      ...(plugin.manifest.slug === 'datetime'
                        ? { defaultTimezone: profileTimezone ?? fallbackTimezone }
                        : {}),
                    },
                  },
                  { autoEnableIfNeeded: true }
                );
                console.log(`[Chat] Skill ${toolName} result:`, {
                  success: result.success,
                  hasData: !!result.data,
                  hasOutput: !!(result as { output?: unknown }).output,
                  error: result.error,
                });
                if (result.success) {
                  return (
                    result.data ?? (result as { output?: unknown }).output ?? result.metadata ?? {}
                  );
                }
                return { error: result.error };
              } catch (error) {
                console.error(`[Chat] Skill ${toolName} exception:`, error);
                return { error: error instanceof Error ? error.message : 'Unknown error' };
              }
            },
          });
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiTools: Record<string, any> | undefined =
      Object.keys(tools).length > 0 ? tools : undefined;

    if (toolsEnabled || skillsEnabled) {
      console.log(
        `[Chat] Tools enabled: ${toolsEnabled}, Skills enabled: ${skillsEnabled}, Registered tools: ${Object.keys(tools).join(', ') || '(none)'}`
      );
    }

    // Inject tool awareness into system context so the model knows what tools it has
    if (Object.keys(tools).length > 0) {
      const toolNames = Object.keys(tools);
      const hasFileTools = toolNames.some((t) => t.startsWith('file_'));
      const hasShellTools = toolNames.some((t) => t === 'shell_exec');
      const hasDateTimeTools = toolNames.some((t) => t.startsWith('datetime__'));
      const toolHints: string[] = [];

      if (hasFileTools) {
        toolHints.push(
          'You have file system tools (file_list, file_read, file_write, etc.) that let you access files and folders on the server. USE THEM when the user asks about files, folders, or drives. Do NOT say you cannot access files — you CAN via these tools.'
        );
      }
      if (hasShellTools) {
        toolHints.push('You have a shell_exec tool to run commands on the server.');
      }
      if (hasDateTimeTools) {
        toolHints.push(
          'You have datetime tools for accurate time and date. ALWAYS use datetime__current_time when asked about the current time/date/day. Never guess.'
        );
      }
      if (toolHints.length > 0) {
        const toolAwarenessMessage: CoreMessage = {
          role: 'system',
          content: `## Available Tools\n\n${toolHints.join('\n')}\n\nAlways use your tools when relevant. Never claim you cannot perform an action if you have a tool for it.`,
        };
        const systemMsgs = messagesWithRetrieval.filter((m) => m.role === 'system');
        const otherMsgs = messagesWithRetrieval.filter((m) => m.role !== 'system');
        messagesWithRetrieval = [...systemMsgs, toolAwarenessMessage, ...otherMsgs];
      }
    }

    // Build stream options
    const streamOptions: Parameters<typeof streamText>[0] = {
      model: aiModel,
      messages: messagesWithRetrieval,
      temperature,
      maxOutputTokens: maxTokens || modelConfig.maxOutputTokens,
      tools: aiTools,
      // AI SDK v6 uses stopWhen instead of maxSteps.
      // Coding CLI tasks need more steps for iterative verify-and-fix loops.
      // Other tools get 10 steps which is enough for most multi-step tool use.
      ...(aiTools
        ? { stopWhen: stepCountIs(Object.keys(tools).includes('coding_cli') ? 15 : 10) }
        : {}),
    };

    // Add extended thinking for Anthropic models with thinkingBudget
    if (thinkingBudget && modelConfig.provider === 'anthropic') {
      (streamOptions as Record<string, unknown>).providerOptions = {
        anthropic: {
          thinking: {
            type: 'enabled',
            budgetTokens: thinkingBudget,
          },
        },
      };
    }

    let stepCounter = 0;
    const result = streamText({
      ...streamOptions,
      // Debug: Log each step completion for tool execution visibility
      onStepFinish: (step) => {
        stepCounter++;
        try {
          // Log error details if step finished with error
          if (step.finishReason === 'error') {
            console.error(`[Chat] Step ${stepCounter} finished with ERROR:`, {
              error: (step as unknown as { error?: unknown }).error,
              rawStep: JSON.stringify(step).substring(0, 500),
            });
          }
          console.log(`[Chat] Step ${stepCounter} finished:`, {
            finishReason: step.finishReason,
            text: step.text
              ? step.text.substring(0, 100) + (step.text.length > 100 ? '...' : '')
              : '',
            toolCalls: step.toolCalls?.map((tc) => ({
              toolName: tc.toolName,
              toolCallId: tc.toolCallId,
              input: tc.input ? JSON.stringify(tc.input).substring(0, 100) : '{}',
            })),
            toolResults: step.toolResults?.map((tr) => ({
              toolName: tr.toolName,
              toolCallId: tr.toolCallId,
              // AI SDK v6 uses 'output' not 'result' on tool results
              output:
                tr.output != null
                  ? typeof tr.output === 'string'
                    ? tr.output.substring(0, 200) + (tr.output.length > 200 ? '...' : '')
                    : JSON.stringify(tr.output).substring(0, 200)
                  : 'undefined',
            })),
            usage: step.usage,
          });
        } catch (logError) {
          console.error(`[Chat] Error in onStepFinish logging:`, logError);
        }
      },
      onError: ({ error }) => {
        console.error(`[Chat] streamText error (step ${stepCounter}):`, error);
      },
      onFinish: async (completion) => {
        try {
          console.log(
            `[Chat] Stream finished after ${stepCounter} step(s). Text length: ${completion.text?.length || 0}`
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stats = (completion as any).usage || {};
          const inputTokens = stats.promptTokens || stats.inputTokens || 0;
          const outputTokens = stats.completionTokens || stats.outputTokens || 0;

          // Save assistant message (fire-and-forget, don't block stream completion)
          db.insert(messagesTable)
            .values({
              conversationId,
              role: 'assistant',
              content: completion.text,
              tokenCount: inputTokens + outputTokens,
              metadata: {
                model,
                provider: modelConfig.provider,
                inputTokens,
                outputTokens,
                ragEnabled: useRag || false,
                geminiFileSearchEnabled: useGemini || false,
                ragSources:
                  ragSources.length > 0
                    ? ragSources.map((s) => ({
                        documentId: s.documentId,
                        chunkId: s.chunkId,
                        filename: s.documentFilename,
                        score: s.score,
                      }))
                    : undefined,
              },
            })
            .catch((err) => {
              console.error('[Chat] Failed to save assistant message:', err);
            });

          // Track usage for cost reporting (fire-and-forget)
          if (stats) {
            const costUsd = calculateCost(modelConfig, inputTokens, outputTokens);

            db.insert(usageRecords)
              .values({
                userId,
                provider: modelConfig.provider,
                model,
                inputTokens,
                outputTokens,
                cost: Math.round(costUsd * 1_000_000), // Store as micro-cents
              })
              .catch((err) => {
                console.error('[Chat] Failed to save usage record:', err);
              });
          }

          // Generate AI title for new conversations (first message)
          const isFirstMessage = uiMessages.filter((m: UIMessage) => m.role === 'user').length <= 1;
          if (isFirstMessage && conversationId) {
            // Get first user message text
            let firstUserMessage = '';
            const firstMsg = uiMessages[0];
            if (firstMsg?.parts) {
              for (const part of firstMsg.parts) {
                if (part.type === 'text') {
                  firstUserMessage = part.text;
                  break;
                }
              }
            }

            generateConversationTitle(firstUserMessage, completion.text, userApiKeys)
              .then(async (title) => {
                await db
                  .update(conversations)
                  .set({ title, updatedAt: new Date() })
                  .where(eq(conversations.id, conversationId!));
              })
              .catch((err) => console.error('Title generation failed:', err));
          }

          // Persist any generated images to S3 (fire-and-forget)
          if (completion.files?.length > 0) {
            Promise.resolve()
              .then(async () => {
                for (const file of completion.files) {
                  if (file.mediaType.startsWith('image/')) {
                    const imageId = randomUUID();
                    const ext = file.mediaType.split('/')[1] || 'png';
                    const s3Key = `users/${userId}/generated/${imageId}.${ext}`;
                    await uploadFile(s3Key, Buffer.from(file.uint8Array), {
                      contentType: file.mediaType,
                    });
                  }
                }
              })
              .catch((err) => {
                console.error('[Chat] Failed to persist generated images:', err);
              });
          }

          // Auto-save to memory if enabled (fire-and-forget, non-blocking)
          if (memoryEnabled && conversationId) {
            // Get current conversation title for memory
            db.query.conversations
              .findFirst({
                where: eq(conversations.id, conversationId),
              })
              .then((conv) => {
                autoSaveMemory(
                  userId,
                  conversationId!,
                  conv?.title || null,
                  userApiKeys as Record<string, string>
                ).catch((err) => console.error('[Chat] Memory auto-save error:', err));
              })
              .catch((err) => console.error('[Chat] Failed to get conversation for memory:', err));
          }
        } catch (err) {
          console.error('Failed to save assistant message or usage:', err);
        }
      },
    });

    // 9. Return stream response
    // AI SDK v6+ with useChat expects toUIMessageStreamResponse()
    // Pass originalMessages to reuse existing message IDs and prevent duplicate React keys
    const streamResponse = result.toUIMessageStreamResponse({
      originalMessages: uiMessages,
    });

    // Add failover info headers
    streamResponse.headers.set('x-model-id', actualModelId);
    streamResponse.headers.set('x-model-fallback', String(usedFallback));
    streamResponse.headers.set('x-model-fallbacks', fallbackModels.join(','));

    return streamResponse;
  } catch (error) {
    console.error('Chat API Error Detailed:', error);

    if (error instanceof SyntaxError) {
      return new Response(JSON.stringify({ error: 'Invalid JSON', code: 'INVALID_JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle provider-specific errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('API key')) {
      return new Response(
        JSON.stringify({
          error: 'API key not configured for this provider',
          code: 'API_KEY_MISSING',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
