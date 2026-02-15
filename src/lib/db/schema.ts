import { pgTable, uuid, text, timestamp, boolean, jsonb, integer, vector, index, unique } from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

// Users Table
export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    name: text("name").notNull().default("User"),
    image: text("image"),
    firebaseUid: text("firebase_uid").unique(), // nullable for Better Auth users
    role: text("role").default("user").notNull(), // 'user' | 'admin'
    preferences: jsonb("preferences").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Better Auth: Session Table
export const session = pgTable("session", {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Better Auth: Account Table
export const account = pgTable("account", {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Better Auth: Verification Table
export const verification = pgTable("verification", {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Profiles Table
export const profiles = pgTable("profiles", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    name: text("name").notNull(),
    agentConfigs: jsonb("agent_configs").default([]),
    ragConfig: jsonb("rag_config").default({}),
    orchestrationConfig: jsonb("orchestration_config").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Conversations Table
export const conversations = pgTable("conversations", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    title: text("title").notNull().default("New Conversation"),
    metadata: jsonb("metadata").default({}),
    isFavorite: boolean("is_favorite").default(false),
    shareToken: text("share_token"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index("conversations_user_id_idx").on(table.userId),
    folderIdIdx: index("conversations_folder_id_idx").on(table.folderId),
    createdAtIdx: index("conversations_created_at_idx").on(table.createdAt),
}));

// Agents Table - supports both templates (no conversationId) and conversation-specific agents
export const agents = pgTable("agents", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    isTemplate: boolean("is_template").default(false).notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    modelProvider: text("model_provider").notNull(),
    modelId: text("model_id").notNull(),
    systemPrompt: text("system_prompt"),
    config: jsonb("config").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index("agents_user_id_idx").on(table.userId),
    conversationIdIdx: index("agents_conversation_id_idx").on(table.conversationId),
    templateIdx: index("agents_template_idx").on(table.userId, table.isTemplate),
}));

// Messages Table
export const messages = pgTable("messages", {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    parentMessageId: uuid("parent_message_id"), // For branching
    role: text("role").notNull(), // 'user' | 'assistant' | 'system'
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    conversationIdIdx: index("messages_conversation_id_idx").on(table.conversationId),
    createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
}));

// API Keys Table
export const apiKeys = pgTable("api_keys", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    provider: text("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    isActive: boolean("is_active").default(true),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Usage Records Table
export const usageRecords = pgTable("usage_records", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    cost: integer("cost_usd_cents_e6"), // Cost in micro-cents (1/1,000,000 of a cent) or similar precision
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index("usage_user_id_idx").on(table.userId),
    }
});

// Feature Flags Table
export const featureFlags = pgTable("feature_flags", {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    isEnabled: boolean("is_enabled").default(false),
    rules: jsonb("rules").default({}), // For targeting specific users/groups
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Activity Logs Table (for Admin - Phase 6)
export const activityLogs = pgTable("activity_logs", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g., 'user.login', 'conversation.create', 'api_key.add'
    resource: text("resource"), // e.g., 'conversation', 'document', 'agent'
    resourceId: uuid("resource_id"), // ID of the affected resource
    metadata: jsonb("metadata").default({}), // Additional context (IP, user agent, etc.)
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index("activity_logs_user_id_idx").on(table.userId),
    actionIdx: index("activity_logs_action_idx").on(table.action),
    createdAtIdx: index("activity_logs_created_at_idx").on(table.createdAt),
}));

// Admin Settings Table - singleton configuration
export const adminSettings = pgTable("admin_settings", {
    id: uuid("id").defaultRandom().primaryKey(),
    autoStartChannels: boolean("auto_start_channels").default(false),
    ipFilteringEnabled: boolean("ip_filtering_enabled").default(false),
    visitorRetentionDays: integer("visitor_retention_days").default(30),

    // Local System Access Controls (Clawdbot-like capabilities)
    localFileAccessEnabled: boolean("local_file_access_enabled").default(false),
    commandExecutionEnabled: boolean("command_execution_enabled").default(false),
    fileAccessBaseDir: text("file_access_base_dir"), // Restrict file ops to this directory (null = no restriction)

    // Background Agent Settings (Phase G)
    backgroundAgentEnabled: boolean("background_agent_enabled").default(false),
    backgroundAgentAutoStart: boolean("background_agent_auto_start").default(false),
    defaultAgentModel: text("default_agent_model"), // Default model for background agent tasks
    proactiveMessagingEnabled: boolean("proactive_messaging_enabled").default(false), // Phase I
    eventTriggersEnabled: boolean("event_triggers_enabled").default(false), // Phase J
    bootScriptsEnabled: boolean("boot_scripts_enabled").default(false), // Phase K

    // Rate Limiting Defaults
    defaultProactiveMaxPerHour: integer("default_proactive_max_per_hour").default(10),
    defaultProactiveMaxPerDay: integer("default_proactive_max_per_day").default(100),
    defaultTriggerMaxPerHour: integer("default_trigger_max_per_hour").default(60),

    // Memory & Retrieval Settings
    geminiRetrievalModel: text("gemini_retrieval_model").default("gemini-3-flash-preview"), // Model used for Gemini file search retrieval
    userProfileMemoryEnabled: boolean("user_profile_memory_enabled").default(true), // Auto-learn user information
    memoryMaxChars: integer("memory_max_chars").default(4000), // Max chars for memory context injection

    // Channel Defaults
    defaultMaxTokens: integer("default_max_tokens").default(4096), // Default max output tokens for channel responses

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    createdAtIdx: index("admin_settings_created_at_idx").on(table.createdAt),
}));

// Page Visits Table - visitor tracking
export const pageVisits = pgTable("page_visits", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    path: text("path").notNull(),
    method: text("method").notNull(),
    ipAddress: text("ip_address"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    timezone: text("timezone"),
    userAgent: text("user_agent"),
    referer: text("referer"),
    isBot: boolean("is_bot").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    visitsUserIdx: index("page_visits_user_idx").on(table.userId),
    visitsIpIdx: index("page_visits_ip_idx").on(table.ipAddress),
    visitsCreatedAtIdx: index("page_visits_created_at_idx").on(table.createdAt),
}));

// IP Blocks Table - admin IP filtering
export const ipBlocks = pgTable("ip_blocks", {
    id: uuid("id").defaultRandom().primaryKey(),
    ipAddress: text("ip_address").notNull(),
    label: text("label"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    ipBlocksIpIdx: index("ip_blocks_ip_idx").on(table.ipAddress),
    ipBlocksActiveIdx: index("ip_blocks_active_idx").on(table.isActive),
}));


// RAG: Documents Table
export const documents = pgTable("documents", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    status: text("status").notNull().default("uploaded"), // 'uploaded' | 'processing' | 'processed' | 'failed'
    processedText: text("processed_text"),
    chunkCount: integer("chunk_count").default(0),
    metadata: jsonb("metadata").default({}),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index("documents_user_id_idx").on(table.userId),
    statusIdx: index("documents_status_idx").on(table.status),
}));

