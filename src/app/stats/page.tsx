import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getProfile } from "@/lib/queries/user";
import { getSelectorDecks, getStatsDashboardData } from "@/actions/stats";
import { StatsHeader } from "@/components/stats/stats-header";
import { StatsDeckSelector } from "@/components/stats/stats-deck-selector";
import { StudyCalendar } from "@/components/stats/study-calendar";
import { FutureDueChart } from "@/components/stats/future-due-chart";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("stats");
  return {
    title: `${t("title")} — Flashtar`,
  };
}

export default async function StatsGlobalPage() {
  const [profile, decks] = await Promise.all([
    getProfile(),
    getSelectorDecks(),
  ]);

  if (!profile) redirect("/login");

  const cookieStore = await cookies();
  const timezone = cookieStore.get("USER_TIMEZONE")?.value || "UTC";

  const { streak, summary, calendar, futureDue } = await getStatsDashboardData(
    null,
    timezone
  );

  return (
    <DashboardShell currentPath="/stats" profile={profile}>
      <div className="space-y-6 max-w-5xl">
        {/* Header Summary */}
        <StatsHeader summary={summary} streak={streak} deckName={null} />

        {/* Deck Selector */}
        <StatsDeckSelector decks={decks} selectedDeckId={null} />

        {/* Heatmap & Future Due Charts */}
        <div className="space-y-6">
          <StudyCalendar data={calendar} />
          <FutureDueChart data={futureDue} />
        </div>
      </div>
    </DashboardShell>
  );
}
