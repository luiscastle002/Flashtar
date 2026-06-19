import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getProfile } from "@/lib/queries/user";
import { getStudyDeckWithSettings } from "@/actions/study-decks";
import { getSelectorDecks, getStatsDashboardData } from "@/actions/stats";
import { StatsHeader } from "@/components/stats/stats-header";
import { StatsDeckSelector } from "@/components/stats/stats-deck-selector";
import { StudyCalendar } from "@/components/stats/study-calendar";
import { FutureDueChart } from "@/components/stats/future-due-chart";
import { getTranslations } from "next-intl/server";

interface StatsDeckPageProps {
  params: Promise<{ deckId: string }>;
}

export async function generateMetadata({ params }: StatsDeckPageProps) {
  const { deckId } = await params;
  const deck = await getStudyDeckWithSettings(deckId);
  const t = await getTranslations("stats");
  return {
    title: `${deck?.name ?? t("title")} — ${t("title")} — Flashtar`,
  };
}

export default async function StatsDeckPage({ params }: StatsDeckPageProps) {
  const { deckId } = await params;

  const [profile, decks, deck] = await Promise.all([
    getProfile(),
    getSelectorDecks(),
    getStudyDeckWithSettings(deckId),
  ]);

  if (!profile) redirect("/login");
  if (!deck) notFound();

  const cookieStore = await cookies();
  const timezone = cookieStore.get("USER_TIMEZONE")?.value || "UTC";

  const { streak, summary, calendar, futureDue } = await getStatsDashboardData(
    deckId,
    timezone
  );

  return (
    <DashboardShell currentPath="/stats" profile={profile}>
      <div className="space-y-6 max-w-5xl">
        {/* Header Summary */}
        <StatsHeader summary={summary} streak={streak} deckName={deck.name} />

        {/* Deck Selector */}
        <StatsDeckSelector decks={decks} selectedDeckId={deckId} />

        {/* Heatmap & Future Due Charts */}
        <div className="space-y-6">
          <StudyCalendar data={calendar} />
          <FutureDueChart data={futureDue} />
        </div>
      </div>
    </DashboardShell>
  );
}
