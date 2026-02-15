"use client";

import { cn } from "@/lib/utils";

interface RelationshipScoreBarProps {
  score: number;
}

function getBarColor(score: number): string {
  if (score < 30) return "bg-red-500";
  if (score <= 60) return "bg-yellow-500";
  return "bg-green-500";
}

function getTextColor(score: number): string {
  if (score < 30) return "text-red-600";
  if (score <= 60) return "text-yellow-600";
  return "text-green-600";
}

export function RelationshipScoreBar({ score }: RelationshipScoreBarProps) {
  const clampedScore = Math.max(0, Math.min(100, score ?? 0));

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              getBarColor(clampedScore)
            )}
            style={{ width: `${clampedScore}%` }}
          />
        </div>
      </div>
      <span className={cn("text-sm font-semibold tabular-nums", getTextColor(clampedScore))}>
        {clampedScore}
      </span>
    </div>
  );
}
