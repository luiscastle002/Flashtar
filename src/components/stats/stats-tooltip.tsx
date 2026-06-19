"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface StatsTooltipProps {
  targetElement: Element | null;
  visible: boolean;
  content: React.ReactNode;
  offset?: number;
}

export function StatsTooltip({
  targetElement,
  visible,
  content,
  offset = 8,
}: StatsTooltipProps) {
  const [coords, setCoords] = React.useState<{ x: number; y: number; flip: boolean } | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useLayoutEffect(() => {
    if (!visible || !targetElement || !tooltipRef.current) {
      setCoords(null);
      return;
    }

    let ticking = false;
    let rafId: number;

    const updatePosition = () => {
      if (!visible || !targetElement || !tooltipRef.current) return;

      if (!ticking) {
        rafId = requestAnimationFrame(() => {
          const tooltipElement = tooltipRef.current;
          if (!tooltipElement) {
            ticking = false;
            return;
          }

          const targetRect = targetElement.getBoundingClientRect();
          const tooltipRect = tooltipElement.getBoundingClientRect();

          // Center horizontally relative to target center
          let x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
          
          // Place above target by default
          let y = targetRect.top - tooltipRect.height - offset;
          let shouldFlip = false;

          // Viewport clamping horizontally (leaving a margin of 8px)
          const minX = 8;
          const maxX = window.innerWidth - tooltipRect.width - 8;
          if (x < minX) x = minX;
          if (x > maxX) x = maxX;

          // Viewport checking vertically: if placing above overflows the viewport top, flip below
          if (targetRect.top - tooltipRect.height - offset < 0) {
            y = targetRect.bottom + offset;
            shouldFlip = true;
          }

          setCoords({ x, y, flip: shouldFlip });
          ticking = false;
        });
        ticking = true;
      }
    };

    // Calculate immediately
    updatePosition();

    // Listen to scroll (capture phase is mandatory for nested scrollable containers) and resize
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
  }, [targetElement, visible, offset]);

  if (!mounted || !visible || !targetElement) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      style={{
        left: coords?.x ?? 0,
        top: coords?.y ?? 0,
        opacity: coords ? 1 : 0,
      }}
      className={cn(
        "fixed pointer-events-none z-[9999] bg-popover/90 text-popover-foreground border border-muted/50 text-xs px-2.5 py-1.5 rounded-md shadow-md backdrop-blur-sm transition-opacity duration-150 animate-in fade-in duration-100",
        coords?.flip ? "slide-in-from-top-1" : "slide-in-from-bottom-1"
      )}
    >
      {content}
    </div>,
    document.body
  );
}
