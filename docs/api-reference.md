# MAIAChat v2 - API Reference

This document describes all available API endpoints in MAIAChat v2.

## Base URL

- Development: `http://localhost:3000/api`
- Production: `https://your-domain.com/api`

## Authentication

Most endpoints require authentication via Firebase session cookie.

```http
Cookie: session=<firebase-session-token>
```

---

## Health & Status

### Check Health

```http
GET /api/health
```

Returns system health status including database, Redis, and S3 connectivity.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "2.0.0",
  "uptime": 3600,
  "services": {
    "database": { "status": "up", "latency": 5 },
    "redis": { "status": "up", "latency": 2 },
    "s3": { "status": "up", "latency": 15 }
  }
}
```

**Status Codes:**
- `200`: Healthy or degraded
- `503`: Unhealthy (database down)

---

## Authentication

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Get Current User

```http
GET /api/auth/me
```

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Logout

```http
POST /api/auth/logout
```

---

## Conversations

### List Conversations

```http
GET /api/conversations?page=1&limit=20&folderId=uuid
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |
| folderId | uuid | Filter by folder |
| isFavorite | boolean | Filter favorites |

**Response:**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "Chat about AI",
      "lastMessage": "What is machine learning?",
      "updatedAt": "2024-01-01T12:00:00.000Z",
      "isFavorite": false,
      "tags": ["ai", "learning"]
    }
  ],
  "total": 100,
  "page": 1,
  "pages": 5
}
```

### Create Conversation

```http
POST /api/conversations
Content-Type: application/json

{
  "title": "New Chat",
  "folderId": "uuid (optional)",
  "profileId": "uuid (optional)"
}
```

### Get Conversation

```http
GET /api/conversations/:id
```

### Update Conversation

```http
PATCH /api/conversations/:id
Content-Type: application/json

{
  "title": "Updated Title",
  "isFavorite": true
}
```

### Delete Conversation

```http
DELETE /api/conversations/:id
```

### Search Conversations

```http
GET /api/conversations/search?q=machine+learning
```

### Export Conversation

```http
GET /api/conversations/:id/export?format=json
```

**Formats:** `json`, `markdown`, `pdf`

### Share Conversation

```http
POST /api/conversations/:id/share
```

**Response:**
```json
{
  "shareToken": "abc123",
  "shareUrl": "https://maiachat.com/shared/abc123"
}
```

---

## Messages

### List Messages

```http
GET /api/conversations/:conversationId/messages
```

### Create Message

```http
POST /api/messages
Content-Type: application/json

{
  "conversationId": "uuid",
  "role": "user",
  "content": "Hello, AI!"
}
```

### Update Message

```http
PATCH /api/messages/:id
Content-Type: application/json

{
  "content": "Updated message content"
}
```

### Delete Message

```http
DELETE /api/messages/:id
```

---

## Chat (AI Interaction)

### Single Provider Chat

```http
POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "model": "gpt-4o",
  "conversationId": "uuid (optional)",
  "ragEnabled": false,
  "ragDocuments": []
}
```

**Response:** Server-Sent Events (SSE) stream

### Multi-Agent Chat

```http
POST /api/chat/multi-agent
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Research this topic" }
  ],
  "agentIds": ["uuid1", "uuid2"],
  "orchestrationMode": "sequential",
  "conversationId": "uuid",
  "enableDebug": false
}
```

**Orchestration Modes:**
- `single`: One agent responds
- `sequential`: Agents respond in order
- `parallel`: Agents respond simultaneously
- `hierarchical`: Coordinator delegates to specialists
- `consensus`: Agents discuss and agree
- `auto-router`: Automatic agent selection

---

## Documents

### Upload Document

```http
POST /api/documents/upload
Content-Type: multipart/form-data

file: <binary>
```

**Supported Types:** PDF, DOCX, TXT, MD, CSV, JSON, XLSX

**Response:**
```json
{
  "id": "uuid",
  "filename": "document.pdf",
  "fileType": "pdf",
  "fileSize": 1024000,
  "status": "uploaded"
}
```

### List Documents

```http
GET /api/documents
```

### Get Document

```http
GET /api/documents/:id
```

### Delete Document

```http
DELETE /api/documents/:id
```

### Generate Embeddings

```http
POST /api/documents/:id/embeddings
```

Triggers processing, chunking, and embedding generation.

### Upload to Gemini

```http
POST /api/documents/:id/gemini
```

Uploads document to Gemini File Store for Gemini model context.

---

## RAG Search

### Semantic Search

```http
POST /api/rag/search
Content-Type: application/json

