import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Play, Settings } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getStudyDeckWithSettings, getDeckDueCounts } from "@/actions/study-decks";
import { getStudyCards } from "@/actions/imports";
import { ImportToStudyDeckButton } from "@/components/study/import-to-study-deck-button";
import { ImportCsvButton } from "@/components/study/import-csv-button";
import { StudyCardListItem } from "@/components/study/study-card-list-item";
import type { DeckStudySettings } from "@/types";
import { getDeckIconUrl } from "@/lib/utils/image";

interface StudyDeckPageProps {
  params: Promise<{ deckId: string }>;
}

export default async function StudyDeckPage({ params }: StudyDeckPageProps) {
  const { deckId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, deckData, dueCounts] = await Promise.all([
    getProfile(),
    getStudyDeckWithSettings(deckId),
    getDeckDueCounts(deckId),
  ]);

  if (!deckData) notFound();

  const { cards, count: totalCards } = await getStudyCards(deckId, { limit: 50 });

  const deck = deckData as typeof deckData & {
    name: string;
    description: string | null;
    emoji: string | null;
    icon_type: "emoji" | "image";
    custom_icon_path: string | null;
    deck_study_settings: DeckStudySettings | null;
  };

  const totalDue = dueCounts?.total_due ?? 0;
  const newCount = dueCounts?.new_count ?? 0;
  const learnCount = dueCounts?.learn_count ?? 0;
  const reviewCount = dueCounts?.review_count ?? 0;

  const customIconUrl = getDeckIconUrl(deck.custom_icon_path);

  return (
    <DashboardShell currentPath="/study" profile={profile}>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {deck.icon_type === "image" && customIconUrl ? (
                <span className="relative inline-block w-8 h-8 rounded-full overflow-hidden border bg-muted shrink-0">
                  <Image src={customIconUrl} alt={deck.name} fill className="object-cover" />
                </span>
              ) : (
                <span className="text-2xl">{deck.emoji ?? "📚"}</span>
              )}
              <h1 className="text-2xl font-bold">{deck.name}</h1>
            </div>
            {deck.description && (
              <p className="text-muted-foreground">{deck.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <Badge variant="outline">{totalCards} total cards</Badge>
              {newCount > 0 && <Badge variant="secondary">{newCount} new</Badge>}
              {learnCount > 0 && <Badge className="bg-orange-500/10 text-orange-600 border-orange-200">{learnCount} learning</Badge>}
              {reviewCount > 0 && <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">{reviewCount} review</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/study/${deckId}/settings`}>
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="sm"
              disabled={totalDue === 0}
              asChild={totalDue > 0}
            >
              {totalDue > 0 ? (
                <Link href={`/study/${deckId}/session`}>
                  <Play className="h-4 w-4 mr-1.5" />
                  Study Now ({totalDue})
                </Link>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1.5" />
                  Nothing due
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Add cards CTA */}
        <div className="flex gap-2 flex-wrap">
          <ImportToStudyDeckButton deckId={deckId} />
          <ImportCsvButton deckId={deckId} />
        </div>

        {/* Cards list */}
        {cards.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">No cards yet</p>
              <p className="text-sm text-muted-foreground">
                Import cards from your AI-generated decks to start studying.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Cards</h2>
              {totalCards > 50 && (
                <span className="text-xs text-muted-foreground">Showing 50 of {totalCards}</span>
              )}
            </div>
            <div className="divide-y rounded-lg border bg-card overflow-hidden">
              {cards.map((card) => (
                <StudyCardListItem key={card.id} card={card} />
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
