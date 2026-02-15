# MaiaChat CLI Tools Integration

Enable your AI assistant to write code using Claude Code or Gemini CLI.

## Overview

MaiaChat can invoke coding CLIs (Claude Code, Gemini) to handle complex coding tasks. This gives the AI the ability to:

- Create new projects and files
- Write and refactor code
- Debug and fix issues
- Generate documentation
- Work with multiple files simultaneously

## Prerequisites

You need at least one of these CLIs installed:

### Claude Code
```bash
# Install via npm
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### Gemini CLI
```bash
# Install via npm
npm install -g @google/gemini-cli

# Verify installation
gemini --version
```

## Configuration

### Via Admin UI

1. Go to **Admin Settings**
2. Find the **CLI Tools** card
3. Check CLI availability status
4. Toggle "Enable CLI Tools" on
5. Configure settings:
   - **Default CLI**: Choose Claude Code or Gemini
   - **Skip Permission Prompts**: Enable for unattended execution
   - **Workspace Directory**: Where generated files are saved
6. Click "Save CLI settings"

### Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Enable CLI tools | false |
| `defaultCli` | Which CLI to use | "claude" |
| `skipPermissions` | Skip CLI permission prompts | true |
| `workspaceRoot` | Output directory | "./workspace" |
| `organizeByTask` | Create dated subdirectories | true |

## How It Works

### Task Execution Flow

1. User asks AI to write code (e.g., "Create a weather app")
2. AI determines this requires the coding CLI tool
3. AI invokes the `coding_cli` tool with the task description
4. CLI executes in the workspace directory
5. AI returns the results including any created files

### Workspace Organization

When `organizeByTask` is enabled (default), files are organized like:

```
workspace/
├── 2026-02-01-weather-app/
│   ├── index.js
│   ├── package.json
│   └── README.md
├── 2026-02-01-api-refactor/
│   └── api.ts
└── .gitignore
```

### Interactive Sessions

The CLI Bridge handles interactive prompts automatically:

- **Yes/No questions**: Defaults to "yes" for safe operations
- **Confirmation prompts**: Automatically continues
- **Selection prompts**: Escalates to user if multiple options
- **Text input**: Escalates to user

## Example Usage

### In Chat

```
User: Create a simple Express.js API with endpoints for users

AI: I'll create that for you using Claude Code.
[Invokes coding_cli tool]

The Express API has been created in workspace/2026-02-01-express-api/
Files created:
- server.js
- routes/users.js
- package.json

The API includes:
- GET /users - List all users
- GET /users/:id - Get user by ID
- POST /users - Create user
- PUT /users/:id - Update user
- DELETE /users/:id - Delete user
```

### API Usage

```typescript
import { executeCodingCLI } from "@/lib/tools/coding-cli";

const result = await executeCodingCLI({
  cli: "claude",
  task: "Create a React component for displaying user profiles",
  workingDirectory: "my-project",
  timeout: 300000,
  skipPermissions: true,
});

if (result.success) {
  console.log("Files created:", result.filesCreated);
  console.log("Working directory:", result.workingDirectory);
}
```

## Security Considerations

### Permission Modes

- **With permissions** (`skipPermissions: false`): CLI prompts for each file operation
- **Skip permissions** (`skipPermissions: true`): CLI operates without prompts

### Workspace Isolation

All CLI output is contained within the configured workspace directory. This:
- Prevents accidental modification of system files
- Keeps generated code organized
- Makes cleanup easy

### Recommendations

1. **Use a dedicated workspace**: Don't point to your main project directory
2. **Review generated code**: Always review before using in production
3. **Enable permissions for sensitive operations**: When working with existing code

## Troubleshooting

### CLI Not Found

If the status shows "Not found":
1. Verify the CLI is installed globally
2. Check your PATH includes npm global bin directory
3. Try running `claude --version` or `gemini --version` in terminal

### Timeout Issues

If tasks are timing out:
1. Increase the timeout value in settings
2. Break large tasks into smaller steps
3. Check network connectivity (CLI may need API access)

### Permission Errors

If CLI fails with permission errors:
1. Ensure workspace directory is writable
2. Check file system permissions
3. Try enabling `skipPermissions` for automated tasks

## Related Documentation

- [Configuration System](./configuration-system.md) - Settings and config
- [Skills System](./skills-system.md) - Plugin architecture
- [API Reference](./api-reference.md) - Full API documentation