// RAG: Chunks Table
export const chunks = pgTable("chunks", {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
    content: text("content").notNull(),
    index: integer("index").notNull(),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    documentIdIdx: index("chunks_document_id_idx").on(table.documentId),
    indexIdx: index("chunks_index_idx").on(table.documentId, table.index),
}));

// RAG: Embeddings Table
export const embeddings = pgTable("embeddings", {
    id: uuid("id").defaultRandom().primaryKey(),
    chunkId: uuid("chunk_id").references(() => chunks.id, { onDelete: "cascade" }).notNull(),
    embedding: vector("embedding", { dimensions: 1536 }), // Default to OpenAI dims, adjust if dynamic
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    chunkIdIdx: index("embeddings_chunk_id_idx").on(table.chunkId),
    embeddingIndex: index("embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
}));

// Gemini File Search Stores Table
export const geminiStores = pgTable("gemini_stores", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    geminiStoreName: text("gemini_store_name").notNull(), // e.g., "fileSearchStores/abc123"
    displayName: text("display_name").notNull(),
    description: text("description"),
    color: text("color").default("#6366f1"),
    documentCount: integer("document_count").default(0),
    status: text("status").notNull().default("active"), // 'active' | 'creating' | 'error'
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index("gemini_stores_user_id_idx").on(table.userId),
    geminiStoreNameIdx: index("gemini_stores_name_idx").on(table.geminiStoreName),
    uniqueUserStore: unique("unique_user_gemini_store").on(table.userId, table.geminiStoreName),
}));

// Gemini Store Documents Junction Table
export const geminiStoreDocuments = pgTable("gemini_store_documents", {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id").references(() => geminiStores.id, { onDelete: "cascade" }).notNull(),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
    geminiDocumentName: text("gemini_document_name"), // Gemini resource name within the store
    geminiState: text("gemini_state").default("pending"), // 'pending' | 'active' | 'failed'
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    lastSyncAt: timestamp("last_sync_at"),
}, (table) => ({
    storeIdIdx: index("gemini_store_docs_store_id_idx").on(table.storeId),
    documentIdIdx: index("gemini_store_docs_document_id_idx").on(table.documentId),
    uniqueStoreDoc: unique("unique_store_document").on(table.storeId, table.documentId),
}));

// Folders Table
export const folders = pgTable("folders", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    color: text("color").default("#6366f1"), // Default indigo color
    parentId: uuid("parent_id"), // For future nested folders support
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index("folders_user_id_idx").on(table.userId),
}));

// Conversation Tags (many-to-many)
export const conversationTags = pgTable("conversation_tags", {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    conversationTagIdx: index("conversation_tags_conversation_id_idx").on(table.conversationId),
    uniqueTagIdx: index("conversation_tags_unique_idx").on(table.conversationId, table.tag),
}));

// ============================================================================
// Relations
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
    conversations: many(conversations),
    folders: many(folders),
    profiles: many(profiles),
    apiKeys: many(apiKeys),
    documents: many(documents),
    agents: many(agents),
    geminiStores: many(geminiStores),
    // Better Auth
    sessions: many(session),
    accounts: many(account),
    // Clawdbot integration
    channelAccounts: many(channelAccounts),
    gatewaySessions: many(gatewaySessions),
    userSkills: many(userSkills),
    autoReplyRules: many(autoReplyRules),
}));

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(users, {
        fields: [session.userId],
        references: [users.id],
    }),
}));

