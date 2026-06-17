"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { StudyDeck } from "@/types";
import { cn } from "@/lib/utils";
import { getDeckIconUrl } from "@/lib/utils/image";

interface StudyDeckCardProps {
  deck: StudyDeck & { due_count?: number; new_count?: number };
}

export function StudyDeckCard({ deck }: StudyDeckCardProps) {
  const router = useRouter();
  const hasDue = (deck.due_count ?? 0) > 0;
  const customIconUrl = getDeckIconUrl(deck.custom_icon_path);

  return (
    <Link href={`/study/${deck.id}`} className="block group">
      <Card className={cn(
        "h-full transition-all duration-200 hover:shadow-md",
        hasDue
          ? "hover:border-primary/60 border-primary/20"
          : "hover:border-border"
      )}>
        {/* Color accent bar */}
        <div
          className="h-1 rounded-t-xl"
          style={{ backgroundColor: deck.color }}
        />
        <CardHeader className="pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {deck.icon_type === "image" && customIconUrl ? (
                <span className="relative inline-block w-8 h-8 rounded-full overflow-hidden border shrink-0 bg-muted">
                  <Image src={customIconUrl} alt={deck.name} fill className="object-cover" />
                </span>
              ) : (
                <span className="text-2xl shrink-0">{deck.emoji ?? "📚"}</span>
              )}
              <div className="min-w-0">
                <p className="font-semibold leading-tight truncate">{deck.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {deck.card_count} card{deck.card_count !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            {/* Due badge */}
            {hasDue ? (
              <Badge
                variant="default"
                className="shrink-0 text-xs font-bold min-w-[1.75rem] text-center"
                style={{ backgroundColor: deck.color, border: "none" }}
              >
                {deck.due_count}
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                ✓
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {(deck.new_count ?? 0) > 0 && (
                <span className="text-xs text-muted-foreground">
                  {deck.new_count} new
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant={hasDue ? "default" : "ghost"}
              className={cn(
                "h-7 px-3 text-xs transition-all",
                hasDue ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              style={hasDue ? { backgroundColor: deck.color, border: "none" } : {}}
              onClick={(e) => {
                e.preventDefault();
                router.push(`/study/${deck.id}/session`);
              }}
            >
              <Play className="h-3 w-3 mr-1" />
              {hasDue ? `Study (${deck.due_count})` : "Browse"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
