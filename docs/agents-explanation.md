# Agents Implementation Guide

## Overview

The MAIAChat application implements a sophisticated multi-agent system that allows you to configure and orchestrate multiple AI models working together. This system is built using **LangGraph** for state management and orchestration, enabling complex workflows where different AI agents collaborate to solve tasks.

---

## What Are Agents?

An **Agent** is a specialized AI configuration that includes:

- **Model Selection**: Each agent can use a different AI model (GPT-4, Claude, Gemini, etc.)
- **System Prompt**: Custom instructions that define the agent's behavior and expertise
- **Role**: Predefined role (coder, analyst, writer, researcher, coordinator, etc.)
- **Tools**: Capabilities like web search, code execution, file operations, RAG search
- **Parameters**: Temperature, max tokens, and other model-specific settings
- **Visibility**: Whether the agent can see other agents' responses
- **Priority**: Determines execution order in sequential mode

### Agent Configuration Structure

```typescript
{
  id: string;                    // Unique identifier
  name: string;                   // Display name
  description?: string;           // What this agent does
  role: "assistant" | "coder" | "analyst" | "writer" | "researcher" | "coordinator" | "reviewer" | "custom";
  provider: "openai" | "anthropic" | "google" | "xai" | ...;
  modelId: string;               // Specific model (e.g., "gpt-4o", "claude-sonnet-4-20250514")
  systemPrompt?: string;         // Custom instructions
  temperature: number;           // 0-2, controls creativity
  maxTokens?: number;            // Maximum response length
  tools: AgentTool[];            // ["web_search", "code_exec", "rag_search", ...]
  canSeeOtherAgents: boolean;    // Can see other agents' responses
  priority: number;              // 0-100, for ordering
  isActive: boolean;             // Enable/disable agent
}
```

---

## How Agents Are Implemented

### 1. **Core Architecture**

The system uses **LangGraph** (a state machine framework) to manage agent orchestration:

- **State Management**: `AgentStateAnnotation` tracks conversation state, messages, active agents, and orchestration mode
- **Graph Nodes**: Each orchestration mode has its own graph structure
- **Execution Flow**: Agents execute through defined graph nodes that handle routing and coordination

### 2. **Key Files**

- **`src/lib/agents/graph.ts`**: Core orchestration logic using LangGraph
- **`src/lib/agents/routing.ts`**: Intelligent routing based on task analysis
- **`src/types/agent.ts`**: Type definitions and schemas
- **`src/app/api/chat/multi-agent/route.ts`**: API endpoint for multi-agent conversations
- **`src/components/agents/AgentConfigForm.tsx`**: UI for creating/editing agents

### 3. **Agent Execution Flow**

```
User Message
    ↓
API Endpoint (/api/chat/multi-agent)
    ↓
Load Agents from Database
    ↓
Execute Orchestration (based on mode)
    ↓
LangGraph State Machine
    ↓
Agent Execution Nodes
    ↓
Model API Calls (OpenAI, Anthropic, Google, etc.)
    ↓
Response Aggregation
    ↓
Save to Database
    ↓
Return to UI
```

---

## Orchestration Modes

The system supports **6 different orchestration modes** for coordinating multiple agents:

### 1. **Single Mode** (`"single"`)
- **Use Case**: One agent handles everything
- **How It Works**: Uses the first active agent
- **Best For**: Simple tasks, single-purpose conversations

### 2. **Sequential Mode** (`"sequential"`)
- **Use Case**: Agents respond one after another, building on previous responses
- **How It Works**: 
  - Agents execute in priority order (highest first)
  - Each agent sees all previous agent responses (if `canSeeOtherAgents` is true)
  - Responses are chained together
- **Best For**: Multi-step tasks, review processes, iterative refinement

**Example Flow:**
```
User: "Write a Python function to calculate fibonacci numbers, then review it"
  ↓
Agent 1 (Coder): Writes the function
  ↓
Agent 2 (Reviewer): Reviews and suggests improvements
  ↓
Final Response: Combined output
```

