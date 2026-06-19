import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getProfile, getSubscription } from "@/lib/queries/user";
import { DeckEditor } from "@/components/decks/deck-editor";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { Plan } from "@/types";

export default async function DeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [profile, subscription] = await Promise.all([getProfile(), getSubscription(user.id)]);

  const { data: deck } = await supabase
    .from("decks")
    .select("*")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) notFound();

  const { data: cards } = await supabase
    .from("flashcards")
    .select("*")
    .eq("deck_id", deckId)
    .order("position");

  return (
    <DashboardShell currentPath="/decks" profile={profile}>
      <DeckEditor
        deck={deck}
        initialCards={cards ?? []}
        plan={(subscription?.plan ?? "free") as Plan}
      />
    </DashboardShell>
  );
}