export const accountRelations = relations(account, ({ one }) => ({
    user: one(users, {
        fields: [account.userId],
        references: [users.id],
    }),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
    user: one(users, {
        fields: [folders.userId],
        references: [users.id],
    }),
    conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
    user: one(users, {
        fields: [conversations.userId],
        references: [users.id],
    }),
    folder: one(folders, {
        fields: [conversations.folderId],
        references: [folders.id],
    }),
    profile: one(profiles, {
        fields: [conversations.profileId],
        references: [profiles.id],
    }),
    messages: many(messages),
    agents: many(agents),
    tags: many(conversationTags),
    // Clawdbot integration
    channelMessages: many(channelMessages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    conversation: one(conversations, {
        fields: [messages.conversationId],
        references: [conversations.id],
    }),
    agent: one(agents, {
        fields: [messages.agentId],
        references: [agents.id],
    }),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
    user: one(users, {
        fields: [agents.userId],
        references: [users.id],
    }),
    conversation: one(conversations, {
        fields: [agents.conversationId],
        references: [conversations.id],
    }),
    messages: many(messages),
}));

export const conversationTagsRelations = relations(conversationTags, ({ one }) => ({
    conversation: one(conversations, {
        fields: [conversationTags.conversationId],
        references: [conversations.id],
    }),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
    user: one(users, {
        fields: [profiles.userId],
        references: [users.id],
    }),
    conversations: many(conversations),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
    user: one(users, {
        fields: [documents.userId],
        references: [users.id],
    }),
    chunks: many(chunks),
    geminiStoreDocuments: many(geminiStoreDocuments),
}));

export const chunksRelations = relations(chunks, ({ one, many }) => ({
    document: one(documents, {
        fields: [chunks.documentId],
        references: [documents.id],
    }),
    embeddings: many(embeddings),
}));

export const embeddingsRelations = relations(embeddings, ({ one }) => ({
    chunk: one(chunks, {
        fields: [embeddings.chunkId],
        references: [chunks.id],
    }),
}));

export const geminiStoresRelations = relations(geminiStores, ({ one, many }) => ({
    user: one(users, {
        fields: [geminiStores.userId],
        references: [users.id],
    }),
    storeDocuments: many(geminiStoreDocuments),
}));

export const geminiStoreDocumentsRelations = relations(geminiStoreDocuments, ({ one }) => ({
    store: one(geminiStores, {
        fields: [geminiStoreDocuments.storeId],
        references: [geminiStores.id],
    }),
    document: one(documents, {
        fields: [geminiStoreDocuments.documentId],
        references: [documents.id],
    }),
}));

// ============================================================================
// Clawdbot Integration: Channel & Gateway Tables
// ============================================================================

// Channel Account Configuration Type - Full Feature Parity with Web Chat
export type ChannelConfig = {
    // === BASIC SETTINGS ===
    defaultChatId?: string;          // Auto-populated Telegram chat ID for scheduled delivery
    lastInboundChatId?: string;      // Most recent Telegram chat ID seen from inbound traffic
    lastInboundSenderId?: string;    // Most recent Telegram sender user ID (identity context)
    autoReplyEnabled?: boolean;
    allowedUsers?: string[];
    blockedUsers?: string[];
    responseDelay?: number;
    workingHours?: { start: string; end: string; timezone: string };

    // === MODEL SELECTION ===
    provider?: string;              // e.g., 'anthropic', 'openai', 'google', 'ollama'
    model?: string;                 // e.g., 'claude-sonnet-4-20250514', 'gpt-4o'
    temperature?: number;           // 0-2
    maxTokens?: number;             // Max output tokens
    thinkingBudget?: number;        // Anthropic extended thinking budget
    contextMessages?: number;       // Max conversation history messages to include (default: 20)

    // === AGENT CONFIGURATION ===
    agentId?: string;               // Single agent mode
    multiAgentEnabled?: boolean;    // Enable multi-agent orchestration
    multiAgentMode?: 'sequential' | 'parallel' | 'consensus';
    multiAgentIds?: string[];       // Agent IDs for multi-agent mode
    multiAgentMaxRounds?: number;   // Max rounds for multi-agent chat

    // === RAG SETTINGS ===
    ragEnabled?: boolean;           // Enable document retrieval
    ragDocumentIds?: string[];      // Specific documents to search (empty = all)
    ragTopK?: number;               // Number of chunks to retrieve (default: 5)
    ragThreshold?: number;          // Minimum similarity score (0-1)

    // === GEMINI FILE SEARCH ===
    geminiFileSearchEnabled?: boolean;  // Use Gemini as universal retriever
    geminiFileIds?: string[];           // Specific Gemini file IDs (legacy File API)
    geminiStoreIds?: string[];          // Gemini File Search Store IDs (persistent stores)

    // === TOOLS & SKILLS ===
    toolsEnabled?: boolean;         // Enable tool execution
    enabledTools?: string[];        // Specific tool IDs (empty = all available)
    skillsEnabled?: boolean;        // Enable skill/plugin execution
    enabledSkills?: string[];       // Specific skill slugs

    // === MEMORY ===
    memoryEnabled?: boolean;        // Auto-save conversations to Gemini memory store

    // === VISION & MEDIA ===
    visionEnabled?: boolean;        // Process images in messages
    ttsEnabled?: boolean;           // Text-to-speech for responses
    sttEnabled?: boolean;           // Speech-to-text for voice messages
    ttsVoice?: string;              // Preferred TTS voice

    // === SYSTEM PROMPT ===
    systemPrompt?: string;          // Custom system prompt override
    includeChannelContext?: boolean; // Add channel context to prompts

    // === CONTENT HUMANIZER ===
    humanizerEnabled?: boolean;             // Enable AI output humanization
    humanizerLevel?: 'light' | 'moderate' | 'aggressive';  // Intensity level
    humanizerCategories?: string[];         // Enabled categories (empty = all)

    // === PER-CONTACT AUTO-REPLY ===
    contactRules?: Record<string, ContactRule>;  // Key = senderExternalId
};

// Per-contact auto-reply override
export type ContactRule = {
    autoReply: boolean;       // Override global toggle for this contact
    instructions?: string;    // Custom AI instructions (injected into system prompt)
    label?: string;           // User-assigned label (e.g., "Wife", "Work")
};

// Channel Accounts Table - stores connected channel credentials
export const channelAccounts = pgTable("channel_accounts", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    // Channel identification
    channelType: text("channel_type").notNull(), // 'slack' | 'discord' | 'telegram' | 'teams' | 'matrix' | 'webchat'
    channelId: text("channel_id").notNull(), // External channel/workspace ID
    accountId: text("account_id").notNull(), // User's ID in that channel

    // Authentication (encrypted)
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    webhookSecret: text("webhook_secret"),

    // Configuration
    isActive: boolean("is_active").default(true),
    config: jsonb("config").$type<ChannelConfig>(),

    // Metadata
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    lastSyncAt: timestamp("last_sync_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userChannelIdx: index("channel_accounts_user_idx").on(table.userId),
    channelTypeIdx: index("channel_accounts_type_idx").on(table.channelType),
    uniqueChannel: unique("unique_channel_account").on(table.userId, table.channelType, table.channelId),
}));

// Channel Attachment Type
export type ChannelAttachment = {
    type: 'image' | 'file' | 'audio' | 'video';
    url: string;
    name: string;
    size: number;
    mimeType?: string;
};

// Channel Messages Table - stores inbound/outbound channel messages
export const channelMessages = pgTable("channel_messages", {
    id: uuid("id").defaultRandom().primaryKey(),
    channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccounts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id),

    // Message identification
    externalMessageId: text("external_message_id").notNull(),
    externalThreadId: text("external_thread_id"),

    // Content
    direction: text("direction").notNull(), // 'inbound' | 'outbound'
    content: text("content").notNull(),
    contentType: text("content_type").default("text"), // 'text' | 'image' | 'file' | 'voice'
    attachments: jsonb("attachments").$type<ChannelAttachment[]>(),

    // Sender info
    senderExternalId: text("sender_external_id"),
    senderDisplayName: text("sender_display_name"),

    // Status
    status: text("status").default("pending"), // 'pending' | 'received' | 'sent' | 'delivered' | 'read' | 'failed'
    errorMessage: text("error_message"),

    // AI processing
    wasProcessedByAi: boolean("was_processed_by_ai").default(false),
    aiResponseMessageId: uuid("ai_response_message_id"),
    processingLatencyMs: integer("processing_latency_ms"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
}, (table) => ({
    channelAccountIdx: index("channel_messages_account_idx").on(table.channelAccountId),
    externalIdIdx: index("channel_messages_external_idx").on(table.externalMessageId),
    conversationIdx: index("channel_messages_conversation_idx").on(table.conversationId),
}));

