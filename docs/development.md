# MAIAChat v2 - Development Guide

This guide covers setting up a local development environment and contributing to MAIAChat v2.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Setup](#local-setup)
3. [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
5. [Testing](#testing)
6. [Code Style](#code-style)
7. [Architecture Overview](#architecture-overview)
8. [Contributing](#contributing)

---

## Prerequisites

### Required Software

- **Node.js**: v20 or higher
- **npm**: v10 or higher (comes with Node.js)
- **Docker**: v24 or higher (for local services)
- **Git**: Latest version

### Recommended Tools

- **VS Code** with extensions:
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - TypeScript Importer
- **TablePlus** or **pgAdmin** for database management
- **Redis Insight** for Redis debugging

---

## Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/alexcelewicz/MaiaChat_V2.git
cd maiachat_v2/maiachat-v2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

```bash
# Copy example file
cp .env.local.example .env.local

# Edit with your values
code .env.local
```

### 4. Start Local Services

```bash
# Start PostgreSQL, Redis, and MinIO
docker compose up -d

# Verify services are running
docker compose ps
```

### 5. Set Up Database

```bash
# Run migrations
npm run db:migrate

# (Optional) Generate types
npm run db:generate
```

### 6. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

---

## Project Structure

```
maiachat-v2/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Authentication pages
│   │   ├── (dashboard)/       # Main application pages
│   │   ├── admin/             # Admin panel
│   │   ├── api/               # API routes
│   │   └── shared/            # Public shared pages
│   │
│   ├── components/            # React components
│   │   ├── admin/            # Admin-specific components
│   │   ├── agents/           # Agent management
│   │   ├── auth/             # Auth forms
│   │   ├── chat/             # Chat interface
│   │   ├── code/             # Code viewer/editor
│   │   ├── conversation/     # Conversation management
│   │   ├── dashboard/        # Dashboard widgets
│   │   ├── documents/        # Document upload/view
│   │   ├── layout/           # Layout components
│   │   ├── profiles/         # Profile management
│   │   ├── providers/        # Context providers
│   │   ├── tools/            # Tool selectors
│   │   └── ui/               # shadcn/ui components
│   │
│   ├── lib/                   # Core utilities
│   │   ├── agents/           # Agent orchestration (LangGraph)
│   │   ├── ai/               # AI provider integrations
│   │   ├── auth/             # Auth utilities
│   │   ├── code/             # Code parsing utilities
│   │   ├── db/               # Database (Drizzle ORM)
│   │   ├── documents/        # Document processing
│   │   ├── embeddings/       # Vector embeddings
│   │   ├── firebase/         # Firebase client/admin
│   │   ├── hooks/            # Custom React hooks
│   │   ├── middleware/       # API middleware
│   │   ├── rag/              # RAG search utilities
│   │   ├── storage/          # S3/MinIO storage
│   │   └── tools/            # Tool implementations
│   │
│   ├── types/                # TypeScript types
│   └── middleware.ts         # Next.js middleware
│
├── drizzle/                   # Database migrations
├── docs/                      # Documentation
├── public/                    # Static assets
├── tests/
│   └── e2e/                  # Playwright tests
│
├── docker-compose.yml        # Local development services
├── docker-compose.prod.yml   # Production deployment
├── Dockerfile                # Container build
├── playwright.config.ts      # E2E test config
└── package.json
```

---

## Development Workflow

### Running the Dev Server

```bash
# Standard development
npm run dev

# With bundle analyzer
ANALYZE=true npm run build
```

### Database Operations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Push schema changes (dev only)
npm run db:push

# Open Drizzle Studio
npm run db:studio
```

### Linting and Formatting

```bash
# Run ESLint
npm run lint

# Fix ESLint errors
npm run lint -- --fix

# Format with Prettier
npx prettier --write .
```

### Type Checking

```bash
# Run TypeScript compiler
npx tsc --noEmit
```

---

## Testing

### E2E Testing with Playwright

```bash
# Install browsers (first time)
npx playwright install

# Run all tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific test file
npx playwright test tests/e2e/chat.spec.ts

# Generate test report
npx playwright show-report
```

### Test Environment Variables

Create `.env.test` for test-specific configuration:

```bash
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=testpassword123
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

---

## Code Style

### TypeScript Guidelines

```typescript
// ✅ Use explicit types for function parameters and returns
function processDocument(doc: Document): ProcessedDocument {
  // ...
}

// ✅ Use interfaces for objects
interface AgentConfig {
  id: string;
  name: string;
  model: string;
}

// ✅ Use type for unions/intersections
type Status = "pending" | "processing" | "complete";

// ❌ Avoid 'any'
function badFunction(data: any) {} // Don't do this

// ✅ Use 'unknown' and type guards instead
function goodFunction(data: unknown) {
  if (typeof data === "string") {
    // data is now typed as string
  }
}
```

### React Component Guidelines

```tsx
// ✅ Use function components with TypeScript
interface ButtonProps {
  variant?: "primary" | "secondary";
  onClick: () => void;
  children: React.ReactNode;
}

export function Button({ variant = "primary", onClick, children }: ButtonProps) {
  return (
    <button className={cn("btn", variant)} onClick={onClick}>
      {children}
    </button>
  );
}

// ✅ Use 'use client' directive for client components
"use client";

export function InteractiveComponent() {
  const [state, setState] = useState(false);
  // ...
}
```

### File Naming

- React components: `PascalCase.tsx`
- Utilities/hooks: `camelCase.ts`
- API routes: `route.ts` (Next.js convention)
- Types: `camelCase.ts`

---

## Architecture Overview

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, Tailwind CSS |
| UI Components | shadcn/ui, Radix UI |
| State | React hooks, SWR |
| Backend | Next.js API Routes |
| Database | PostgreSQL 16 + pgvector |
| ORM | Drizzle ORM |
| Cache | Redis |
| Auth | Better Auth |
| Storage | MinIO (S3-compatible) |
| AI | Vercel AI SDK, LangGraph |

### Data Flow

```
User → Next.js → API Route → Database/Redis/AI Provider → Response → UI
         ↓
    Middleware
    (Auth, Rate Limit)
```

### AI Provider Architecture

```typescript
// All providers implement the same interface
interface AIProvider {
  chat(messages: Message[], config: ModelConfig): Promise<StreamResponse>;
  generateEmbeddings(text: string[]): Promise<number[][]>;
}

// Provider factory selects the right implementation
const provider = getProvider("openai"); // or "anthropic", "google", etc.
```

### Agent Orchestration

```
User Message
    ↓
Orchestration Mode (Single/Sequential/Parallel/Hierarchical/Consensus)
    ↓
Agent Selection (based on routing rules)
    ↓
LangGraph Execution
    ↓
Response Aggregation
    ↓
User Response
```

---

## Contributing

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npx playwright test`
5. Commit: `git commit -m "feat: add my feature"`
6. Push: `git push origin feature/my-feature`
7. Open a Pull Request

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new chat feature
fix: resolve message ordering bug
docs: update API documentation
style: format code with prettier
refactor: simplify agent routing logic
test: add e2e tests for documents
chore: update dependencies
```

### Pull Request Guidelines

- [ ] Tests pass
- [ ] Linting passes
- [ ] Types check
- [ ] Documentation updated (if needed)
- [ ] PR description explains changes

### Code Review

- Be respectful and constructive
- Focus on code, not the person
- Suggest improvements with examples
- Approve when satisfied

---

## Useful Commands

```bash
# Development
npm run dev                 # Start dev server
npm run build              # Production build
npm run start              # Start production server

# Database
npm run db:generate        # Generate migration
npm run db:migrate         # Run migrations
npm run db:studio          # Open Drizzle Studio

# Testing
npx playwright test        # Run E2E tests
npx playwright test --ui   # Interactive test UI

# Code Quality
npm run lint               # ESLint
npx prettier --write .     # Format code
npx tsc --noEmit           # Type check

# Docker
docker compose up -d       # Start services
docker compose down        # Stop services
docker compose logs -f     # View logs
```

---

## Troubleshooting

### Common Issues

**Port 3000 already in use:**
```bash
# Find and kill the process
npx kill-port 3000
```

**Database connection errors:**
```bash
# Check if PostgreSQL is running
docker compose ps

# Restart services
docker compose restart postgres
```

**Type errors after schema change:**
```bash
# Regenerate types
npm run db:generate
```

**Hydration mismatch:**
- Check for `"use client"` directive
- Ensure dynamic content uses `useEffect`

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Playwright Documentation](https://playwright.dev/docs)
