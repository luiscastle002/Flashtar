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
      .select("id")
      .eq("user_id", user.id)
      .eq("is_archived", false);

    if (error) {
      console.error("Error fetching study decks for due count:", error);
      return NextResponse.json({ totalDue: 0 });
    }

    if (!decks || decks.length === 0) {
      return NextResponse.json({ totalDue: 0 });
    }

    // Query due counts for all decks in parallel
    const dueCounts = await Promise.all(
      decks.map((deck) => getDeckDueCounts(deck.id))
    );

    // Sum total due counts
    const totalDue = dueCounts.reduce((sum, d) => sum + (d?.total_due ?? 0), 0);

    return NextResponse.json({ totalDue });
  } catch (err) {
    console.error("Error in study due count API route:", err);
    return NextResponse.json({ totalDue: 0 }, { status: 500 });
  }
}