// Gateway Sessions Table - tracks active WebSocket connections
export const gatewaySessions = pgTable("gateway_sessions", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    // Session identification
    sessionToken: text("session_token").notNull().unique(),
    sessionKey: text("session_key"), // Maps to gateway session key pattern: agent:main:<conversationId>
    status: text("status").default("active"), // 'active' | 'idle' | 'disconnected'

    // Associated resources (for session binding)
    conversationId: uuid("conversation_id").references(() => conversations.id),
    channelAccountId: uuid("channel_account_id").references(() => channelAccounts.id),
    agentId: uuid("agent_id").references(() => agents.id),

    // Connection info
    connectedAt: timestamp("connected_at").defaultNow().notNull(),
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
    disconnectedAt: timestamp("disconnected_at"),
    clientInfo: jsonb("client_info").$type<{ userAgent: string; ip: string }>(),

    // Resource tracking
    activeChannels: text("active_channels").array(),
    memoryUsageMb: integer("memory_usage_mb"),

    // Session state snapshot/metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
    userSessionIdx: index("gateway_sessions_user_idx").on(table.userId),
    statusIdx: index("gateway_sessions_status_idx").on(table.status),
    sessionKeyIdx: index("gateway_sessions_key_idx").on(table.sessionKey),
}));

// Skills/Plugins Table - plugin definitions
export const skills = pgTable("skills", {
    id: uuid("id").defaultRandom().primaryKey(),

    // Skill identification
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    version: text("version").notNull(),

    // Metadata
    description: text("description"),
    author: text("author"),
    icon: text("icon"),
    iconUrl: text("icon_url"),
    category: text("category"), // 'productivity' | 'communication' | 'development' | 'utility'

    // Source
    sourceType: text("source_type").default("builtin").notNull(), // 'builtin' | 'marketplace' | 'custom'
    sourceUrl: text("source_url"),

    // Configuration schema
    configSchema: jsonb("config_schema"),
    toolDefinitions: jsonb("tool_definitions"),

    // Permissions required
    requiredPermissions: text("required_permissions").array(),
    permissions: text("permissions").array(),

    // Status
    isEnabled: boolean("is_enabled").default(true),
    isVerified: boolean("is_verified").default(false),
    isBuiltin: boolean("is_builtin").default(false),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User Skills Table - user-specific plugin configurations
export const userSkills = pgTable("user_skills", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),

    // User configuration
    config: jsonb("config"),
    isEnabled: boolean("is_enabled").default(true),

    // Usage stats
    usageCount: integer("usage_count").default(0),
    lastUsedAt: timestamp("last_used_at"),

    installedAt: timestamp("installed_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userSkillIdx: index("user_skills_user_idx").on(table.userId),
    skillIdx: index("user_skills_skill_idx").on(table.skillId),
    uniqueUserSkill: unique("unique_user_skill").on(table.userId, table.skillId),
}));

// Auto-Reply Action Config Type
export type AutoReplyActionConfig = {
    replyTemplate?: string;
    agentId?: string;
    skillSlug?: string;
    forwardTo?: string;
};

// Auto-Reply Rules Table - automated response rules
export const autoReplyRules = pgTable("auto_reply_rules", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channelAccountId: uuid("channel_account_id").references(() => channelAccounts.id, { onDelete: "cascade" }),

    // Rule definition
    name: text("name").notNull(),
    priority: integer("priority").default(0),
    isEnabled: boolean("is_enabled").default(true),

    // Trigger conditions
    triggerType: text("trigger_type").notNull(), // 'keyword' | 'regex' | 'sender' | 'time' | 'all'
    triggerPattern: text("trigger_pattern"),
    triggerConfig: jsonb("trigger_config"),

    // Action
    actionType: text("action_type").notNull(), // 'reply' | 'forward' | 'agent' | 'skill'
    actionConfig: jsonb("action_config").$type<AutoReplyActionConfig>(),

    // Limits
    maxTriggersPerHour: integer("max_triggers_per_hour"),
    cooldownSeconds: integer("cooldown_seconds"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userRulesIdx: index("auto_reply_rules_user_idx").on(table.userId),
    channelRulesIdx: index("auto_reply_rules_channel_idx").on(table.channelAccountId),
    priorityIdx: index("auto_reply_rules_priority_idx").on(table.priority),
}));

// Scheduled Tasks Table - automated AI tasks on a cron schedule
export const scheduledTasks = pgTable("scheduled_tasks", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channelAccountId: uuid("channel_account_id").references(() => channelAccounts.id, { onDelete: "cascade" }),

    // Task definition (legacy fields kept for backward compatibility)
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    cron: text("cron").notNull(),
    timezone: text("timezone"),

    // Model configuration - allows selecting any configured model
    modelId: text("model_id"), // e.g., "gpt-4o", "claude-sonnet-4-20250514", "ollama/llama3"

    // Enhanced scheduling (Phase H - Clawdbot compatible)
    schedule: jsonb("schedule").$type<CronSchedule>(), // New: structured schedule
    payload: jsonb("payload").$type<CronPayload>(),    // New: structured payload
    sessionTarget: text("session_target").default("isolated"), // "main" | "isolated"
    wakeMode: text("wake_mode").default("now"), // "now" | "lazy"
    isolation: jsonb("isolation").$type<{ maxTokens?: number; timeout?: number }>(),
    includeRecentMessages: integer("include_recent_messages").default(0),
    state: jsonb("state").$type<CronJobState>().default({}),

    // Status
    isEnabled: boolean("is_enabled").default(true),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
    lastError: text("last_error"),
    lastOutput: text("last_output"),
    runCount: integer("run_count").default(0),
    lockOwner: text("lock_owner"),
    lockExpiresAt: timestamp("lock_expires_at"),
    runningAt: timestamp("running_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    scheduledTasksUserIdx: index("scheduled_tasks_user_idx").on(table.userId),
    scheduledTasksChannelIdx: index("scheduled_tasks_channel_idx").on(table.channelAccountId),
    scheduledTasksNextRunIdx: index("scheduled_tasks_next_run_idx").on(table.nextRunAt),
}));

