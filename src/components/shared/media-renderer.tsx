"use client";

import React from "react";
import { Volume2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MediaRendererProps {
  src: string;
  mediaType: "image" | "audio" | "video" | "embed" | "link";
  width?: string;
  fit?: "contain" | "cover" | "fill";
  alignment?: "left" | "center" | "right" | "full";
  alt?: string;
  caption?: string;
  className?: string;
}

interface CustomWindow extends Window {
  playFlashtarAudio?: (url: string) => void;
}

export function MediaRenderer({
  src,
  mediaType,
  width = "100%",
  fit = "contain",
  alignment = "center",
  alt,
  caption,
  className
}: MediaRendererProps) {
  if (!src) return null;

  // Alignment classes for centering/positioning containers
  const containerAlignmentClass = cn("flex w-full my-4 justify-center", {
    "justify-center": alignment === "center" || !alignment,
    "justify-start": alignment === "left",
    "justify-end": alignment === "right",
    "w-full": alignment === "full",
  });

  const getProxyUrl = (rawUrl: string) => {
    if (!rawUrl) return "";
    if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:") || rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1")) {
      return rawUrl;
    }
    return `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`;
  };

  const handleAudioPlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const proxyUrl = getProxyUrl(src);
    
    // Check for global active player registered by study display
    if (typeof window !== "undefined" && (window as unknown as CustomWindow).playFlashtarAudio) {
      (window as unknown as CustomWindow).playFlashtarAudio!(proxyUrl);
    } else {
      const audio = new Audio(proxyUrl);
      audio.play().catch((err) => console.error("Audio manual playback failed:", err));
    }
  };

  const getEmbedUrl = (rawUrl: string) => {
    if (!rawUrl) return "";
    try {
      const url = new URL(rawUrl);
      if (url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be")) {
        const videoId = url.hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v") || "";
        return `https://www.youtube.com/embed/${videoId}`;
      }
      if (url.hostname.includes("vimeo.com")) {
        const videoId = url.pathname.split("/").pop() || "";
        return `https://player.vimeo.com/video/${videoId}`;
      }
    } catch {}
    return rawUrl;
  };

  const renderContent = () => {
    switch (mediaType) {
      case "image":
        return (
          <div className="relative overflow-hidden rounded-lg border border-border bg-muted/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt || "Flashcard Media"}
              style={{ objectFit: fit }}
              className="h-auto max-h-[350px] transition-all duration-200"
            />
            {caption && (
              <div className="text-center text-xs text-muted-foreground p-1.5 bg-muted/40 border-t">
                {caption}
              </div>
            )}
          </div>
        );

      case "audio":
        return (
          <button
            type="button"
            onClick={handleAudioPlay}
            className="inline-flex items-center justify-center p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition mx-1 align-middle cursor-pointer border border-primary/20"
            title={alt || "Play audio link"}
          >
            <Volume2 className="h-4 w-4" />
          </button>
        );

      case "video":
        return (
          <video
            controls
            src={getProxyUrl(src)}
            style={{ objectFit: fit }}
            className="rounded-lg shadow max-h-[300px]"
          />
        );

      case "embed":
        return (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border">
            <iframe
              src={getEmbedUrl(src)}
              className="absolute inset-0 w-full h-full border-0"
              allowFullScreen
            />
          </div>
        );

      default:
        return (
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-background hover:bg-muted text-xs text-primary transition font-medium"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="truncate max-w-[250px]">{src}</span>
          </a>
        );
    }
  };

  // Dimensions configuration wrapper
  const inlineWidthStyle = mediaType === "audio" || mediaType === "link" ? undefined : width;

  return (
    <div className={cn(containerAlignmentClass, className)}>
      <div style={{ width: inlineWidthStyle }}>
        {renderContent()}
      </div>
    </div>
  );
}
