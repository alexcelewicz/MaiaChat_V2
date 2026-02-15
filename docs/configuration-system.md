# MaiaChat Configuration System

This document explains how to configure MaiaChat using the unified configuration system.

## Overview

MaiaChat uses a unified configuration system that supports:
- **UI-based configuration** via the Admin Settings panel
- **JSON import/export** for backup and migration
- **Environment variables** for deployment configuration
- **Database storage** for persistent settings

## Configuration via Admin UI

### Accessing Settings

1. Log in as an admin user
2. Navigate to **Admin Settings** (gear icon in admin sidebar)
3. You'll find various configuration cards for different features

### Configuration Import/Export

In the Admin Settings page, you'll find a **Configuration Management** card that allows you to:

- **Export Configuration**: Download your current settings as a JSON file
- **Import Configuration**: Upload a JSON file to apply settings

This is useful for:
- Backing up your configuration
- Migrating settings between environments
- Sharing configurations across deployments

## Configuration Sections

### Task Execution

Controls how scheduled tasks and background agent operations behave.

| Setting | Description | Default |
|---------|-------------|---------|
| `maxAttempts` | Number of retry attempts for failed tasks | 3 |
| `completionTimeout` | Timeout for task completion (ms) | 60000 |
| `requireToolCallForScheduled` | Require tool usage for scheduled tasks | true |

### Notifications

Controls how failures and events are communicated.

| Setting | Description | Default |
|---------|-------------|---------|
| `failureNotifyOriginalChannel` | Send failure notices to original channel | true |
| `failureNotifyTelegram` | Also send failures via Telegram | true |
| `telegramUserId` | Telegram user ID for admin notifications | null |

### Memory & Retrieval

Controls the AI memory and context systems.

| Setting | Description | Default |
|---------|-------------|---------|
| `autoSave` | Automatically save conversation context | true |
| `ragEnabled` | Enable retrieval-augmented generation | true |
| `userProfileMemoryEnabled` | Learn personal information about users | true |
| `autoRecallEnabled` | Automatically recall relevant memories | true |
| `autoCaptureEnabled` | Automatically capture key facts | true |

### Skills

Controls plugin/skill loading.

| Setting | Description | Default |
|---------|-------------|---------|
| `clawdbotSkillsEnabled` | Load skills from Clawdbot repository | false |
| `clawdbotSourcePath` | Path to Clawdbot source directory | "../clawdbot-source" |
| `enabledSkills` | List of specifically enabled skill slugs | [] |

### CLI Tools (Coming Soon)

Controls coding CLI integration (Phase 2).

| Setting | Description | Default |
|---------|-------------|---------|
| `defaultCli` | Default CLI to use (claude/gemini) | "claude" |
| `skipPermissions` | Skip CLI permission prompts | true |
| `workspaceRoot` | Base directory for generated files | "./workspace" |

## JSON Configuration Format

When exporting configuration, you'll receive a JSON file with this structure:

```json
{
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
  "general": {
    "defaultModel": "auto",
    "visitorRetentionDays": 30
  }
}
```

## Environment Variables

Some settings can be overridden via environment variables:

| Variable | Description |
|----------|-------------|
| `MAIACHAT_SKILLS_DIR` | Custom skills directory path |
| `ADMIN_EMAILS` | Comma-separated list of admin email addresses |
| `DATABASE_URL` | PostgreSQL connection string |

## API Endpoints

The configuration system exposes these API endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/config` | Export current configuration |
| PUT | `/api/admin/config` | Import full configuration |
| PATCH | `/api/admin/config` | Update specific settings |
| POST | `/api/admin/config/validate` | Validate config without applying |

## Configuration Priority

When loading configuration, values are resolved in this order (highest priority first):

1. **Database** - Settings saved via UI
2. **Environment variables** - Deployment-level overrides
3. **File** - `config/default.json` if present
4. **Defaults** - Built-in default values

## Troubleshooting

### Configuration Not Applied

If settings don't seem to take effect:
1. Check the browser console for errors
2. Verify you're logged in as an admin
3. Try refreshing the page after saving
4. Check server logs for validation errors

### Import Fails

If importing a configuration file fails:
1. Ensure the file is valid JSON
2. Check the version matches the expected format
3. Look for specific field errors in the error message

### Skills Not Loading

If Clawdbot skills aren't appearing:
1. Verify the source path is correct
2. Ensure the Clawdbot repository is cloned
3. Check that `clawdbotSkillsEnabled` is true
4. Click "Reload from Disk" in Skills settings

## Related Documentation

- [Skills System](./skills-system.md) - Detailed guide on skills
- [User Guide](./user-guide.md) - General user documentation
- [API Reference](./api-reference.md) - Full API documentation
