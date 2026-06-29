"use client";

import React, { useState, useRef, useEffect, useContext } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  ExternalLink,
  Volume2,
  Pause,
  Image as ImageIcon,
  Settings,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { MediaContext } from "./media-context";

export function MediaNodeView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, selected } = props;
  const { src, mediaType, width, fit, alignment, alt, caption } = node.attrs;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSrc, setTempSrc] = useState(src || "");
  const [tempAlt, setTempAlt] = useState(alt || "");
  const [tempCaption, setTempCaption] = useState(caption || "");
  const [localWidth, setLocalWidth] = useState(width || "100%");

  const { onDelete } = useContext(MediaContext);

  // Sync temp variables and localWidth when node attributes change
  useEffect(() => {
    setTempSrc(src || "");
    setTempAlt(alt || "");
    setTempCaption(caption || "");
    setLocalWidth(width || "100%");
  }, [src, alt, caption, width]);

  // Clean up audio playback on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Determine alignment tailwind classes
  const alignmentClass = cn({
    "mx-auto": alignment === "center" || !alignment,
    "mr-auto ml-0": alignment === "left",
    "ml-auto mr-0": alignment === "right",
    "w-full": alignment === "full",
  });

  // Safe CORS stream URL helper
  const getProxyUrl = (rawUrl: string) => {
    if (!rawUrl) return "";
    if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:") || rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1")) {
      return rawUrl;
    }
    return `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`;
  };

  // Drag-to-resize mouse handler
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = containerRef.current?.offsetWidth || 300;
    const parentWidth = containerRef.current?.parentElement?.offsetWidth || 800;
    let finalWidthPercentage = width || "100%";
    
    let animationFrameId: number | null = null;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (animationFrameId) return;

      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.max(100, Math.min(parentWidth, startWidth + deltaX));
        // Save width as percentage of parent container to keep it responsive
        const percentageWidth = Math.round((newWidth / parentWidth) * 100);
        finalWidthPercentage = `${percentageWidth}%`;
        setLocalWidth(finalWidthPercentage);
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      // Persist the final width back to the editor state once on drag release
      updateAttributes({ width: finalWidthPercentage });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Play/Pause toggler for audio attachments
  const handleAudioPlayToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!src) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);
    const streamUrl = getProxyUrl(src);

    if (!audioRef.current) {
      const audio = new Audio(streamUrl);
      audioRef.current = audio;

      audio.oncanplaythrough = () => {
        setIsLoading(false);
        audio.play().catch((err) => {
          console.error("Audio proxy play failed:", err);
          setIsPlaying(false);
        });
        setIsPlaying(true);
      };

      audio.onended = () => {
        setIsPlaying(false);
      };

      audio.onerror = () => {
        setIsLoading(false);
        setIsPlaying(false);
        console.error("Audio proxy failed to load from:", src);
      };
    } else {
      audioRef.current.play().then(() => {
        setIsLoading(false);
        setIsPlaying(true);
      }).catch((err) => {
        console.error("Audio playback resume failed:", err);
        setIsPlaying(false);
      });
    }
  };

  // Parse embed links (YouTube/Vimeo)
  const getEmbedUrl = (rawUrl: string) => {
    if (!rawUrl) return "";
    try {
      const url = new URL(rawUrl);
      if (url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be")) {
        let videoId = "";
        if (url.hostname.includes("youtu.be")) {
          videoId = url.pathname.slice(1);
        } else {
          videoId = url.searchParams.get("v") || "";
        }
        return `https://www.youtube.com/embed/${videoId}`;
      }
      if (url.hostname.includes("vimeo.com")) {
        const videoId = url.pathname.split("/").pop() || "";
        return `https://player.vimeo.com/video/${videoId}`;
      }
    } catch {
      // Return raw URL if not parseable
    }
    return rawUrl;
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete && src) {
      onDelete(src);
    }
    deleteNode();
  };

  const handleSaveSettings = () => {
    updateAttributes({
      src: tempSrc,
      alt: tempAlt,
      caption: tempCaption
    });
    setSettingsOpen(false);
  };

  const renderMediaContent = () => {
    if (!src) {
      return (
        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/30 rounded-lg bg-muted/20 text-muted-foreground">
          <ImageIcon className="h-8 w-8 mb-2" />
          <span className="text-xs">No URL Provided</span>
        </div>
      );
    }

    switch (mediaType) {
      case "image":
        return (
          <div className="relative group/img overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt || "Card Media"}
              style={{ objectFit: fit || "contain" }}
              className="w-full h-auto max-h-[350px] transition-all duration-200"
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
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all border bg-muted/30 hover:bg-muted/50 text-xs font-medium max-w-full">
            <button
              type="button"
              onClick={handleAudioPlayToggle}
              className="hover:scale-110 transition cursor-pointer flex items-center justify-center p-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-3.5 w-3.5 fill-current" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 fill-current" />
              )}
            </button>
            <span className="truncate max-w-[200px]" title={src}>
              {src.split("/").pop() || "Audio Stream"}
            </span>
          </div>
        );

      case "video":
        return (
          <video
            controls
            src={getProxyUrl(src)}
            style={{ objectFit: fit || "contain" }}
            className="rounded-lg shadow w-full max-h-[300px]"
          />
        );

      case "embed":
        const embedSrc = getEmbedUrl(src);
        return (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border">
            <iframe
              src={embedSrc}
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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

  return (
    <NodeViewWrapper className={cn("relative my-4 select-none group/node", alignmentClass)} style={{ width: mediaType === "audio" || mediaType === "link" ? "auto" : localWidth }}>
      {/* Node View Content */}
      <div
        ref={containerRef}
        className={cn(
          "relative transition-all duration-200",
          selected ? "ring-2 ring-primary ring-offset-2 rounded-lg" : "hover:ring-1 hover:ring-muted-foreground/30 rounded-lg"
        )}
      >
        {renderMediaContent()}

        {/* Floating Bubble Toolbar */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-popover border border-border shadow-md rounded-lg opacity-0 pointer-events-none group-hover/node:opacity-100 group-hover/node:pointer-events-auto transition-opacity duration-200 z-40">
          
          {/* Alignment controls */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", alignment === "left" && "bg-muted")}
            onClick={() => updateAttributes({ alignment: "left" })}
            title="Align Left"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", (alignment === "center" || !alignment) && "bg-muted")}
            onClick={() => updateAttributes({ alignment: "center" })}
            title="Align Center"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", alignment === "right" && "bg-muted")}
            onClick={() => updateAttributes({ alignment: "right" })}
            title="Align Right"
          >
            <AlignRight className="h-3.5 w-3.5" />
          </Button>

          {/* Fit modes (Only for images & videos) */}
          {(mediaType === "image" || mediaType === "video") && (
            <>
              <div className="w-[1px] h-4 bg-border mx-1" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7", fit === "contain" && "bg-muted")}
                onClick={() => updateAttributes({ fit: "contain" })}
                title="Fit: Contain"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7", fit === "cover" && "bg-muted")}
                onClick={() => updateAttributes({ fit: "cover" })}
                title="Fit: Cover"
              >
                <span className="text-[10px] font-bold">COV</span>
              </Button>
            </>
          )}

          {/* Settings modal trigger */}
          <div className="w-[1px] h-4 bg-border mx-1" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setSettingsOpen(true)}
            title="Settings (Alt text, URL)"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>

          {/* Delete button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            title="Delete media"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Resizing Handle (Only for image/video) */}
        {(mediaType === "image" || mediaType === "video") && (
          <div
            className="absolute top-1/2 -translate-y-1/2 right-0 h-8 w-1.5 cursor-col-resize hover:bg-primary/55 bg-muted-foreground/20 border border-border rounded-l-md hover:scale-x-125 transition-transform duration-100 z-30"
            onMouseDown={handleResizeStart}
            title="Drag to resize"
          />
        )}
      </div>

      {/* Settings Modal (Alt Text, Description, Custom Source URL) */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle>Media Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="media-src">Source URL</Label>
              <Input
                id="media-src"
                value={tempSrc}
                onChange={(e) => setTempSrc(e.target.value)}
                placeholder="https://example.com/file.mp3"
              />
            </div>
            {mediaType === "image" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="media-alt">Alt Text (Accessibility)</Label>
                  <Input
                    id="media-alt"
                    value={tempAlt}
                    onChange={(e) => setTempAlt(e.target.value)}
                    placeholder="Describe this image..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="media-caption">Caption</Label>
                  <Input
                    id="media-caption"
                    value={tempCaption}
                    onChange={(e) => setTempCaption(e.target.value)}
                    placeholder="Add a visible caption below image..."
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings}>
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
}