### 3. **Parallel Mode** (`"parallel"`)
- **Use Case**: All agents respond simultaneously to the same input
- **How It Works**: 
  - All agents process the user message at the same time
  - Each agent works independently (unless `canSeeOtherAgents` is true)
  - All responses are collected and returned
- **Best For**: Getting multiple perspectives, comparing approaches, brainstorming

**Example Flow:**
```
User: "What's the best way to implement authentication?"
  ↓
Agent 1 (Coder): [Responds with OAuth approach]
Agent 2 (Analyst): [Responds with security analysis]
Agent 3 (Researcher): [Responds with industry best practices]
  ↓
All responses shown to user simultaneously
```

### 4. **Hierarchical Mode** (`"hierarchical"`)
- **Use Case**: A coordinator agent delegates tasks to specialist agents
- **How It Works**:
  1. Coordinator agent analyzes the task
  2. Coordinator breaks it into subtasks
  3. Coordinator delegates to appropriate specialists
  4. Specialists respond independently
  5. Coordinator synthesizes final response
- **Best For**: Complex multi-part tasks, research projects, comprehensive analysis

**Example Flow:**
```
User: "Research the pros and cons of microservices architecture"
  ↓
Coordinator: Analyzes task, delegates:
  - Researcher: Gather information
  - Analyst: Analyze pros/cons
  - Writer: Structure the response
  ↓
Specialists respond
  ↓
Coordinator: Synthesizes final comprehensive answer
```

### 5. **Consensus Mode** (`"consensus"`)
- **Use Case**: Multiple agents provide perspectives, then a synthesizer combines them
- **How It Works**:
  1. All agents respond in parallel
  2. A synthesizer agent (or first agent) combines responses
  3. Identifies agreements and disagreements
  4. Provides balanced final answer
- **Best For**: Important decisions, fact-checking, balanced perspectives

### 6. **Auto-Router Mode** (`"auto"`)
- **Use Case**: System automatically selects the best agent(s) and mode
- **How It Works**:
  1. Analyzes the task (code, analysis, creative, research, etc.)
  2. Matches task requirements to agent capabilities
  3. Selects optimal agents and mode
  4. Executes accordingly
- **Best For**: General use, when you want the system to decide

---

## What Agents Can Do

### 1. **Specialized Tasks**

Each agent can be configured for specific expertise:

- **Code Expert**: Write, review, debug code
- **Data Analyst**: Analyze data, create insights, statistical analysis
- **Content Writer**: Create written content, articles, documentation
- **Researcher**: Gather information, fact-check, synthesize research
- **Coordinator**: Orchestrate other agents, break down complex tasks
- **Reviewer**: Review and validate outputs from other agents

### 2. **Tool Integration**

Agents can use various tools:

- **`web_search`**: Search the internet for current information
- **`code_exec`**: Execute code snippets
- **`file_read`**: Read files from the system
- **`file_write`**: Write files to the system
- **`rag_search`**: Search through your uploaded documents
- **`image_gen`**: Generate images
- **`calculator`**: Perform mathematical calculations

### 3. **Model Diversity**

You can mix different AI models:

- **OpenAI**: GPT-4o, GPT-4o-mini, O1, O1-mini
- **Anthropic**: Claude Sonnet 4, Claude Opus 4, Claude Haiku
- **Google**: Gemini 2.5 Pro, Gemini 2.0 Flash
- **X.AI**: Grok-3, Grok-3-fast

**Example**: Use GPT-4o for reasoning, Claude for writing, Gemini for research.

### 4. **Custom Behavior**

- **System Prompts**: Define exactly how each agent should behave
- **Temperature**: Control creativity (low = focused, high = creative)
- **Max Tokens**: Control response length
- **Visibility**: Control whether agents see each other's work

---

## How to Use Multiple Models Working Together

### Step 1: Create Agents

