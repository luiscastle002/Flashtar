"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { X, Send, Sparkle } from "lucide-react";
import { toast } from "sonner";
import { submitFeedback } from "@/actions/feedback";
import { cn } from "@/lib/utils";

export function BlackHoleCompanion() {
  const t = useTranslations("companion");
  const pathname = usePathname();

  // State Machines
  const [dockPosition, setDockPosition] = useState<"left" | "right">("left");
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "absorbing" | "success">("idle");

  // Form State
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(1);

  // Dragging State
  const [dragXOffset, setDragXOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(0);
  const isClickRef = useRef(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Speech Bubble State
  const [bubbleText, setBubbleText] = useState<string | null>(null);

  // Motion preference state
  const [reducedMotion, setReducedMotion] = useState(false);

  // 1. Check prefers-reduced-motion on mount
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  // 2. Load persisted positions from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedDock = localStorage.getItem("flashtar_companion_dock");
      if (savedDock === "left" || savedDock === "right") {
        setDockPosition(savedDock);
      }
    }
  }, []);

  // 3. Handle click-outside to close panel
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setStatus("idle");
        setError(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  // 4. Handle Escape key to close panel
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setStatus("idle");
        setError(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // 5. Focus textarea when panel opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // 6. Route-contextual random speech bubbles
  useEffect(() => {
    if (isOpen) {
      setBubbleText(null);
      return;
    }

    let bubbleTimeout: NodeJS.Timeout;
    let checkInterval: NodeJS.Timeout;

    // Organic random delay before the first bubble (30s to 90s)
    const initialDelay = 30000 + Math.random() * 60000;

    const showBubble = () => {
      const generalPrompts = [
        t("thought_general_1"),
        t("thought_general_2"),
        t("thought_general_3"),
      ];

      let contextPrompt = "";
      if (pathname.includes("/study/courses")) {
        contextPrompt = t("prompt_courses");
      } else if (pathname.includes("/study")) {
        contextPrompt = t("prompt_study");
      } else if (pathname.includes("/settings")) {
        contextPrompt = t("prompt_settings");
      } else {
        contextPrompt = t("prompt_dashboard");
      }

      const pool = [contextPrompt, ...generalPrompts].filter(Boolean);
      const randomPrompt = pool[Math.floor(Math.random() * pool.length)];

      setBubbleText(randomPrompt);

      // Dismiss automatically after 7 seconds
      bubbleTimeout = setTimeout(() => {
        setBubbleText(null);
        // Setup next organic check after a random cooldown of 3-6 minutes
        const nextCooldown = 180000 + Math.random() * 180000;
        setTimeout(setupCheckInterval, nextCooldown);
      }, 7000);
    };

    const setupCheckInterval = () => {
      checkInterval = setInterval(() => {
        // 30% chance every 15 seconds to pop up organically
        if (Math.random() < 0.3) {
          clearInterval(checkInterval);
          showBubble();
        }
      }, 15000);
    };

    const initialTimer = setTimeout(() => {
      showBubble();
    }, initialDelay);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(bubbleTimeout);
      clearInterval(checkInterval);
    };
  }, [isOpen, pathname, t]);

  // Translate helper mapping sub-keys
  const translateKey = (key: string) => {
    if (key.startsWith("companion.")) {
      return t(key.replace("companion.", "") as Parameters<typeof t>[0]);
    }
    return key;
  };

  // Pointer Event Handlers for Dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isOpen) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;

    setIsDragging(true);
    dragStartRef.current = e.clientX;
    isClickRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current;
    if (Math.abs(deltaX) > 5) {
      isClickRef.current = false;
    }
    setDragXOffset(deltaX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);

    const deltaX = e.clientX - dragStartRef.current;
    setDragXOffset(0);

    if (isClickRef.current || Math.abs(deltaX) <= 5) {
      // It was a click, not a drag - toggle the panel
      const nextOpen = !isOpen;
      setIsOpen(nextOpen);
      if (nextOpen) {
        // Randomize placeholder prompt index (1 to 8)
        setPlaceholderIndex(Math.floor(Math.random() * 8) + 1);
      }
      setBubbleText(null);
    } else {
      // Snapping logic based on viewport midpoint
      const screenWidth = window.innerWidth;
      const currentLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
      const finalX = currentLeft + deltaX;

      if (finalX < screenWidth / 2) {
        setDockPosition("left");
        localStorage.setItem("flashtar_companion_dock", "left");
      } else {
        setDockPosition("right");
        localStorage.setItem("flashtar_companion_dock", "right");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) {
      setError("companion.error_empty");
      return;
    }
    if (feedback.length > 1000) {
      setError("companion.error_too_long");
      return;
    }

    setError(null);
    setStatus("absorbing");
    setIsSubmitting(true);

    const [res] = await Promise.all([
      submitFeedback({
        content: feedback,
        path: pathname,
        metadata: {
          userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "unknown",
          screen: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown",
        },
      }),
      // Hold submission animation for at least 800ms for gravitational absorption effect
      new Promise((resolve) => setTimeout(resolve, 850)),
    ]);

    setIsSubmitting(false);

    if (res.error) {
      setError(res.error);
      setStatus("idle");
      toast.error(translateKey(res.error));
    } else {
      setStatus("success");
      setFeedback("");
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: dockPosition === "left" ? "1.5rem" : "auto",
        right: dockPosition === "right" ? "1.5rem" : "auto",
        transform: `translateX(${dragXOffset}px)`,
        zIndex: 40,
      }}
      className={cn(
        "group relative flex flex-col items-center",
        isDragging ? "transition-none cursor-grabbing select-none" : "transition-all duration-300 cursor-grab"
      )}
    >
      <style>{`
        @keyframes aura-pulse {
          0%, 100% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        @keyframes horizon-warp {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        .absorb-active {
          animation: absorb-effect 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        @keyframes absorb-effect {
          0% { transform: scale(1) translateY(0); filter: blur(0); opacity: 1; }
          10% { transform: scale(1.02); }
          100% { transform: scale(0) translateY(80px); filter: blur(4px); opacity: 0; }
        }
      `}</style>

      {/* 1. Speech Bubble overlay */}
      {bubbleText && (
        <div
          className={cn(
            "absolute bottom-20 w-52 p-3 rounded-xl border border-white/10 bg-black/85 backdrop-blur-md text-xs text-white shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-none select-none",
            dockPosition === "left" ? "left-2 origin-bottom-left" : "right-2 origin-bottom-right"
          )}
        >
          <div className="leading-relaxed font-sans">{bubbleText}</div>
          <div
            className={cn(
              "absolute -bottom-1.5 w-3 h-3 bg-black/85 border-r border-b border-white/10 rotate-45",
              dockPosition === "left" ? "left-6" : "right-6"
            )}
          />
        </div>
      )}

      {/* 2. Feedback Panel popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={t("title")}
          className={cn(
            "absolute bottom-20 w-80 max-w-[calc(100vw-3rem)] rounded-2xl border border-white/10 bg-black/90 backdrop-blur-lg shadow-2xl p-4 transition-all duration-300 origin-bottom pointer-events-auto",
            status === "absorbing" ? "absorb-active" : "animate-in fade-in zoom-in-95 duration-200",
            dockPosition === "left" ? "left-0" : "right-0"
          )}
        >
          {status === "success" ? (
            <div className="flex flex-col items-center text-center py-6 animate-in fade-in duration-300">
              <Sparkle className="w-8 h-8 text-indigo-400 fill-indigo-400/20 animate-pulse mb-3" />
              <h3 className="text-sm font-semibold text-white mb-1">
                {t("success_msg_1")}
              </h3>
              <p className="text-xs text-zinc-400">
                {t("success_msg_2")}
              </p>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setStatus("idle");
                }}
                className="mt-5 text-xs text-zinc-400 hover:text-white underline transition-colors underline-offset-4 focus-visible:outline-none"
              >
                {t("title")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-xs font-semibold text-zinc-300 tracking-wide">
                  {t("title")}
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-md text-zinc-500 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <textarea
                ref={textareaRef}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={t(`textarea_placeholder_${placeholderIndex}` as Parameters<typeof t>[0])}
                disabled={isSubmitting}
                className="w-full min-h-[90px] max-h-[160px] p-2.5 rounded-lg border border-white/10 bg-white/5 text-zinc-100 text-xs placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all resize-y"
              />

              {error && (
                <div className="text-[11px] text-rose-400 leading-tight">
                  {translateKey(error)}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />
                    {t("button_sending")}
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    {t("button_send")}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      )}

      {/* 3. Black Hole Core wrapper */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative w-16 h-16 flex items-center justify-center rounded-full active:scale-95 transition-transform"
      >
        {/* Glow Aura Layer */}
        <div
          className={cn(
            "absolute inset-2 rounded-full transition-all duration-700 bg-gradient-to-r pointer-events-none",
            status === "absorbing"
              ? "scale-[1.8] opacity-100 from-indigo-500/60 to-pink-500/60 blur-xl shadow-[0_0_40px_15px_rgba(168,85,247,0.4)]"
              : "scale-100 opacity-60 from-indigo-600/30 to-purple-600/30 blur-md"
          )}
          style={{
            animation: reducedMotion || status === "absorbing" ? "none" : "aura-pulse 4s ease-in-out infinite",
          }}
        />

        {/* Black Hole Event Horizon SVG */}
        <svg
          width="64"
          height="64"
          viewBox="0 0 100 100"
          className={cn(
            "relative z-10 select-none pointer-events-none transition-transform duration-500",
            status === "absorbing" ? "scale-[1.3]" : "scale-100"
          )}
        >
          <defs>
            <filter id="bh-distortion">
              <feTurbulence
                type="fractalNoise"
                baseFrequency={reducedMotion ? "0.0" : "0.035"}
                numOctaves="2"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={reducedMotion ? "0" : "7"}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <radialGradient id="bh-ring-grad" cx="50%" cy="50%" r="50%">
              <stop offset="68%" stopColor="#4f46e5" stopOpacity="0.8" />
              <stop offset="85%" stopColor="#c084fc" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Glowing warped boundary */}
          <circle
            cx="50"
            cy="50"
            r="23"
            fill="none"
            stroke="url(#bh-ring-grad)"
            strokeWidth="3.5"
            style={{
              filter: "url(#bh-distortion)",
              opacity: status === "absorbing" ? 0.95 : 0.7,
            }}
          />

          {/* Core Event Horizon */}
          <circle
            cx="50"
            cy="50"
            r="20"
            fill="#000"
            style={{
              filter: "url(#bh-distortion)",
              animation: reducedMotion ? "none" : "horizon-warp 3s ease-in-out infinite",
            }}
          />
        </svg>
      </div>
    </div>
  );
}
