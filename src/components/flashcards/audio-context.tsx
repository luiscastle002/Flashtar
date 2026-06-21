"use client";

import { createContext } from "react";
import type { CardAudio } from "@/types";

export interface AudioContextType {
  audios: CardAudio[];
  onMoveSide?: (audioId: string, deleteNode: () => void) => void;
  onDelete?: (audioId: string) => void;
}

export const AudioContext = createContext<AudioContextType>({
  audios: [],
});
