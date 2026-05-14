import { getSupabaseAdmin } from "@/lib/supabase-admin";

interface CreateNotificationInput {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
}

/**
 * Fire-and-forget notification insert. Swallows errors so the caller's
 * primary action (e.g. creating a placement) is not blocked by a missing
 * notifications table or transient DB issue.
 *
 * Errors log to console.error so they're picked up by Vercel function
 * log filters. A swallowed insert that the bell never surfaces is one
 * of the few "silent" failure modes left in the order pipeline, so it's
 * worth logging loudly.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (!input.userId) {
    console.error("[notifications] skipped, missing userId", { kind: input.kind, title: input.title });
    return;
  }
  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from("notifications").insert({
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body || "",
      link: input.link || "",
    });
    if (error) {
      console.error("[notifications] insert failed:", {
        message: error.message,
        code: (error as { code?: string }).code,
        userId: input.userId,
        kind: input.kind,
      });
    }
  } catch (err) {
    console.error("[notifications] insert threw:", err);
  }
}
