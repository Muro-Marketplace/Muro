// Single entry point for every email Wallplace sends.
//
// Responsibilities, in order:
//   1. Idempotency:  skip if the same idempotency_key has already sent successfully.
//   2. Suppressions: skip if the address is hard-bounced or has complained
//                    (security stream bypasses this).
//   3. Preferences:  skip if the user has opted out of this category
//                    (critical categories bypass).
//   4. Vacation:     honour user's "pause non-critical" mode.
//   5. Throttle:     honour per-category sending caps.
//   6. Render:       React Email -> HTML + plaintext.
//   7. Send:         via Resend.
//   8. Log:          write the attempt + outcome to email_events.
//
// Always returns a result object so callers can react (e.g. show a toast).
// Never throws, email is best-effort, API routes should not 500 because mail bounced.

import { Resend } from "resend";
import { render } from "@react-email/components";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isProductionRuntime } from "@/lib/email/env";
import { STREAMS } from "./streams";
import { CATEGORY_RULES, preferenceKeyFor, type EmailCategory } from "./categories";
import type { ReactElement } from "react";

let _resend: Resend | null = null;
function resend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface SendEmailInput {
  /** Stable key to dedupe retries. Use a semantic id, e.g. `verify:${userId}:${tokenHash}`. */
  idempotencyKey: string;
  /** Human name used in email_events.template. e.g. "verify_email". */
  template: string;
  category: EmailCategory;
  to: string;
  subject: string;
  /** React Email element. Will be rendered to HTML + plaintext. */
  react: ReactElement;
  /** Optional explicit plaintext override. */
  text?: string;
  /** Associated user, for preference + throttle checks. */
  userId?: string;
  /** Arbitrary debugging data. Kept small. */
  metadata?: Record<string, unknown>;
}

export type SendEmailResult =
  | { ok: true; skipped: false; messageId: string }
  | { ok: true; skipped: true; reason: SkipReason }
  | { ok: false; error: string };

