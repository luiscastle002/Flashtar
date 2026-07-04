"use client";

import React, { memo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudyCard } from "@/types";
import { cn } from "@/lib/utils";
import { formatDueIn } from "@/lib/scheduling/sm2";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";

interface StudyCardListItemProps {
  card: StudyCard;
  checked?: boolean;
  onCheckedChange?: (cardId: string) => void;
  onDoubleClick?: (card: StudyCard) => void;
  showCheckbox?: boolean;
  id?: string;
}

function stripSoundTags(html: string): string {
  if (!html) return "";
  return html.replace(/\[sound:[^\]]*\]/gi, "");
}

export const StudyCardListItem = memo(function StudyCardListItem({
  card,
  checked = false,
  onCheckedChange,
  onDoubleClick,
  showCheckbox = false,
  id,
}: StudyCardListItemProps) {
  const t = useTranslations("study.card.state");
  const tRoot = useTranslations();

  const lastClickTime = useRef(0);
  const wasCheckedBeforeClick = useRef(checked);

  const touchTimeout = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  const stateLabels: Record<string, { label: string; className: string }> = {
    new:       { label: t("new"),       className: "bg-muted text-muted-foreground" },
    learn:     { label: t("learn"),     className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
    review:    { label: t("review"),    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
    suspended: { label: t("suspended"), className: "bg-muted text-muted-foreground line-through" },
    buried:    { label: t("buried"),    className: "bg-muted text-muted-foreground" },
    leech:     { label: t("leech"),     className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  };

  const stateInfo = stateLabels[card.state] ?? stateLabels.new;
  const dueStr = card.state === "review" || card.state === "learn"
    ? formatDueIn(new Date(card.due_at), tRoot)
    : null;

  // Single Click handles instant selection toggle
  // Double Click reverts Click 1 changes to preserve selection state
  const handleRowClick = () => {
    const now = Date.now();
    if (now - lastClickTime.current < 250) {
      // Revert Click 1 selection change
      if (wasCheckedBeforeClick.current !== checked) {
        onCheckedChange?.(card.id);
      }
      return;
    }
    lastClickTime.current = now;
    wasCheckedBeforeClick.current = checked;
    onCheckedChange?.(card.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onDoubleClick?.(card);
  };

  // Mobile Long-Press Interaction
  const handleTouchStart = () => {
    isLongPress.current = false;
    touchTimeout.current = setTimeout(() => {
      isLongPress.current = true;
      onDoubleClick?.(card);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 600);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchTimeout.current) {
      clearTimeout(touchTimeout.current);
      touchTimeout.current = null;
    }
    if (isLongPress.current) {
      e.preventDefault();
    }
  };

  const handleTouchMove = () => {
    if (touchTimeout.current) {
      clearTimeout(touchTimeout.current);
      touchTimeout.current = null;
    }
  };

  // Keyboard navigation on row
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " ") {
      e.preventDefault();
      onCheckedChange?.(card.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onDoubleClick?.(card);
    }
  };

  return (
    <div
      id={id}
      onClick={handleRowClick}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={checked}
      className={cn(
        "flex items-start gap-4 px-4 py-3 transition-all duration-200 cursor-pointer select-none group",
        "hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 rounded-md",
        "border-l-4",
        checked
          ? "bg-indigo-50/50 dark:bg-indigo-950/20 border-l-indigo-500"
          : card.is_flagged
            ? "border-l-amber-400 bg-amber-50/10 dark:bg-amber-950/5"
            : "border-l-transparent hover:border-l-muted-foreground/20"
      )}
    >
      {showCheckbox && (
        <div 
          className="flex items-center h-5 shrink-0 pt-0.5" 
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={checked}
            onCheckedChange={() => onCheckedChange?.(card.id)}
            aria-label="Select card"
          />
        </div>
      )}
      {/* Front preview */}
      <div className="flex-1 min-w-0 pointer-events-none">
        <div
          className="text-sm font-medium line-clamp-1"
          dangerouslySetInnerHTML={{ __html: stripSoundTags(card.front) }}
        />
        <div
          className="text-xs text-muted-foreground mt-0.5 line-clamp-1"
          dangerouslySetInnerHTML={{ __html: stripSoundTags(card.back) }}
        />
      </div>

      {/* Right side: state/due/flag + hover actions */}
      <div className="flex items-center gap-2 shrink-0 relative min-w-[90px] justify-end">
        {/* Normal status items */}
        <div className="flex items-center gap-2 transition-opacity duration-200 group-hover:opacity-0">
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

        {/* Desktop Hover Quick Action */}
        <div className="absolute inset-y-0 right-0 hidden md:flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(card);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
});
