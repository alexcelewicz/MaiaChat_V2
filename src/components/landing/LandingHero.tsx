import Link from "next/link";
import {
  Server,
  Cpu,
  Shield,
  ArrowRight,
  Star,
  MessageSquare,
  Wrench,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const stats = [
  { value: "40+", label: "AI Models", icon: Cpu },
  { value: "8", label: "Providers", icon: Layers },
  { value: "5", label: "Channels", icon: MessageSquare },
  { value: "14+", label: "Built-in Tools", icon: Wrench },
];

export function LandingHero() {
  return (
    <section className="relative overflow-hidden px-4 pt-20 pb-16 sm:pt-28 sm:pb-20">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-primary/15 to-violet-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-blue-500/10 to-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl text-center">
        {/* Trust badges */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Server className="h-3.5 w-3.5" />
            Self-Hosted
          </Badge>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Cpu className="h-3.5 w-3.5" />
            40+ Models
          </Badge>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Shield className="h-3.5 w-3.5" />
            Open Source
          </Badge>
        </div>

        {/* H1 */}
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Self-Hosted{" "}
          <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
            AI Assistant
          </span>{" "}
          Platform
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          The open source alternative to Clawdbot and OpenClaw. Run your own
          multi-provider AI assistant with Telegram, Discord, Slack, and web
          chat — fully under your control.
        </p>

        {/* CTAs */}
        <div className="mb-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="h-12 px-8 text-base" asChild>
            <Link href="/chat">
              Try MaiaChat Now
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
            <a
              href="https://github.com/alexcelewicz/MaiaChat_V2"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Star className="h-4 w-4" />
              Star on GitHub
            </a>
          </Button>
        </div>

        {/* Stats grid */}
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(({ value, label, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border bg-card/50 p-4 text-center backdrop-blur-sm"
            >
              <Icon className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground" />
              <div className="text-2xl font-bold text-foreground">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
