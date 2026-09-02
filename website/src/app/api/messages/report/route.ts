// Report-conversation endpoint (#20). Logs the report so support can triage.
//
// This used to insert "if the table exists" and fall back to a `console.warn`
// "so a missing migration doesn't break the user-facing modal". **The table had
// never existed.** So the fallback WAS the behaviour: every report a person
// made, about harassment or anything else, existed only as a line in a Vercel
// log, and the route answered `{ ok: true }`. Migration 111 creates the table.
//
// The swallow is gone with it. A report that does not persist is not a report,
// and reporting success for a write that failed is what made this invisible for
// as long as it was.
//
// The modal side is already honest: E43-e routed Report/Delete/Block through
// submitFlagAction, which sets the "submitted" confirmation ONLY after mutate()
// resolves (it throws on a non-2xx), and shows an error toast otherwise. So the
// 500 this route now returns reaches the person as a visible failure. An
// earlier note here claimed the modal still swallowed it, which repeated this
// header's own pre-E43-e description without re-checking the component.

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
  const { error } = await db.from("conversation_reports").insert({
    reporter_user_id: auth.user!.id,
    other_party: otherParty,
    conversation_id: conversationId || null,
    reason: reason.slice(0, 2000),
  });
  if (error) {
    console.error("[messages/report] insert FAILED, the report is lost:", error.message, {
      reporter: auth.user!.id,
      otherParty,
      conversationId,
      reason: reason.slice(0, 200),
    });
    return NextResponse.json({ error: "Could not record the report" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
