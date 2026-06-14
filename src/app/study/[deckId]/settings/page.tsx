import { redirect, notFound } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getStudyDeckWithSettings } from "@/actions/study-decks";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DeckSettingsForm } from "@/components/study/deck-settings-form";
import type { DeckStudySettings } from "@/types";

interface SettingsPageProps {
  params: Promise<{ deckId: string }>;
}

export default async function DeckSettingsPage({ params }: SettingsPageProps) {
  const { deckId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, deckData] = await Promise.all([
    getProfile(),
    getStudyDeckWithSettings(deckId),
  ]);

  if (!deckData) notFound();

  const deck = deckData as typeof deckData & { deck_study_settings: DeckStudySettings | null };

  return (
    <DashboardShell currentPath="/study" profile={profile}>
      <div className="max-w-xl space-y-6">
        <div>
          <h1 className="text-xl font-bold">Deck Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {deck.emoji ?? "📚"} {deck.name}
          </p>
        </div>
        <DeckSettingsForm
          deckId={deckId}
          settings={deck.deck_study_settings}
          isArchived={deck.is_archived}
        />
      </div>
    </DashboardShell>
  );
}
