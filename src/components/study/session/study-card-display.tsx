"use client";

import { useState, useEffect } from "react";
import { Flag, Volume2 } from "lucide-react";
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
  autoplayAudioFront?: boolean;
  autoplayAudioBack?: boolean;
}

export function StudyCardDisplay({
  card,
  isFlipped,
  onFlip,
  autoplayAudioFront = false,
  autoplayAudioBack = false,
}: StudyCardDisplayProps) {
  const [flagged, setFlagged] = useState(card.is_flagged);
  const t = useTranslations("study.session");
  const tCard = useTranslations("study.card");

  // Sync state when card changes
  useEffect(() => {
    setFlagged(card.is_flagged);
  }, [card.is_flagged]);

  // Autoplay front audio when card changes
  useEffect(() => {
    if (!autoplayAudioFront) return;
    
    const frontAudios = card.audios?.filter((a) => a.side === "front") || [];
    if (frontAudios.length > 0 && frontAudios[0].audio_files?.file_id) {
      const fileId = frontAudios[0].audio_files.file_id;
      const url = `/api/integrations/google/audio/${fileId}?v=${new Date(card.updated_at).getTime()}`;
      const audio = new Audio(url);
      audio.play().catch((e) => console.error("Autoplay front audio failed:", e));
    }
  }, [card.id, autoplayAudioFront, card.updated_at, card.audios]);

  // Autoplay back audio when card is flipped
  useEffect(() => {
    if (!isFlipped || !autoplayAudioBack) return;
    
    const backAudios = card.audios?.filter((a) => a.side === "back") || [];
    if (backAudios.length > 0 && backAudios[0].audio_files?.file_id) {
      const fileId = backAudios[0].audio_files.file_id;
      const url = `/api/integrations/google/audio/${fileId}?v=${new Date(card.updated_at).getTime()}`;
      const audio = new Audio(url);
      audio.play().catch((e) => console.error("Autoplay back audio failed:", e));
    }
  }, [card.id, isFlipped, autoplayAudioBack, card.updated_at, card.audios]);

  async function handleFlag() {
    const newValue = !flagged;
    setFlagged(newValue);
    await updateStudyCard(card.id, { is_flagged: newValue });
  }

  // Parse [sound:filename.mp3] tags into inline audio buttons
  const processHtml = (html: string, side: "front" | "back") => {
    if (!html) return "";
    
    const regex = /\[sound:([^\]]+)\]/g;
    return html.replace(regex, (match, filename) => {
      const normalized = filename.trim().toLowerCase().normalize("NFC");
      const matchedAudio = card.audios?.find(
        (a) => a.side === side && (a.normalized_filename === normalized || a.original_filename === normalized)
      );
      
      if (matchedAudio?.audio_files?.file_id) {
        const fileId = matchedAudio.audio_files.file_id;
        const cacheBuster = new Date(card.updated_at).getTime();
        const url = `/api/integrations/google/audio/${fileId}?v=${cacheBuster}`;
        
        return `<button 
          class="inline-flex items-center justify-center p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition mx-1 align-middle cursor-pointer" 
          onclick="event.stopPropagation(); const a = new Audio('${url}'); a.play().catch(e => console.error(e))" 
          title="Play ${filename}"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        </button>`;
      }
      
      // Hide unmatched sound tags to keep the UI clean
      return "";
    });
  };

  // Render a replay button for TTS / general audio when no sound tags exist
  const renderPlayButton = (side: "front" | "back") => {
    const sideAudios = card.audios?.filter((a) => a.side === side) || [];
    if (sideAudios.length === 0) return null;
    
    const html = side === "front" ? card.front : card.back;
    if (html.includes("[sound:")) return null;
    
    const fileId = sideAudios[0].audio_files?.file_id;
    if (!fileId) return null;
    
    const url = `/api/integrations/google/audio/${fileId}?v=${new Date(card.updated_at).getTime()}`;
    
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition mx-auto mt-4"
        onClick={(e) => {
          e.stopPropagation();
          const audio = new Audio(url);
          audio.play().catch((err) => console.error("Error playing audio:", err));
        }}
        type="button"
      >
        <Volume2 className="h-4 w-4" />
      </Button>
    );
  };

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
              <div className="my-auto w-full text-center flex flex-col justify-center items-center">
                <div
                  className="text-center text-lg md:text-xl font-medium leading-relaxed max-w-prose whitespace-pre-wrap break-words mx-auto"
                  dangerouslySetInnerHTML={{ __html: processHtml(card.front, "front") }}
                />
                {renderPlayButton("front")}
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
            {/* Front content (small) with option to replay audio */}
            <div className="px-5 py-3 border-b bg-muted/40 rounded-t-2xl flex items-center justify-between">
              <div
                className="text-sm text-muted-foreground text-center line-clamp-2 flex-1"
                dangerouslySetInnerHTML={{ __html: processHtml(card.front, "front") }}
              />
              {!card.front.includes("[sound:") && card.audios?.some((a) => a.side === "front") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full hover:bg-muted text-muted-foreground ml-2 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    const frontAudios = card.audios?.filter((a) => a.side === "front") || [];
                    if (frontAudios[0]?.audio_files?.file_id) {
                      const audio = new Audio(`/api/integrations/google/audio/${frontAudios[0].audio_files.file_id}?v=${new Date(card.updated_at).getTime()}`);
                      audio.play().catch((err) => console.error(err));
                    }
                  }}
                  type="button"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {/* Answer */}
            <div 
              className="flex-1 overflow-y-auto px-6 py-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="my-auto w-full text-center flex flex-col justify-center items-center">
                <div
                  className="text-center text-lg md:text-xl leading-relaxed max-w-prose whitespace-pre-wrap break-words mx-auto"
                  dangerouslySetInnerHTML={{ __html: processHtml(card.back, "back") }}
                />
                {renderPlayButton("back")}
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
                type="button"
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
