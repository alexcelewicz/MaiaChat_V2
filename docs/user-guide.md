# MAIAChat v2 - User Guide

Welcome to MAIAChat v2, a modern multi-provider AI chat platform with powerful features for conversations, document analysis, and agent orchestration.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Chat Features](#chat-features)
3. [Document Management](#document-management)
4. [Agents](#agents)
5. [Profiles](#profiles)
6. [Settings](#settings)
7. [FAQ](#faq)
8. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Creating an Account

1. Navigate to the MAIAChat homepage
2. Click "Sign Up" or "Register"
3. Enter your email address and create a password
4. Verify your email address (check your inbox)
5. Alternatively, sign up with Google OAuth by clicking "Continue with Google"

### Logging In

1. Go to the login page
2. Enter your email and password
3. Click "Sign In"
4. You'll be redirected to the chat dashboard

### Dashboard Overview

After logging in, you'll see:
- **Sidebar**: Lists your conversations, folders, and navigation
- **Main Area**: Chat interface or current page content
- **Header**: Theme toggle, user menu, and quick actions

---

## Chat Features

### Starting a New Chat

1. Click the "New Chat" button in the sidebar
2. Type your message in the input box at the bottom
3. Press Enter or click the Send button

### Selecting AI Models

1. Click on the model selector dropdown (usually shows current model name)
2. Browse available models grouped by provider:
   - **OpenAI**: GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo
   - **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
   - **Google**: Gemini 2.0 Flash, Gemini 1.5 Pro
   - **X.ai**: Grok 3, Grok 2
   - **OpenRouter**: Access to multiple providers
3. Filter models by capability using the filter buttons (Vision, Reasoning, Tools, Code)

### Markdown Support

MAIAChat fully supports Markdown in messages:
- **Bold**: `**text**`
- **Italic**: `*text*`
- **Code**: `` `code` `` for inline, ``` for blocks
- **Lists**: Use `-` or `1.` for lists
- **Tables**: Standard Markdown tables
- **Math**: Use `$...$` for inline LaTeX, `$$...$$` for block equations

### Code Blocks

Code in responses is automatically:
- Syntax highlighted based on language
- Numbered with line numbers
- Copyable with one click
- Downloadable as a file

### Diagrams

MAIAChat supports Mermaid diagrams. Ask the AI to create:
- Flowcharts
- Sequence diagrams
- Entity relationship diagrams
- Gantt charts

### Conversation Management

#### Organizing with Folders
1. Click the folder icon in the sidebar
2. Create a new folder
3. Drag conversations into folders

#### Tagging Conversations
1. Right-click on a conversation
2. Select "Add Tag"
3. Create or select existing tags

#### Favorites
- Click the star icon on any conversation to favorite it
- Access favorites quickly from the sidebar filter

#### Search
- Press `Ctrl+K` (or `Cmd+K` on Mac) to open search
- Search across all conversations and messages
- Filter by date, tags, or folders

#### Export
1. Click the three-dot menu on a conversation
2. Select "Export"
3. Choose format: JSON, Markdown, or PDF

#### Share
1. Click the share button on a conversation
2. Generate a shareable link
3. Anyone with the link can view (read-only)
4. Revoke access anytime

---

## Document Management

### Uploading Documents

1. Navigate to the Documents page
2. Click "Upload" or drag files into the drop zone
3. Supported formats:
   - PDF documents
   - Word documents (.docx)
   - Text files (.txt, .md)
   - Spreadsheets (.csv, .xlsx)
   - JSON files

### Document Processing

After upload, documents are automatically:
1. **Extracted**: Text is extracted from the document
2. **Chunked**: Split into semantic chunks
3. **Embedded**: Vector embeddings are generated
4. **Indexed**: Made searchable with RAG

### Using RAG (Retrieval Augmented Generation)

1. Enable RAG in the chat interface (toggle in settings or input area)
2. Select which documents to include
3. Ask questions - the AI will use your documents as context
4. Source citations will appear with AI responses

---

## Agents

### What are Agents?

Agents are specialized AI configurations designed for specific tasks. Each agent can have:
- A specific model (e.g., GPT-4 for reasoning, Claude for writing)
- A custom system prompt
- Selected tools (web search, calculator, etc.)
- Unique parameters (temperature, max tokens)

### Preset Agents

MAIAChat includes several preset agents:
- **Research Assistant**: For in-depth research with web search
- **Code Helper**: Optimized for programming tasks
- **Writing Assistant**: For creative and professional writing
- **Data Analyst**: For working with data and spreadsheets

### Creating Custom Agents

1. Go to the Agents page
2. Click "Create Agent"
3. Configure:
   - Name and description
   - Role (researcher, coder, writer, etc.)
   - AI model
   - System prompt
   - Temperature and max tokens
   - Available tools
4. Save your agent

### Orchestration Modes

When using multiple agents:

- **Single**: One agent handles the entire conversation
- **Sequential**: Agents respond in order, each building on the previous
- **Parallel**: All agents respond simultaneously
- **Hierarchical**: A coordinator agent delegates to specialists
- **Consensus**: Multiple agents discuss and reach agreement
- **Auto-Router**: Automatically selects the best agent for each query

---

## Profiles

Profiles save your complete configuration for quick switching.

### What's in a Profile?

- Selected agents and their configurations
- Orchestration mode
- RAG settings (enabled documents)
- UI preferences
- Model defaults

### Profile Templates

Use built-in templates:
- **Research Mode**: RAG enabled, research agent, web search tools
- **Code Development**: Code helper agent, syntax highlighting
- **Creative Writing**: Writing assistant, higher temperature

### Saving Profiles

1. Configure your ideal setup
2. Go to Profiles page
3. Click "Save Current as Profile"
4. Name and describe your profile

---

## Settings

### API Keys

To use your own API keys:
1. Go to Settings
2. Find the API Keys section
3. Enter your keys for each provider
4. Keys are encrypted and stored securely
5. Validate keys with the "Validate" button

### Theme

- Toggle between Light and Dark mode
- System theme follows your OS preference

### Notifications

Configure notification preferences for:
- New messages
- Document processing completion
- Agent tasks

---

## FAQ

### How is my data protected?

- All data is encrypted in transit (HTTPS)
- API keys are encrypted at rest using AES-256-GCM
- Conversations are stored securely in PostgreSQL
- No data is shared with third parties

### What are tokens?

Tokens are units of text that AI models process. Roughly:
- 1 token ≈ 4 characters in English
- 1 token ≈ 0.75 words
- Token usage affects costs

### Why is my response slow?

Response times depend on:
- Model complexity (GPT-4 is slower than GPT-3.5)
- Response length
- Server load
- Network conditions

### Can I use my own API keys?

Yes! MAIAChat supports BYOK (Bring Your Own Key) for all providers:
- OpenAI
- Anthropic
- Google AI
- X.ai
- OpenRouter

---

## Troubleshooting

### Message not sending

1. Check your internet connection
2. Verify your API key is valid (Settings > API Keys > Validate)
3. Check if rate limits are exceeded
4. Try refreshing the page

### Document upload failing

1. Check file size (max 50MB)
2. Verify file format is supported
3. Try a different browser
4. Check network connection

### Agent not responding

1. Verify the agent's model is available
2. Check API key for that provider
3. Try a different orchestration mode
4. Check debug panel for errors

### Search not finding results

1. Wait for document processing to complete
2. Try different search terms
3. Check if RAG is enabled
4. Verify documents are indexed

### Need more help?

- Check the [GitHub Issues](https://github.com/alexcelewicz/MaiaChat_V2/issues)
- Contact support at support@maiachat.com
- Join our Discord community
