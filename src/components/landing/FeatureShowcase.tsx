import {
  Brain,
  MessageSquare,
  Search,
  Bot,
  Clock,
  Server,
  Wrench,
  Workflow,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Multi-Provider AI",
    description:
      "Connect OpenAI, Anthropic, Google Gemini, xAI Grok, and local models. Switch providers per-conversation with your own API keys.",
    highlights: [
      "40+ models supported",
      "Bring your own API keys",
      "Local model support via Ollama",
    ],
    gradient: "from-violet-500 to-purple-600",
  },
  {
    icon: MessageSquare,
    title: "Multi-Channel Messaging",
    description:
      "One AI assistant accessible from Telegram, Discord, Slack, WhatsApp, and web chat. Conversation history synced across every channel.",
    highlights: [
      "5 channel integrations",
      "Unified conversation history",
      "Channel-specific personalities",
    ],
    gradient: "from-blue-500 to-cyan-600",
  },
  {
    icon: Search,
    title: "RAG Document Search",
    description:
      "Upload PDFs, Word docs, and spreadsheets. AI searches your documents with retrieval-augmented generation for accurate, cited answers.",
    highlights: [
      "PDF, DOCX, XLSX support",
      "Vector-based retrieval",
      "Source citations included",
    ],
    gradient: "from-pink-500 to-rose-600",
  },
  {
    icon: Bot,
    title: "Autonomous Agents",
    description:
      "Deploy AI agents that reason, plan, and execute multi-step tasks. Background agents work autonomously while you focus elsewhere.",
    highlights: [
      "Multi-step task execution",
      "Background processing",
      "Tool-calling capabilities",
    ],
    gradient: "from-amber-500 to-orange-600",
  },
  {
    icon: Clock,
    title: "Scheduled Tasks",
    description:
      "Automate recurring AI tasks on any cron schedule. Morning briefings, report generation, monitoring — all running on autopilot.",
    highlights: [
      "Cron-based scheduling",
      "Automated reports",
      "Proactive notifications",
    ],
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    icon: Server,
    title: "Self-Hosted & Private",
    description:
      "Deploy on your own infrastructure with Docker. Your data never leaves your servers. Full control over models, storage, and access.",
    highlights: [
      "Docker one-command deploy",
      "Zero data sharing",
      "Full admin controls",
    ],
    gradient: "from-indigo-500 to-violet-600",
  },
  {
    icon: Wrench,
    title: "14+ Built-in Tools",
    description:
      "Web search, code execution, image generation, voice mode, document analysis, and more — all available out of the box.",
    highlights: [
      "Web search & browsing",
      "Code execution sandbox",
      "Image generation",
    ],
    gradient: "from-orange-500 to-red-600",
  },
  {
    icon: Workflow,
    title: "Multi-Agent Orchestration",
    description:
      "Create custom agent profiles with different models, system prompts, and tool access. Orchestrate multiple agents on complex workflows.",
    highlights: [
      "Custom agent profiles",
      "Per-agent model selection",
      "Workflow orchestration",
    ],
    gradient: "from-cyan-500 to-blue-600",
  },
];

export function FeatureShowcase() {
  return (
    <section className="px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything You Need in an AI Platform
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            MaiaChat combines multi-provider AI, multi-channel messaging, and
            powerful automation — all self-hosted and open source.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, description, highlights, gradient }) => (
            <div
              key={title}
              className="group relative rounded-xl border bg-card/50 p-5 backdrop-blur-sm transition-all duration-300 hover:border-primary/20 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
            >
              {/* Gradient orb */}
              <div
                className={`absolute -top-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-10 ${gradient}`}
              />

              <div className="relative">
                <div
                  className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm ${gradient}`}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="mb-1.5 text-sm font-semibold text-foreground">
                  {title}
                </h3>
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                  {description}
                </p>
                <ul className="space-y-1">
                  {highlights.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span className="h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
