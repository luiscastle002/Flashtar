import { createContext } from "react";

export interface MediaContextType {
  onDelete?: (src: string) => void;
  onUpdateMetadata?: (src: string, attrs: Record<string, unknown>) => void;
}

export const MediaContext = createContext<MediaContextType>({});
