import { redirect, notFound } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getStudyDeckWithSettings, getDeckDueCounts } from "@/actions/study-decks";
import { getStudyCards } from "@/actions/imports";
import { CourseDetailsClient } from "@/components/courses/course-details-client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createClient } from "@/lib/supabase/server";

export default async function CourseDeckPage(props: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { deckId } = await props.params;
  const searchParams = await props.searchParams;
  const page = Number(typeof searchParams?.page === "string" ? searchParams.page : "1") || 1;

  const [profile, deckData] = await Promise.all([
    getProfile(),
    getStudyDeckWithSettings(deckId),
  ]);

  if (!deckData) notFound();

  // If this is a personal deck accessed through the courses route, redirect to standard study page
  if (!deckData.shared_deck_id) {
    redirect(`/study/${deckId}`);
  }

  // Fetch category_id of the shared deck
  const supabase = await createClient();
  const { data: sharedDeck } = await supabase
    .from("shared_decks")
    .select("category_id")
    .eq("id", deckData.shared_deck_id)
    .single();

  const categoryId = sharedDeck?.category_id ?? "";

  // Fetch syllabus cards and due counts
  const [cardData, dueCounts] = await Promise.all([
    getStudyCards(deckId, { limit: 100, page }),
    getDeckDueCounts(deckId),
  ]);

  return (
    <DashboardShell currentPath="/study/courses" profile={profile}>
      <div className="max-w-4xl">
        <CourseDetailsClient
          deck={deckData}
          cards={cardData.cards}
          dueCounts={dueCounts}
          totalCards={deckData.card_count}
          categoryId={categoryId}
          currentPage={page}
        />
      </div>
    </DashboardShell>
  );
}
