"use client";

import { Badge } from "@/components/ui/badge";
import type { StudyCard } from "@/types";
import { cn } from "@/lib/utils";
import { formatDueIn } from "@/lib/scheduling/sm2";

interface StudyCardListItemProps {
  card: StudyCard;
}

const STATE_LABELS: Record<string, { label: string; className: string }> = {
  new:       { label: "New",       className: "bg-muted text-muted-foreground" },
  learn:     { label: "Learning",  className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
  review:    { label: "Review",    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  suspended: { label: "Suspended", className: "bg-muted text-muted-foreground line-through" },
  buried:    { label: "Buried",    className: "bg-muted text-muted-foreground" },
  leech:     { label: "Leech",     className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
};

export function StudyCardListItem({ card }: StudyCardListItemProps) {
  const stateInfo = STATE_LABELS[card.state] ?? STATE_LABELS.new;
  const dueStr = card.state === "review" || card.state === "learn"
    ? formatDueIn(new Date(card.due_at))
    : null;

  return (
    <div className={cn(
      "flex items-start gap-4 px-4 py-3 hover:bg-accent/30 transition-colors",
      card.is_flagged && "border-l-2 border-amber-400"
    )}>
      {/* Front preview */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium line-clamp-1"
          dangerouslySetInnerHTML={{ __html: card.front }}
        />
        <p
          className="text-xs text-muted-foreground mt-0.5 line-clamp-1"
          dangerouslySetInnerHTML={{ __html: card.back }}
        />
      </div>

      {/* Right side: state + due */}
      <div className="flex items-center gap-2 shrink-0">
        {dueStr && (
          <span className="text-xs text-muted-foreground">{dueStr}</span>
        )}
        <Badge
          variant="outline"
          className={cn("text-xs font-medium h-5", stateInfo.className)}
        >
          {stateInfo.label}
        </Badge>
        {card.is_flagged && (
          <span className="text-amber-500 text-xs">🚩</span>
        )}
      </div>
    </div>
  );
}
