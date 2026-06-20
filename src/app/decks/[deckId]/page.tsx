import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getProfile, getSubscription } from "@/lib/queries/user";
import { DeckEditor } from "@/components/decks/deck-editor";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { Plan, CardAudio } from "@/types";

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

  const cardsWithAudios = (cards ?? []).map(card => ({
    ...card,
    audios: [] as CardAudio[]
  }));

  if (cards && cards.length > 0) {
    const flashcardIds = cards.map(c => c.id);
    const { data: cardAudios } = await supabase
      .from("card_audios")
      .select(`
        flashcard_id,
        side,
        original_filename,
        normalized_filename,
        audio_files (
          file_id,
          provider,
          voice_id,
          language,
          duration_seconds
        )
      `)
      .in("flashcard_id", flashcardIds);

    if (cardAudios) {
      const casted = cardAudios as unknown as Array<{ flashcard_id: string } & CardAudio>;
      console.log("[Audio] DeckPage: found", casted.length, "card_audio rows for", flashcardIds.length, "flashcard IDs");
      const audiosMap: Record<string, CardAudio[]> = {};
      for (const audio of casted) {
        if (!audiosMap[audio.flashcard_id]) {
          audiosMap[audio.flashcard_id] = [];
        }
        audiosMap[audio.flashcard_id].push(audio);
      }
      for (const card of cardsWithAudios) {
        card.audios = audiosMap[card.id] || [];
      }
      console.log("[Audio] DeckPage: cards with audio:", cardsWithAudios.filter(c => c.audios.length > 0).length, "/", cardsWithAudios.length);
    }
  }

  return (
    <DashboardShell currentPath="/decks" profile={profile}>
      <DeckEditor
        deck={deck}
        initialCards={cardsWithAudios}
        plan={(subscription?.plan ?? "free") as Plan}
      />
    </DashboardShell>
  );
}
