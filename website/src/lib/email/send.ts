// Single entry point for every email Wallplace sends.
//
// Responsibilities, in order:
//   1. Idempotency:  skip if the same idempotency_key has already sent
//                    successfully or is mid-flight (a fresh `queued` row).
//                    Dead attempts (failed, render_failed, dry_run, skipped_*
//                    and stale queued rows) do NOT burn the key: a later
//                    attempt with the same key re-claims the row and retries
//                    (WS5.1, R4.3/R4.9).
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
import { orFilter } from "@/lib/db/safe-filter";
import { isProductionRuntime } from "@/lib/email/env";
import { STREAMS } from "./streams";
import {
  CATEGORY_RULES,
  preferenceKeyFor,
  resolveEmailCategory,
  type EmailCategory,
} from "./categories";
import type { ReactElement } from "react";

let _resend: Resend | null = null;
function resend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// WS5.1 (R4.9): a `queued` row normally means another caller is mid-flight, so
// it dedupes. But a crash between the claim and the provider call, or a failed
// post-send status update, leaves `queued` forever and nothing sweeps it. After
// this long the row is treated as dead and a retry may re-claim it.
const STALE_QUEUED_MS = 3_600_000; // 1 hour

/** True when an existing email_events row should still block its key. */
function blocksKey(row: { status: string; created_at?: string | null }): boolean {
  if (row.status === "sent") return true;
  if (row.status !== "queued") return false;
  const created = row.created_at ? Date.parse(row.created_at) : NaN;
  // An unparseable created_at counts as fresh: dedupe rather than double-send.
  if (Number.isNaN(created)) return true;
  return Date.now() - created < STALE_QUEUED_MS;
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
  // R4.12: money-consequential templates are treated as critical no matter
  // which category the send site declared. See TEMPLATE_CATEGORY_OVERRIDES.
  const category = resolveEmailCategory(input.template, input.category);
  const rules = CATEGORY_RULES[category];
  const stream = STREAMS[rules.stream];
  const db = getSupabaseAdmin();
  const to = input.to.trim().toLowerCase();
  // R4.16: the resolved category is stamped into every email_events row so the
  // throttle can count per CATEGORY. The table has no category column, and a
  // migration for one is not worth it when metadata is already jsonb.
  const eventMetadata: Record<string, unknown> = { ...(input.metadata ?? {}), category };

  // 1. Idempotency, short-circuit if we've already sent or are mid-flight.
  // Treating a fresh 'queued' row as duplicate prevents the classic race where
  // two concurrent callers both pass an "is it sent yet?" check and both go on
  // to send. The atomic claim below catches anything that slips past here.
  // Dead attempts fall through on purpose: their key must not block a retry.
  {
    const { data: existing, error } = await db
      .from("email_events")
      .select("id, status, created_at")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error) {
      // R4.6: this error used to be discarded, and when the claim below also
      // failed the send was misreported as a duplicate success. Fail hard so a
      // DB outage surfaces to the caller and to error monitoring.
      console.error(
        `[email] idempotency pre-check failed for ${input.idempotencyKey}: ${error.message}`,
      );
      return { ok: false, error: `Idempotency check failed: ${error.message}` };
    }
    if (existing && blocksKey(existing)) {
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
        await logEvent(db, input, to, rules.stream, "skipped_suppressed", eventMetadata);
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
        await logEvent(db, input, to, rules.stream, "skipped_vacation", eventMetadata);
        return { ok: true, skipped: true, reason: "vacation_mode" };
      }
      const key = preferenceKeyFor(category);
      if (key && prefs[key] === false) {
        await logEvent(db, input, to, rules.stream, "skipped_opted_out", eventMetadata);
        return { ok: true, skipped: true, reason: "opted_out" };
      }
    }
  }

  // 4. Throttle, per-user, per-CATEGORY cap. CATEGORY_RULES has always
  // documented the cap per category, but the query filtered
  // `.eq("template", ...)`, so every cap was per template and looser than
  // designed (R4.16). The category lives in metadata (stamped above on every
  // row this module writes); rows from before the stamp existed fall outside
  // the count, which only makes the transition window more permissive.
  if (rules.throttleCount > 0 && input.userId) {
    const since = new Date(Date.now() - rules.throttleHours * 3_600_000).toISOString();
    const { count } = await db
      .from("email_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .contains("metadata", { category })
      .in("status", ["sent", "queued"])
      .gte("created_at", since);
    if ((count ?? 0) >= rules.throttleCount) {
      await logEvent(db, input, to, rules.stream, "skipped_throttled", eventMetadata);
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
    await logEvent(db, input, to, rules.stream, "render_failed", eventMetadata, msg);
    return { ok: false, error: `Render failed: ${msg}` };
  }

  // 5b. Thread the recipient into the footer unsubscribe link (QA flag C24).
  // EmailShell builds `/account/email/unsubscribe?c=<category>` but only the
  // send pipeline knows WHO the mail is going to, and the unsubscribe page
  // needs both. Injecting here fixes every template at once instead of
  // threading a userId prop through sixty shells. Templates render the link
  // in exactly two forms (with `?c=` or bare), both handled; the adjacent
  // `/account/email` preference-centre link is left alone.
  if (input.userId) {
    const inject = (body: string): string =>
      body
        .replaceAll("/account/email/unsubscribe?c=", `/account/email/unsubscribe?u=${input.userId}&c=`)
        .replace(/\/account\/email\/unsubscribe(?![?\w])/g, `/account/email/unsubscribe?u=${input.userId}`);
    html = inject(html);
    text = inject(text);
  }

  // 6. Send.
  const client = resend();
  if (!client) {
    await logEvent(db, input, to, rules.stream, "skipped_no_api_key", eventMetadata);
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
  // win; the second gets an empty result. Previously ANY existing row,
  // including failed / render_failed / dry_run / skipped_*, kept the claim
  // forever and the retry was misreported as "duplicate" (R4.3): a transient
  // provider outage permanently burnt the key for that email. Now only a
  // successful send or a live in-flight attempt blocks; anything else is
  // re-claimed just below.
  const claimRow = {
    idempotency_key: input.idempotencyKey,
    user_id: input.userId ?? null,
    to_email: to,
    template: input.template,
    stream: rules.stream,
    subject: input.subject,
    status: "queued",
    metadata: eventMetadata,
  };
  const { data: inserted, error: claimError } = await db
    .from("email_events")
    .upsert(claimRow, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (claimError) {
    // R4.6: a DB failure on the claim (outage, RLS, constraint) used to be
    // discarded and reported as `skipped: "duplicate"`, ok:true, with nothing
    // logged: a Supabase blip silently dropped every in-flight email while
    // reporting success. Hard failure, logged, so callers and monitoring see it.
    console.error(
      `[email] idempotency claim failed for ${input.idempotencyKey}: ${claimError.message}`,
    );
    return { ok: false, error: `Idempotency claim failed: ${claimError.message}` };
  }

  let queuedRow = inserted;
  if (!queuedRow) {
    // A row with this key already exists. Only `sent` or a fresh `queued` row
    // is a real duplicate; a dead attempt (failed, render_failed, dry_run,
    // skipped_*, stale queued) is re-claimed so the retry can proceed. The
    // conditional UPDATE is the atomic arbiter: Postgres re-checks the WHERE
    // clause against the committed row after taking the row lock, and the
    // winner resets created_at, so a concurrent second retry no longer
    // matches (the row is queued and fresh again) and reports duplicate.
    const staleBefore = new Date(Date.now() - STALE_QUEUED_MS).toISOString();
    const { data: reclaimed, error: reclaimError } = await db
      .from("email_events")
      .update({
        ...claimRow,
        error: null,
        provider_message_id: null,
        sent_at: null,
        created_at: new Date().toISOString(),
      })
      .eq("idempotency_key", input.idempotencyKey)
      .neq("status", "sent")
      .or(orFilter(["status.neq.queued", `created_at.lt.${staleBefore}`]))
      .select("id")
      .maybeSingle();
    if (reclaimError) {
      console.error(
        `[email] idempotency re-claim failed for ${input.idempotencyKey}: ${reclaimError.message}`,
      );
      return { ok: false, error: `Idempotency claim failed: ${reclaimError.message}` };
    }
    if (!reclaimed) {
      return { ok: true, skipped: true, reason: "duplicate" };
    }
    queuedRow = reclaimed;
  }

  // 09 §E.2 level 2. EMAIL_DRY_RUN exercises everything up to and including the
  // provider call: recipient resolution, category/consent rules, render, and the
  // idempotency claim. It sits AFTER the claim on purpose, so a dry run proves the
  // dedup key behaves as it will in production rather than skipping the one step
  // most likely to be wrong. Nothing reaches Resend and no real inbox is touched.
  //
  // WS5.4 (R4.8): in production the flag is IGNORED, loudly, unless
  // EMAIL_DRY_RUN_FORCE is also set. A leaked env var used to skip every email
  // in production with ok:true while /api/health/email stayed green.
  const dryRunRequested =
    process.env.EMAIL_DRY_RUN === "1" || process.env.EMAIL_DRY_RUN === "true";
  const dryRunForced =
    process.env.EMAIL_DRY_RUN_FORCE === "1" || process.env.EMAIL_DRY_RUN_FORCE === "true";
  if (dryRunRequested && isProductionRuntime() && !dryRunForced) {
    console.error(
      `[email] EMAIL_DRY_RUN is set in production; ignoring it and sending ${input.template} for real. Set EMAIL_DRY_RUN_FORCE as well if you truly mean it.`,
    );
  } else if (dryRunRequested) {
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
        // R4.7: the URL arm must be the POST-capable API endpoint. It used to
        // point at the /account/email/unsubscribe PAGE, which serves GET only,
        // so every one-click POST from Gmail/Yahoo answered 405 and failed
        // unsubscribes escalated into spam reports.
        "List-Unsubscribe": `<mailto:unsubscribe@wallplace.co.uk?subject=unsubscribe-${category}>, <${process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk"}/api/account/email/unsubscribe?c=${category}&u=${input.userId ?? ""}>`,
        ...(rules.criticalAlwaysSend ? {} : { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }),
      },
      tags: [
        { name: "template", value: input.template },
        { name: "category", value: category },
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
  metadata: Record<string, unknown>,
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
      metadata,
    },
    { onConflict: "idempotency_key" }
  );
}
