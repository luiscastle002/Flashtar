"use client";

import { useState, useEffect, useRef } from "react";
import { Flag, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateStudyCard } from "@/actions/imports";
import type { StudyCard, CardAudio } from "@/types";
import { cn } from "@/lib/utils";
import { parseHtmlContent } from "@/lib/media/html-parser";
import { resolveAudioUrl } from "@/lib/media/audio-resolver";

interface CustomWindow extends Window {
  playFlashtarAudio?: (url: string) => void;
}

interface StudyCardDisplayProps {
  card: StudyCard;
  isFlipped: boolean;
  onFlip: () => void;
  autoplayAudioFront?: boolean;
  autoplayAudioBack?: boolean;
  /** When true (course mode): suppresses audio play button on the front face */
  isCourse?: boolean;
}

function getAudioUrl(audio: CardAudio, cardUpdatedAt: string): string {
  const fileId = audio.audio_files?.file_id;
  if (!fileId) return "";

  const provider = audio.audio_files?.provider;
  if (provider === "url") {
    if (fileId.startsWith("audio/") || fileId.startsWith("http://") || fileId.startsWith("https://")) {
      return resolveAudioUrl(fileId);
    }
    if (fileId.startsWith("/")) {
      return fileId;
    }
    return `/api/media/proxy?url=${encodeURIComponent(fileId)}`;
  }

  const cacheBuster = new Date(cardUpdatedAt).getTime();
  return `/api/integrations/google/audio/${fileId}?v=${cacheBuster}`;
}

