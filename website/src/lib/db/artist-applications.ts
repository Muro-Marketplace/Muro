import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type AppliedPlan = "core" | "premium" | "pro";

function normalisePlan(value: unknown): AppliedPlan | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v === "core" || v === "premium" || v === "pro" ? v : null;
}

/**
 * The plan an artist picked on the application form (artist_applications.
 * selected_plan). Applications are keyed by email, so this is looked up by
 * the signed-in user's email. Null when nothing is on file or the value is
 * not a known plan. Never throws: a lookup failure just means no preselect.
 */
export async function getAppliedPlanByEmail(
  email: string | null | undefined,
): Promise<AppliedPlan | null> {
  if (!email) return null;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("artist_applications")
      .select("selected_plan")
      .eq("email", email.trim().toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ selected_plan: string | null }>();
    if (error || !data) return null;
    return normalisePlan(data.selected_plan);
  } catch {
    return null;
  }
}