// Channel Runtime State Table - tracks bot persistence across server restarts
export const channelRuntimeState = pgTable("channel_runtime_state", {
    id: uuid("id").defaultRandom().primaryKey(),
    channelAccountId: uuid("channel_account_id")
        .notNull()
        .references(() => channelAccounts.id, { onDelete: "cascade" })
        .unique(),

    // Connection state
    running: boolean("running").default(false),
    connected: boolean("connected").default(false),

    // Timestamps
    lastStartAt: timestamp("last_start_at"),
    lastStopAt: timestamp("last_stop_at"),
    lastHeartbeatAt: timestamp("last_heartbeat_at"),
    lastMessageAt: timestamp("last_message_at"),

    // Error tracking
    lastError: text("last_error"),
    errorCount: integer("error_count").default(0),
    consecutiveErrors: integer("consecutive_errors").default(0),

    // Usage statistics
    messageCount: integer("message_count").default(0),
    totalTokensUsed: integer("total_tokens_used").default(0),
    totalCost: integer("total_cost_usd_cents_e6").default(0),  // Micro-cents

    // Process tracking (for multi-instance deployments)
    processId: text("process_id"),
    hostName: text("host_name"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    runningIdx: index("runtime_running_idx").on(table.running),
    channelAccountIdx: index("runtime_channel_account_idx").on(table.channelAccountId),
}));

// ============================================================================
// Clawdbot Integration: Relations
// ============================================================================

export const channelAccountsRelations = relations(channelAccounts, ({ one, many }) => ({
    user: one(users, {
        fields: [channelAccounts.userId],
        references: [users.id],
    }),
    messages: many(channelMessages),
    autoReplyRules: many(autoReplyRules),
    runtimeState: one(channelRuntimeState),
}));

export const channelMessagesRelations = relations(channelMessages, ({ one }) => ({
    channelAccount: one(channelAccounts, {
        fields: [channelMessages.channelAccountId],
        references: [channelAccounts.id],
    }),
    conversation: one(conversations, {
        fields: [channelMessages.conversationId],
        references: [conversations.id],
    }),
}));

export const gatewaySessionsRelations = relations(gatewaySessions, ({ one }) => ({
    user: one(users, {
        fields: [gatewaySessions.userId],
        references: [users.id],
    }),
}));

export const skillsRelations = relations(skills, ({ many }) => ({
    userSkills: many(userSkills),
}));

export const userSkillsRelations = relations(userSkills, ({ one }) => ({
    user: one(users, {
        fields: [userSkills.userId],
        references: [users.id],
    }),
    skill: one(skills, {
        fields: [userSkills.skillId],
        references: [skills.id],
    }),
}));

export const autoReplyRulesRelations = relations(autoReplyRules, ({ one }) => ({
    user: one(users, {
        fields: [autoReplyRules.userId],
        references: [users.id],
    }),
    channelAccount: one(channelAccounts, {
        fields: [autoReplyRules.channelAccountId],
        references: [channelAccounts.id],
    }),
}));

export const channelRuntimeStateRelations = relations(channelRuntimeState, ({ one }) => ({
    channelAccount: one(channelAccounts, {
        fields: [channelRuntimeState.channelAccountId],
        references: [channelAccounts.id],
    }),
}));

// ============================================================================
// Background Agent System (Phase G-L)
// ============================================================================

// Background Agent State Table - daemon state tracking
export const backgroundAgentState = pgTable("background_agent_state", {
    id: uuid("id").defaultRandom().primaryKey(),
    agentKey: text("agent_key").notNull().unique(), // "main", "cron", "event"
    status: text("status").default("stopped").notNull(), // 'running' | 'stopped' | 'error'
    lastHeartbeatAt: timestamp("last_heartbeat_at"),
    heartbeatIntervalMs: integer("heartbeat_interval_ms").default(30000),
    processId: text("process_id"),
    hostName: text("host_name"),
    startedAt: timestamp("started_at"),
    stoppedAt: timestamp("stopped_at"),
    lastError: text("last_error"),
    errorCount: integer("error_count").default(0),
    totalTasksRun: integer("total_tasks_run").default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    agentKeyIdx: index("background_agent_key_idx").on(table.agentKey),
    statusIdx: index("background_agent_status_idx").on(table.status),
}));

// Cron Schedule Types (Clawdbot-compatible)
export type CronSchedule =
    | { kind: "at"; atMs: number }                    // One-shot at specific time
    | { kind: "every"; everyMs: number }              // Interval-based
    | { kind: "cron"; expr: string; tz?: string };    // Cron expression with timezone

// Cron Payload Types (Clawdbot-compatible)
export type CronPayload =
    | { kind: "systemEvent"; text: string }                                                    // Inject into session
    | {
        kind: "agentTurn";
        message: string;
        deliver?: boolean;
        channel?: string;
        to?: string;
        executionMode?: "model" | "agent";
        agentId?: string | null;
    }; // Agent processes and optionally delivers

// Cron Job State
export type CronJobState = {
    lastOutput?: string;
    lastDurationMs?: number;
    consecutiveFailures?: number;
    customData?: Record<string, unknown>;
};

// Proactive Message Rate Limits Table - per-target rate limiting
export const proactiveMessageRateLimits = pgTable("proactive_message_rate_limits", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccounts.id, { onDelete: "cascade" }),
    targetId: text("target_id").notNull(), // Chat/user/group ID
    messagesThisHour: integer("messages_this_hour").default(0),
    messagesThisDay: integer("messages_this_day").default(0),
    lastMessageAt: timestamp("last_message_at"),
    hourResetAt: timestamp("hour_reset_at"),
    dayResetAt: timestamp("day_reset_at"),
    maxPerHour: integer("max_per_hour").default(10),
    maxPerDay: integer("max_per_day").default(100),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userTargetIdx: index("rate_limit_user_target_idx").on(table.userId, table.channelAccountId, table.targetId),
    uniqueTarget: unique("unique_rate_limit_target").on(table.userId, table.channelAccountId, table.targetId),
}));

// Event Trigger Source Config Type
export type EventTriggerSourceConfig = {
    webhookPath?: string;
    webhookSecret?: string;
    watchPath?: string;
    emailFilter?: { from?: string; subject?: string };
};

// Event Trigger Action Config Type
export type EventTriggerActionConfig = {
    message?: string;
    channel?: string;
    targetId?: string;
    skillSlug?: string;
    agentId?: string;
    notifyMethod?: 'message' | 'email';
    emailTo?: string;
    emailSubject?: string;
};

