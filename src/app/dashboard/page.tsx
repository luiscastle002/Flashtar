import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getDashboardStats, getRecentDecks, getProfile } from "@/lib/queries/user";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { Layers, Sparkles, CreditCard, ArrowRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

export default async function DashboardPage() {
  const [stats, recentDecks, profile, t, locale] = await Promise.all([
    getDashboardStats(),
    getRecentDecks(),
    getProfile(),
    getTranslations("dashboard"),
    getLocale(),
  ]);

  const usagePercent =
    stats && stats.generationLimit !== Infinity
      ? Math.min(100, (stats.monthlyGenerations / stats.generationLimit) * 100)
      : 0;

  return (
    <DashboardShell currentPath="/dashboard" profile={profile}>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-display uppercase tracking-wider">{t("title")}</h1>
          <p className="text-muted-foreground">{t("welcome")}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 font-display uppercase tracking-wider text-[10px] font-semibold">
                <Layers className="h-4 w-4 text-primary" /> {t("total_decks")}
              </CardDescription>
              <CardTitle className="text-3xl font-display font-extrabold">{stats?.totalDecks ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 font-display uppercase tracking-wider text-[10px] font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> {t("total_cards")}
              </CardDescription>
              <CardTitle className="text-3xl font-display font-extrabold">{stats?.totalFlashcards ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="font-display uppercase tracking-wider text-[10px] font-semibold">{t("ai_usage")}</CardDescription>
              <CardTitle className="text-3xl font-display font-extrabold">
                {stats?.monthlyGenerations ?? 0}
                {stats?.generationLimit !== Infinity && (
                  <span className="text-lg text-muted-foreground font-display font-normal">
                    /{stats?.generationLimit}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            {stats?.generationLimit !== Infinity && (
              <CardContent>
                <Progress value={usagePercent} className="h-2" />
              </CardContent>
            )}
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 font-display uppercase tracking-wider text-[10px] font-semibold">
                <CreditCard className="h-4 w-4 text-primary" /> {t("plan")}
              </CardDescription>
              <CardTitle className="text-3xl capitalize font-display font-extrabold">{stats?.plan ?? "free"}</CardTitle>
            </CardHeader>
            {stats?.plan === "free" && (
              <CardContent>
                <Button size="sm" asChild>
                  <Link href="/plan">{t("upgrade_pro")}</Link>
                </Button>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button asChild size="lg">
            <Link href="/generate">
              <Sparkles className="mr-2 h-4 w-4" />
              {t("generate_new")}
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/decks">{t("view_all")}</Link>
          </Button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold font-display uppercase tracking-wider">{t("recent_decks")}</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/decks">
                {t("view_all_link")} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          {recentDecks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">{t("no_decks_yet")}</p>
                <Button asChild>
                  <Link href="/generate">{t("generate_deck")}</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentDecks.map((deck) => (
                <Link key={deck.id} href={`/decks/${deck.id}`}>
                  <Card className="hover:border-primary/50 transition-colors h-full">
                    <CardHeader>
                      <CardTitle className="line-clamp-1">{deck.name}</CardTitle>
                      <CardDescription>
                        {t("cards_plural", { count: deck.flashcard_count ?? 0 })} · {t("updated", { date: formatDate(deck.updated_at, locale) })}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
