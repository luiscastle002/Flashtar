"use client";

import React, { useState, useEffect, useRef, useContext } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Play, Pause, X, ArrowLeftRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardAudio } from "@/types";
import { toast } from "sonner";
import { AudioContext } from "./audio-context";

export function AudioChip(props: NodeViewProps) {
  const { node, deleteNode } = props;
  const audioId = node.attrs.audioId;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Retrieve metadata from AudioContext
  const { audios, onMoveSide, onDelete } = useContext(AudioContext);

  // Find the audio details using the stable UUID data-audio-id
  const audioMeta = audios.find((a: CardAudio) => a.id === audioId);
  const filename = audioMeta?.original_filename || "Audio";
  const fileId = audioMeta?.audio_files?.file_id;

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!fileId) {
      toast.error("Audio file reference not found.");
      return;
    }

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);
    const playUrl = `/api/integrations/google/audio/${fileId}?v=${new Date().getTime()}`;
    
    if (!audioRef.current) {
      const audio = new Audio(playUrl);
      audioRef.current = audio;
      
      audio.oncanplaythrough = () => {
        setIsLoading(false);
        audio.play().catch((err) => {
          console.error("Audio playback error:", err);
          setIsPlaying(false);
          toast.error("Failed to play audio. Click to retry.");
        });
        setIsPlaying(true);
      };

      audio.onended = () => {
        setIsPlaying(false);
      };

      audio.onerror = (err) => {
        console.error("Audio loading error:", err);
        setIsLoading(false);
        setIsPlaying(false);
        toast.error("Audio failed to load.");
      };
    } else {
      audioRef.current.play().then(() => {
        setIsLoading(false);
        setIsPlaying(true);
      }).catch((err) => {
        console.error("Audio playback resume error:", err);
        setIsPlaying(false);
      });
    }
  };

  const handleMoveSide = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (onMoveSide && audioId) {
      onMoveSide(audioId, deleteNode);
    } else {
      toast.error("Move action not configured.");
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Call immediate database unmapping if configured
    if (onDelete && audioId) {
      onDelete(audioId);
    }
    // Delete node from editor
    deleteNode();
  };

  return (
    <NodeViewWrapper className="inline-block align-middle select-none">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 mx-1 rounded-md transition select-none text-xs font-medium border align-middle",
          isPlaying
            ? "bg-primary/20 border-primary/40 text-primary animate-pulse"
            : "bg-muted hover:bg-muted/80 border-border text-foreground/80"
        )}
      >
        {/* Play / Pause / Load controls */}
        <button
          type="button"
          onClick={handlePlayToggle}
          className="hover:scale-110 transition cursor-pointer flex items-center justify-center p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
          title={isPlaying ? "Pause" : "Play audio"}
          aria-label={isPlaying ? "Pause" : "Play audio"}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-3 w-3 fill-current" />
          ) : (
            <Play className="h-3 w-3 fill-current" />
          )}
        </button>

        {/* Filename */}
        <span className="max-w-[120px] truncate" title={filename}>
          {filename}
        </span>

        {/* Move Side (↔) button */}
        {onMoveSide && (
          <button
            type="button"
            onClick={handleMoveSide}
            className="hover:scale-110 text-muted-foreground hover:text-foreground transition cursor-pointer flex items-center justify-center p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
            title="Move to other side"
            aria-label="Move to other side"
          >
            <ArrowLeftRight className="h-3 w-3" />
          </button>
        )}

        {/* Delete (✕) button */}
        <button
          type="button"
          onClick={handleDelete}
          className="hover:scale-110 text-muted-foreground hover:text-destructive transition cursor-pointer flex items-center justify-center p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
          title="Delete audio"
          aria-label="Delete audio"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    </NodeViewWrapper>
  );
}
