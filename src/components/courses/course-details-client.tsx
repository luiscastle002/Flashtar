"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Play, RotateCcw, Settings, Volume2, BookOpen, Check, ChevronLeft, Sparkles, ChevronDown, ChevronUp, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Pagination } from "@/components/shared/pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetCourseProgress } from "@/actions/courses";
import { updateDeckSettings } from "@/actions/study-decks";
import { toast } from "sonner";
import type { StudyCard, CardStudyState } from "@/types";

interface CourseDetailsClientProps {
  deck: {
    id: string;
    name: string;
    description: string | null;
    emoji: string | null;
    color: string;
    deck_study_settings?: {
      new_cards_per_day: number;
      max_reviews_per_day: number;
    } | null;
  };
  cards: StudyCard[];
  dueCounts: {
    total_due: number;
    new_count: number;
    learn_count: number;
    review_count: number;
  } | null;
  totalCards: number;
  categoryId?: string;
  currentPage?: number;
}

export function CourseDetailsClient({
  deck,
  cards,
  dueCounts,
  totalCards,
  categoryId,
  currentPage = 1,
}: CourseDetailsClientProps) {
  const router = useRouter();
  const t = useTranslations("courses");
  const tStudy = useTranslations("study");

  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const [showSyllabus, setShowSyllabus] = useState(false);

  // Settings form state
  const [newCardsPerDay, setNewCardsPerDay] = useState(
    deck.deck_study_settings?.new_cards_per_day ?? 20
  );
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(
    deck.deck_study_settings?.max_reviews_per_day ?? 20
  );

  const totalDue = dueCounts?.total_due ?? 0;
  const newCount = dueCounts?.new_count ?? 0;
  const learnCount = dueCounts?.learn_count ?? 0;
  const reviewCount = dueCounts?.review_count ?? 0;

  // Calculate Studied Progress
  const studiedCards = cards.filter(card => card.state !== "new").length;
  const progressPercent = totalCards > 0 ? Math.round((studiedCards / totalCards) * 100) : 0;

  // Handle course progress reset
  const handleReset = async () => {
    setResetLoading(true);
    try {
      const res = await resetCourseProgress(deck.id);
      if (res.error) {
        toast.error("Failed to reset progress: " + res.error);
      } else {
        toast.success("Course progress reset successfully.");
        setResetOpen(false);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred.");
    } finally {
      setResetLoading(false);
    }
  };

  // Handle settings update
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true);
    try {
      const res = await updateDeckSettings(deck.id, {
        new_cards_per_day: Number(newCardsPerDay),
        max_reviews_per_day: Number(maxReviewsPerDay),
      });
      if (res.error) {
        toast.error("Failed to update settings: " + res.error);
      } else {
        toast.success("Settings updated successfully.");
        setSettingsOpen(false);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred.");
    } finally {
      setSettingsLoading(false);
    }
  };

  // Play audio for a card
  const handlePlayAudio = (e: React.MouseEvent, card: StudyCard) => {
    e.stopPropagation();
    const audioFile = card.audios?.[0]?.audio_files?.file_id;
    if (audioFile) {
      const audio = new Audio(audioFile);
      audio.play().catch((err) => console.error("Error playing audio:", err));
    } else {
      toast.info("Audio pronunciation not available.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Category Back Navigation */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 rounded-xl text-muted-foreground hover:text-foreground">
          <Link href={categoryId ? `/study/courses/category/${categoryId}` : "/study/courses"}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Category
          </Link>
        </Button>
      </div>

      {/* Course Header Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-card/40 border p-6 rounded-2xl backdrop-blur-md shadow-lg relative overflow-hidden">
        <div className="flex items-start gap-4">
          <span className="text-4xl md:text-5xl shrink-0" role="img" aria-label="Deck emoji">
            {deck.emoji ?? "📚"}
          </span>
          <div>
            {/* Strip qualified prefix if DB still has old values (e.g. "courses.decks.hiragana.name" → "hiragana") */}
            {(() => {
              const rawDeckName = deck.name.split(".").filter((s: string) => !['courses','decks','name'].includes(s)).join(".") || deck.name.split(".").pop() || deck.name;
              return (
                <>
                  <h1 className="text-2xl md:text-3xl font-extrabold font-display uppercase tracking-wider text-foreground">
                    {t(`decks.${rawDeckName}.name` as Parameters<typeof t>[0], { defaultValue: rawDeckName })}
                  </h1>
                  <p className="text-muted-foreground text-sm mt-1 max-w-xl">
                    {t(`decks.${rawDeckName}.desc` as Parameters<typeof t>[0], { defaultValue: deck.description ?? "" })}
                  </p>
                </>
              );
            })()}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 md:self-end">
          {/* Settings Modal Trigger */}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl hover:bg-accent">
                <Settings className="h-4.5 w-4.5 text-muted-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <form onSubmit={handleSaveSettings}>
                <DialogHeader>
                  <DialogTitle>{tStudy("settings.title")}</DialogTitle>
                  <DialogDescription>
                    Adjust the daily limit constraints for this course.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="newCards">{tStudy("settings.new_cards_day")}</Label>
                    <Input
                      id="newCards"
                      type="number"
                      min="0"
                      max="9999"
                      value={newCardsPerDay}
                      onChange={(e) => setNewCardsPerDay(Number(e.target.value))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxReviews">{tStudy("settings.max_reviews_day")}</Label>
                    <Input
                      id="maxReviews"
                      type="number"
                      min="0"
                      max="9999"
                      value={maxReviewsPerDay}
                      onChange={(e) => setMaxReviewsPerDay(Number(e.target.value))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setSettingsOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={settingsLoading}>
                    {settingsLoading ? "Saving..." : "Save Settings"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Reset Progress Modal Trigger */}
          <Dialog open={resetOpen} onOpenChange={setResetOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl text-red-500 hover:bg-red-500/10 border-red-500/20">
                <RotateCcw className="h-4.5 w-4.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("actions.reset_progress_title")}</DialogTitle>
                <DialogDescription>
                  {t("actions.reset_progress_desc")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setResetOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleReset} disabled={resetLoading}>
                  {resetLoading ? "Resetting..." : t("actions.reset_progress")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Interactive Course Dashboard */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column: Interactive Study CTA Card */}
        <div className="md:col-span-2 space-y-6">
          <Card
            className="border-2 overflow-hidden shadow-lg transition-all duration-300 relative bg-card/40 backdrop-blur-sm"
            style={{ borderColor: deck.color + "30" }}
          >
            {/* Highlight Accent */}
            <div
              className="h-2 w-full"
              style={{ backgroundColor: deck.color }}
            />

            <CardContent className="p-8 space-y-6">
              {totalDue > 0 ? (
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-semibold uppercase tracking-wider font-display">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                    Review Available
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold font-display uppercase tracking-wide">
                      {studiedCards === 0 ? "Ready to begin?" : "Continue your learning path"}
                    </h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      You have {totalDue} due cards waiting for review or learn steps today.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="w-full text-base font-semibold rounded-2xl h-12 shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
                    asChild
                  >
                    <Link href={`/study/courses/${deck.id}/session`}>
                      <Play className="h-5 w-5 mr-2 fill-current" />
                      {studiedCards === 0 ? "Start Learning" : "Study Due Cards"} ({totalDue})
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-semibold uppercase tracking-wider font-display">
                    <Check className="h-3.5 w-3.5" />
                    All Caught Up
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold font-display uppercase tracking-wide">
                      {"You're done for today! 🎉"}
                    </h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      All currently scheduled reviews are completed. Check back tomorrow for new cards or reviews.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full text-base font-semibold rounded-2xl h-12 border"
                    disabled
                  >
                    Nothing Due Today
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Mini stats overview */}
        <div className="space-y-4">
          <h3 className="font-bold font-display uppercase tracking-wider text-xs text-muted-foreground">
            Progress & Scheduling
          </h3>

          <div className="grid gap-4">
            {/* Completion Progress card */}
            <Card className="bg-card/30 border shadow-sm">
              <CardContent className="p-5 space-y-3">
                <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground font-display">
                  <span>Syllabus Mastered</span>
                  <span>{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <p className="text-[10px] font-semibold text-muted-foreground/80 font-display uppercase tracking-wide">
                  {studiedCards} of {totalCards} cards started
                </p>
              </CardContent>
            </Card>

            {/* Queue breakdown card */}
            <Card className="bg-card/30 border shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-display">
                  <BarChart2 className="h-4 w-4 text-primary" />
                  {"Today's Study Queue"}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-blue-500/5 border border-blue-500/10">
                    <div className="text-lg font-bold text-blue-500">{newCount}</div>
                    <div className="text-[8px] uppercase tracking-wider font-semibold text-muted-foreground font-display">New</div>
                  </div>
                  <div className="p-2 rounded-xl bg-orange-500/5 border border-orange-500/10">
                    <div className="text-lg font-bold text-orange-500">{learnCount}</div>
                    <div className="text-[8px] uppercase tracking-wider font-semibold text-muted-foreground font-display">Learn</div>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                    <div className="text-lg font-bold text-emerald-500">{reviewCount}</div>
                    <div className="text-[8px] uppercase tracking-wider font-semibold text-muted-foreground font-display">Review</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Course Syllabus Accordion Section */}
      <div className="border rounded-2xl overflow-hidden bg-card/10">
        <button
          type="button"
          onClick={() => setShowSyllabus(!showSyllabus)}
          className="w-full flex items-center justify-between p-5 font-bold font-display uppercase tracking-wider text-foreground hover:bg-card/30 transition-all duration-300 border-b"
        >
          <span className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-primary" />
            Course Syllabus ({totalCards} Items)
          </span>
          {showSyllabus ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {showSyllabus && (
          <div className="p-6 bg-card/5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {cards.map((card) => {
                const stateColors: Record<CardStudyState, string> = {
                  new: "bg-muted text-muted-foreground border-transparent",
                  learn: "bg-orange-500/10 text-orange-500 border-orange-500/20",
                  review: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                  suspended: "bg-red-500/10 text-red-500 border-red-500/20",
                  buried: "bg-muted/80 text-muted-foreground border-transparent",
                  leech: "bg-red-500/15 text-red-600 border-red-500/30",
                };

                return (
                  <Card
                    key={card.shared_card_id}
                    className="group relative flex flex-col items-center justify-center p-4 min-h-[140px] text-center border bg-card/30 hover:border-primary/40 hover:bg-card/50 transition-all duration-300 rounded-2xl"
                  >
                    {/* Pronunciation Play Button */}
                    <button
                      type="button"
                      onClick={(e) => handlePlayAudio(e, card)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-primary/5 text-primary hover:bg-primary/25 opacity-0 group-hover:opacity-100 transition duration-300"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>

                    {/* Scheduling state badge */}
                    <span
                      className={`absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded-md font-semibold border font-display uppercase tracking-wider ${
                        stateColors[card.state] || stateColors.new
                      }`}
                    >
                      {card.state}
                    </span>

                    {/* Character visual display */}
                    <div className="text-3xl font-extrabold font-display text-foreground mt-4 select-none">
                      {card.front.replace(/<[^>]*>/g, "")}
                    </div>

                    <div className="text-xs text-muted-foreground/80 font-medium font-display mt-2 lowercase select-none">
                      {card.back.replace(/<[^>]*>/g, "")}
                    </div>
                  </Card>
                );
              })}
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={totalCards}
              pageSize={100}
              basePath={`/study/courses/${deck.id}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
