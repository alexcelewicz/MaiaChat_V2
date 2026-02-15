"use client";

import {
  Mail,
  Calendar,
  Phone,
  MessageSquare,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Interaction {
  id: string;
  type: string;
  subject: string;
  summary?: string;
  channel?: string;
  sentiment?: string;
  occurredAt: string;
}

interface InteractionTimelineProps {
  interactions: Interaction[];
}

const typeConfig: Record<string, { icon: typeof Mail; label: string; color: string }> = {
  email: { icon: Mail, label: "Email", color: "text-blue-500 bg-blue-50" },
  email_sent: { icon: Mail, label: "Email Sent", color: "text-blue-500 bg-blue-50" },
  email_received: { icon: Mail, label: "Email Received", color: "text-blue-500 bg-blue-50" },
  meeting: { icon: Calendar, label: "Meeting", color: "text-purple-500 bg-purple-50" },
  call: { icon: Phone, label: "Call", color: "text-green-500 bg-green-50" },
  chat: { icon: MessageSquare, label: "Chat", color: "text-orange-500 bg-orange-50" },
  note: { icon: StickyNote, label: "Note", color: "text-gray-500 bg-gray-50" },
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

export function InteractionTimeline({ interactions }: InteractionTimelineProps) {
  if (interactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <MessageSquare className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">No interactions yet</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

      {interactions.map((interaction) => {
        const config = typeConfig[interaction.type] || {
          icon: MessageSquare,
          label: interaction.type,
          color: "text-gray-500 bg-gray-50",
        };
        const Icon = config.icon;

        return (
          <div key={interaction.id} className="relative flex gap-3 pb-6 last:pb-0">
            {/* Icon circle */}
            <div
              className={cn(
                "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                config.color
              )}
            >
              <Icon className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {config.label}
                  </span>
                  {interaction.sentiment && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0 rounded-full border",
                        interaction.sentiment === "positive" &&
                          "bg-green-50 text-green-600 border-green-200",
                        interaction.sentiment === "negative" &&
                          "bg-red-50 text-red-600 border-red-200",
                        interaction.sentiment === "neutral" &&
                          "bg-gray-50 text-gray-600 border-gray-200"
                      )}
                    >
                      {interaction.sentiment}
                    </span>
                  )}
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(interaction.occurredAt)}
                </time>
              </div>

              <p className="mt-0.5 text-sm font-medium">{interaction.subject}</p>

              {interaction.summary && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {interaction.summary}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
