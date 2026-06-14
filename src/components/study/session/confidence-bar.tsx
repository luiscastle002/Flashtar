"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const ZONE_LABELS = ["Again", "Hard", "Good", "Easy"] as const;
const ZONE_COLORS = [
  "hsl(0, 85%, 55%)",    // Again  — red
  "hsl(30, 90%, 55%)",   // Hard   — orange
  "hsl(55, 85%, 55%)",   // Good   — yellow-green
  "hsl(120, 60%, 45%)",  // Easy   — green
] as const;

function pctToZoneIndex(pct: number): number {
  if (pct <= 24) return 0;
  if (pct <= 49) return 1;
  if (pct <= 74) return 2;
  return 3;
}

interface ConfidenceBarProps {
  onRate: (pct: number) => void;
  disabled?: boolean;
}

export function ConfidenceBar({ onRate, disabled = false }: ConfidenceBarProps) {
  const [fillPct, setFillPct] = useState<number | null>(null);
  const [hoveredZone, setHoveredZone] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const pendingPct = useRef<number | null>(null);

  useEffect(() => {
    // Detect device type once on mount
    setIsDesktop(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  function getPctFromEvent(e: { clientX: number }): number {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    const pct = getPctFromEvent(e);
    setFillPct(pct);
    pendingPct.current = pct;
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging.current || disabled) return;
    const pct = getPctFromEvent(e);
    setFillPct(pct);
    pendingPct.current = pct;
    setHoveredZone(pctToZoneIndex(pct));
  }

  function handlePointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (pendingPct.current === null) return;

    if (isDesktop) {
      // Desktop: auto-submit on release
      onRate(pendingPct.current);
    }
    // Mobile: don't submit yet — user taps "Submit" button
  }


  const activeZone = fillPct !== null ? pctToZoneIndex(fillPct) : null;
  const displayZone = hoveredZone ?? activeZone;

  // Build gradient based on fill
  const gradientStyle = {
    background: `linear-gradient(to right,
      hsl(0, 85%, 55%),
      hsl(30, 90%, 55%) 33%,
      hsl(55, 85%, 55%) 66%,
      hsl(120, 60%, 45%)
    )`,
  };

  return (
    <div className="space-y-3">
      {/* Zone label */}
      <div className="flex items-center justify-center h-6">
        {displayZone !== null && (
          <span
            className="text-sm font-semibold transition-colors duration-150"
            style={{ color: ZONE_COLORS[displayZone] }}
          >
            {ZONE_LABELS[displayZone]}
          </span>
        )}
      </div>

      {/* The bar itself */}
      <div
        ref={barRef}
        className={cn(
          "relative h-10 rounded-full overflow-hidden cursor-pointer select-none",
          "border border-border/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        style={gradientStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={(e) => {
          if (!isDragging.current) {
            const pct = getPctFromEvent(e);
            setHoveredZone(pctToZoneIndex(pct));
          }
        }}
        onMouseMove={(e) => {
          if (!isDragging.current) {
            const pct = getPctFromEvent(e);
            setHoveredZone(pctToZoneIndex(pct));
          }
        }}
        onMouseLeave={() => setHoveredZone(null)}
        role="slider"
        aria-label="Confidence level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fillPct ?? 0}
      >
        {/* Dark overlay showing un-filled region */}
        <div
          className="absolute inset-0 bg-background/60 transition-[left] duration-100 ease-out"
          style={{ left: fillPct !== null ? `${fillPct}%` : "0%" }}
        />

        {/* Thumb indicator */}
        {fillPct !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white shadow-md border-2 border-white transition-[left] duration-100 ease-out pointer-events-none"
            style={{ left: `${fillPct}%` }}
          />
        )}

        {/* Zone tick marks at 25%, 50%, 75% */}
        {[25, 50, 75].map((tick) => (
          <div
            key={tick}
            className="absolute top-2 bottom-2 w-px bg-white/30"
            style={{ left: `${tick}%` }}
          />
        ))}
      </div>

      {/* Zone hint labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
        {ZONE_LABELS.map((label, i) => (
          <span key={label} style={{ color: displayZone === i ? ZONE_COLORS[i] : undefined }}>
            {label}
          </span>
        ))}
      </div>

      {/* Mobile submit button */}
      {!isDesktop && fillPct !== null && (
        <button
          className="w-full py-3 rounded-xl font-semibold text-white transition-all mt-1"
          style={{ backgroundColor: ZONE_COLORS[pctToZoneIndex(fillPct)] }}
          onClick={() => {
            if (pendingPct.current !== null) onRate(pendingPct.current);
          }}
          disabled={disabled}
        >
          Submit — {ZONE_LABELS[pctToZoneIndex(fillPct)]}
        </button>
      )}
    </div>
  );
}
