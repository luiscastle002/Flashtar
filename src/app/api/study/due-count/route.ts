import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";
import { getDeckDueCounts } from "@/actions/study-decks";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ totalDue: 0 }, { status: 401 });
    }

    const supabase = await createClient();
    
    // Get all active study decks for this user
    const { data: decks, error } = await supabase
      .from("study_decks")
      .select("id, shared_deck_id")
      .eq("user_id", user.id)
      .eq("is_archived", false);

    if (error) {
      console.error("Error fetching study decks for due count:", error);
      return NextResponse.json({ selfStudyDue: 0, coursesDue: 0 });
    }

    if (!decks || decks.length === 0) {
      return NextResponse.json({ selfStudyDue: 0, coursesDue: 0 });
    }

    // Query due counts for all decks in parallel
    const dueCounts = await Promise.all(
      decks.map(async (deck) => {
        const dCounts = await getDeckDueCounts(deck.id);
        return {
          isCourse: deck.shared_deck_id !== null,
          total_due: dCounts?.total_due ?? 0
        };
      })
    );

    // Sum total due counts by type
    const selfStudyDue = dueCounts
      .filter((d) => !d.isCourse)
      .reduce((sum, d) => sum + d.total_due, 0);

    const coursesDue = dueCounts
      .filter((d) => d.isCourse)
      .reduce((sum, d) => sum + d.total_due, 0);

    return NextResponse.json({ selfStudyDue, coursesDue });
  } catch (err) {
    console.error("Error in study due count API route:", err);
    return NextResponse.json({ selfStudyDue: 0, coursesDue: 0 }, { status: 500 });
  }
}