export function StudyCardDisplay({
  card,
  isFlipped,
  onFlip,
  autoplayAudioFront = false,
  autoplayAudioBack = false,
  isCourse = false,
}: StudyCardDisplayProps) {
  const [flagged, setFlagged] = useState(card.is_flagged);
  const t = useTranslations("study.session");
  const tCard = useTranslations("study.card");

  // Sync state when card changes
  useEffect(() => {
    setFlagged(card.is_flagged);
  }, [card.is_flagged]);

  const sharedAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    sharedAudioRef.current = new Audio();
    return () => {
      if (sharedAudioRef.current) {
        sharedAudioRef.current.pause();
        sharedAudioRef.current = null;
      }
    };
  }, []);

  const resolvePlayableAudios = (side: "front" | "back"): CardAudio[] => {
    const dbAudios = card.audios?.filter((a) => a.side === side) || [];
    const htmlContent = side === "front" ? card.front : card.back;
    
    // Parse out any remote media attachments of type audio
    const remoteAudios: CardAudio[] = [];
    if (htmlContent) {
      const mediaRegex = /<div\s+([^>]*data-type="media-attachment"[^>]*)>([\s\S]*?)<\/div>/g;
      let match;
      while ((match = mediaRegex.exec(htmlContent)) !== null) {
        const attributesStr = match[1];
        
        const getAttr = (name: string) => {
          const matchAttr = attributesStr.match(new RegExp(`data-${name}="([^"]*)"`)) || 
                            attributesStr.match(new RegExp(`${name}="([^"]*)"`));
          return matchAttr ? matchAttr[1] : "";
        };

        const src = getAttr("src");
        const mediaType = getAttr("media-type") || "image";

        if (mediaType === "audio" && src) {
          remoteAudios.push({
            side,
            original_filename: src.split("/").pop() || "Remote Audio",
            normalized_filename: null,
            audio_files: {
              file_id: src,
              provider: "url",
              voice_id: "",
              language: "",
              duration_seconds: null
            }
          });
        }
      }
    }

    return [...dbAudios, ...remoteAudios];
  };

  const playAudioSequence = (audios: CardAudio[]) => {
    if (!sharedAudioRef.current) return;
    sharedAudioRef.current.pause();
    
    const playNext = (index: number) => {
      if (index >= audios.length || !sharedAudioRef.current) return;
      const url = getAudioUrl(audios[index], card.updated_at);
      if (!url) {
        playNext(index + 1);
        return;
      }
      
      sharedAudioRef.current.src = url;
      sharedAudioRef.current.load();
      sharedAudioRef.current.play().then(() => {
        if (sharedAudioRef.current) {
          sharedAudioRef.current.onended = () => playNext(index + 1);
        }
      }).catch(e => {
        console.error("Autoplay failed:", e);
        playNext(index + 1);
      });
    };
    playNext(0);
  };

  const handleManualPlay = (url: string) => {
    if ((window as CustomWindow).playFlashtarAudio) {
      (window as CustomWindow).playFlashtarAudio!(url);
    } else if (sharedAudioRef.current) {
      sharedAudioRef.current.pause();
      sharedAudioRef.current.src = url;
      sharedAudioRef.current.load();
      sharedAudioRef.current.play().catch((err) => console.error("Error playing audio:", err));
    }
  };

  // Setup window hook to capture manual play events and ensure they stop autoplays/previous audios
  useEffect(() => {
    (window as CustomWindow).playFlashtarAudio = (url: string) => {
      if (sharedAudioRef.current) {
        sharedAudioRef.current.pause();
        sharedAudioRef.current.src = url;
        sharedAudioRef.current.load();
        sharedAudioRef.current.play().catch((e) => console.error("Manual play failed:", e));
      }
    };

    return () => {
      delete (window as CustomWindow).playFlashtarAudio;
    };
  }, []);

  // Autoplay front audio when card changes
  useEffect(() => {
    if (!autoplayAudioFront) return;
    const frontAudios = resolvePlayableAudios("front");
    playAudioSequence(frontAudios);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, autoplayAudioFront]);

  // Autoplay back audio when card is flipped
  useEffect(() => {
    if (!isFlipped || !autoplayAudioBack) return;
    const backAudios = resolvePlayableAudios("back");
    playAudioSequence(backAudios);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, isFlipped, autoplayAudioBack]);

  async function handleFlag() {
    const newValue = !flagged;
    setFlagged(newValue);
    await updateStudyCard(card.id, { is_flagged: newValue });
  }

  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 500); // matches duration-500
    return () => clearTimeout(timer);
  }, [isFlipped, card.id]);

  const showFront = !isFlipped || isAnimating;
  const showBack = isFlipped || isAnimating;

  // Parse both span[data-type="audio"] and legacy [sound:filename.mp3] tags into inline audio buttons
  const processHtml = (html: string, side: "front" | "back") => {
    if (!html) return "";
    
    // 1. Process new format: <span data-type="audio" data-audio-id="UUID"></span>
    const spanRegex = /<span\s+[^>]*data-type="audio"[^>]*data-audio-id="([^"]+)"[^>]*>([\s\S]*?)<\/span>/g;
    let processed = html.replace(spanRegex, (match, audioId) => {
      const matchedAudio = card.audios?.find((a) => a.id === audioId);
      if (matchedAudio) {
        const url = getAudioUrl(matchedAudio, card.updated_at);
        if (!url) return "";
        const filename = matchedAudio.original_filename || "audio";
        
        return `<button 
          class="inline-flex items-center justify-center p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition mx-1 align-middle cursor-pointer" 
          onclick="event.stopPropagation(); if (window.playFlashtarAudio) { window.playFlashtarAudio('${url}'); } else { new Audio('${url}').play().catch(e => console.error(e)); }" 
          title="Play ${filename}"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        </button>`;
      }
      return "";
    });

    // 2. Process legacy format: [sound:filename.mp3]
    const legacyRegex = /\[sound:([^\]]+)\]/g;
    processed = processed.replace(legacyRegex, (match, filename) => {
      const normalized = filename.trim().toLowerCase().normalize("NFC");
      const matchedAudio = card.audios?.find(
        (a) => a.side === side && (a.normalized_filename === normalized || a.original_filename === normalized)
      );
      
      if (matchedAudio) {
        const url = getAudioUrl(matchedAudio, card.updated_at);
        if (!url) return "";
        
        return `<button 
          class="inline-flex items-center justify-center p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition mx-1 align-middle cursor-pointer" 
          onclick="event.stopPropagation(); if (window.playFlashtarAudio) { window.playFlashtarAudio('${url}'); } else { new Audio('${url}').play().catch(e => console.error(e)); }" 
          title="Play ${filename}"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        </button>`;
      }
      
      return "";
    });

    return processed;
  };

  // Render a replay button for TTS / general audio when no sound tags exist
  const renderPlayButton = (side: "front" | "back") => {
    const sideAudios = card.audios?.filter((a) => a.side === side) || [];
    if (sideAudios.length === 0) return null;
    
    const html = side === "front" ? card.front : card.back;
    if (html.includes("[sound:") || html.includes('data-type="audio"')) return null;
    
    const url = getAudioUrl(sideAudios[0], card.updated_at);
    if (!url) return null;
    
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition mx-auto mt-4"
        onClick={(e) => {
          e.stopPropagation();
          handleManualPlay(url);
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
          <div 
            className={cn(
              "absolute inset-0 rounded-2xl border bg-card shadow-sm flex flex-col",
              !isFlipped ? "pointer-events-auto z-10" : "pointer-events-none z-0"
            )}
            style={{
              WebkitBackfaceVisibility: "hidden",
              backfaceVisibility: "hidden",
              transform: "rotateY(0deg) translateZ(1px)",
            }}
          >
            {showFront && (
              <>
                <div 
                  className={cn(
                    "flex-1 px-6 py-4 flex flex-col",
                    isAnimating ? "overflow-hidden" : "overflow-y-auto"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="my-auto w-full text-center flex flex-col justify-center items-center">
                    <div className="text-center text-lg md:text-xl font-medium leading-relaxed max-w-prose whitespace-pre-wrap break-words mx-auto">
                      {parseHtmlContent(processHtml(card.front, "front"))}
                    </div>
                    {/* In course mode the pronunciation plays on the back — suppress front audio button */}
                    {!isCourse && renderPlayButton("front")}
                  </div>
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t text-xs text-muted-foreground">
                  <Badge variant="outline" className="capitalize text-xs">
                    {tCard(`state.${card.state}` as Parameters<typeof tCard>[0])}
                  </Badge>
                  <span className="opacity-60">{t("reveal_hint")}</span>
                </div>
              </>
            )}
          </div>

          {/* Back face */}
          <div 
            className={cn(
              "absolute inset-0 rounded-2xl border bg-card shadow-sm flex flex-col",
              isFlipped ? "pointer-events-auto z-10" : "pointer-events-none z-0"
            )}
            style={{
              WebkitBackfaceVisibility: "hidden",
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg) translateZ(1px)",
            }}
          >
            {showBack && (
              <>
                {/* Front content (small) with option to replay audio */}
                <div className="px-5 py-3 border-b bg-muted/40 rounded-t-2xl flex items-center justify-between">
                  <div className="text-sm text-muted-foreground text-center line-clamp-2 flex-1">
                    {parseHtmlContent(processHtml(card.front, "front"), { isPreview: true })}
                  </div>
                  {!card.front.includes("[sound:") && !card.front.includes('data-type="audio"') && card.audios?.some((a) => a.side === "front") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full hover:bg-muted text-muted-foreground ml-2 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        const frontAudios = card.audios?.filter((a) => a.side === "front") || [];
                        if (frontAudios[0]) {
                          const url = getAudioUrl(frontAudios[0], card.updated_at);
                          if (url) handleManualPlay(url);
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
                  className={cn(
                    "flex-1 px-6 py-4 flex flex-col",
                    isAnimating ? "overflow-hidden" : "overflow-y-auto"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="my-auto w-full text-center flex flex-col justify-center items-center">
                    <div className="text-center text-lg md:text-xl leading-relaxed max-w-prose whitespace-pre-wrap break-words mx-auto">
                      {parseHtmlContent(processHtml(card.back, "back"))}
                    </div>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
