import { redirect, notFound } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getStudyDeckWithSettings } from "@/actions/study-decks";
import { getSessionQueue, startStudySession } from "@/actions/study-sessions";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StudySessionClient } from "@/components/study/session/study-session-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import type { DeckStudySettings } from "@/types";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

interface SessionPageProps {
  params: Promise<{ deckId: string }>;
}

export async function generateMetadata() {
  const t = await getTranslations("courses");
  return {
    title: `${t("title")} Session — Flashtar`,
  };
}

export default async function CourseStudySessionPage({ params }: SessionPageProps) {
  const { deckId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, deckData, t, tCourses] = await Promise.all([
    getProfile(),
    getStudyDeckWithSettings(deckId),
    getTranslations("study.session"),
    getTranslations("courses"),
  ]);

  if (!deckData) notFound();

  // If this is a personal deck accessed through the courses route, redirect to standard session page
  if (!deckData.shared_deck_id) {
    redirect(`/study/${deckId}/session`);
  }

  // Lookup the category this shared deck belongs to (once, used everywhere below)
  const supabase = await createClient();
  const { data: sharedDeckRow } = await supabase
    .from("shared_decks")
    .select("category_id")
    .eq("id", deckData.shared_deck_id)
    .single();
  const categoryBackUrl = sharedDeckRow?.category_id
    ? `/study/courses/category/${sharedDeckRow.category_id}`
    : "/study/courses";

  // Strip qualified prefix if DB still has old values (e.g. "courses.decks.hiragana.name" → "hiragana")
  const rawDeckName = deckData.name
    .split(".")
    .filter((s: string) => !["courses", "decks", "name"].includes(s))
    .join(".") ||
    deckData.name.split(".").pop() ||
    deckData.name;
  const translatedDeckName = tCourses(
    `decks.${rawDeckName}.name` as Parameters<typeof tCourses>[0],
    { defaultValue: rawDeckName }
  );

  // Load session queue (server-side via adapted courses-aware resolver)
  const { cards } = await getSessionQueue(deckId);

  // Queue empty → show "all done" state with correct back URL
  if (!cards?.length) {
    return (
      <DashboardShell currentPath="/study/courses" profile={profile}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-sm w-full bg-card/60 backdrop-blur-sm shadow-md">
            <CardContent className="py-12 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10">
                <BookOpen className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">{t("all_caught_up_title")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("no_cards_due", { name: translatedDeckName })}
                </p>
              </div>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href={categoryBackUrl}>{t("back_to_deck")}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  // Create the session record before rendering
  const sessionResult = await startStudySession(deckId);
  if ("error" in sessionResult || !sessionResult.data) {
    return (
      <DashboardShell currentPath="/study/courses" profile={profile}>
        <p className="text-destructive">
          {t("start_session_failed", { error: sessionResult.error ?? "Unknown error" })}
        </p>
      </DashboardShell>
    );
  }

  const deck = deckData as typeof deckData & { deck_study_settings: DeckStudySettings | null };
  const showConfidenceBar = deck.deck_study_settings?.show_confidence_bar ?? true;
  const autoplayAudioFront = deck.deck_study_settings?.autoplay_audio_front ?? true;
  const autoplayAudioBack = deck.deck_study_settings?.autoplay_audio_back ?? true;

  return (
    <DashboardShell currentPath="/study/courses" profile={profile}>
      <StudySessionClient
        initialCards={cards}
        sessionId={sessionResult.data.id}
        deckId={deckId}
        deckName={translatedDeckName}
        showConfidenceBar={showConfidenceBar}
        autoplayAudioFront={autoplayAudioFront}
        autoplayAudioBack={autoplayAudioBack}
        isCourse={true}
        courseBackUrl={categoryBackUrl}
      />
    </DashboardShell>
  );
}