{
  "query": "What is machine learning?",
  "documentIds": ["uuid1", "uuid2"],
  "limit": 5,
  "threshold": 0.7,
  "searchType": "hybrid"
}
```

**Search Types:** `semantic`, `text`, `hybrid`

**Response:**
```json
{
  "results": [
    {
      "chunkId": "uuid",
      "documentId": "uuid",
      "content": "Machine learning is...",
      "score": 0.92,
      "metadata": {}
    }
  ]
}
```

---

## Agents

### List Agents

```http
GET /api/agents
```

### Create Agent

```http
POST /api/agents
Content-Type: application/json

{
  "name": "Research Assistant",
  "role": "researcher",
  "description": "Expert at finding information",
  "provider": "openai",
  "model": "gpt-4o",
  "systemPrompt": "You are a research assistant...",
  "temperature": 0.7,
  "maxTokens": 4096,
  "tools": ["web-search", "rag-search"]
}
```

### Get Agent

```http
GET /api/agents/:id
```

### Update Agent

```http
PATCH /api/agents/:id
Content-Type: application/json

{
  "name": "Updated Name"
}
```

### Delete Agent

```http
DELETE /api/agents/:id
```

---

## Profiles

### List Profiles

```http
GET /api/profiles
```

### Create Profile

```http
POST /api/profiles
Content-Type: application/json

{
  "name": "Research Mode",
  "description": "Configuration for research tasks",
  "isDefault": false,
  "config": {
    "agents": [
      { "id": "uuid", "enabled": true }
    ],
    "ragEnabled": true,
    "ragDocuments": ["uuid1"],
    "orchestrationMode": "sequential",
    "uiPreferences": {
      "showDebugPanel": true
    }
  }
}
```

### Get Profile

```http
GET /api/profiles/:id
```

### Update Profile

```http
PATCH /api/profiles/:id
Content-Type: application/json

{
  "name": "Updated Profile"
}
```

### Delete Profile

```http
DELETE /api/profiles/:id
```

---

## API Keys

### List API Keys

```http
GET /api/api-keys
```

**Response:**
```json
{
  "keys": [
    {
      "id": "uuid",
      "provider": "openai",
      "lastFourChars": "sk-...abcd",
      "isValid": true,
      "lastUsed": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

### Save API Key

```http
POST /api/api-keys
Content-Type: application/json

{
  "provider": "openai",
  "apiKey": "sk-..."
}
```

### Validate API Key

```http
POST /api/api-keys/validate
Content-Type: application/json

{
  "provider": "openai",
  "apiKey": "sk-..."
}
```

### Delete API Key

```http
DELETE /api/api-keys/:provider
```

---

## Tools

### List Available Tools

```http
GET /api/tools
```

**Response:**
```json
{
  "tools": [
    {
      "id": "web-search",
      "name": "Web Search",
      "description": "Search the web using DuckDuckGo",
      "parameters": {
        "query": { "type": "string", "required": true }
      }
    }
  ]
}
```

---

## Folders

### List Folders

```http
GET /api/folders
```

### Create Folder

```http
POST /api/folders
Content-Type: application/json

{
  "name": "Work",
  "color": "#3b82f6"
}
```

---

## Usage & Analytics

### Get Usage Statistics

```http
GET /api/usage?startDate=2024-01-01&endDate=2024-01-31&groupBy=day
```

**Response:**
```json
{
  "totalTokens": 1000000,
  "totalCost": 15.50,
  "byProvider": {
    "openai": { "tokens": 500000, "cost": 10.00 },
    "anthropic": { "tokens": 500000, "cost": 5.50 }
  },
  "daily": [
    { "date": "2024-01-01", "tokens": 50000, "cost": 0.75 }
  ]
}
```

---

## Admin Endpoints

**Requires admin role**

### List Users

```http
GET /api/admin/users?page=1&search=john
```

### Update User

```http
PATCH /api/admin/users/:id
Content-Type: application/json

{
  "role": "admin",
  "status": "active"
}
```

### Feature Flags

```http
GET /api/admin/features
POST /api/admin/features
Content-Type: application/json

{
  "name": "multi-agent",
  "enabled": true
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

**Common Status Codes:**
| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Not authenticated |
| 403 | Forbidden - Not authorized |
| 404 | Not Found |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| /api/chat | 60 requests/minute |
| /api/documents/upload | 10 requests/minute |
| /api/rag/search | 120 requests/minute |
| Other endpoints | 300 requests/minute |

When rate limited, response includes:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704067200
```
