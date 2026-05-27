// Phase 2.8 A1. Helper for inserting admin_audit_log rows. Used by:
//   - GET /api/messages when an admin reads a conversation scoped to
//     a dispute_id (A1)
//   - PATCH /api/admin/disputes/[id] (A2 actions)
//   - PATCH /api/admin/blogs/[id] (A4 approve/reject; optional but
//     useful for the audit trail)
//
// Never throws — admin actions shouldn't fail just because the audit
// write failed. We log to stderr and move on.

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function recordAdminAction(input: {
  adminUserId: string;
  action: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    await db.from("admin_audit_log").insert({
      admin_user_id: input.adminUserId,
      action: input.action,
      context: input.context ?? null,
    });
  } catch (err) {
    console.error("[admin-audit] insert failed:", err);
  }
}
