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
import { sendAdminAlert } from "@/lib/email/admin-alert";

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
  const { data: report, error } = await db
    .from("conversation_reports")
    .insert({
      reporter_user_id: auth.user!.id,
      other_party: otherParty,
      conversation_id: conversationId || null,
      reason: reason.slice(0, 2000),
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) {
    console.error("[messages/report] insert FAILED, the report is lost:", error.message, {
      reporter: auth.user!.id,
      otherParty,
      conversationId,
      reason: reason.slice(0, 200),
    });
    return NextResponse.json({ error: "Could not record the report" }, { status: 500 });
  }

  // A report, about harassment or anything else, used to be a row nobody
  // watched: there is no admin surface for conversation_reports, so the only
  // way the team found out was to query the table. The alert is the surface.
  //
  // Keyed on the stored row, so one report means one alert however many times
  // the send is retried, and a genuinely new report (a new row) always alerts.
  // The fallback, for an insert that somehow returns no row, is keyed on the
  // report's own content the way the contact form's alert is: no timestamp, so
  // a retry of the identical request cannot post a second copy.
  // Best-effort throughout: the report is already stored and the response does
  // not depend on the alert.
  const reporter = auth.user!;
  const alertKey =
    report?.id ?? `${reporter.id}:${conversationId || otherParty}:${reason.slice(0, 64)}`;
  try {
    await sendAdminAlert({
      idempotencyKey: `admin_conversation_report:${alertKey}`,
      subject: `Conversation reported: ${otherParty}`,
      summary: `${reporter.email ?? reporter.id} reported a conversation with ${otherParty}.`,
      fields: [
        { label: "Report", value: report?.id ?? "(id not returned)" },
        { label: "Reporter", value: `${reporter.email ?? ""} (${reporter.id})` },
        { label: "Other party", value: otherParty },
        { label: "Conversation", value: conversationId || "(not tied to a thread)" },
        { label: "Reason", value: reason.slice(0, 500) },
      ],
      actionPath: "/admin/moderation",
      actionLabel: "Open moderation",
    });
  } catch (err) {
    console.error("[messages/report] admin alert failed:", err);
  }
  return NextResponse.json({ ok: true });
}
