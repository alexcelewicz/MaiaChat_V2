"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Users, Mail, Calendar, Phone, MessageSquare, StickyNote } from "lucide-react";

interface StaleContact {
  id: string;
  name: string;
  lastContactAt: string | null;
  importance: "critical" | "high" | "normal" | "low";
}

interface RecentInteraction {
  id: string;
  type: string;
  subject: string;
  occurredAt: string;
}

interface BriefingData {
  staleContacts: StaleContact[];
  recentInteractions: RecentInteraction[];
  totalContacts: number;
}

interface MorningBriefingCardProps {
  briefing: BriefingData;
}

const importanceBadgeVariant: Record<StaleContact["importance"], "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "default",
  normal: "secondary",
  low: "outline",
};

const typeIcons: Record<string, typeof Mail> = {
  email: Mail,
  email_sent: Mail,
  email_received: Mail,
  meeting: Calendar,
  call: Phone,
  chat: MessageSquare,
  note: StickyNote,
};

function daysSince(dateString: string | null): number {
  if (!dateString) return -1;
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function formatRelativeTime(dateString: string): string {
  const days = daysSince(dateString);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function MorningBriefingCard({ briefing }: MorningBriefingCardProps) {
  const staleContacts = briefing?.staleContacts ?? [];
  const recentInteractions = briefing?.recentInteractions ?? [];
  const totalContacts = briefing?.totalContacts ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Morning Briefing
          <Badge variant="secondary" className="ml-auto text-xs">
            <Users className="mr-1 h-3 w-3" />
            {totalContacts} contacts
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Stale Contacts */}
        {staleContacts.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-orange-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Needs Attention ({staleContacts.length})
            </h4>
            <ul className="space-y-1.5">
              {staleContacts.map((contact) => (
                <li
                  key={contact.id}
                  className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{contact.name}</span>
                    <Badge variant={importanceBadgeVariant[contact.importance]} className="text-[10px] px-1.5 py-0">
                      {contact.importance}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {daysSince(contact.lastContactAt) >= 0
                      ? `${daysSince(contact.lastContactAt)}d since last contact`
                      : "No previous contact logged"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recent Interactions */}
        {recentInteractions.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium">Recent Activity</h4>
            <ul className="space-y-1.5">
              {recentInteractions.slice(0, 5).map((interaction) => {
                const Icon = typeIcons[interaction.type] || MessageSquare;
                return (
                  <li
                    key={interaction.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{interaction.subject}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(interaction.occurredAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Empty state */}
        {staleContacts.length === 0 && recentInteractions.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-2">
            All caught up! No alerts or recent activity.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
