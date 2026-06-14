"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface SpaceBackgroundConfig {
  starCount: number;
  parallax: boolean;
  shootingStars: boolean;
  nebula: boolean;
  isVisible: boolean;
}

interface SpaceBackgroundContextType {
  config: SpaceBackgroundConfig;
  register: (id: string, config: Omit<SpaceBackgroundConfig, "isVisible">) => void;
  unregister: (id: string) => void;
}

const SpaceBackgroundContext = createContext<SpaceBackgroundContextType | undefined>(undefined);

export const SpaceBackgroundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeControllers, setActiveControllers] = useState<Record<string, Omit<SpaceBackgroundConfig, "isVisible">>>({});

  const register = useCallback((id: string, newConfig: Omit<SpaceBackgroundConfig, "isVisible">) => {
    setActiveControllers((prev) => ({
      ...prev,
      [id]: newConfig,
    }));
  }, []);

  const unregister = useCallback((id: string) => {
    setActiveControllers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Determine active config
  const activeKeys = Object.keys(activeControllers);
  const isVisible = activeKeys.length > 0;
  
  // Use the latest registered config, or default if none active
  const latestId = activeKeys[activeKeys.length - 1];
  const latestConfig = latestId ? activeControllers[latestId] : null;

  const config: SpaceBackgroundConfig = {
    starCount: latestConfig?.starCount ?? 75,
    parallax: latestConfig?.parallax ?? true,
    shootingStars: latestConfig?.shootingStars ?? true,
    nebula: latestConfig?.nebula ?? true,
    isVisible,
  };

  return (
    <SpaceBackgroundContext.Provider value={{ config, register, unregister }}>
      {children}
    </SpaceBackgroundContext.Provider>
  );
};

export const useSpaceBackground = () => {
  const context = useContext(SpaceBackgroundContext);
  if (!context) {
    throw new Error("useSpaceBackground must be used within a SpaceBackgroundProvider");
  }
  return context;
};