// Event Triggers Table - react to external events
export const eventTriggers = pgTable("event_triggers", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sourceType: text("source_type").notNull(), // 'webhook' | 'file_watch' | 'email' | 'schedule'
    sourceConfig: jsonb("source_config").$type<EventTriggerSourceConfig>(),
    actionType: text("action_type").notNull(), // 'agent_turn' | 'notify' | 'skill'
    actionConfig: jsonb("action_config").$type<EventTriggerActionConfig>(),
    isEnabled: boolean("is_enabled").default(true),
    maxTriggersPerHour: integer("max_triggers_per_hour").default(60),
    cooldownSeconds: integer("cooldown_seconds").default(0),
    lastTriggeredAt: timestamp("last_triggered_at"),
    triggerCount: integer("trigger_count").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userTriggersIdx: index("event_triggers_user_idx").on(table.userId),
    sourceTypeIdx: index("event_triggers_source_type_idx").on(table.sourceType),
    enabledIdx: index("event_triggers_enabled_idx").on(table.isEnabled),
}));

// Event Trigger Logs Table - execution history
export const eventTriggerLogs = pgTable("event_trigger_logs", {
    id: uuid("id").defaultRandom().primaryKey(),
    triggerId: uuid("trigger_id").notNull().references(() => eventTriggers.id, { onDelete: "cascade" }),
    eventPayload: jsonb("event_payload"),
    status: text("status").notNull(), // 'success' | 'error' | 'skipped' | 'rate_limited'
    error: text("error"),
    output: text("output"),
    durationMs: integer("duration_ms"),
    triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
}, (table) => ({
    triggerLogsIdx: index("event_trigger_logs_trigger_idx").on(table.triggerId),
    triggeredAtIdx: index("event_trigger_logs_triggered_at_idx").on(table.triggeredAt),
}));

// Boot Scripts Table - startup automation
export const bootScripts = pgTable("boot_scripts", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    content: text("content").notNull(), // Markdown instructions for the AI
    runOnChannelStart: boolean("run_on_channel_start").default(false),
    runOnServerStart: boolean("run_on_server_start").default(true),
    runOnSchedule: text("run_on_schedule"), // Optional cron expression
    isEnabled: boolean("is_enabled").default(true),
    priority: integer("priority").default(0), // Higher runs first
    lastRunAt: timestamp("last_run_at"),
    lastStatus: text("last_status"), // 'success' | 'skipped' | 'failed'
    lastError: text("last_error"),
    lastOutput: text("last_output"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    bootScriptsUserIdx: index("boot_scripts_user_idx").on(table.userId),
    bootScriptsEnabledIdx: index("boot_scripts_enabled_idx").on(table.isEnabled),
    bootScriptsPriorityIdx: index("boot_scripts_priority_idx").on(table.priority),
}));

// ============================================================================
// Background Agent Relations
// ============================================================================

export const proactiveMessageRateLimitsRelations = relations(proactiveMessageRateLimits, ({ one }) => ({
    user: one(users, {
        fields: [proactiveMessageRateLimits.userId],
        references: [users.id],
    }),
    channelAccount: one(channelAccounts, {
        fields: [proactiveMessageRateLimits.channelAccountId],
        references: [channelAccounts.id],
    }),
}));

export const eventTriggersRelations = relations(eventTriggers, ({ one, many }) => ({
    user: one(users, {
        fields: [eventTriggers.userId],
        references: [users.id],
    }),
    logs: many(eventTriggerLogs),
}));

export const eventTriggerLogsRelations = relations(eventTriggerLogs, ({ one }) => ({
    trigger: one(eventTriggers, {
        fields: [eventTriggerLogs.triggerId],
        references: [eventTriggers.id],
    }),
}));

export const bootScriptsRelations = relations(bootScripts, ({ one }) => ({
    user: one(users, {
        fields: [bootScripts.userId],
        references: [users.id],
    }),
}));

// ============================================================================
// Autonomous Task System
// ============================================================================

// Autonomous Task Status & Config Types
export type AutonomousTaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';

export type AutonomousTaskConfig = {
    toolsEnabled?: boolean;
    enabledTools?: string[];
    ragEnabled?: boolean;
    memoryEnabled?: boolean;
    agentId?: string;
    agentSystemPrompt?: string;
    temperature?: number;
};

// Session State for persistence (survives restarts)
export type SessionState = {
    isRunning?: boolean;
    lastStep?: number;
    checkpoint?: {
        messageHistoryHash?: string;  // Hash to detect if we can resume
        toolCallsPending?: Array<{ toolName: string; args: unknown }>;
        lastResponse?: string;
    };
    recoveredAt?: string;  // When session was recovered after restart
    resumeCount?: number;  // Number of times session has been resumed
};

// Cross-Task Message Types
export type TaskMessageType = 'message' | 'result' | 'request' | 'error' | 'status';
export type TaskMessageStatus = 'pending' | 'read' | 'processed';

// Autonomous Tasks Table - Claude Code/Gemini CLI-like continuous operation
export const autonomousTasks = pgTable("autonomous_tasks", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),

    taskKey: text("task_key").notNull().unique(),
    initialPrompt: text("initial_prompt").notNull(),

    status: text("status").default("pending").notNull().$type<AutonomousTaskStatus>(),
    currentStep: integer("current_step").default(0),
    maxSteps: integer("max_steps").default(50),

    progressSummary: text("progress_summary"),
    lastToolCall: jsonb("last_tool_call"),
    toolCallsCount: integer("tool_calls_count").default(0),

    modelId: text("model_id").notNull(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    timeoutMs: integer("timeout_ms").default(300000), // 5 min default
    config: jsonb("config").$type<AutonomousTaskConfig>().default({}),

    queuedMessages: jsonb("queued_messages").default([]),

    finalOutput: text("final_output"),
    errorMessage: text("error_message"),
    totalTokensUsed: integer("total_tokens_used").default(0),

    // Channel delivery fields (for autonomous mode via Telegram, Discord, etc.)
    channelAccountId: uuid("channel_account_id").references(() => channelAccounts.id, { onDelete: "set null" }),
    channelId: text("channel_id"),  // The specific channel/chat to deliver to
    channelThreadId: text("channel_thread_id"),  // Thread ID if applicable
    notifyOnProgress: boolean("notify_on_progress").default(true),
    progressInterval: integer("progress_interval").default(3),  // Steps between updates

    // Session persistence fields (Phase 5: Agent Continuation)
    parentTaskId: uuid("parent_task_id"),  // Self-referential FK for sub-tasks
    sessionState: jsonb("session_state").$type<SessionState>().default({}),
    spawnDepth: integer("spawn_depth").default(0),  // Limit nested sub-task depth

    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    lastActivityAt: timestamp("last_activity_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    userIdx: index("autonomous_tasks_user_idx").on(table.userId),
    statusIdx: index("autonomous_tasks_status_idx").on(table.status),
    taskKeyIdx: index("autonomous_tasks_task_key_idx").on(table.taskKey),
    channelAccountIdx: index("autonomous_tasks_channel_account_idx").on(table.channelAccountId),
    parentIdx: index("autonomous_tasks_parent_idx").on(table.parentTaskId),
}));

