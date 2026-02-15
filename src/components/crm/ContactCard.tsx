"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  name: string;
  company?: string;
  role?: string;
  importance: "critical" | "high" | "normal" | "low";
  relationshipScore: number;
  tags: string[];
  email?: string;
  avatarUrl?: string;
}

interface ContactCardProps {
  contact: Contact;
  onClick?: () => void;
}

const importanceColors: Record<Contact["importance"], string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  normal: "bg-blue-500",
  low: "bg-gray-400",
};

function getScoreColor(score: number): string {
  if (score < 30) return "bg-red-500/10 text-red-700 border-red-200";
  if (score <= 60) return "bg-yellow-500/10 text-yellow-700 border-yellow-200";
  return "bg-green-500/10 text-green-700 border-green-200";
}

export function ContactCard({ contact, onClick }: ContactCardProps) {
  const name = contact.name || "Unknown";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const tags = contact.tags ?? [];

  return (
    <Card
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-md",
        onClick && "hover:border-primary/30"
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
            importanceColors[contact.importance || "normal"]
          )}
        >
          {contact.avatarUrl ? (
            <img
              src={contact.avatarUrl}
              alt={name}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold">{name}</h3>
            <Badge
              variant="outline"
              className={cn("shrink-0 text-xs", getScoreColor(contact.relationshipScore ?? 0))}
            >
              {contact.relationshipScore ?? 0}
            </Badge>
          </div>

          {(contact.company || contact.role) && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[contact.role, contact.company].filter(Boolean).join(" at ")}
            </p>
          )}

          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
