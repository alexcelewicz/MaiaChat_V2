# MaiaChat Skills System

Skills are plugins that extend the AI's capabilities with new tools and knowledge.

## Overview

MaiaChat supports three types of skills:

1. **Built-in Skills** - Maintained by MaiaChat, always available
2. **Custom Skills** - Your own SKILL.md files in the skills directory
3. **Clawdbot Skills** - Community skills from the Clawdbot project

## Managing Skills via UI

### Accessing Skills Settings

1. Log in to MaiaChat
2. Go to **Settings** > **AI Skills**
3. You'll see cards for Enabled Skills and Available Skills

### Enabling/Disabling Skills

- Use the toggle switch next to any skill to enable or disable it
- Disabled skills are not available to the AI during conversations
- Some skills may require configuration before use

### Configuring Skills

1. Click the gear icon next to an enabled skill
2. Fill in any required configuration (API keys, preferences)
3. Click "Save Configuration"

## Clawdbot Community Skills

Clawdbot is a community project with 15+ ready-to-use skills.

### Enabling Clawdbot Skills

1. Clone the Clawdbot repository:
   ```bash
   git clone https://github.com/clawdbot/clawdbot ../clawdbot-source
   ```

2. Go to **Settings** > **AI Skills**

3. In the "Clawdbot Community Skills" card:
   - Toggle "Enable Clawdbot Skills" ON
   - Set the source path (e.g., `../clawdbot-source`)
   - Click "Save & Reload Skills"

### Available Clawdbot Skills

| Skill | Description |
|-------|-------------|
| weather | Get current weather and forecasts |
| github | Interact with GitHub repositories |
| summarize | Summarize text and documents |
| openai-image-gen | Generate images with DALL-E |
| openai-whisper | Transcribe audio to text |
| nano-pdf | Read and extract PDF content |
| notion | Interact with Notion workspaces |
| obsidian | Access Obsidian vault notes |
| trello | Manage Trello boards and cards |

## Creating Custom Skills

Custom skills are defined using SKILL.md files.

### Directory Structure

```
skills/
├── my-skill/
│   └── SKILL.md
├── another-skill/
│   └── SKILL.md
```

### SKILL.md Format

```markdown
---
name: My Custom Skill
slug: my-skill
version: 1.0.0
description: What this skill does
author: Your Name
category: utility
permissions:
  - api_calls
---

# My Custom Skill Instructions

Here you write the knowledge and instructions for this skill.
The AI will receive this content when the skill is invoked.

## Example Usage

Tell the AI how to use this skill's capabilities.

## Important Notes

Any limitations or considerations.
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| name | Yes | Display name of the skill |
| slug | Yes | Unique identifier (lowercase, hyphens) |
| version | No | Semantic version number |
| description | No | Brief description shown in UI |
| author | No | Creator of the skill |
| category | No | One of: productivity, communication, development, utility, search, automation, other |
| permissions | No | Array of required permissions |

### Available Permissions

- `read_messages` - Read conversation history
- `send_messages` - Send messages to users
- `web_search` - Search the web
- `browser_automation` - Control browser
- `file_access` - Read/write files
- `api_calls` - Make external API calls
- `database_access` - Query databases

### Reloading Custom Skills

After adding or modifying SKILL.md files:

1. Go to **Settings** > **AI Skills**
2. In the "Custom Skills" card, click **Reload from Disk**
3. New skills will appear in the Available Skills list

## How Skills Work

### Skill Invocation

When a skill is enabled, the AI can access it via a tool called `<skill-slug>__get_instructions`. This returns the skill's markdown content, which the AI uses to understand the skill's capabilities.

### Example Flow

1. User asks: "What's the weather in London?"
2. AI sees the weather skill is available
3. AI calls `weather__get_instructions` to get weather skill knowledge
4. Skill returns instructions for fetching weather data
5. AI follows instructions to get and present the weather

## Skill Configuration

Some skills require configuration (API keys, preferences).

### Via UI

1. Enable the skill
2. Click the gear icon
3. Fill in configuration fields
4. Save

### Configuration Schema

Skills can define their configuration requirements:

```yaml
configSchema:
  api_key:
    type: secret
    label: API Key
    description: Your API key for this service
    required: true
  temperature:
    type: number
    label: Temperature
    default: 0.7
  mode:
    type: select
    label: Mode
    options:
      - value: fast
        label: Fast (less accurate)
      - value: accurate
        label: Accurate (slower)
```

## Troubleshooting

### Skills Not Appearing

1. Verify the skills directory exists
2. Check that each skill has a SKILL.md file
3. Ensure SKILL.md has valid frontmatter
4. Click "Reload from Disk"

### Skill Not Working

1. Check if the skill is enabled (toggle is on)
2. Verify any required configuration is filled
3. Check browser console for errors
4. Look at server logs for skill execution errors

### Clawdbot Skills Missing

1. Verify the repository is cloned correctly
2. Check the source path is accurate
3. Ensure "Enable Clawdbot Skills" is toggled on
4. Click "Save & Reload Skills"

## Related Documentation

- [Configuration System](./configuration-system.md) - Settings and config
- [API Reference](./api-reference.md) - Skill API endpoints
