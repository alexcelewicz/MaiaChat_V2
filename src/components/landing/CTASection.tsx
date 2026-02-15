import Link from "next/link";
import { ArrowRight, Star, Shield, Server, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const trustItems = [
  { icon: Shield, label: "No data collection" },
  { icon: Server, label: "Self-hosted" },
  { icon: Zap, label: "Free & open source" },
];

export function CTASection() {
  return (
    <section className="px-4 py-16 sm:py-20">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-card to-violet-500/5 p-8 sm:p-12">
        {/* Background orb */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 blur-3xl" />

        <div className="relative text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Ready to Run Your Own AI Assistant?
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            Deploy MaiaChat in minutes with Docker. Connect your preferred AI
            providers, add your messaging channels, and start chatting.
          </p>

          <div className="mb-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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

          <div className="flex flex-wrap items-center justify-center gap-4">
            {trustItems.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Icon className="h-4 w-4" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
