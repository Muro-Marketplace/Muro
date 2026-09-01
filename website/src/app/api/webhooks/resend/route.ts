// POST /api/webhooks/resend
//
// Receiver for Resend's delivery webhooks (WS5.2, txn audit 4 finding R4.4).
// Before this route existed, NOTHING wrote email_suppressions: the suppression
// gate in sendEmail() was dead code, hard-bounced addresses were retried on
// every future send forever, complaints never suppressed anyone, and
// email_events said "sent" (API-accepted) with no idea whether anything was
// delivered. Sender reputation decayed with no signal.
//
// Configure in the Resend dashboard (Webhooks -> Add endpoint) pointing at
// this route with the events below enabled, and paste the endpoint's signing
// secret into RESEND_WEBHOOK_SECRET. This is a webhook, not a cron: it is
// deliberately NOT registered in vercel.json.
//
// Handles:
//   - email.delivered   -> record delivery in the event row's metadata
//   - email.bounced     -> stamp bounced_at; on a hard (permanent) bounce,
//                          write an email_suppressions row (reason
//                          'hard_bounce', scope 'all')
//   - email.complained  -> stamp complained_at; write a suppression
//                          (reason 'complaint', scope 'all')
//   - email.opened      -> stamp opened_at
//   - email.clicked     -> stamp clicked_at
//
// Everything else (email.sent, email.delivery_delayed, unknown types) is
// acknowledged and ignored. Rows are matched by provider_message_id, which
// sendEmail() records from Resend's API response; an event for a message we
// never logged is acknowledged so Resend does not retry it forever. All
// writes are idempotent, so a redelivered event lands on the same state.
//
// Signature verification lives in src/lib/email/resend-webhook.ts (route
// modules may only export handlers, and the tests exercise it directly).
// The timestamp is bounded to +/- 5 minutes against replay.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySvixSignature } from "@/lib/email/resend-webhook";

export const runtime = "nodejs";

interface ResendWebhookEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
  };
}

/** Recipients of the event, normalised the way sendEmail() stores to_email. */
function recipientsOf(event: ResendWebhookEvent): string[] {
  const to = event.data?.to;
  const list = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  return list
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** The event's own timestamp when parseable, so redelivery stamps identically. */
function eventTimeIso(event: ResendWebhookEvent): string {
  const t = event.created_at ? Date.parse(event.created_at) : NaN;
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || secret.trim() === "") {
    // Refuse rather than silently accept unsigned traffic. /api/health/email
    // watches this env var, so the missing config pages instead of hiding.
    console.error("[webhooks/resend] RESEND_WEBHOOK_SECRET is not set; refusing event");
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const verified = verifySvixSignature(
    rawBody,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
  );
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    // Unlike the Supabase webhook (which would retry forever), svix retries
    // with backoff and gives up, so a 500 here buys a redelivery of exactly
    // the events we failed to record. Handlers are idempotent, so the
    // redelivery is safe.
    console.error("[webhooks/resend] handler error:", err);
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handleEvent(event: ResendWebhookEvent): Promise<void> {
  const type = event.type ?? "";
  const messageId = event.data?.email_id;
  const db = getSupabaseAdmin();
  const at = eventTimeIso(event);

  switch (type) {
    case "email.delivered": {
      // email_events has no delivered_at column; the confirmation lands in
      // metadata so "sent" (accepted by Resend's API) and "delivered"
      // (confirmed by the receiving server) stop being the same claim.
      if (!messageId) return;
      const { data: row, error: readError } = await db
        .from("email_events")
        .select("id, metadata")
        .eq("provider_message_id", messageId)
        .limit(1)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!row) return;
      const metadata = { ...((row.metadata as Record<string, unknown>) ?? {}), delivered_at: at };
      const { error } = await db.from("email_events").update({ metadata }).eq("id", row.id);
      if (error) throw new Error(error.message);
      return;
    }

    case "email.bounced": {
      if (messageId) {
        const { error } = await db
          .from("email_events")
          .update({ bounced_at: at })
          .eq("provider_message_id", messageId);
        if (error) throw new Error(error.message);
      }
      // Resend labels bounces Permanent / Transient / Undetermined. Only a
      // transient failure (full mailbox, greylisting) deserves another try;
      // anything else suppresses so we stop burning sender reputation on a
      // dead address.
      const bounceType = (event.data?.bounce?.type ?? "").toLowerCase();
      if (bounceType !== "transient") {
        await suppress(db, recipientsOf(event), "hard_bounce", event);
      }
      return;
    }

    case "email.complained": {
      if (messageId) {
        const { error } = await db
          .from("email_events")
          .update({ complained_at: at })
          .eq("provider_message_id", messageId);
        if (error) throw new Error(error.message);
      }
      await suppress(db, recipientsOf(event), "complaint", event);
      return;
    }

    case "email.opened": {
      if (!messageId) return;
      const { error } = await db
        .from("email_events")
        .update({ opened_at: at })
        .eq("provider_message_id", messageId);
      if (error) throw new Error(error.message);
      return;
    }

    case "email.clicked": {
      if (!messageId) return;
      const { error } = await db
        .from("email_events")
        .update({ clicked_at: at })
        .eq("provider_message_id", messageId);
      if (error) throw new Error(error.message);
      return;
    }

    default:
      // email.sent, email.delivery_delayed, future types: acknowledged, ignored.
      return;
  }
}

async function suppress(
  db: ReturnType<typeof getSupabaseAdmin>,
  emails: string[],
  reason: "hard_bounce" | "complaint",
  event: ResendWebhookEvent,
): Promise<void> {
  if (emails.length === 0) return;
  const rows = emails.map((email) => ({
    email,
    reason,
    // Scope 'all' on purpose: a hard bounce or a complaint is about the
    // ADDRESS, not about one category of mail. sendEmail() still lets
    // critical categories through (its criticalAlwaysSend bypass), which is
    // the designed behaviour for password resets to a flaky address.
    scope: "all",
    notes: `resend webhook ${event.type ?? "unknown"}${
      event.data?.bounce?.subType ? ` (${event.data.bounce.subType})` : ""
    } at ${eventTimeIso(event)}`,
  }));
  // Plain upsert (not ignoreDuplicates) so an existing narrower suppression,
  // e.g. scope 'marketing' from a manual entry, escalates to 'all' when the
  // address hard-bounces. Redelivery of the same event rewrites the same row.
  const { error } = await db.from("email_suppressions").upsert(rows, { onConflict: "email" });
  if (error) throw new Error(error.message);
}
