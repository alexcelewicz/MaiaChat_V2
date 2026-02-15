# MaiaChat Complete Feature Guide

**Version**: 2.0.0
**Last Updated**: February 2026
**Status**: Production Ready

This comprehensive guide covers all features implemented across 7 development phases. Use this document to understand what's possible and test each feature.

---

## Table of Contents

1. [Phase 1: Foundation & Configuration](#phase-1-foundation--configuration)
2. [Phase 2: CLI Tools Integration](#phase-2-cli-tools-integration)
3. [Phase 3: Email Integration](#phase-3-email-integration)
4. [Phase 4: Workflow System](#phase-4-workflow-system)
5. [Phase 5: Agent Continuation](#phase-5-agent-continuation)
6. [Phase 6: Clawdbot Skills Sync](#phase-6-clawdbot-skills-sync)
7. [Phase 7: File Access in Chat](#phase-7-file-access-in-chat)
8. [Additional Fixes & Improvements](#additional-fixes--improvements)

---

## Phase 1: Foundation & Configuration

### What Was Implemented

1. **Unified Configuration System**
   - Single JSON configuration with priority chain: file → database → environment → defaults
   - Import/export configuration from Admin UI
   - Zod validation schema for type safety

2. **Task Completion Loop**
   - AI agents now execute tasks instead of just saying "I will do X"
   - Retry logic: up to 3 attempts if AI fails to use tools
   - Failure notifications sent to original channel AND Telegram

3. **Memory Lifecycle Hooks**
   - Auto-recall: Relevant memories injected before agent runs
   - Auto-capture: Facts automatically extracted and saved after responses

4. **Skill Loader Enhancement**
   - Clawdbot community skills can be enabled from UI
   - Config-aware skill loading

### How to Use

#### Configuration Management (Admin UI)

1. **Access**: Go to **Admin Panel** → **Settings**
2. **Export Config**: Click "Export Config" to download current settings as JSON
3. **Import Config**: Click "Import Config" to upload and apply a configuration file
4. **Validate**: Import validates before applying - you'll see errors if config is invalid

#### Task Execution Settings

Configure in Admin Settings or via config JSON:
```json
{
  "taskExecution": {
    "maxAttempts": 3,
    "completionTimeout": 60000,
    "requireToolCallForScheduled": true
  },
  "notifications": {
    "failureNotifyOriginalChannel": true,
    "failureNotifyTelegram": true,
    "telegramUserId": "YOUR_TELEGRAM_USER_ID"
  }
}
```

#### Memory Settings

```json
{
  "memory": {
    "autoSave": true,
    "ragEnabled": true,
    "userProfileMemoryEnabled": true,
    "autoRecallEnabled": true,
    "autoCaptureEnabled": true
  }
}
```

### Testing Phase 1

#### Test 1.1: Configuration Export/Import
1. Go to Admin Panel → Settings
2. Click "Export Config" - should download a JSON file
3. Modify the JSON (e.g., change `taskExecution.maxAttempts` to 5)
4. Click "Import Config" and select the modified file
5. **Expected**: Config updates successfully, toast notification appears

#### Test 1.2: Task Completion (Scheduled Task)
1. Create a scheduled task: "Send me the current weather for London"
2. Wait for it to execute
3. **Expected**: Agent should call the weather tool and provide actual data, not just say "I will check the weather"

#### Test 1.3: Task Retry on Failure
1. Create a scheduled task with an impossible request
2. Monitor logs
3. **Expected**: Task retries up to 3 times before marking as failed

#### Test 1.4: Memory Auto-Recall
1. Tell the AI: "Remember that my favorite color is blue"
2. Start a new conversation
3. Ask: "What is my favorite color?"
4. **Expected**: AI recalls "blue" from memory

---

## Phase 2: CLI Tools Integration

### What Was Implemented

1. **Coding CLI Tool**
   - Execute coding tasks using Claude Code or Gemini CLI
   - Supports both CLIs with proper argument handling
   - Auto-detection of available CLIs

2. **Interactive CLI Bridge**
   - Handles CLI prompts and questions
   - Can answer autonomously or escalate to user
   - Session management for long-running tasks

3. **Workspace Organization**
   - Files organized by date and task name
   - Configurable workspace root directory

4. **Admin UI for CLI**
   - Check CLI availability status
   - Configure default CLI and permissions
   - Set workspace directory

### How to Use

#### CLI Settings (Admin UI)

1. Go to **Admin Panel** → **Settings**
2. Find the **CLI Tools** card
3. Enable CLI tools with the toggle
4. Select default CLI (Claude or Gemini)
5. Configure workspace directory

#### CLI Configuration

```json
{
  "cli": {
    "enabled": true,
    "defaultCli": "claude",
    "skipPermissions": true,
    "workspaceRoot": "./workspace",
    "organizeByTask": true
  }
}
```

#### Using CLI via Chat

Ask the AI to write code:
- "Create a Python script that calculates fibonacci numbers"
- "Build a simple REST API with Express.js in E:\MyProjects\api"
- "Write a React component for a todo list"

The AI will use the Coding CLI tool to invoke Claude Code or Gemini CLI.

### Testing Phase 2

#### Test 2.1: CLI Availability Check
1. Go to Admin Panel → Settings → CLI Tools
2. **Expected**: Shows which CLIs are available (Claude Code, Gemini CLI)
3. Green checkmarks for installed CLIs

#### Test 2.2: Gemini CLI Coding Task
1. In chat, type: "Use Gemini CLI to create a hello world Python script in E:\Test_Gemini"
2. **Expected**:
   - Shows "Using Tool: Coding CLI" in chat
   - Gemini CLI executes
   - Creates a Python file
   - Returns the output

#### Test 2.3: Claude Code Coding Task
1. In chat, type: "Use Claude Code to create a simple Node.js hello world project in E:\Test_Claude"
2. **Expected**:
   - Shows "Using Tool: Coding CLI" in chat
   - Claude Code executes (may take a few minutes)
   - Creates project files
   - Returns success with file list

#### Test 2.4: CLI from Telegram
1. Open your Telegram chat with the MaiaChat bot
2. Send: "Create a simple Python calculator script"
3. **Expected**: Same behavior as web chat - CLI executes and returns results

---

## Phase 3: Email Integration

### What Was Implemented

1. **Google OAuth with PKCE**
   - Secure authentication flow
   - Automatic token refresh
   - Token storage in database

2. **Gmail API Wrapper**
   - Search emails with Gmail query syntax
   - Read email content and threads
   - Send new emails
   - Create and send drafts
   - Reply to threads
   - Archive and trash operations

3. **Email Tool for Agents**
   - AI can read, search, and send emails
   - Thread-aware replies
   - Draft management

4. **Settings UI**
   - Connect/disconnect Google account
   - View permissions granted
   - OAuth status display

### How to Use

#### Connect Google Account

1. Go to **Settings** → **Integrations**
2. Click "Connect Google Account"
3. Authorize with your Google account
4. Grant requested permissions (Gmail read/send)
5. **Status**: Should show "Connected" with your email

#### Email Operations via Chat

Ask the AI to work with your emails:
- "Check my inbox for new emails"
- "Search for emails from john@example.com"
- "Send an email to jane@example.com with subject 'Meeting Tomorrow'"
- "Read the latest email from my boss"
- "Reply to the last email from support@company.com"

#### Email Configuration

```json
{
  "integrations": {
    "google": {
      "enabled": true,
      "scopes": ["gmail.readonly", "gmail.send", "calendar.readonly"]
    }
  }
}
```

### Testing Phase 3

#### Test 3.1: Google OAuth Connection
1. Go to Settings → Integrations
2. Click "Connect Google Account"
3. Complete OAuth flow
4. **Expected**: Shows "Connected" with your email address

#### Test 3.2: Email Search
1. In chat: "Search my emails for messages from [known sender]"
2. **Expected**: Returns list of matching emails with subjects and dates

#### Test 3.3: Read Email
1. In chat: "Read my latest email"
2. **Expected**: Shows email content, sender, subject, date

#### Test 3.4: Send Email
1. In chat: "Send an email to [your email] with subject 'Test from MaiaChat' and body 'This is a test'"
2. Check your inbox
3. **Expected**: Email arrives in your inbox

#### Test 3.5: Reply to Thread
1. In chat: "Reply to the email from [sender] saying 'Thank you for your message'"
2. **Expected**: Reply sent in the same thread

---

## Phase 4: Workflow System

### What Was Implemented

1. **Workflow Engine**
   - Deterministic pipeline execution
   - Step types: tool, llm, condition, approval, transform
   - Variable interpolation with $input, $stepId patterns

2. **Approval Gates**
   - Pause workflow and wait for human approval
   - Secure resumable tokens with expiration
   - Approve via web UI or token link

3. **Workflow API**
   - Create, update, delete workflows
   - Execute workflows with inputs
   - Resume paused workflows

4. **Workflow Builder UI**
   - Visual step editor
   - Built-in templates
   - Run history display

### How to Use

#### Access Workflow Builder

1. Go to **Settings** → **Workflows**
2. Click "Create Workflow" or use a template

#### Built-in Templates

- **Email Triage**: Categorize and summarize incoming emails
- **Daily Summary**: Generate daily activity summaries
- **Content Pipeline**: Process and transform content

#### Workflow Step Types

| Step Type | Description | Example |
|-----------|-------------|---------|
| `tool` | Execute a tool | Call weather API |
| `llm` | AI processing | Summarize content |
| `condition` | Branch logic | If priority > 5 |
| `approval` | Human gate | Require approval before sending |
| `transform` | Data mapping | Extract fields |

#### Variable Interpolation

```json
{
  "stepId": "summarize",
  "type": "llm",
  "input": {
    "prompt": "Summarize this email: $fetchEmail.content"
  }
}
```

### Testing Phase 4

#### Test 4.1: Create Workflow
1. Go to Settings → Workflows
2. Click "Create Workflow"
3. Add a name and description
4. Add steps (e.g., LLM step to summarize input)
5. Save workflow
6. **Expected**: Workflow appears in list

#### Test 4.2: Run Workflow
1. Select a workflow from the list
2. Click "Run"
3. Provide input data
4. **Expected**: Workflow executes, shows results

#### Test 4.3: Approval Gate
1. Create workflow with approval step in the middle
2. Run the workflow
3. **Expected**: Workflow pauses at approval step
4. Approve via UI
5. **Expected**: Workflow continues and completes

#### Test 4.4: Use Template
1. Go to Settings → Workflows
2. Click on "Email Triage" template
3. Click "Use Template"
4. **Expected**: Pre-configured workflow created

---

## Phase 5: Agent Continuation

### What Was Implemented

1. **Session Manager**
   - Persistent sessions that survive restarts
   - Session state saved to database
   - Session recovery API

2. **Cross-Task Messaging**
   - Tasks can send messages to each other
   - Message queue with status tracking
   - Polling and notification system

3. **Sub-Task Spawning**
   - Parent tasks can spawn child tasks
   - Depth limits prevent infinite spawning
   - Child task tracking

### How to Use

#### Autonomous Tasks

Create long-running autonomous tasks:
1. Go to **Settings** → **Autonomous Tasks**
2. Create a new task with instructions
3. Task runs continuously until completion or failure

#### Sub-Task Example

When an autonomous task needs to delegate work:
```
"Monitor my inbox and for each important email,
spawn a sub-task to draft a response"
```

#### Session Recovery

If the server restarts:
- Active sessions are recovered from database
- Tasks resume from last checkpoint
- No work is lost

### Testing Phase 5

#### Test 5.1: Create Autonomous Task
1. Go to Settings → Autonomous Tasks (or use API)
2. Create task: "Monitor the time and tell me when it's noon"
3. **Expected**: Task starts running in background

#### Test 5.2: Session Persistence
1. Create an autonomous task
2. Restart the MaiaChat server
3. **Expected**: Task resumes after restart

#### Test 5.3: Sub-Task Spawning
1. Create task: "Create two sub-tasks: one to check weather, one to check news"
2. **Expected**: Parent task creates two child tasks
3. Child tasks execute independently
4. Parent waits for children to complete

---

## Phase 6: Clawdbot Skills Sync

### What Was Implemented

1. **Sync Service**
   - Check for Clawdbot repository updates
   - Pull latest skills with one click
   - Clone repository if not present

2. **Compatibility Checker**
   - Check required binaries (ffmpeg, pandoc, etc.)
   - Check required environment variables
   - Platform compatibility (Windows, Linux, Mac)

3. **Skill Management API**
   - List all available skills
   - Enable/disable individual skills
   - Bulk enable compatible skills

4. **Admin UI**
   - Visual skill browser at /admin/clawdbot-sync
   - Skills grouped by category
   - Search and filter capabilities
   - One-click operations

### How to Use

#### Access Clawdbot Sync

1. Go to **Admin Panel** → **Clawdbot Sync**
2. Or navigate directly to `/admin/clawdbot-sync`

#### Initial Setup

1. If repository not cloned:
   - Click "Clone Repository"
   - Wait for clone to complete

2. If repository exists:
   - Click "Check for Updates"
   - Click "Pull Latest" if updates available

#### Enable Skills

1. Browse skills by category
2. Check compatibility status (green = compatible)
3. Click toggle to enable/disable
4. Or click "Enable All Compatible" for bulk enable

#### Available Skill Categories

- **Weather**: Get weather forecasts
- **GitHub**: Repository operations
- **Summarize**: Text summarization
- **Image Generation**: Create images with AI
- **Whisper**: Audio transcription
- **PDF**: PDF processing
- **Notion**: Notion integration
- **Obsidian**: Obsidian notes
- **Trello**: Trello boards

### Testing Phase 6

#### Test 6.1: Clone Repository
1. Go to Admin → Clawdbot Sync
2. If no repository, click "Clone Repository"
3. **Expected**: Repository clones, skills appear in list

#### Test 6.2: Check Compatibility
1. View skill list
2. Click on a skill to see details
3. **Expected**: Shows compatibility info (required bins, env vars, platforms)

#### Test 6.3: Enable Skill
1. Find a compatible skill (green status)
2. Click the toggle to enable
3. **Expected**: Skill enabled, available in chat

#### Test 6.4: Use Enabled Skill
1. Enable the "weather" skill
2. In chat: "What's the weather in London?"
3. **Expected**: Weather skill provides forecast

#### Test 6.5: Bulk Enable
1. Click "Enable All Compatible"
2. **Expected**: All compatible skills toggled on

---

## Phase 7: File Access in Chat

### What Was Implemented

1. **File Download API**
   - Download files from workspace
   - List files in directories
   - Preview text files

2. **Chat UI Components**
   - FileAttachment: Display files with preview
   - FileBrowser: Navigate workspace files
   - Syntax highlighting for code files

3. **Security**
   - Blocked patterns for sensitive files (.env, credentials, etc.)
   - Sandboxed to workspace directory

### How to Use

#### View Files in Chat

When the AI creates files using CLI tools:
- Files appear as attachments in the chat
- Click to preview text files
- Download button for all files

#### File Browser

1. Click the folder icon in chat toolbar
2. Browse workspace directory
3. Navigate with breadcrumbs
4. Preview or download files

### Testing Phase 7

#### Test 7.1: File Display After CLI
1. Ask AI to create a file: "Create a Python script that prints hello world"
2. **Expected**: File appears as attachment after creation

#### Test 7.2: File Preview
1. Click on a text file attachment
2. **Expected**: Preview dialog opens with syntax highlighting

#### Test 7.3: File Download
1. Click download button on file attachment
2. **Expected**: File downloads to your computer

#### Test 7.4: File Browser
1. Click folder icon in chat toolbar
2. Navigate to workspace
3. **Expected**: See files created by CLI, can preview/download

---

## Additional Fixes & Improvements

### Chat Scroll Behavior
- **Fixed**: Opening existing conversations now scrolls to the latest message
- **Before**: Would show middle of conversation
- **After**: Automatically scrolls to bottom on load

### CLI Prompt Handling
- **Fixed**: Long prompts no longer get truncated on Windows
- **Solution**: Prompts passed via stdin instead of command-line arguments
- **Works on**: Windows, macOS, Linux

### React Performance Optimizations
- Applied React best practices for rendering
- Optimized component re-renders
- Improved scroll performance in chat

---

## Configuration Reference

### Complete Configuration Schema

```json
{
  "$schema": "./config-schema.json",
  "version": "1.0.0",

  "taskExecution": {
    "maxAttempts": 3,
    "completionTimeout": 60000,
    "requireToolCallForScheduled": true
  },

  "notifications": {
    "failureNotifyOriginalChannel": true,
    "failureNotifyTelegram": true,
    "telegramUserId": null
  },

  "cli": {
    "enabled": true,
    "defaultCli": "claude",
    "skipPermissions": true,
    "workspaceRoot": "./workspace",
    "organizeByTask": true
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

  "skills": {
    "clawdbotSkillsEnabled": false,
    "clawdbotSourcePath": "./clawdbot-source",
    "enabledSkills": []
  },

  "integrations": {
    "google": {
      "enabled": false,
      "scopes": ["gmail.readonly", "gmail.send", "calendar.readonly"]
    }
  },

  "general": {
    "defaultModel": "auto",
    "visitorRetentionDays": 30,
    "proactiveMessagingEnabled": false,
    "eventTriggersEnabled": false
  }
}
```

---

## Quick Start Checklist

Use this checklist to verify all features are working:

### Phase 1: Foundation
- [ ] Export configuration from Admin Settings
- [ ] Import configuration successfully
- [ ] Create and execute a scheduled task
- [ ] Verify memory recall works across conversations

### Phase 2: CLI Tools
- [ ] CLI availability shows in Admin Settings
- [ ] Gemini CLI executes coding task
- [ ] Claude Code executes coding task
- [ ] CLI works from Telegram

### Phase 3: Email
- [ ] Connect Google account
- [ ] Search emails
- [ ] Read an email
- [ ] Send an email
- [ ] Reply to a thread

### Phase 4: Workflows
- [ ] Create a workflow
- [ ] Run a workflow
- [ ] Test approval gate
- [ ] Use a template

### Phase 5: Agent Continuation
- [ ] Create autonomous task
- [ ] Verify task survives restart
- [ ] Test sub-task creation

### Phase 6: Clawdbot Skills
- [ ] Clone or update repository
- [ ] View skill compatibility
- [ ] Enable a skill
- [ ] Use enabled skill in chat

### Phase 7: File Access
- [ ] View file attachments in chat
- [ ] Preview text files
- [ ] Download files
- [ ] Use file browser

---

## Troubleshooting

### CLI Not Working

1. **Check CLI is installed**: Run `claude --version` or `gemini --version` in terminal
2. **Check CLI is enabled**: Admin Settings → CLI Tools → Enable toggle
3. **Check permissions**: Ensure `skipPermissions` is true in config
4. **Check logs**: Look for errors in server console

### Email Not Working

1. **Check OAuth**: Settings → Integrations should show "Connected"
2. **Refresh tokens**: Disconnect and reconnect Google account
3. **Check scopes**: Ensure all required permissions were granted

### Skills Not Loading

1. **Check Clawdbot path**: Verify `clawdbotSourcePath` points to valid directory
2. **Check compatibility**: Skill may require binaries you don't have installed
3. **Reload skills**: Go to Settings → Skills → "Save & Reload Skills"

### Workflow Not Running

1. **Check step configuration**: Each step needs valid input/output config
2. **Check variable references**: Ensure $stepId references exist
3. **View run logs**: Check workflow run history for errors

---

## Architecture Overview

```
MaiaChat/
├── src/
│   ├── lib/
│   │   ├── config/          # Phase 1: Configuration system
│   │   ├── ai/
│   │   │   └── task-executor.ts   # Phase 1: Task completion loop
│   │   ├── memory/
│   │   │   └── lifecycle-hooks.ts # Phase 1: Memory hooks
│   │   ├── tools/
│   │   │   ├── coding-cli.ts      # Phase 2: CLI tool
│   │   │   ├── cli-bridge.ts      # Phase 2: Interactive CLI
│   │   │   └── email.ts           # Phase 3: Email tool
│   │   ├── integrations/
│   │   │   └── google/            # Phase 3: OAuth & Gmail
│   │   ├── workflows/
│   │   │   ├── types.ts           # Phase 4: Workflow types
│   │   │   └── executor.ts        # Phase 4: Workflow engine
│   │   ├── autonomous/
│   │   │   └── session-manager.ts # Phase 5: Session management
│   │   └── services/
│   │       └── clawdbot-sync.ts   # Phase 6: Skill sync
│   ├── app/
│   │   ├── api/
│   │   │   ├── admin/config/      # Phase 1: Config API
│   │   │   ├── admin/cli/         # Phase 2: CLI API
│   │   │   ├── integrations/      # Phase 3: OAuth API
│   │   │   ├── workflows/         # Phase 4: Workflow API
│   │   │   ├── tasks/             # Phase 5: Task API
│   │   │   └── files/             # Phase 7: File API
│   │   └── admin/
│   │       └── clawdbot-sync/     # Phase 6: Sync UI
│   └── components/
│       └── chat/
│           ├── FileAttachment.tsx # Phase 7: File display
│           └── FileBrowser.tsx    # Phase 7: File browser
└── config/
    └── default.json               # Phase 1: Default config
```

---

## Contributing & Open Source

This application is being prepared for open source release. Key considerations:

1. **Documentation**: This guide serves as the primary feature documentation
2. **Configuration**: All settings configurable via UI or JSON - no code changes needed
3. **Modularity**: Each phase is independent and can be disabled
4. **Security**: Sensitive files blocked, OAuth tokens encrypted

---

*Created with love by the MaiaChat development team*
