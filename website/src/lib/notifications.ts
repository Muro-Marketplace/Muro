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
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
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
      console.warn("Notification insert skipped:", error.message);
    }
  } catch (err) {
    console.warn("Notification insert threw:", err);
  }
}
