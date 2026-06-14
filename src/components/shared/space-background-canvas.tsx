"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useSpaceBackground } from "./space-background-context";

interface Star {
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  speed: number; // in radians per second
  phase: number;
  depth: number; // 0.2 (far), 0.5 (mid), 0.8 (near)
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  life: number; // 1.0 down to 0
  decay: number;
}

interface NebulaBlob {
  x: number;
  y: number;
  baseRadius: number;
  currentRadius: number;
  colorRGB: string; // e.g. "99, 102, 241"
  colorAlpha: number; // base opacity
  angle: number;
  speed: number;
  pulsePhase: number;
  pulseSpeed: number;
}

export const SpaceBackgroundCanvas: React.FC = () => {
  const { config } = useSpaceBackground();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Animation frame reference
  const requestRef = useRef<number | null>(null);

  // Keep references to animation variables to avoid re-runs & re-renders
  const starsRef = useRef<Star[]>([]);
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const nebulaRef = useRef<NebulaBlob[]>([]);

  // Viewport dimensions in CSS pixels (updated via ResizeObserver)
  const viewportSizeRef = useRef({ width: 0, height: 0 });

  // Parallax mouse coordinates
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  
  // Track window focus and system settings
  const [reducedMotion, setReducedMotion] = useState(false);
  const isHiddenRef = useRef(false);
  const reducedMotionRef = useRef(reducedMotion);

  // Theme support
  const { resolvedTheme } = useTheme();
  const themeRef = useRef(resolvedTheme);

  useEffect(() => {
    themeRef.current = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  // Sync prop changes to refs for the animation loop
  const propsRef = useRef(config);
  useEffect(() => {
    propsRef.current = config;
  }, [config]);

  // Initialize stars and nebula blobs
  const initUniverse = useCallback((width: number, height: number) => {
    const stars: Star[] = [];
    const totalCount = propsRef.current.starCount;

    // Distribute stars proportionally
    const farCount = Math.round(totalCount * 0.60);    // ~45 stars for default 75
    const midCount = Math.round(totalCount * 0.27);    // ~20 stars for default 75
    const nearCount = totalCount - farCount - midCount;  // ~10 stars for default 75

    // Layer 1: Far (Background)
    for (let i = 0; i < farCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 0.5 + Math.random() * 0.4, // 0.5px to 0.9px
        baseOpacity: 0.15 + Math.random() * 0.45,
        speed: 0.3 + Math.random() * 0.7, // slow twinkle (radians per sec)
        phase: Math.random() * Math.PI * 2,
        depth: 0.2,
      });
    }

    // Layer 2: Midground
    for (let i = 0; i < midCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 1.0 + Math.random() * 0.4, // 1.0px to 1.4px
        baseOpacity: 0.3 + Math.random() * 0.5,
        speed: 0.5 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        depth: 0.5,
      });
    }

    // Layer 3: Foreground (Near)
    for (let i = 0; i < nearCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 1.5 + Math.random() * 0.7, // 1.5px to 2.2px
        baseOpacity: 0.5 + Math.random() * 0.5,
        speed: 0.8 + Math.random() * 1.0,
        phase: Math.random() * Math.PI * 2,
        depth: 0.8,
      });
    }

    starsRef.current = stars;

    // Soft, wide-spread nebula color points (very subtle Indigo, Cyan, Violet)
    const minDim = Math.min(width, height);
    nebulaRef.current = [
      {
        x: width * 0.25,
        y: height * 0.35,
        baseRadius: minDim * 0.45,
        currentRadius: minDim * 0.45,
        colorRGB: "99, 102, 241", // Indigo-500
        colorAlpha: 0.04, // extremely subtle
        angle: Math.random() * Math.PI * 2,
        speed: 0.0001,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.0002,
      },
      {
        x: width * 0.75,
        y: height * 0.65,
        baseRadius: minDim * 0.5,
        currentRadius: minDim * 0.5,
        colorRGB: "6, 182, 212", // Cyan-500
        colorAlpha: 0.03, // extremely subtle
        angle: Math.random() * Math.PI * 2,
        speed: 0.00008,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.00015,
      },
      {
        x: width * 0.5,
        y: height * 0.5,
        baseRadius: minDim * 0.35,
        currentRadius: minDim * 0.35,
        colorRGB: "139, 92, 246", // Violet-500
        colorAlpha: 0.03, // extremely subtle
        angle: Math.random() * Math.PI * 2,
        speed: 0.00007,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.00018,
      },
    ];
  }, []);

  // Re-initialize stars if starCount changes
  useEffect(() => {
    const { width, height } = viewportSizeRef.current;
    if (width > 0 && height > 0) {
      initUniverse(width, height);
    }
  }, [config.starCount, initUniverse]);

  // Main render and physics loop
  const animate = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas || isHiddenRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = viewportSizeRef.current;
    if (width === 0 || height === 0) {
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const isLight = themeRef.current === "light";

    // 1. Clear physical canvas area
    if (isLight) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Save context state, scale for high-DPI, and do all drawing in CSS pixels
    ctx.save();
    ctx.scale(dpr, dpr);

    const activeNebula = propsRef.current.nebula && !reducedMotionRef.current;
    const activeParallax = propsRef.current.parallax && !reducedMotionRef.current;
    const activeShootingStars = propsRef.current.shootingStars && !reducedMotionRef.current;

    // 2. Draw & Animate Nebula Blobs
    if (activeNebula) {
      nebulaRef.current.forEach((blob) => {
        // Orbit center point slightly
        blob.angle += blob.speed;
        const radiusOffset = blob.baseRadius * 0.1;
        const orbitX = blob.x + Math.cos(blob.angle) * 15;
        const orbitY = blob.y + Math.sin(blob.angle) * 15;

        // Breathe/pulse size
        blob.pulsePhase += blob.pulseSpeed;
        blob.currentRadius = blob.baseRadius + Math.sin(blob.pulsePhase) * radiusOffset;

        // Render radial glow
        const grad = ctx.createRadialGradient(
          orbitX,
          orbitY,
          0,
          orbitX,
          orbitY,
          blob.currentRadius
        );

        // Subtler nebula in light mode
        const alphaMultiplier = isLight ? 0.25 : 1.0;
        const alpha = blob.colorAlpha * alphaMultiplier;

        grad.addColorStop(0, `rgba(${blob.colorRGB}, ${alpha})`);
        grad.addColorStop(1, `rgba(${blob.colorRGB}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orbitX, orbitY, blob.currentRadius, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 3. Smooth mouse parallax interpolation (Lerp)
    if (activeParallax) {
      const mouse = mouseRef.current;
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;
    } else {
      const mouse = mouseRef.current;
      mouse.x += (0 - mouse.x) * 0.05;
      mouse.y += (0 - mouse.y) * 0.05;
    }

    // 4. Update and Draw Stars (in CSS units)
    const timeSec = time / 1000;
    starsRef.current.forEach((star) => {
      // Slow constant drift (slower for background stars)
      const baseDrift = 0.03; // pixels per frame in CSS units
      if (!reducedMotionRef.current) {
        star.x += baseDrift * star.depth;
        star.y += baseDrift * 0.3 * star.depth;

        // Wrap around edge boundaries (using CSS width/height)
        if (star.x > width) star.x = 0;
        if (star.x < 0) star.x = width;
        if (star.y > height) star.y = 0;
        if (star.y < 0) star.y = height;
      }

      // Parallax offsets (using CSS limits)
      const parallaxFactor = 15;
      const offsetX = mouseRef.current.x * parallaxFactor * star.depth;
      const offsetY = mouseRef.current.y * parallaxFactor * star.depth;

      let drawX = star.x + offsetX;
      let drawY = star.y + offsetY;

      // Local wrapping to keep stars on canvas even with heavy parallax
      if (drawX > width) drawX -= width;
      if (drawX < 0) drawX += width;
      if (drawY > height) drawY -= height;
      if (drawY < 0) drawY += height;

      // Twinkle calculation: calm cosine oscillation
      let opacity = star.baseOpacity;
      if (!reducedMotionRef.current) {
        opacity = star.baseOpacity * (0.2 + 0.8 * Math.abs(Math.sin(timeSec * star.speed + star.phase)));
      }

      // Render star
      if (isLight) {
        // Light mode: subtle dark slate/indigo stars
        ctx.fillStyle = `rgba(15, 23, 42, ${opacity * 0.15})`;
      } else {
        // Dark mode: bright white stars
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      }
      ctx.beginPath();
      ctx.arc(drawX, drawY, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // 5. Update and Draw Shooting Stars (in CSS units)
    if (activeShootingStars) {
      // Low probability random spawn
      if (Math.random() < 0.0006 && shootingStarsRef.current.length < 2) {
        const sideRand = Math.random();
        let spawnX = 0;
        let spawnY = 0;

        if (sideRand < 0.5) {
          spawnX = Math.random() * (width * 0.3);
          spawnY = Math.random() * (height * 0.2);
        } else {
          spawnX = Math.random() * (width * 0.6);
          spawnY = 0;
        }

        const angle = 0.35 + Math.random() * 0.2; // ~20 to 30 degrees diagonal down-right
        const speed = 10 + Math.random() * 8;

        shootingStarsRef.current.push({
          x: spawnX,
          y: spawnY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          length: 40 + Math.random() * 50,
          life: 1.0,
          decay: 0.01 + Math.random() * 0.015,
        });
      }

      // Draw and decay active shooting stars
      shootingStarsRef.current = shootingStarsRef.current.filter((sStar) => {
        sStar.x += sStar.vx;
        sStar.y += sStar.vy;
        sStar.life -= sStar.decay;

        if (sStar.life <= 0) return false;

        const grad = ctx.createLinearGradient(
          sStar.x,
          sStar.y,
          sStar.x - sStar.vx * 1.5,
          sStar.y - sStar.vy * 1.5
        );

        if (isLight) {
          grad.addColorStop(0, `rgba(99, 102, 241, ${sStar.life * 0.25})`);
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        } else {
          grad.addColorStop(0, `rgba(255, 255, 255, ${sStar.life * 0.8})`);
          grad.addColorStop(0.3, `rgba(165, 180, 252, ${sStar.life * 0.5})`);
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        }

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sStar.x, sStar.y);
        ctx.lineTo(sStar.x - sStar.vx * 1.0, sStar.y - sStar.vy * 1.0);
        ctx.stroke();

        return true;
      });
    }

    // Restore context scaling matrix for next frame
    ctx.restore();

    requestRef.current = requestAnimationFrame(animate);
  }, []);

  // 1. Detect prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  // 2. Track page visibility API (pause when hidden)
  useEffect(() => {
    const handleVisibility = () => {
      isHiddenRef.current = document.hidden;
      if (document.hidden) {
        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = null;
        }
      } else {
        // Resume loop if it was stopped
        if (!requestRef.current && canvasRef.current) {
          requestRef.current = requestAnimationFrame(animate);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [animate]);

  // 3. Parallax mouse listener (triggers on desktop only)
  useEffect(() => {
    if (reducedMotion || !config.parallax) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      mouseRef.current.targetX = e.clientX / innerWidth - 0.5;
      mouseRef.current.targetY = e.clientY / innerHeight - 0.5;
    };

    const handleMouseLeave = () => {
      mouseRef.current.targetX = 0;
      mouseRef.current.targetY = 0;
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [config.parallax, reducedMotion]);

  // 4. ResizeObserver: manages canvas dimensions & high-DPI scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const handleResize = (entries: ResizeObserverEntry[]) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        
        // Save CSS dimensions to ref
        viewportSizeRef.current = { width, height };

        // Scale backbuffer to physical screen pixels for High-DPI screens
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        // Initialize positions if first setup or aspect ratio changed significantly
        if (starsRef.current.length === 0) {
          initUniverse(width, height);
        } else {
          // Adjust star positions mapping to maintain viewport coverage
          starsRef.current.forEach((star) => {
            if (star.x > width) star.x = Math.random() * width;
            if (star.y > height) star.y = Math.random() * height;
          });
          // Update nebula positions relative to the new dimensions
          if (nebulaRef.current.length > 0) {
            const minDim = Math.min(width, height);
            nebulaRef.current[0].x = width * 0.25;
            nebulaRef.current[0].y = height * 0.35;
            nebulaRef.current[0].baseRadius = minDim * 0.45;

            nebulaRef.current[1].x = width * 0.75;
            nebulaRef.current[1].y = height * 0.65;
            nebulaRef.current[1].baseRadius = minDim * 0.5;

            nebulaRef.current[2].x = width * 0.5;
            nebulaRef.current[2].y = height * 0.5;
            nebulaRef.current[2].baseRadius = minDim * 0.35;
          }
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Initial loop execution
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      resizeObserver.disconnect();
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [animate, initUniverse]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden transition-all duration-500",
        resolvedTheme === "light" ? "bg-transparent" : "bg-black",
        config.isVisible ? "opacity-100" : "opacity-0"
      )}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
};
