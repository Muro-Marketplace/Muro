// Report-conversation endpoint (#20). Logs the report so support can
// triage; full case-management UI is a follow-up.
//
// Stores in `conversation_reports` if the table exists, falls back to
// console.warn so a missing migration doesn't break the user-facing
// modal. The frontend already swallows 4xx/5xx and shows the
// "submitted" confirmation either way, the goal here is durability,
// not blocking the UI.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Reports are not free either, limit to 6/min so a malicious
  // signed-in user can't fill up the support queue.
  const limited = await checkRateLimit(request, 6, 60_000);
  if (limited) return limited;

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { otherParty, conversationId, reason } = (body || {}) as {
    otherParty?: string;
    conversationId?: string;
    reason?: string;
  };
  if (!otherParty || typeof otherParty !== "string" || !reason || typeof reason !== "string") {
    return NextResponse.json({ error: "otherParty and reason are required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  // Best-effort insert. If the table doesn't exist yet we log so the
  // support team can still see the report came through.
  const { error } = await db.from("conversation_reports").insert({
    reporter_user_id: auth.user!.id,
    other_party: otherParty,
    conversation_id: conversationId || null,
    reason: reason.slice(0, 2000),
  });
  if (error) {
    console.warn("[messages/report] insert failed:", error.message, {
      reporter: auth.user!.id,
      otherParty,
      conversationId,
      reason: reason.slice(0, 200),
    });
  }
  return NextResponse.json({ ok: true });
}
