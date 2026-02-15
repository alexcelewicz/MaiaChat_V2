import { Check, Minus } from "lucide-react";

const rows = [
  {
    feature: "Deployment",
    maia: "Self-hosted (Docker)",
    other: "Cloud-hosted only",
    maiaWins: true,
  },
  {
    feature: "AI Model Support",
    maia: "40+ models, 8 providers + local",
    other: "Limited provider support",
    maiaWins: true,
  },
  {
    feature: "Messaging Channels",
    maia: "Web, Telegram, Discord, Slack, WhatsApp",
    other: "Web only",
    maiaWins: true,
  },
  {
    feature: "RAG / Document Search",
    maia: "Built-in with vector search",
    other: "Limited or plugin-based",
    maiaWins: true,
  },
  {
    feature: "Agent Orchestration",
    maia: "Multi-agent with custom profiles",
    other: "Single agent",
    maiaWins: true,
  },
  {
    feature: "Data Privacy",
    maia: "100% on your servers",
    other: "Data passes through third-party",
    maiaWins: true,
  },
];

export function ComparisonSection() {
  return (
    <section className="px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Why Choose MaiaChat Over Clawdbot?
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            MaiaChat gives you full control. No vendor lock-in, no data leaving
            your infrastructure, and more integrations out of the box.
          </p>
        </div>

        {/* Comparison table */}
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Feature
                </th>
                <th className="px-4 py-3 font-semibold text-primary">
                  MaiaChat
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Clawdbot / OpenClaw
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ feature, maia, other, maiaWins }) => (
                <tr key={feature} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {feature}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 text-foreground">
                      {maiaWins && (
                        <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                      )}
                      {maia}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Minus className="h-4 w-4 flex-shrink-0" />
                      {other}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
