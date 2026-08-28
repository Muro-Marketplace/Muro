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
// KNOWN, and not this route's to fix: the modal shows "submitted" regardless of
// the response, so a 500 here still does not reach the person. Surfaced in
// PROGRESS rather than changed from the API side.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Reports are not free either, limit to 6/min so a malicious
  // signed-in user can't fill up the support queue.
  const limited = await checkRateLimit(request, 6, 60_000);
  if (limited) return limited;

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
  // unwinding optimistic state. The helper had zero call sites while two doc
  // comments claimed it was enforced.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

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
