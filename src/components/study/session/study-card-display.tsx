"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateStudyCard } from "@/actions/imports";
import type { StudyCard } from "@/types";
import { cn } from "@/lib/utils";

interface StudyCardDisplayProps {
  card: StudyCard;
  isFlipped: boolean;
  onFlip: () => void;
}

export function StudyCardDisplay({ card, isFlipped, onFlip }: StudyCardDisplayProps) {
  const [flagged, setFlagged] = useState(card.is_flagged);
  const t = useTranslations("study.session");
  const tCard = useTranslations("study.card");

  async function handleFlag() {
    const newValue = !flagged;
    setFlagged(newValue);
    await updateStudyCard(card.id, { is_flagged: newValue });
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-[320px]">
      {/* Card container with 3D flip */}
      <div
        className="relative flex-1 cursor-pointer"
        style={{ perspective: "1200px" }}
        onClick={onFlip}
      >
        <div
          className={cn(
            "absolute inset-0 transition-all duration-500",
            "[transform-style:preserve-3d]",
            isFlipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]"
          )}
        >
          {/* Front face */}
          <div className="absolute inset-0 rounded-2xl border bg-card shadow-sm flex flex-col [backface-visibility:hidden]">
            <div 
              className="flex-1 overflow-y-auto px-6 py-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="my-auto w-full text-center">
                <div
                  className="text-center text-lg md:text-xl font-medium leading-relaxed max-w-prose whitespace-pre-wrap break-words mx-auto"
                  dangerouslySetInnerHTML={{ __html: card.front }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t text-xs text-muted-foreground">
              <Badge variant="outline" className="capitalize text-xs">
                {tCard(`state.${card.state}` as Parameters<typeof tCard>[0])}
              </Badge>
              <span className="opacity-60">{t("reveal_hint")}</span>
            </div>
          </div>

          {/* Back face */}
          <div className="absolute inset-0 rounded-2xl border bg-card shadow-sm flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)]">
            {/* Front content (small) */}
            <div className="px-5 py-3 border-b bg-muted/40 rounded-t-2xl">
              <p
                className="text-sm text-muted-foreground text-center line-clamp-2"
                dangerouslySetInnerHTML={{ __html: card.front }}
              />
            </div>
            {/* Answer */}
            <div 
              className="flex-1 overflow-y-auto px-6 py-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="my-auto w-full text-center">
                <div
                  className="text-center text-lg md:text-xl leading-relaxed max-w-prose whitespace-pre-wrap break-words mx-auto"
                  dangerouslySetInnerHTML={{ __html: card.back }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                {card.tags.length > 0 && (
                  card.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 px-2 text-xs",
                  flagged ? "text-amber-500" : "text-muted-foreground"
                )}
                onClick={(e) => {
                  e.stopPropagation(); // don't flip again
                  handleFlag();
                }}
              >
                <Flag className={cn("h-3 w-3 mr-1", flagged && "fill-amber-500")} />
                {flagged ? t("flagged") : t("flag")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