1. Go to the **Agents** page (`/agents`)
2. Click **"New Agent"**
3. Configure each agent:
   - **Name**: e.g., "Code Expert"
   - **Role**: Select appropriate role (coder, analyst, etc.)
   - **Provider**: Choose AI provider (OpenAI, Anthropic, Google, etc.)
   - **Model**: Select specific model
   - **System Prompt**: Define behavior
   - **Tools**: Enable relevant tools
   - **Temperature**: Adjust for task type

### Step 2: Add Agents to a Conversation

Agents are associated with conversations. When you create or use a conversation, you can:

- Add multiple agents to the conversation
- Each agent can use a different model
- Configure orchestration mode

### Step 3: Choose Orchestration Mode

When sending a message, specify the orchestration mode:

```typescript
// API Request
POST /api/chat/multi-agent
{
  "conversationId": "uuid",
  "message": "Your question here",
  "orchestrationMode": "sequential", // or "parallel", "hierarchical", etc.
  "agentIds": ["agent-1-id", "agent-2-id"], // Optional: specific agents
  "enableDebug": false
}
```

### Step 4: Examples of Multi-Model Workflows

#### Example 1: Code Review Pipeline

**Setup:**
- Agent 1: **Coder** (Claude Sonnet 4) - Writes code
- Agent 2: **Reviewer** (GPT-4o) - Reviews code
- Mode: **Sequential**

**Workflow:**
```
User: "Write a Python function to parse JSON and handle errors"
  ↓
Coder (Claude): Writes the function
  ↓
Reviewer (GPT-4o): Reviews for best practices, suggests improvements
  ↓
Final: Code + review feedback
```

#### Example 2: Research & Analysis

**Setup:**
- Agent 1: **Researcher** (Gemini 2.5 Pro) - Gathers information
- Agent 2: **Analyst** (O1) - Analyzes data
- Agent 3: **Writer** (Claude Sonnet 4) - Structures response
- Mode: **Hierarchical** (with Coordinator)

**Workflow:**
```
User: "Research the impact of AI on software development"
  ↓
Coordinator: Delegates:
  - Researcher: Gather current information
  - Analyst: Analyze trends and patterns
  - Writer: Structure comprehensive report
  ↓
Coordinator: Synthesizes final report
```

#### Example 3: Multiple Perspectives

**Setup:**
- Agent 1: **Coder** (GPT-4o) - Technical approach
- Agent 2: **Analyst** (Claude Opus 4) - Strategic approach
- Agent 3: **Researcher** (Gemini) - Industry best practices
- Mode: **Parallel**

**Workflow:**
```
User: "What's the best architecture for a real-time chat app?"
  ↓
All three agents respond simultaneously:
  - Coder: Technical implementation details
  - Analyst: Strategic considerations
  - Researcher: Industry patterns and benchmarks
  ↓
User sees all three perspectives at once
```

#### Example 4: Auto-Routing

**Setup:**
- Multiple agents with different roles
- Mode: **Auto**

**Workflow:**
```
User: "Write a Python script to analyze CSV data"
  ↓
System analyzes: "code" task
  ↓
Auto-selects: Coder agent (best match)
  ↓
Executes with Coder agent
```

---

## Advanced Features

### 1. **Intelligent Routing** (`src/lib/agents/routing.ts`)

The system can automatically route tasks to the best agents based on:

- **Task Type Detection**: Code, analysis, creative, research, etc.
- **Capability Matching**: Matches task requirements to agent capabilities
- **Cost Optimization**: Selects models within budget constraints
- **Latency Optimization**: Prefers faster models for time-sensitive tasks
- **Quality Tiers**: Budget, balanced, premium, frontier models

### 2. **Agent Visibility Control**

- **`canSeeOtherAgents: true`**: Agent sees all previous agent responses
- **`canSeeOtherAgents: false`**: Agent only sees user messages and its own responses

Useful for:
- Independent analysis (set to false)
- Collaborative refinement (set to true)

### 3. **Priority System**

- Agents with higher priority execute first in sequential mode
- Useful for review workflows where reviewer should come last

### 4. **Debug Mode**

