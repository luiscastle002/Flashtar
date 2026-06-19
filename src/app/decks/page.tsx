import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { DecksPageClient } from "@/components/decks/decks-page-client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { redirect } from "next/navigation";

export default async function DecksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const profile = await getProfile();

  const { data: decks } = await supabase
    .from("decks")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const deckIds = (decks ?? []).map((d) => d.id);
  let countMap: Record<string, number> = {};

  if (deckIds.length) {
    const { data: counts } = await supabase.from("flashcards").select("deck_id").in("deck_id", deckIds);
    countMap = (counts ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.deck_id] = (acc[row.deck_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  const decksWithCounts = (decks ?? []).map((deck) => ({
    ...deck,
    flashcard_count: countMap[deck.id] ?? 0,
  }));

  return (
    <DashboardShell currentPath="/decks" profile={profile}>
      <DecksPageClient decks={decksWithCounts} />
    </DashboardShell>
  );
}
