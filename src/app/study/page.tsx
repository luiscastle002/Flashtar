import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, getProfile, canCreateStudyDeck } from "@/lib/queries/user";
import { getStudyDecks, getDeckDueCounts } from "@/actions/study-decks";
import { StudyDeckCard } from "@/components/study/study-deck-card";
import { CreateStudyDeckButton } from "@/components/study/create-study-deck-button";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("study");
  return {
    title: `${t("title")} — Flashtar`,
    description: t("no_decks_desc"),
  };
}

export default async function StudyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, decks, gate, t] = await Promise.all([
    getProfile(),
    getStudyDecks(),
    canCreateStudyDeck(),
    getTranslations("study"),
  ]);

  // Fetch due counts for all decks in parallel
  const dueCounts = await Promise.all(
    decks.map((deck) => getDeckDueCounts(deck.id))
  );

  const decksWithDue = decks.map((deck, i) => ({
    ...deck,
    due_count: dueCounts[i]?.total_due ?? 0,
    new_count: dueCounts[i]?.new_count ?? 0,
  }));

  const totalDue = decksWithDue.reduce((sum, d) => sum + (d.due_count ?? 0), 0);

  return (
    <DashboardShell currentPath="/study" profile={profile}>
      <div className="space-y-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-display uppercase tracking-wider flex items-center gap-3">
              <BookOpen className="h-7 w-7 text-primary" />
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 font-display uppercase tracking-wider font-semibold">
              {totalDue > 0
                ? t("due_count_plural", { count: totalDue })
                : t("all_caught_up")}
            </p>
          </div>
          <CreateStudyDeckButton
            gate={gate}
            className="shrink-0"
          />
        </div>

        {/* Decks grid */}
        {decksWithDue.length === 0 ? (
          <EmptyState gate={gate} t={t} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {decksWithDue.map((deck) => (
              <StudyDeckCard key={deck.id} deck={deck} />
            ))}
          </div>
        )}

        {/* Upgrade banner for free users at limit */}
        {!gate.allowed && gate.plan === "free" && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("unlock_unlimited")}</CardTitle>
              <CardDescription>
                {t("limit_warning", { current: gate.currentCount, limit: Number(gate.limit) })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" asChild>
                <Link href="/settings">
                  {t("upgrade_pro")} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

function EmptyState({
  gate,
  t,
}: {
  gate: Awaited<ReturnType<typeof canCreateStudyDeck>>;
  t: (key: string) => string;
}) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-5">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold font-display uppercase tracking-wider mb-2">{t("no_decks_title")}</h2>
        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
          {t("no_decks_desc")}
        </p>
        <CreateStudyDeckButton gate={gate} />
      </CardContent>
    </Card>
  );
}