Enable debug mode to see:
- Reasoning steps
- Routing decisions
- Agent selection logic

---

## Best Practices

### 1. **Agent Design**

- **One Agent, One Purpose**: Each agent should have a clear, focused role
- **Clear System Prompts**: Be specific about what the agent should do
- **Appropriate Models**: Use powerful models (GPT-4o, Claude Opus) for complex tasks, faster models (GPT-4o-mini, Gemini Flash) for simple tasks

### 2. **Orchestration Mode Selection**

- **Simple questions**: Use "single" mode
- **Multi-step tasks**: Use "sequential" mode
- **Multiple perspectives**: Use "parallel" mode
- **Complex projects**: Use "hierarchical" mode with coordinator
- **Uncertain**: Use "auto" mode

### 3. **Model Selection**

- **Reasoning tasks**: O1, Claude Opus 4, GPT-4o
- **Code tasks**: Claude Sonnet 4, GPT-4o
- **Creative tasks**: Claude Sonnet 4 (higher temperature)
- **Research tasks**: Gemini 2.5 Pro (good at web search)
- **Fast responses**: GPT-4o-mini, Gemini Flash

### 4. **Cost Management**

- Use expensive models (O1, Claude Opus) only for complex tasks
- Use cheaper models (GPT-4o-mini) for simple tasks
- Set `maxTokens` to limit response length
- Use routing preferences to set cost limits

---

## Technical Implementation Details

### State Management

The system uses LangGraph's state annotation system:

```typescript
const AgentStateAnnotation = Annotation.Root({
  conversationId: string,
  messages: AgentMessage[],      // All messages in conversation
  activeAgents: AgentConfig[],    // Agents participating
  orchestrationMode: OrchestrationMode,
  currentAgentIndex: number,      // For sequential mode
  round: number,                  // For consensus mode
  isComplete: boolean,
  userInput: string,
  debug?: { reasoning, decisions }
});
```

### Graph Execution

Each mode has its own graph:

```typescript
// Sequential Mode
START → process → [continue/end] → END

// Parallel Mode
START → parallel → END

// Hierarchical Mode
START → coordinator → END
```

### Agent Execution

Each agent execution:
1. Builds message history (filtered by visibility)
2. Adds system prompt
3. Calls model API
4. Returns formatted response
5. Updates state

---

## API Usage

### Create Agent

```typescript
POST /api/agents
{
  "conversationId": "uuid",
  "name": "My Agent",
  "role": "coder",
  "provider": "openai",
  "modelId": "gpt-4o",
  "systemPrompt": "You are a code expert...",
  "temperature": 0.7,
  "tools": ["code_exec"],
  "canSeeOtherAgents": true,
  "priority": 50,
  "isActive": true
}
```

### Multi-Agent Chat

```typescript
POST /api/chat/multi-agent
{
  "conversationId": "uuid",
  "message": "Your question",
  "orchestrationMode": "sequential",
  "agentIds": ["agent-1-id", "agent-2-id"], // Optional
  "enableDebug": false
}
```

### Get Agents

```typescript
GET /api/agents?conversationId=uuid
GET /api/agents?includePresets=true
```

---

## Future Enhancements

Based on the codebase, planned features include:

- **Streaming Responses**: Real-time streaming from all agents
- **Agent-to-Agent Communication**: Direct agent collaboration
- **Checkpointing**: Save and resume agent workflows
- **Tool Approval**: Human-in-the-loop for tool calls
- **Agent Templates**: Reusable agent configurations

---

## Summary

The agents system in MAIAChat enables:

✅ **Multiple AI models** working together  
✅ **6 orchestration modes** for different workflows  
✅ **Specialized agents** for specific tasks  
✅ **Tool integration** (web search, code execution, RAG, etc.)  
✅ **Intelligent routing** based on task analysis  
✅ **Cost and latency optimization**  
✅ **Flexible configuration** per agent  

This creates a powerful platform for complex AI workflows where different models collaborate to provide comprehensive, high-quality responses.
