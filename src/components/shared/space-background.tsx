"use client";

import React, { useEffect, useId } from "react";
import { useSpaceBackground } from "./space-background-context";

export interface SpaceBackgroundProps {
  /** Total number of stars to render (default: 400) */
  starCount?: number;
  /** Enable mouse parallax effect (default: true) */
  parallax?: boolean;
  /** Enable random shooting stars (default: true) */
  shootingStars?: boolean;
  /** Enable slow drifting nebula gradients (default: true) */
  nebula?: boolean;
  /** Custom classes for container styling (not active in controller, handled by canvas) */
  className?: string;
}

export const SpaceBackground: React.FC<SpaceBackgroundProps> = ({
  starCount = 75,
  parallax = true,
  shootingStars = true,
  nebula = true,
}) => {
  const { register, unregister } = useSpaceBackground();
  const id = useId();

  useEffect(() => {
    register(id, {
      starCount,
      parallax,
      shootingStars,
      nebula,
    });

    return () => {
      unregister(id);
    };
  }, [id, starCount, parallax, shootingStars, nebula, register, unregister]);

  return null;
};
