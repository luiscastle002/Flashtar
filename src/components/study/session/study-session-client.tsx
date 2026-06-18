"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StudyCardDisplay } from "./study-card-display";
import { ConfidenceBar } from "./confidence-bar";
import { SessionCompletionScreen } from "./session-completion-screen";
import { submitReview, endStudySession, addMoreNewCards } from "@/actions/study-sessions";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";
import type { StudyCard, ConfidenceRating } from "@/types";

interface StudySessionClientProps {
  initialCards: StudyCard[];
  sessionId: string;
  deckId: string;
  deckName: string;
  showConfidenceBar: boolean;
}

interface SessionStats {
  studied: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  newSeen: number;
}

export function StudySessionClient({
  initialCards,
  sessionId,
  deckId,
  deckName,
  showConfidenceBar,
}: StudySessionClientProps) {
  const router = useRouter();
  const t = useTranslations("study.session");
  const tRoot = useTranslations();
  const [cards, setCards] = useState<StudyCard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [stats, setStats] = useState<SessionStats>({
    studied: 0, again: 0, hard: 0, good: 0, easy: 0, newSeen: 0,
  });
  const cardStartRef = useRef<number>(Date.now());
  const sessionStartRef = useRef<number>(Date.now());

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0
    ? Math.round((currentIndex / cards.length) * 100)
    : 100;

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't intercept if modal/dialog is open
      if (e.target !== document.body && (e.target as HTMLElement).tagName !== "BODY") {
        // allow input fields to type normally
        if ((e.target as HTMLElement).tagName === "INPUT" ||
            (e.target as HTMLElement).tagName === "TEXTAREA") return;
      }

      if (!isFlipped) {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          setIsFlipped(true);
        }
        return;
      }

      // Answer shortcuts (only when card is flipped)
      if (e.key === "1") handleRate(0);
      if (e.key === "2") handleRate(30);
      if (e.key === "3") handleRate(60);
      if (e.key === "4") handleRate(90);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFlipped, currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped(true);
  }, []);

  const handleRate = useCallback(async (confidencePct: number) => {
    if (!currentCard || isSubmitting) return;
    setIsSubmitting(true);

    const durationMs = Date.now() - cardStartRef.current;

    try {
      const result = await submitReview({
        sessionId,
        cardId: currentCard.id,
        confidencePct,
        durationMs,
      });

      if ("error" in result && result.error) {
        toast.error(translateError(result.error, tRoot));
        setIsSubmitting(false);
        return;
      }

      // Update local stats
      const rating: ConfidenceRating = result.data?.rating ?? "good";
      setStats((prev) => ({
        studied: prev.studied + 1,
        again: prev.again + (rating === "again" ? 1 : 0),
        hard: prev.hard + (rating === "hard" ? 1 : 0),
        good: prev.good + (rating === "good" ? 1 : 0),
        easy: prev.easy + (rating === "easy" ? 1 : 0),
        newSeen: prev.newSeen + (currentCard.state === "new" ? 1 : 0),
      }));

      // Advance to next card
      const nextIndex = currentIndex + 1;
      if (nextIndex >= cards.length) {
        setIsComplete(true);
      } else {
        setCurrentIndex(nextIndex);
        setIsFlipped(false);
        cardStartRef.current = Date.now();
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [currentCard, currentIndex, cards.length, isSubmitting, sessionId, tRoot]);

  async function handleFinish() {
    const durationMs = Date.now() - sessionStartRef.current;
    await endStudySession(sessionId, {
      cardsStudied: stats.studied,
      cardsAgain: stats.again,
      cardsHard: stats.hard,
      cardsGood: stats.good,
      cardsEasy: stats.easy,
      newCardsSeen: stats.newSeen,
      durationMs,
    });
    router.push(`/study/${deckId}`);
    router.refresh();
  }

  async function handleStudyMore() {
    const result = await addMoreNewCards(deckId);
    if ("error" in result && result.error) {
      toast.error(translateError(result.error, tRoot));
      return;
    }
    if (!result.cards.length) {
      toast.info(t("no_more_new_cards"));
      return;
    }
    setCards((prev) => [...prev, ...result.cards]);
    setCurrentIndex(cards.length); // jump to first of new batch
    setIsFlipped(false);
    setIsComplete(false);
    cardStartRef.current = Date.now();
  }

  if (isComplete) {
    return (
      <SessionCompletionScreen
        stats={stats}
        durationMs={Date.now() - sessionStartRef.current}
        onFinish={handleFinish}
        onStudyMore={handleStudyMore}
      />
    );
  }

  if (!currentCard) return null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] max-w-2xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
          onClick={handleFinish}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {deckName}
        </Button>
        <div className="flex-1">
          <Progress value={progress} className="h-2" />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums shrink-0">
          {currentIndex + 1}/{cards.length}
        </span>
      </div>

      {/* Card display */}
      <div className="flex-1 flex flex-col">
        <StudyCardDisplay
          card={currentCard}
          isFlipped={isFlipped}
          onFlip={handleFlip}
        />

        {/* Answer controls — only shown after flip */}
        {isFlipped && (
          <div className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {showConfidenceBar ? (
              <ConfidenceBar
                onRate={handleRate}
                disabled={isSubmitting}
              />
            ) : (
              <ClassicButtons onRate={handleRate} disabled={isSubmitting} />
            )}
            <p className="text-center text-xs text-muted-foreground mt-3">
              {t.rich("keyboard_help", {
                space: () => <kbd className="font-mono bg-muted px-1 rounded">{t("keyboard_space")}</kbd>,
                keys: () => (
                  <>
                    <kbd className="font-mono bg-muted px-1 rounded">1</kbd>{" "}
                    <kbd className="font-mono bg-muted px-1 rounded">2</kbd>{" "}
                    <kbd className="font-mono bg-muted px-1 rounded">3</kbd>{" "}
                    <kbd className="font-mono bg-muted px-1 rounded">4</kbd>
                  </>
                )
              })}
            </p>
          </div>
        )}

        {/* Show Answer button */}
        {!isFlipped && (
          <div className="mt-6 text-center">
            <Button
              size="lg"
              onClick={handleFlip}
              className="px-10 animate-in fade-in duration-200"
            >
              {t("show_answer")}
              <span className="ml-2 text-xs opacity-60 font-mono">{t("keyboard_space")}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Classic 4-button fallback (when show_confidence_bar = false)
function ClassicButtons({
  onRate,
  disabled,
}: {
  onRate: (pct: number) => void;
  disabled: boolean;
}) {
  const t = useTranslations("study.session");
  const buttons = [
    { key: "again", pct: 10, className: "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950" },
    { key: "hard",  pct: 35, className: "border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950" },
    { key: "good",  pct: 65, className: "border-green-200 text-green-600 hover:bg-green-50 dark:border-green-900 dark:text-green-400 dark:hover:bg-green-950" },
    { key: "easy",  pct: 90, className: "border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950" },
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-2">
      {buttons.map(({ key, pct, className }) => (
        <Button
          key={key}
          variant="outline"
          disabled={disabled}
          onClick={() => onRate(pct)}
          className={`h-12 text-sm font-medium ${className}`}
        >
          {t(`rating.${key}`)}
        </Button>
      ))}
    </div>
  );
}
