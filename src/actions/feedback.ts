"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";

const submitFeedbackSchema = z.object({
  content: z.string().min(5, "companion.error_empty").max(1000, "companion.error_too_long"),
  path: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export async function submitFeedback(payload: {
  content: string;
  path: string;
  metadata?: Record<string, unknown>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "companion.error_not_authenticated" };
  }

  const parsed = submitFeedbackSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { error: firstIssue.message };
  }

  const { content, path, metadata = {} } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("user_feedback").insert({
    user_id: user.id,
    content,
    path,
    metadata,
  });

  if (error) {
    console.error("Error inserting user feedback:", error);
    return { error: "companion.error_failed" };
  }

  return { success: true };
}