export type SkipReason =
  | "duplicate"
  | "suppressed"
  | "opted_out"
  | "vacation_mode"
  | "throttled"
  | "no_api_key"
  | "missing_config"
  // 09 §E.2: the send was fully exercised but deliberately not handed to the
  // provider, because EMAIL_DRY_RUN is set.
  | "dry_run";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const rules = CATEGORY_RULES[input.category];
  const stream = STREAMS[rules.stream];
  const db = getSupabaseAdmin();
  const to = input.to.trim().toLowerCase();

  // 1. Idempotency, short-circuit if we've already sent or are mid-flight.
  // Treating 'queued' as duplicate prevents the classic race where two
  // concurrent callers both pass an "is it sent yet?" check and both go on
  // to send. The atomic claim below catches anything that slips past here.
  {
    const { data: existing } = await db
      .from("email_events")
      .select("id, status, provider_message_id")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing && (existing.status === "sent" || existing.status === "queued")) {
      return { ok: true, skipped: true, reason: "duplicate" };
    }
  }

  // 2. Suppressions, unless we're sending security (password reset must always go).
  if (!rules.criticalAlwaysSend) {
    const { data: supp } = await db
      .from("email_suppressions")
      .select("scope")
      .eq("email", to)
      .maybeSingle();
    if (supp) {
      const blocks =
        supp.scope === "all" ||
        (supp.scope === "marketing" && rules.stream === "news") ||
        (supp.scope === "notify" && rules.stream !== "tx") ||
        (supp.scope === "security_only" && rules.stream !== "tx");
      if (blocks) {
        await logEvent(db, input, to, rules.stream, "skipped_suppressed");
        return { ok: true, skipped: true, reason: "suppressed" };
      }
    }
  }

  // 3. User preferences, opt-out + vacation mode + category toggle.
  if (!rules.criticalAlwaysSend && input.userId) {
    const { data: prefs } = await db
      .from("email_preferences")
      .select("*")
      .eq("user_id", input.userId)
      .maybeSingle();
    if (prefs) {
      if (prefs.vacation_until && new Date(prefs.vacation_until) > new Date()) {
        await logEvent(db, input, to, rules.stream, "skipped_vacation");
        return { ok: true, skipped: true, reason: "vacation_mode" };
      }
      const key = preferenceKeyFor(input.category);
      if (key && prefs[key] === false) {
        await logEvent(db, input, to, rules.stream, "skipped_opted_out");
        return { ok: true, skipped: true, reason: "opted_out" };
      }
    }
  }

  // 4. Throttle, per-user, per-category cap.
  if (rules.throttleCount > 0 && input.userId) {
    const since = new Date(Date.now() - rules.throttleHours * 3_600_000).toISOString();
    const { count } = await db
      .from("email_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("template", input.template)
      .in("status", ["sent", "queued"])
      .gte("created_at", since);
    if ((count ?? 0) >= rules.throttleCount) {
      await logEvent(db, input, to, rules.stream, "skipped_throttled");
      return { ok: true, skipped: true, reason: "throttled" };
    }
  }

  // 5. Render.
  let html: string;
  let text: string;
  try {
    html = await render(input.react);
    text = input.text ?? (await render(input.react, { plainText: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(db, input, to, rules.stream, "render_failed", msg);
    return { ok: false, error: `Render failed: ${msg}` };
  }

  // 6. Send.
  const client = resend();
  if (!client) {
    await logEvent(db, input, to, rules.stream, "skipped_no_api_key");
    // 09 §A.6 layer 2 (E1). An unset key used to return ok:true, so the one
    // environment where dropping mail is fatal was also the one that reported
    // success. In production this is now a hard failure that surfaces in error
    // monitoring and to any caller that inspects the result; dev and preview
    // keep the soft skip so `npm run dev` does not error on every signup.
    // The result union is unchanged: no_api_key was always a distinct outcome,
    // it was simply classified as ok:true.
    if (isProductionRuntime()) {
      console.error(
        `[email] RESEND_API_KEY unset in production, dropped ${input.template} to ${to}`,
      );
      return { ok: false, error: "email_not_configured" };
    }
    return { ok: true, skipped: true, reason: "no_api_key" };
  }

  // Atomically claim the idempotency key. With ignoreDuplicates the insert
  // becomes ON CONFLICT DO NOTHING, so two concurrent callers can't both
  // win; the second gets an empty result and we abort with "duplicate".
  // Previously this was a plain upsert, which let both callers pass and
  // both call the provider, hence customers seeing multiple welcome
  // emails after a single signup.
  const { data: claimed } = await db
    .from("email_events")
    .upsert(
      {
        idempotency_key: input.idempotencyKey,
        user_id: input.userId ?? null,
        to_email: to,
        template: input.template,
        stream: rules.stream,
        subject: input.subject,
        status: "queued",
        metadata: input.metadata ?? {},
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return { ok: true, skipped: true, reason: "duplicate" };
  }
  const queuedRow = claimed;

  // 09 §E.2 level 2. EMAIL_DRY_RUN exercises everything up to and including the
  // provider call: recipient resolution, category/consent rules, render, and the
  // idempotency claim. It sits AFTER the claim on purpose, so a dry run proves the
  // dedup key behaves as it will in production rather than skipping the one step
  // most likely to be wrong. Nothing reaches Resend and no real inbox is touched.
  if (process.env.EMAIL_DRY_RUN === "1" || process.env.EMAIL_DRY_RUN === "true") {
    await db
      .from("email_events")
      .update({ status: "dry_run", sent_at: new Date().toISOString() })
      .eq("id", queuedRow?.id);
    return { ok: true, skipped: true, reason: "dry_run" };
  }

  try {
    const res = await client.emails.send({
      from: stream.from,
      to,
      replyTo: stream.replyTo,
      subject: input.subject,
      html,
      text,
      headers: {
        // RFC 8058 one-click unsub, required by Gmail/Yahoo bulk-sender rules.
        // For tx emails we still include the mailto so mailbox providers have a signal.
        "List-Unsubscribe": `<mailto:unsubscribe@wallplace.co.uk?subject=unsubscribe-${input.category}>, <${process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk"}/account/email/unsubscribe?c=${input.category}&u=${input.userId ?? ""}>`,
        ...(rules.criticalAlwaysSend ? {} : { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }),
      },
      tags: [
        { name: "template", value: input.template },
        { name: "category", value: input.category },
        { name: "stream", value: rules.stream },
      ],
    });

    if (res.error) {
      await db
        .from("email_events")
        .update({ status: "failed", error: res.error.message })
        .eq("id", queuedRow?.id);
      return { ok: false, error: res.error.message };
    }

    await db
      .from("email_events")
      .update({
        status: "sent",
        provider_message_id: res.data?.id ?? null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", queuedRow?.id);

    return { ok: true, skipped: false, messageId: res.data?.id ?? "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("email_events")
      .update({ status: "failed", error: msg })
      .eq("id", queuedRow?.id);
    return { ok: false, error: msg };
  }
}

async function logEvent(
  db: ReturnType<typeof getSupabaseAdmin>,
  input: SendEmailInput,
  to: string,
  stream: string,
  status: string,
  error?: string
) {
  await db.from("email_events").upsert(
    {
      idempotency_key: input.idempotencyKey,
      user_id: input.userId ?? null,
      to_email: to,
      template: input.template,
      stream,
      subject: input.subject,
      status,
      error: error ?? null,
      metadata: input.metadata ?? {},
    },
    { onConflict: "idempotency_key" }
  );
}