// Autonomous Tasks Relations
export const autonomousTasksRelations = relations(autonomousTasks, ({ one, many }) => ({
    user: one(users, {
        fields: [autonomousTasks.userId],
        references: [users.id],
    }),
    conversation: one(conversations, {
        fields: [autonomousTasks.conversationId],
        references: [conversations.id],
    }),
    agent: one(agents, {
        fields: [autonomousTasks.agentId],
        references: [agents.id],
    }),
    // Parent-child relationships for sub-task spawning
    parentTask: one(autonomousTasks, {
        fields: [autonomousTasks.parentTaskId],
        references: [autonomousTasks.id],
        relationName: "parentChild",
    }),
    childTasks: many(autonomousTasks, { relationName: "parentChild" }),
}));

// ============================================================================
// Cross-Task Messaging Table
// ============================================================================

export const taskMessages = pgTable("task_messages", {
    id: uuid("id").defaultRandom().primaryKey(),
    fromTaskKey: text("from_task_key").notNull(),
    toTaskKey: text("to_task_key").notNull(),
    messageType: text("message_type").default("message").notNull().$type<TaskMessageType>(),
    payload: jsonb("payload").notNull(),
    status: text("status").default("pending").notNull().$type<TaskMessageStatus>(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    toTaskIdx: index("task_messages_to_task_idx").on(table.toTaskKey, table.status),
    fromTaskIdx: index("task_messages_from_task_idx").on(table.fromTaskKey),
}));

// ============================================================================
// CRM: Contacts & Interactions
// ============================================================================

export const crmContacts = pgTable("crm_contacts", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    role: text("role"),
    avatarUrl: text("avatar_url"),
    relationship: text("relationship").default("colleague"), // colleague | client | prospect | friend | family
    importance: text("importance").default("normal"), // critical | high | normal | low
    tags: jsonb("tags").$type<string[]>().default([]),
    relationshipScore: integer("relationship_score").default(50), // 0-100
    lastContactAt: timestamp("last_contact_at"),
    contactFrequencyDays: integer("contact_frequency_days"),
    linkedinUrl: text("linkedin_url"),
    twitterHandle: text("twitter_handle"),
    notes: text("notes"),
    enrichmentData: jsonb("enrichment_data"),
    mergedIntoId: uuid("merged_into_id"),
    externalIds: jsonb("external_ids").$type<Record<string, string>>().default({}), // hubspot, gmail IDs
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index("crm_contacts_user_id_idx").on(table.userId),
    userEmailIdx: index("crm_contacts_user_email_idx").on(table.userId, table.email),
    userNameIdx: index("crm_contacts_user_name_idx").on(table.userId, table.name),
    userScoreIdx: index("crm_contacts_user_score_idx").on(table.userId, table.relationshipScore),
}));

export const crmInteractions = pgTable("crm_interactions", {
    id: uuid("id").defaultRandom().primaryKey(),
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull(), // email_sent | email_received | meeting | call | chat | note
    channel: text("channel"), // gmail | calendar | telegram | manual
    subject: text("subject"),
    summary: text("summary"),
    sentiment: text("sentiment"), // positive | neutral | negative
    externalId: text("external_id"),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    contactIdIdx: index("crm_interactions_contact_id_idx").on(table.contactId),
    userIdIdx: index("crm_interactions_user_id_idx").on(table.userId),
    typeIdx: index("crm_interactions_type_idx").on(table.type),
    occurredAtIdx: index("crm_interactions_occurred_at_idx").on(table.occurredAt),
}));

export const crmContactsRelations = relations(crmContacts, ({ one, many }) => ({
    user: one(users, {
        fields: [crmContacts.userId],
        references: [users.id],
    }),
    interactions: many(crmInteractions),
}));

export const crmInteractionsRelations = relations(crmInteractions, ({ one }) => ({
    contact: one(crmContacts, {
        fields: [crmInteractions.contactId],
        references: [crmContacts.id],
    }),
    user: one(users, {
        fields: [crmInteractions.userId],
        references: [users.id],
    }),
}));

// ============================================================================
// Google Integration: OAuth Credentials
// ============================================================================

