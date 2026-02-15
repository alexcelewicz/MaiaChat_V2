# MaiaChat

A production-grade, multi-provider AI chat platform with multi-channel support (Telegram, Slack, Discord), tool execution, RAG document search, voice conversation, persistent memory, multi-agent orchestration, and comprehensive admin controls.

Built with Next.js 15, TypeScript, PostgreSQL, and Redis.

## Table of Contents

- [Features Overview](#features-overview)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Configuration System](#configuration-system)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Docker Deployment](#docker-deployment)
- [Admin Setup](#admin-setup)
- [AI Models & Providers](#ai-models--providers)
- [Chat Interface](#chat-interface)
- [Channels (Telegram, Slack, Discord)](#channels)
- [Telegram Commands Reference](#telegram-commands-reference)
- [Integrations (Gmail, Calendar)](#integrations)
- [Workflows](#workflows)
- [CLI Tools (Claude Code, Gemini)](#cli-tools)
- [Tools](#tools)
- [Skills & Plugins](#skills--plugins)
- [Agents](#agents)
- [Multi-Agent Orchestration](#multi-agent-orchestration)
- [RAG (Document Search)](#rag-document-search)
- [Gemini File Search](#gemini-file-search)
- [Memory System](#memory-system)
- [Voice & Audio](#voice--audio)
- [Scheduled Tasks](#scheduled-tasks)
- [Conversation Management](#conversation-management)
- [Cost Tracking](#cost-tracking)
- [Security](#security)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Development](#development)
- [License](#license)

---

## Features Overview

| Category | Features |
|---|---|
| **AI Models** | 40+ models from 8 providers (OpenAI, Anthropic, Google, xAI, OpenRouter, Deepgram, Ollama, LM Studio) |
| **Channels** | Telegram, Slack, Discord, WebChat with full feature parity |
| **Integrations** | Google OAuth (Gmail, Calendar) with email reading/sending from chat |
| **Workflows** | Deterministic pipelines with approval gates, resumable tokens, step types |
| **CLI Tools** | Claude Code and Gemini CLI integration for coding tasks |
| **Tools** | 14 built-in tools: file system, shell execution, web search, image generation, email, and more |
| **Skills** | 6 built-in plugins: browser automation, calculator, datetime, STT, TTS, web search |
| **RAG** | Document upload, chunking, pgvector semantic search, hybrid retrieval |
| **Gemini** | Google Gemini File Search Stores for persistent document retrieval |
| **Memory** | Auto-save conversations to Gemini memory stores, semantic retrieval in context |
| **Agents** | Custom agents with system prompts, model selection, and tool assignment |
| **Multi-Agent** | Sequential, parallel, consensus, and hierarchical orchestration modes |
| **Voice** | Deepgram-powered speech-to-text and text-to-speech with 12 voices |
| **Admin** | User management, IP blocking, file/shell access controls, feature flags |
| **Conversations** | Folders, tags, favorites, search, export (MD/JSON/PDF), sharing |
| **Cost Tracking** | Per-message token counting and cost calculation by model |
| **Scheduling** | Cron-based scheduled tasks with timezone support |
| **Configuration** | Unified JSON config system with import/export and runtime validation |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/alexcelewicz/MaiaChat_V2.git
cd maiachat_v2/maiachat-v2

# Install dependencies
npm install

# Start PostgreSQL and Redis (Docker)
docker-compose up -d postgres redis

# Set up environment
cp .env.example .env.local
# Edit .env.local with your configuration (see Environment Variables below)

# Run database migrations
npm run db:push

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Installation

### Prerequisites

- **Node.js** 18+ (20+ recommended)
- **PostgreSQL** 15+ with the `pgvector` extension
- **Redis** 7+
- **Firebase project** (for authentication) or set `DEV_BYPASS_AUTH=true` for local development

### Step-by-Step

1. **Clone and install:**

```bash
git clone https://github.com/alexcelewicz/MaiaChat_V2.git
cd maiachat_v2/maiachat-v2
npm install
```

2. **Set up PostgreSQL with pgvector:**

```sql
-- Connect to your PostgreSQL instance
CREATE DATABASE maiachat;
\c maiachat
CREATE EXTENSION IF NOT EXISTS vector;
```

3. **Configure environment variables** (see [Environment Variables](#environment-variables))

4. **Run database migrations:**

```bash
npm run db:push
```

5. **Start the app:**

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

---

## Environment Variables

Create a `.env.local` file in the `maiachat-v2` directory:

```env
# === REQUIRED ===

# PostgreSQL with pgvector
DATABASE_URL="postgresql://user:password@localhost:5432/maiachat"

# Redis (session management, rate limiting)
REDIS_URL="redis://localhost:6379"

# Encryption key for API key storage (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY="your-64-char-hex-string"

# === AUTHENTICATION ===

# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=""
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
NEXT_PUBLIC_FIREBASE_APP_ID=""

# Firebase Admin SDK
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""

# Admin users (comma-separated emails that are auto-promoted to admin)
ADMIN_EMAILS="admin@example.com"

# Skip Firebase auth for local development (creates a dev user automatically)
# DEV_BYPASS_AUTH=true

# === APPLICATION ===

NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# === OPTIONAL: S3/MinIO (document storage) ===

S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY=""
S3_SECRET_KEY=""
S3_BUCKET="maiachat-documents"

# === OPTIONAL: AI Provider fallback keys (users add their own in Settings) ===

OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
GOOGLE_GENERATIVE_AI_API_KEY=""
XAI_API_KEY=""
OPENROUTER_API_KEY=""
DEEPGRAM_API_KEY=""

# === OPTIONAL: Full local access mode (enables all file/shell tools) ===
# MAIACHAT_LOCAL_MODE=true
```

---

## Configuration System

MaiaChat uses a unified JSON configuration system for managing application settings. Configuration can be set via:

1. **File**: `config/default.json` - Default values
2. **Database**: Admin settings stored in the database
3. **Environment Variables**: Override any setting

### Configuration File

The main configuration file is located at `config/default.json`:

```json
{
  "version": "1.0.0",

  "taskExecution": {
    "maxAttempts": 3,
    "completionTimeout": 60000,
    "requireToolCallForScheduled": true
  },

  "cli": {
    "enabled": false,
    "defaultCli": "claude",
    "skipPermissions": true,
    "workspaceRoot": "./workspace"
  },

  "tools": {
    "localFileAccessEnabled": false,
    "commandExecutionEnabled": false,
    "fileAccessBaseDir": null
  },

  "memory": {
    "autoSave": true,
    "ragEnabled": true,
    "userProfileMemoryEnabled": true,
    "autoRecallEnabled": true,
    "autoCaptureEnabled": true
  },

  "integrations": {
    "google": {
      "enabled": false,
      "scopes": ["gmail.readonly", "gmail.send", "calendar.readonly"]
    }
  },

  "agents": {
    "backgroundAgentEnabled": false,
    "proactiveMessagingEnabled": false
  }
}
```

### Enabling Features

To enable features like Google integration:

1. **Edit the config file** directly: Set `integrations.google.enabled: true`
2. **Or use Admin Settings**: Navigate to `/admin/settings` → Configuration

### Import/Export

Configuration can be exported and imported via the Admin Settings page, allowing you to:
- Backup your configuration
- Transfer settings between environments
- Version control your configuration

---

## Database Setup

MaiaChat uses PostgreSQL with the pgvector extension for vector similarity search.

```bash
# Run migrations (creates all tables)
npm run db:push

# Generate migration files (after schema changes)
npm run db:generate

# Open Drizzle Studio (database browser)
npm run db:studio
```

### Key Tables

| Table | Purpose |
|---|---|
| `users` | User accounts with Firebase UID mapping |
| `conversations` | Chat conversations with metadata |
| `messages` | Individual messages (user + assistant) |
| `agents` | Custom AI agent configurations |
| `documents` | Uploaded documents for RAG |
| `document_chunks` | Chunked text with pgvector embeddings |
| `api_keys` | AES-256-GCM encrypted per-user API keys |
| `channel_accounts` | Channel configurations (Telegram, Slack, etc.) |
| `channel_messages` | Channel message tracking |
| `gemini_stores` | Gemini File Search store metadata |
| `usage_records` | Token usage and cost tracking |
| `scheduled_tasks` | Cron-based scheduled tasks |
| `auto_reply_rules` | Channel auto-reply rules |
| `admin_settings` | System-wide admin configuration |

---

## Running the Application

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build
npm start

# Linting
npm run lint
```

---

## Docker Deployment

### Development

```bash
# Start all services (PostgreSQL, Redis, MinIO)
docker-compose up -d

# Start only infrastructure (app runs locally)
docker-compose up -d postgres redis minio
npm run dev
```

### Production

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | pgvector/pgvector:pg16 | 5432 | Database with vector search |
| `redis` | redis:7-alpine | 6379 | Sessions, rate limiting, caching |
| `minio` | minio/minio | 9000/9001 | S3-compatible document storage |
| `app` | Custom Dockerfile | 3000 | Next.js application |

---

## Admin Setup

### First-Time Setup

1. Set `ADMIN_EMAILS` in `.env.local` to your email address
2. Register/login with that email — you'll be auto-promoted to admin
3. Navigate to `/admin` to access the admin dashboard

### Admin Settings

Access via **Settings > Admin Settings** or navigate to `/admin/settings`:

| Setting | Description | Default |
|---|---|---|
| **Auto-Start Channels** | Boot channel connectors on server startup | Off |
| **IP Filtering** | Block specific IP addresses | Off |
| **Visitor Retention** | Data retention period in days | 30 |
| **Local File Access** | Allow AI to read/write files on the server | Off |
| **Command Execution** | Allow AI to run shell commands | Off |
| **File Access Base Dir** | Restrict file operations to a specific directory | None (unrestricted) |

### Admin Features

- **User Management** — View all users, promote/demote admins, delete accounts
- **IP Blocking** — Block specific IPs or ranges
- **Activity Logs** — Audit trail of user actions
- **Page Visit Tracking** — Analytics with geo-location
- **Feature Flags** — Toggle features per user or globally

---

## AI Models & Providers

Users add their own API keys in **Settings > API Keys**. Each user's keys are encrypted with AES-256-GCM.

### Supported Providers

| Provider | Models | Key Features |
|---|---|---|
| **OpenAI** | GPT-4o, GPT-4o Mini, o1, o1-mini, o3-mini | Tools, vision, JSON mode |
| **Anthropic** | Claude Opus 4, Claude Sonnet 4, Claude 3.5 Sonnet/Haiku | Extended thinking, vision, tools |
| **Google** | Gemini 2.5 Pro/Flash, 2.0 Flash, 1.5 Pro/Flash | Vision, grounding, long context |
| **xAI** | Grok 3, Grok 3 Fast, Grok 2, Grok 2 Vision | Vision, reasoning |
| **OpenRouter** | 100+ models (Llama, DeepSeek, Mistral, etc.) | Multi-provider gateway |
| **Ollama** | Llama 3.3, Qwen 2.5, DeepSeek R1, Mistral | Local, free, private |
| **LM Studio** | Any GGUF model | Local, free, private |
| **Deepgram** | Aura voices | Speech-to-text, text-to-speech |

---

## Chat Interface

The web chat interface at `/chat` provides:

- **Model selector** — Switch between any supported model mid-conversation
- **Temperature control** — Adjust creativity (0 = deterministic, 2 = creative)
- **Max tokens** — Limit response length
- **Extended thinking** — Anthropic thinking budget (1024-100000 tokens)
- **Toggle panels** — Enable/disable RAG, Gemini search, tools, skills, memory per conversation
- **Voice input** — Record and transcribe audio
- **Image upload** — Attach images for vision-capable models
- **Agent selection** — Apply a custom agent with its own system prompt and model

---

## Channels

MaiaChat supports multi-channel AI communication with full feature parity.

### Setting Up Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) on Telegram
2. Copy the bot token
3. In MaiaChat, go to **Channels** and click **Add Channel > Telegram**
4. Paste the bot token and configure settings
5. Click **Connect** — the bot starts polling for messages

### Setting Up Slack

1. Create a Slack App at [api.slack.com](https://api.slack.com/apps)
2. Configure OAuth scopes: `chat:write`, `channels:history`, `im:history`
3. Set the OAuth redirect URL to `https://yourdomain.com/api/channels/callback/slack`
4. In MaiaChat, go to **Channels > Add Channel > Slack** and enter your Client ID/Secret
5. Complete the OAuth flow

### Setting Up Discord

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a bot and copy the token
3. In MaiaChat, go to **Channels > Add Channel > Discord** and enter the bot token
4. Invite the bot to your server

### Channel Settings

Each channel has a dedicated settings panel with:

| Section | Options |
|---|---|
| **AI Model** | Model selection, temperature, max tokens |
| **Agent** | Single agent or default assistant |
| **Multi Agent** | Enable orchestration with multiple agents |
| **Document Search (RAG)** | Toggle RAG, select documents |
| **Gemini File Search** | Toggle Gemini stores |
| **Tools** | Cloud tools (toggleable) + local tools (admin-controlled) |
| **Skills** | Enable/disable plugins |
| **Memory** | Auto-save conversations to Gemini memory |
| **Voice & Media** | TTS, vision settings |

---

## Telegram Commands Reference

All commands are available by typing in the Telegram chat with your bot:

### Configuration Commands

| Command | Description | Example |
|---|---|---|
| `/help` | Show all available commands | `/help` |
| `/status` | Show current configuration | `/status` |
| `/model <id>` | Set the AI model | `/model gpt-4o` |
| `/models` | List available model providers | `/models` |
| `/temp <0-2>` | Set temperature | `/temp 0.7` |
| `/reset` | Reset all settings to defaults | `/reset` |
| `/newchat` | Clear conversation history | `/newchat` |

### Feature Toggles

| Command | Description | Example |
|---|---|---|
| `/tools on\|off` | Enable/disable tool execution | `/tools on` |
| `/memory on\|off` | Enable/disable memory auto-save | `/memory on` |
| `/rag on\|off` | Enable/disable document search | `/rag on` |
| `/ragdocs [ids]` | Select specific documents for RAG | `/ragdocs doc1,doc2` |
| `/gemini on\|off` | Enable/disable Gemini File Search | `/gemini on` |
| `/vision on\|off` | Enable/disable image processing | `/vision on` |
| `/tts on\|off` | Enable/disable voice responses | `/tts on` |

### Agent Commands

| Command | Description | Example |
|---|---|---|
| `/agent <id>` | Set active agent | `/agent my-coder` |
| `/agents` | List your agents | `/agents` |
| `/multiagent on\|off [mode]` | Multi-agent mode (sequential/parallel/consensus) | `/multiagent on consensus` |
| `/multiagent set <a1> <a2>` | Configure agents for multi-agent | `/multiagent set coder analyst` |
| `/multiagent rounds <n>` | Set max consensus rounds | `/multiagent rounds 3` |

---

## Integrations

Connect external services to enhance your AI assistant's capabilities.

### Google Integration (Gmail & Calendar)

MaiaChat integrates with Google services using OAuth 2.0 with PKCE for secure authentication.

#### Setup

1. **Create OAuth Credentials** in [Google Cloud Console](https://console.cloud.google.com/):
   - Go to APIs & Services → Credentials
   - Create OAuth 2.0 Client ID (Web application)
   - Add authorized redirect URI: `https://yourdomain.com/api/integrations/google/callback`

2. **Set Environment Variables**:
   ```env
   GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
   ```

3. **Enable in Configuration**:
   - Edit `config/default.json` and set `integrations.google.enabled: true`
   - Or update via Admin Settings → Configuration

4. **Connect Your Account**:
   - Go to Settings → Integrations
   - Click "Connect Google Account"
   - Authorize the requested permissions

#### Features

| Feature | Description |
|---|---|
| **Read Email** | Search and read Gmail messages |
| **Send Email** | Compose and send emails |
| **Draft Management** | Create and send drafts |
| **Reply to Threads** | Reply within email threads |
| **Archive/Trash** | Organize emails |
| **Calendar View** | View calendar events (read-only) |

#### Email Tool Commands

The AI can use the `email` tool with these actions:
- `search` — Search emails with Gmail query syntax
- `read` — Read a specific email
- `send` — Send an email
- `draft` — Create a draft
- `reply` — Reply to a thread
- `archive` / `trash` — Organize emails

### Security

- OAuth 2.0 with PKCE (Proof Key for Code Exchange)
- Tokens encrypted at rest
- Automatic token refresh
- Revoke access anytime from Settings or [Google Account](https://myaccount.google.com/permissions)

---

## Workflows

Create automated pipelines with approval gates for complex, multi-step tasks.

### Overview

Workflows are deterministic pipelines that execute steps in sequence. Key features:

- **Step Types**: Tool execution, LLM prompts, conditions, approvals, data transforms
- **Approval Gates**: Pause execution until human approval
- **Resumable Tokens**: Secure tokens to resume paused workflows
- **Variable Interpolation**: Pass data between steps with `$input`, `$stepId` patterns

### Creating a Workflow

1. Go to Settings → Workflows
2. Click "New Workflow" or choose a template
3. Add steps using the visual editor
4. Configure triggers (manual, scheduled, or event-based)
5. Save and activate

### Step Types

| Type | Description | Example Use |
|---|---|---|
| **Tool** | Execute a tool action | Search emails, fetch URL |
| **LLM** | Generate AI response | Summarize content, categorize |
| **Condition** | Branch based on logic | `$input.count > 5` |
| **Approval** | Wait for human approval | Confirm before sending |
| **Transform** | Transform data | Extract fields, format output |

### Built-in Templates

| Template | Description |
|---|---|
| **Email Triage** | Fetch, categorize, and summarize new emails |
| **Daily Summary** | Compile daily activity summaries |
| **Web Research** | Search web and compile findings |

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/workflows` | GET | List all workflows |
| `/api/workflows` | POST | Create a workflow |
| `/api/workflows/[id]` | PUT | Update a workflow |
| `/api/workflows/[id]/run` | POST | Execute a workflow |
| `/api/workflows/resume` | POST | Resume a paused workflow |

---

## CLI Tools

Integrate with AI-powered coding CLIs like Claude Code and Gemini CLI.

### Overview

MaiaChat can delegate coding tasks to external AI coding tools:

| CLI | Description |
|---|---|
| **Claude Code** | Anthropic's CLI for code generation and editing |
| **Gemini CLI** | Google's CLI for coding assistance |

### Setup

1. **Install the CLI**:
   ```bash
   # Claude Code
   npm install -g @anthropic-ai/claude-code

   # Gemini CLI
   npm install -g @google/gemini-cli
   ```

2. **Enable in Configuration**:
   ```json
   {
     "cli": {
       "enabled": true,
       "defaultCli": "claude",
       "workspaceRoot": "./workspace"
     }
   }
   ```

3. **Enable Command Execution** in Admin Settings (required for CLI execution)

### Features

| Feature | Description |
|---|---|
| **Task Delegation** | AI can invoke coding CLIs for complex tasks |
| **Interactive Bridge** | Handle CLI questions automatically or escalate to user |
| **Workspace Organization** | Files organized by date and task |
| **Permission Handling** | Skip permission prompts for autonomous operation |

### Security

- CLI execution requires **Command Execution** enabled in admin settings
- Files are isolated in the configured workspace directory
- All CLI invocations are logged

---

## Tools

MaiaChat includes 14 built-in tools that the AI can call during conversations.

### Cloud Tools (always available when tools are enabled)

| Tool | Description |
|---|---|
| `web_search` | Search the internet using DuckDuckGo/Brave |
| `calculator` | Evaluate mathematical expressions |
| `url_fetch` | Fetch and parse web page content |
| `rag_search` | Search your uploaded documents |
| `json_processor` | Parse and transform JSON data |
| `image_gen` | Generate images using DALL-E |

### File System Tools (requires Local File Access in admin settings)

| Tool | Description |
|---|---|
| `file_read` | Read file contents |
| `file_write` | Create or modify files |
| `file_list` | List directory contents |
| `file_search` | Search for text within files |
| `file_delete` | Delete files or directories |
| `file_move` | Move or rename files |

### System Tools (requires Command Execution in admin settings)

| Tool | Description |
|---|---|
| `shell_exec` | Execute shell commands (bash, PowerShell, cmd) |

### Security

File system and shell tools are gated by admin settings. Additionally:
- **Blocked file patterns**: `.env`, `.pem`, `.key`, `id_rsa`, `credentials.json`, `shadow`, `passwd`
- **Blocked commands**: `mkfs`, `fdisk`, `dd`, `format`, `nmap`, `hydra`, `sqlmap`, `passwd`, `visudo`
- **Blocked patterns**: `rm -rf /`, fork bombs, `chmod 777 /`, piping curl to shell
- **Base directory**: Optionally restrict all file operations to a specific directory

---

## Skills & Plugins

Skills extend the AI's capabilities with specialized tools.

### Built-in Plugins

| Plugin | Tools | Description |
|---|---|---|
| **Browser** | open, navigate, screenshot, click, type, extract, close | Web browsing and automation |
| **Calculator** | calculate, convert | Math computation and unit conversion |
| **DateTime** | current_time, convert_timezone, date_difference, add_time | Date/time utilities |
| **STT** | transcribe | Speech-to-text transcription |
| **TTS** | speak | Text-to-speech generation |
| **Web Search** | search | Enhanced web search with caching |

### Enabling Skills

- **Web chat**: Toggle "Skills" in the chat options panel
- **Channels**: Use `/skills on` or enable in channel settings

---

## Agents

Agents are custom AI personas with their own system prompts, models, and tool configurations.

### Creating an Agent

1. Go to **Agents** in the sidebar
2. Click **Create Agent**
3. Configure:
   - **Name** and description
   - **System prompt** — Custom instructions (up to 10,000 characters)
   - **Model** — Any supported model from any provider
   - **Temperature** — Per-agent creativity control
   - **Max tokens** — Per-agent output limit
   - **Role** — assistant, coder, analyst, writer, researcher, coordinator, reviewer, or custom
   - **Tools** — Select which tools this agent can use
   - **Extended thinking** — Anthropic thinking budget

### Built-in Agent Presets

| Preset | Role | Description |
|---|---|---|
| General Assistant | assistant | Helpful general-purpose AI |
| Coder | coder | Code generation and debugging |
| Data Analyst | analyst | Data analysis and insights |
| Creative Writer | writer | Creative content generation |
| Researcher | researcher | Deep research and fact-checking |
| System Admin | coordinator | System administration tasks |
| Coordinator | coordinator | Multi-agent task coordination |

### Using Agents

- **Web chat**: Select an agent from the agent dropdown
- **Channels**: Use `/agent <name>` or configure in channel settings

---

## Multi-Agent Orchestration

Run multiple agents on a single conversation for complex tasks.

### Orchestration Modes

| Mode | How It Works |
|---|---|
| **Sequential** | Agents respond in order, each seeing prior agents' responses |
| **Parallel** | All agents respond simultaneously, responses are synthesized |
| **Consensus** | Multi-round discussion between agents to reach agreement |
| **Hierarchical** | A coordinator agent delegates subtasks to specialist agents |
| **Auto** | System selects the optimal mode based on the task |

### Setup

1. Create two or more agents
2. In a conversation or channel, enable multi-agent mode
3. Select agents and orchestration mode
4. Send a message — all selected agents collaborate on the response

### Channel Commands

```
/multiagent on sequential    # Enable sequential mode
/multiagent on consensus     # Enable consensus mode
/multiagent set coder analyst  # Assign specific agents
/multiagent rounds 5         # Max consensus rounds
/multiagent off              # Disable
```

---

## RAG (Document Search)

Upload documents and let the AI search them during conversations.

### Supported Formats

PDF, DOCX, XLSX, CSV, JSON, TXT, Markdown

### How It Works

1. **Upload** — Go to **Documents** and upload files
2. **Processing** — Documents are chunked and embedded using OpenAI embeddings (1536 dimensions)
3. **Storage** — Chunks are stored in PostgreSQL with pgvector HNSW indexing
4. **Retrieval** — When RAG is enabled, the AI automatically searches your documents for relevant context
5. **Citation** — Sources are cited in responses with `[Source N]` format

### Retrieval Methods

| Method | Description |
|---|---|
| **Semantic** | Vector similarity search using cosine distance |
| **Full-text** | PostgreSQL tsvector search with English stemming |
| **Hybrid** | Reciprocal Rank Fusion combining both methods |

### Configuration

- **Top-K**: Number of chunks to retrieve (default: 5, max: 20)
- **Threshold**: Minimum similarity score (0-1, default: 0.7)
- **Document filter**: Search all documents or select specific ones

---

## Gemini File Search

Use Google's Gemini File Search Stores for persistent, cloud-based document retrieval.

### Setup

1. Add a **Google API key** in Settings
2. Go to **Gemini Stores** and create a store
3. Upload documents to the store
4. Enable Gemini File Search in conversations or channels

### Features

- **Persistent stores** — Documents don't expire (unlike the 48h File API)
- **Multiple stores** — Organize documents into topic-based collections
- **Dual retrieval** — Use RAG + Gemini together (`retrievalMode: "both"`)
- **Auto-sync** — Sync documents from MaiaChat to Gemini stores

---

## Memory System

Automatically save and retrieve past conversation context.

### How It Works

1. **Enable memory** — Toggle in chat options or use `/memory on` in channels
2. **Auto-save** — After 4+ messages, conversations are summarized and saved to a Gemini File Search store
3. **Retrieval** — When memory is enabled, relevant past conversations are injected as context
4. **Per-user isolation** — Each user gets their own memory store

### Requirements

- A **Google API key** (for Gemini File Search Stores)
- Memory toggle enabled in the conversation or channel

---

## Voice & Audio

### Speech-to-Text (STT)

- **Provider**: Deepgram (real-time streaming transcription)
- **Usage**: Click the microphone icon in the chat input
- **Voice Activity Detection**: Automatic silence detection with configurable thresholds
- **Channel support**: Send voice messages in Telegram — they're automatically transcribed

### Text-to-Speech (TTS)

- **Provider**: Deepgram Aura
- **12 voices available**:
  - Female: Asteria, Luna, Stella, Athena, Hera
  - Male: Orion, Arcas, Perseus, Angus, Orpheus, Helios, Zeus
- **Usage**: Enable TTS in chat settings or use `/tts on` in channels

### Requirements

- A **Deepgram API key** added in Settings

---

## Scheduled Tasks

Set up recurring tasks with cron expressions.

### Features

- **Cron syntax** — Full cron expression support (e.g., `0 9 * * MON` for every Monday at 9 AM)
- **Timezone aware** — Execute in the user's timezone
- **Task types** — Channel messages, memory consolidation, data exports, custom actions
- **Management** — Create, update, delete, enable/disable tasks
- **Execution tracking** — Last run, next run, status, error logging

---

## Conversation Management

### Organization

| Feature | Description |
|---|---|
| **Folders** | Nested folder structure for conversations |
| **Tags** | Multi-tag system for flexible categorization |
| **Favorites** | Star important conversations |
| **Search** | Full-text search across all conversations |
| **Profiles** | Group conversations by context (Work, Personal, Project) |

### Export Formats

| Format | Description |
|---|---|
| **Markdown** | Clean `.md` export with formatting |
| **JSON** | Full structured data export |
| **PDF** | Formatted PDF with syntax highlighting |
| **Code** | `.zip` with code blocks extracted as files |

### Sharing

Generate public links to share conversations. Control view/edit access with token-based permissions.

---

## Cost Tracking

MaiaChat tracks token usage and costs for every message.

- **Per-message tracking** — Input/output tokens counted separately
- **Model-specific pricing** — Accurate costs per model and provider
- **Usage dashboard** — Visual breakdown by model, provider, and time period
- **Micro-cent precision** — Costs stored in micro-cents for accuracy

---

## Security

### Authentication

- **Firebase Authentication** with email/password and OAuth providers
- **Session management** — Redis-backed sessions with 5-day expiry
- **HTTP-only secure cookies** — Session tokens stored securely
- **Admin role system** — Email-based auto-promotion or manual role assignment

### Data Protection

- **API key encryption** — AES-256-GCM with random IV per key
- **Per-user data isolation** — All data scoped by userId foreign keys
- **Rate limiting** — Redis-based rate limits on all endpoints
- **IP blocking** — Admin-configurable IP filtering
- **CSRF protection** — On all mutation endpoints

### Tool Security

- **File operations** — Blocked patterns for sensitive files (.env, .pem, .key, credentials, SSH keys)
- **Shell commands** — Blocklist for destructive commands (mkfs, fdisk, dd, format, nmap, etc.)
- **Directory sandboxing** — Optional base directory restriction for all file operations
- **Admin gating** — File access and command execution require explicit admin enablement

---

## Architecture

```
maiachat-v2/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Login, register pages
│   │   ├── (dashboard)/        # Settings, documents, agents
│   │   ├── admin/              # Admin dashboard
│   │   ├── api/                # ~70 API routes
│   │   │   ├── auth/           # Login, logout, session
│   │   │   ├── chat/           # Chat + multi-agent endpoints
│   │   │   ├── channels/       # Channel management
│   │   │   ├── agents/         # Agent CRUD
│   │   │   ├── documents/      # Document upload + processing
│   │   │   ├── memory/         # Memory save/retrieve
│   │   │   ├── gemini/         # Gemini stores management
│   │   │   ├── audio/          # Deepgram STT/TTS
│   │   │   ├── admin/          # Admin APIs
│   │   │   └── ...
│   │   ├── chat/               # Chat interface
│   │   └── shared/             # Public shared conversations
│   ├── components/             # React components
│   │   ├── chat/               # Chat UI (input, messages, model selector, voice)
│   │   ├── channels/           # Channel settings panel
│   │   ├── conversation/       # Conversation list, folders, search
│   │   ├── dashboard/          # Usage dashboard
│   │   ├── gemini/             # Gemini store manager
│   │   ├── layout/             # App layout, sidebar
│   │   └── ui/                 # shadcn/ui components
│   ├── lib/                    # Core libraries
│   │   ├── ai/                 # Provider factory, model configs, Gemini integration
│   │   ├── auth/               # Session management, admin auth
│   │   ├── channels/           # Channel processor, connectors, commands
│   │   │   ├── telegram/       # Telegram connector
│   │   │   ├── slack/          # Slack connector
│   │   │   ├── discord/        # Discord connector
│   │   │   └── webchat/        # WebChat connector
│   │   ├── db/                 # Drizzle ORM schema and client
│   │   ├── documents/          # Document processors (PDF, DOCX, etc.)
│   │   ├── memory/             # Memory store and summarizer
│   │   ├── plugins/            # Skill/plugin system
│   │   ├── rag/                # RAG search and storage
│   │   ├── tools/              # Tool registry and implementations
│   │   ├── voice/              # Deepgram STT/TTS
│   │   └── ...
│   └── types/                  # TypeScript type definitions
├── drizzle/                    # Database migrations
├── public/                     # Static assets
├── docker-compose.yml          # Development Docker setup
└── docker-compose.prod.yml     # Production Docker setup
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript (strict mode) |
| **Database** | PostgreSQL 16 + pgvector |
| **Cache** | Redis 7 |
| **ORM** | Drizzle ORM |
| **AI SDK** | Vercel AI SDK v6 |
| **Auth** | Better Auth |
| **UI** | shadcn/ui, Tailwind CSS, Framer Motion |
| **Voice** | Deepgram Aura (TTS) + Deepgram Nova (STT) |
| **Storage** | MinIO / S3-compatible |
| **Channels** | grammY (Telegram), Slack API, Discord.js |

---

## Development

```bash
# Development server with hot reload
npm run dev

# Linting
npm run lint

# Production build
npm run build

# Database migrations
npm run db:push        # Apply schema changes
npm run db:generate    # Generate migration files
npm run db:studio      # Open Drizzle Studio (DB browser)
```

### Development Mode

Set `DEV_BYPASS_AUTH=true` in `.env.local` to skip Firebase authentication during development. This creates a mock user automatically so you can test without setting up Firebase.

---

## License

MIT

---

Built with Next.js, TypeScript, and a lot of AI assistance.
