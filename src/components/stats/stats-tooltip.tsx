"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface StatsTooltipProps {
  targetRect: DOMRect | null;
  visible: boolean;
  content: React.ReactNode;
  offset?: number;
}

export function StatsTooltip({
  targetRect,
  visible,
  content,
  offset = 8,
}: StatsTooltipProps) {
  const [coords, setCoords] = React.useState({ x: 0, y: 0, flip: false });
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useLayoutEffect(() => {
    if (!visible || !targetRect || !tooltipRef.current) return;

    const tooltipElement = tooltipRef.current;
    const tooltipRect = tooltipElement.getBoundingClientRect();

    // Center horizontally relative to target center
    let x = targetRect.left + window.scrollX + targetRect.width / 2 - tooltipRect.width / 2;
    
    // Place above target by default
    let y = targetRect.top + window.scrollY - tooltipRect.height - offset;
    let shouldFlip = false;

    // Viewport clamping horizontally
    const minX = window.scrollX + 8;
    const maxX = window.scrollX + window.innerWidth - tooltipRect.width - 8;
    if (x < minX) x = minX;
    if (x > maxX) x = maxX;

    // Viewport checking vertically: if placing above overflows the viewport top, flip below
    if (targetRect.top - tooltipRect.height - offset < 0) {
      y = targetRect.bottom + window.scrollY + offset;
      shouldFlip = true;
    }

    setCoords({ x, y, flip: shouldFlip });
  }, [targetRect, visible, offset]);

  if (!mounted || !visible || !targetRect) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      style={{
        left: coords.x,
        top: coords.y,
      }}
      className={cn(
        "fixed pointer-events-none z-[9999] bg-popover/90 text-popover-foreground border border-muted/50 text-xs px-2.5 py-1.5 rounded-md shadow-md backdrop-blur-sm transition-opacity duration-150 animate-in fade-in duration-100",
        coords.flip ? "slide-in-from-top-1" : "slide-in-from-bottom-1"
      )}
    >
      {content}
    </div>,
    document.body
  );
}