export const googleCredentials = pgTable("google_credentials", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    email: text("email"),
    scope: text("scope").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const googleCredentialsRelations = relations(googleCredentials, ({ one }) => ({
    user: one(users, {
        fields: [googleCredentials.userId],
        references: [users.id],
    }),
}));

// ============================================================================
// HubSpot Integration: OAuth Credentials
// ============================================================================

export const hubspotCredentials = pgTable("hubspot_credentials", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    portalId: text("portal_id"),
    scope: text("scope").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const hubspotCredentialsRelations = relations(hubspotCredentials, ({ one }) => ({
    user: one(users, {
        fields: [hubspotCredentials.userId],
        references: [users.id],
    }),
}));

// ============================================================================
// Asana Integration: OAuth Credentials
// ============================================================================

export const asanaCredentials = pgTable("asana_credentials", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    workspaceId: text("workspace_id"),
    scope: text("scope").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const asanaCredentialsRelations = relations(asanaCredentials, ({ one }) => ({
    user: one(users, {
        fields: [asanaCredentials.userId],
        references: [users.id],
    }),
}));

// ============================================================================
// Workflows: Deterministic Pipeline System (Lobster-inspired)
// ============================================================================

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";
export type WorkflowRunStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface WorkflowDefinition {
    version?: string;
    steps: WorkflowStepDefinition[];
    trigger?: {
        type: "manual" | "schedule" | "event";
        config?: Record<string, unknown>;
    };
    variables?: Record<string, unknown>;
    input?: {
        required?: string[];
        optional?: string[];
        schema?: Record<string, unknown>;
    };
    output?: {
        type?: string;
        schema?: Record<string, unknown>;
    };
}

export interface WorkflowStepDefinition {
    id: string;
    name: string;
    type: "tool" | "llm" | "condition" | "approval" | "transform";
    tool?: string;
    action?: string;
    args?: Record<string, unknown>;
    prompt?: string;
    condition?: string;
    approval?: {
        required: boolean;
        prompt: string;
        timeout?: number;
        items?: unknown[];
    };
    transform?: {
        input: string;
        output: string;
        expression: string;
    };
    onSuccess?: string; // Next step ID
    onFailure?: string; // Step ID on failure
    continueOnError?: boolean;
}

export const workflows = pgTable("workflows", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    definition: jsonb("definition").$type<WorkflowDefinition>().notNull(),
    status: text("status").$type<WorkflowStatus>().default("draft").notNull(),
    isTemplate: boolean("is_template").default(false).notNull(),
    tags: jsonb("tags").$type<string[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userIdx: index("workflows_user_idx").on(table.userId),
    statusIdx: index("workflows_status_idx").on(table.status),
}));

export const workflowRuns = pgTable("workflow_runs", {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),

    status: text("status").$type<WorkflowRunStatus>().default("pending").notNull(),
    currentStepId: text("current_step_id"),
    stepResults: jsonb("step_results").$type<Record<string, unknown>>().default({}),

    // Approval state
    pendingApprovalStepId: text("pending_approval_step_id"),
    pendingApprovalPrompt: text("pending_approval_prompt"),
    pendingApprovalItems: jsonb("pending_approval_items"),
    resumeToken: text("resume_token").unique(),

    // Input/Output
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),

    // Timing
    startedAt: timestamp("started_at"),
    pausedAt: timestamp("paused_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    workflowIdx: index("workflow_runs_workflow_idx").on(table.workflowId),
    userIdx: index("workflow_runs_user_idx").on(table.userId),
    statusIdx: index("workflow_runs_status_idx").on(table.status),
    resumeTokenIdx: index("workflow_runs_resume_token_idx").on(table.resumeToken),
}));

export const workflowApprovals = pgTable("workflow_approvals", {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: "cascade" }).notNull(),
    stepId: text("step_id").notNull(),
    prompt: text("prompt").notNull(),
    items: jsonb("items"),
    approved: boolean("approved"), // null = pending
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    runIdx: index("workflow_approvals_run_idx").on(table.runId),
}));

// Workflow Relations
export const workflowsRelations = relations(workflows, ({ one, many }) => ({
    user: one(users, {
        fields: [workflows.userId],
        references: [users.id],
    }),
    runs: many(workflowRuns),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one, many }) => ({
    workflow: one(workflows, {
        fields: [workflowRuns.workflowId],
        references: [workflows.id],
    }),
    user: one(users, {
        fields: [workflowRuns.userId],
        references: [users.id],
    }),
    approvals: many(workflowApprovals),
}));

export const workflowApprovalsRelations = relations(workflowApprovals, ({ one }) => ({
    run: one(workflowRuns, {
        fields: [workflowApprovals.runId],
        references: [workflowRuns.id],
    }),
    approver: one(users, {
        fields: [workflowApprovals.approvedBy],
        references: [users.id],
    }),
}));

// ============================================================================
// Tool Execution Logs (Audit Trail)
// ============================================================================

export const toolExecutionLogs = pgTable("tool_execution_logs", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    toolId: text("tool_id").notNull(),
    toolName: text("tool_name").notNull(),
    action: text("action"), // sub-action within tool (e.g., "search", "create")
    params: jsonb("params"), // sanitized input params (sensitive values redacted)
    result: text("result").$type<"success" | "error" | "denied">().notNull(),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata"), // additional context
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    userIdx: index("tool_exec_logs_user_idx").on(table.userId),
    toolIdx: index("tool_exec_logs_tool_idx").on(table.toolId),
    createdIdx: index("tool_exec_logs_created_idx").on(table.createdAt),
}));

// ============================================================================
// Notifications (In-App Notification Center)
// ============================================================================

export const notifications = pgTable("notifications", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull(), // 'task_complete' | 'channel_message' | 'system' | 'alert' | 'proactive'
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"), // optional link to navigate to
    icon: text("icon"), // lucide icon name
    isRead: boolean("is_read").default(false).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    userIdx: index("notifications_user_idx").on(table.userId),
    unreadIdx: index("notifications_unread_idx").on(table.userId, table.isRead),
}));

// ============================================================================
// User Onboarding Progress
// ============================================================================

export const userOnboarding = pgTable("user_onboarding", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
    completedSteps: jsonb("completed_steps").$type<string[]>().default([]),
    currentStep: text("current_step").default("welcome"),
    isComplete: boolean("is_complete").default(false).notNull(),
    skippedAt: timestamp("skipped_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Tool Permissions (Granular Per-User Tool Access)
// ============================================================================

export const toolPermissions = pgTable("tool_permissions", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    toolId: text("tool_id").notNull(),
    isAllowed: boolean("is_allowed").default(true).notNull(),
    maxCallsPerHour: integer("max_calls_per_hour"),
    maxCallsPerDay: integer("max_calls_per_day"),
    grantedBy: uuid("granted_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    userToolIdx: unique("unique_user_tool_perm").on(table.userId, table.toolId),
}));

// ============================================================================
// Model Failover Configuration
// ============================================================================

export const modelFailoverConfig = pgTable("model_failover_config", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    primaryModel: text("primary_model").notNull(),
    fallbackModels: jsonb("fallback_models").$type<string[]>().default([]),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    maxRetries: integer("max_retries").default(2),
    retryDelayMs: integer("retry_delay_ms").default(1000),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Proactive Intelligence Templates
// ============================================================================

export const proactiveTemplates = pgTable("proactive_templates", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(), // 'briefing' | 'alert' | 'digest' | 'monitor'
    icon: text("icon"), // lucide icon name
    defaultPrompt: text("default_prompt").notNull(),
    defaultCron: text("default_cron").notNull(),
    defaultTimezone: text("default_timezone").default("UTC"),
    requiredTools: jsonb("required_tools").$type<string[]>().default([]),
    requiredIntegrations: jsonb("required_integrations").$type<string[]>().default([]),
    configSchema: jsonb("config_schema"), // zod-like schema for template variables
    isBuiltin: boolean("is_builtin").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
