import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getDashboardStats, getRecentDecks } from "@/lib/queries/user";
import { formatDate, pluralize } from "@/lib/utils";
import Link from "next/link";
import { Layers, Sparkles, CreditCard, ArrowRight } from "lucide-react";

export default async function DashboardPage() {
  const [stats, recentDecks] = await Promise.all([getDashboardStats(), getRecentDecks()]);

  const usagePercent =
    stats && stats.generationLimit !== Infinity
      ? Math.min(100, (stats.monthlyGenerations / stats.generationLimit) * 100)
      : 0;

  return (
    <DashboardShell currentPath="/dashboard">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here&apos;s your study overview.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Layers className="h-4 w-4" /> Total Decks
              </CardDescription>
              <CardTitle className="text-3xl">{stats?.totalDecks ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Total Flashcards
              </CardDescription>
              <CardTitle className="text-3xl">{stats?.totalFlashcards ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>AI Usage This Month</CardDescription>
              <CardTitle className="text-3xl">
                {stats?.monthlyGenerations ?? 0}
                {stats?.generationLimit !== Infinity && (
                  <span className="text-lg text-muted-foreground font-normal">
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
              <CardDescription className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Plan
              </CardDescription>
              <CardTitle className="text-3xl capitalize">{stats?.plan ?? "free"}</CardTitle>
            </CardHeader>
            {stats?.plan === "free" && (
              <CardContent>
                <Button size="sm" asChild>
                  <Link href="/settings">Upgrade to Pro</Link>
                </Button>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button asChild size="lg">
            <Link href="/generate">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate New Deck
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/decks">View All Decks</Link>
          </Button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Decks</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/decks">
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          {recentDecks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No decks yet. Generate your first deck with AI!</p>
                <Button asChild>
                  <Link href="/generate">Generate Deck</Link>
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
                        {deck.flashcard_count}{" "}
                        {pluralize(deck.flashcard_count ?? 0, "card")} · Updated{" "}
                        {formatDate(deck.updated_at)}
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
