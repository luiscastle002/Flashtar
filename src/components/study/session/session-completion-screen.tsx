"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PartyPopper, Clock, BookOpen, BarChart2, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SessionStats {
  studied: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  newSeen: number;
}

interface SessionCompletionScreenProps {
  stats: SessionStats;
  durationMs: number;
  onFinish: () => void;
  onStudyMore: () => Promise<void>;
}

export function SessionCompletionScreen({
  stats,
  durationMs,
  onFinish,
  onStudyMore,
}: SessionCompletionScreenProps) {
  const [studyMorePending, setStudyMorePending] = useState(false);
  const [confetti, setConfetti] = useState(false);

  // Trigger confetti burst on mount
  useEffect(() => {
    setConfetti(true);
    const t = setTimeout(() => setConfetti(false), 2000);
    return () => clearTimeout(t);
  }, []);

  const retentionPct =
    stats.studied > 0
      ? Math.round(((stats.good + stats.easy) / stats.studied) * 100)
      : 0;

  const durationMin = Math.floor(durationMs / 60000);
  const durationSec = Math.floor((durationMs % 60000) / 1000);
  const durationStr =
    durationMin > 0 ? `${durationMin}m ${durationSec}s` : `${durationSec}s`;

  async function handleStudyMore() {
    setStudyMorePending(true);
    try {
      await onStudyMore();
    } finally {
      setStudyMorePending(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
      {/* Confetti particles */}
      {confetti && <ConfettiParticles />}

      <div className="w-full max-w-sm space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 mx-auto">
          <PartyPopper className="h-10 w-10 text-primary" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">Session Complete!</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Great work — you studied {stats.studied} card{stats.studied !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<BarChart2 className="h-4 w-4" />}
            label="Retention"
            value={`${retentionPct}%`}
            highlight={retentionPct >= 80}
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Time spent"
            value={durationStr}
          />
          <StatCard
            icon={<BookOpen className="h-4 w-4" />}
            label="Cards studied"
            value={String(stats.studied)}
          />
          <StatCard
            icon={<RotateCcw className="h-4 w-4" />}
            label="New cards"
            value={String(stats.newSeen)}
          />
        </div>

        {/* Rating breakdown */}
        {stats.studied > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-3 font-medium">Rating breakdown</p>
            <div className="flex gap-1 h-2 rounded-full overflow-hidden">
              {[
                { count: stats.again, color: "hsl(0, 85%, 55%)" },
                { count: stats.hard, color: "hsl(30, 90%, 55%)" },
                { count: stats.good, color: "hsl(55, 85%, 55%)" },
                { count: stats.easy, color: "hsl(120, 60%, 45%)" },
              ].map(({ count, color }, i) =>
                count > 0 ? (
                  <div
                    key={i}
                    className="rounded-sm transition-all"
                    style={{
                      backgroundColor: color,
                      flex: count,
                    }}
                  />
                ) : null
              )}
            </div>
            <div className="flex justify-between mt-2">
              {(["Again", "Hard", "Good", "Easy"] as const).map((label, i) => {
                const counts = [stats.again, stats.hard, stats.good, stats.easy];
                const colors = [
                  "text-red-500", "text-orange-500", "text-yellow-500", "text-green-500"
                ];
                return (
                  <div key={label} className="text-center">
                    <p className={cn("text-xs font-semibold", colors[i])}>{counts[i]}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={handleStudyMore}
            disabled={studyMorePending}
            variant="outline"
          >
            {studyMorePending ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Loading…</>
            ) : (
              <><BookOpen className="h-4 w-4 mr-1.5" /> Study More New Cards</>
            )}
          </Button>
          <Button className="w-full" onClick={onFinish}>
            Finish Session
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground text-sm" asChild>
            <Link href={`/stats`}>
              <BarChart2 className="h-4 w-4 mr-1.5" />
              View Statistics
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-3 text-left",
      highlight && "border-green-200 dark:border-green-900"
    )}>
      <div className={cn(
        "flex items-center gap-1.5 text-muted-foreground mb-1",
        highlight && "text-green-600 dark:text-green-400"
      )}>
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn(
        "text-xl font-bold",
        highlight && "text-green-600 dark:text-green-400"
      )}>
        {value}
      </p>
    </div>
  );
}

// Lightweight CSS confetti (no external dependency)
function ConfettiParticles() {
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    animDelay: `${Math.random() * 0.8}s`,
    color: [
      "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
      "#f97316", "#eab308", "#22c55e", "#14b8a6",
    ][Math.floor(Math.random() * 8)],
    size: 6 + Math.random() * 8,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 animate-confetti-fall"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animationDelay: p.animDelay,
            animationDuration: `${1.5 + Math.random() * 1}s`,
            animationFillMode: "forwards",
          }}
        />
      ))}
    </div>
  );
}
