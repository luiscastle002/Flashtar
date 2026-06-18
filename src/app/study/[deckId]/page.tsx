import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Play, Settings } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getStudyDeckWithSettings, getDeckDueCounts } from "@/actions/study-decks";
import { getStudyCards } from "@/actions/imports";
import { ImportToStudyDeckButton } from "@/components/study/import-to-study-deck-button";
import { ImportCsvButton } from "@/components/study/import-csv-button";
import { StudyCardListManager } from "@/components/study/study-card-list-manager";
import type { DeckStudySettings } from "@/types";
import { getDeckIconUrl } from "@/lib/utils/image";
import { getTranslations } from "next-intl/server";

interface StudyDeckPageProps {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{
    search?: string;
    page?: string;
    sort?: "name_asc" | "name_desc" | "created_asc" | "created_desc";
    suspended?: "all" | "suspended_only";
    cursor?: string;
    direction?: "next" | "prev";
  }>;
}

export async function generateMetadata({ params }: StudyDeckPageProps) {
  const { deckId } = await params;
  const deckData = await getStudyDeckWithSettings(deckId);
  const t = await getTranslations("study");
  return {
    title: `${deckData?.name ?? t("title")} — Flashtar`,
  };
}

export default async function StudyDeckPage({ params, searchParams }: StudyDeckPageProps) {
  const { deckId } = await params;
  const sParams = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, deckData, dueCounts, t, tCard] = await Promise.all([
    getProfile(),
    getStudyDeckWithSettings(deckId),
    getDeckDueCounts(deckId),
    getTranslations("study"),
    getTranslations("study.card"),
  ]);

  if (!deckData) notFound();

  // Parse parameters from searchParams Promise
  const page = sParams.page ? Number(sParams.page) : 1;
  const search = sParams.search;
  const sort = sParams.sort;
  const suspended = sParams.suspended;
  const cursor = sParams.cursor;
  const direction = sParams.direction;

  const { cards, count: totalCards, useKeyset, nextCursor, prevCursor } = await getStudyCards(deckId, {
    search,
    page,
    sort,
    suspended,
    cursor,
    direction,
    limit: 100, // Display only 100 cards per page
  });

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
              <Badge variant="outline">{t("deck_view.total_cards_plural", { count: totalCards })}</Badge>
              {newCount > 0 && <Badge variant="secondary">{tCard("new_count", { count: newCount })}</Badge>}
              {learnCount > 0 && <Badge className="bg-orange-500/10 text-orange-600 border-orange-200">{t("deck_view.learning_count", { count: learnCount })}</Badge>}
              {reviewCount > 0 && <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">{t("deck_view.review_count", { count: reviewCount })}</Badge>}
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
                  {t("deck_view.study_now", { count: totalDue })}
                </Link>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1.5" />
                  {t("deck_view.nothing_due")}
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
        <div className="space-y-2">
          <h2 className="font-semibold">{t("deck_view.cards_title")}</h2>
          <StudyCardListManager
            initialCards={cards}
            totalCount={totalCards}
            useKeyset={useKeyset}
            nextCursor={nextCursor}
            prevCursor={prevCursor}
            deckId={deckId}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
