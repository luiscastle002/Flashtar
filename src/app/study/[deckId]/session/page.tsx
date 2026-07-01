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

interface SessionPageProps {
  params: Promise<{ deckId: string }>;
}

export async function generateMetadata() {
  const t = await getTranslations("navigation");
  return {
    title: `${t("study")} — Flashtar`,
  };
}

export default async function StudySessionPage({ params }: SessionPageProps) {
  const { deckId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, deckData, t] = await Promise.all([
    getProfile(),
    getStudyDeckWithSettings(deckId),
    getTranslations("study.session"),
  ]);

  if (!deckData) notFound();

  // Load session queue (server-side via RPC)
  const { cards } = await getSessionQueue(deckId);

  // Queue empty → redirect to completion or show "all done" state
  if (!cards?.length) {
    return (
      <DashboardShell currentPath="/study" profile={profile}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-sm w-full">
            <CardContent className="py-12 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10">
                <BookOpen className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">{t("all_caught_up_title")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("no_cards_due", { name: deckData.name })}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={`/study/${deckId}`}>{t("back_to_deck")}</Link>
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
      <DashboardShell currentPath="/study" profile={profile}>
        <p className="text-destructive">
          {t("start_session_failed", { error: sessionResult.error ?? "Unknown error" })}
        </p>
      </DashboardShell>
    );
  }

  // Determine whether to show confidence bar or classic buttons
  const deck = deckData as typeof deckData & { deck_study_settings: DeckStudySettings | null };
  const showConfidenceBar = deck.deck_study_settings?.show_confidence_bar ?? true;
  const autoplayAudioFront = deck.deck_study_settings?.autoplay_audio_front ?? true;
  const autoplayAudioBack = deck.deck_study_settings?.autoplay_audio_back ?? true;

  return (
    <DashboardShell currentPath="/study" profile={profile}>
      <StudySessionClient
        initialCards={cards}
        sessionId={sessionResult.data.id}
        deckId={deckId}
        deckName={deck.name}
        showConfidenceBar={showConfidenceBar}
        autoplayAudioFront={autoplayAudioFront}
        autoplayAudioBack={autoplayAudioBack}
      />
    </DashboardShell>
  );
}
