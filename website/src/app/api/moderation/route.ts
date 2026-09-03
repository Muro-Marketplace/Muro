// Phase 2.6. Public POST endpoint for the feedback bubble. Accepts
// `feature_request` and `feedback` submissions (not `blog` — that's
// authored content owned by the blog editor in Phase 2.7) and inserts
// a row into moderation_queue for the admin pool.
//
// Rate limit: 5 submissions per IP per hour, sliding window.
//
// Auth: not required. Visitor email is optional. We never trust the
// payload's `submitted_by_email` for routing — the moderation panel
// uses it only as a display hint.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { withRateLimit, getIP } from "@/lib/rate-limit";
import {
  parsePayload,
  type ModerationEntityType,
  type ModerationPayload,
} from "@/lib/moderation/types";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { sendEmail } from "@/lib/email/send";
import { unverifiedRecipientAllowed } from "@/lib/email/unverified-recipient";
import { FeedbackReceived, type FeedbackSubmissionType } from "@/emails/templates/account/FeedbackReceived";

export const runtime = "nodejs";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk").replace(/\/$/, "");

/**
 * The sender's acknowledgement. Until this existed the form stored the row and
 * told the sender nothing, so a submission that landed and one that silently
 * failed looked identical from their side.
 *
 * `verifiedUser` is set only when the address is the signed-in caller's own,
 * off the token. Otherwise this is a REFLECTED send to an address an anonymous
 * caller typed, and the route's per-IP limit does not cover the attack that
 * matters (many IPs at one inbox), so the per-recipient cap applies, the same
 * way it does on the contact form. Refusing only the email and not the
 * submission is deliberate. Never throws: the row is already stored.
 */
async function acknowledgeSubmission(input: {
  referenceId: string;
  to: string;
  kind: FeedbackSubmissionType;
  excerpt: string;
  verifiedUser: { id: string; firstName: string } | null;
}): Promise<void> {
  try {
    if (!input.verifiedUser) {
      const allowed = await unverifiedRecipientAllowed({ to: input.to, template: "feedback_received" });
      if (!allowed) return;
    }
    await sendEmail({
      idempotencyKey: `feedback_ack:moderation:${input.referenceId}`,
      template: "feedback_received",
      category: "orders_and_payouts",
      to: input.to,
      // No userId for an unverified address: attaching one would apply
      // somebody's preferences to an address we have not tied to them.
      userId: input.verifiedUser?.id,
      subject: `Thanks for your ${input.kind}`,
      react: FeedbackReceived({
        firstName: input.verifiedUser?.firstName || "there",
        referenceId: input.referenceId,
        submittedType: input.kind,
        messageExcerpt: input.excerpt.slice(0, 300),
        supportUrl: `${SITE}/support`,
      }),
      metadata: { referenceId: input.referenceId, kind: input.kind },
    });
  } catch (err) {
    console.error("[moderation POST] acknowledgement failed:", err);
  }
}

const RATE_LIMIT_NAME = "moderation_submit";
const RATE_LIMIT_PER_HOUR = 5;

const featureRequestSchema = z.object({
  entity_type: z.literal("feature_request"),
  title: z.string().min(2).max(80),
  description: z.string().min(2).max(1000),
  contact_email: z.string().email().optional(),
});

const feedbackSchema = z.object({
  entity_type: z.literal("feedback"),
  message: z.string().min(2).max(1000),
  rating: z.number().int().min(1).max(5).optional(),
  contact_email: z.string().email().optional(),
  source_url: z.string().max(500).optional(),
});

const submitSchema = z.discriminatedUnion("entity_type", [
  featureRequestSchema,
  feedbackSchema,
]);

export async function POST(request: Request) {
  const blocked = await withRateLimit(request, {
    name: RATE_LIMIT_NAME,
    limit: RATE_LIMIT_PER_HOUR,
    windowSeconds: 60 * 60,
    key: getIP(request),
  });
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Submission failed validation, please review the form fields and try again.",
      },
      { status: 400 },
    );
  }

  const entityType = parsed.data.entity_type as ModerationEntityType;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  // Build the payload via the Phase 2.0d parser so the JSONB column
  // always conforms.
  let payload: ModerationPayload | null = null;
  if (parsed.data.entity_type === "feature_request") {
    payload = parsePayload(entityType, {
      title: parsed.data.title,
      description: parsed.data.description,
      contact_email: parsed.data.contact_email,
      user_agent: userAgent,
    });
  } else {
    payload = parsePayload(entityType, {
      message: parsed.data.message,
      rating: parsed.data.rating,
      contact_email: parsed.data.contact_email,
      source_url: parsed.data.source_url,
      user_agent: userAgent,
    });
  }

  if (!payload) {
    return NextResponse.json(
      { error: "Submission failed validation" },
      { status: 400 },
    );
  }

  const auth = await getAuthenticatedUser(request);
  const submittedByUserId = auth.user?.id ?? null;
  const submittedByEmail =
    (parsed.data as { contact_email?: string }).contact_email ||
    auth.user?.email ||
    null;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("moderation_queue")
    .insert({
      entity_type: entityType,
      entity_id: crypto.randomUUID(),
      submitted_by_user_id: submittedByUserId,
      submitted_by_email: submittedByEmail,
      status: "pending",
      payload,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    console.error("[moderation POST]", error);
    return NextResponse.json(
      { error: "Could not record your submission. Please try again later." },
      { status: 500 },
    );
  }

  // The row is written; from here everything is best-effort and the response
  // is the same whatever the mail does. Until now the submission went into the
  // queue and nobody was told: no alert to the team (it sat in /admin/feedback
  // until someone thought to look) and nothing to the sender.
  const submission = parsed.data;
  const alert =
    submission.entity_type === "feedback"
      ? {
          kind: "feedback" as const,
          subject: `New feedback${submission.rating ? ` (${submission.rating}/5)` : ""}`,
          summary: "Someone left feedback through the feedback bubble.",
          text: submission.message,
          page: submission.source_url ?? null,
          actionPath: "/admin/feedback",
        }
      : {
          kind: "feature request" as const,
          subject: `New feature request: ${submission.title}`,
          summary: "Someone submitted a feature request through the feedback bubble.",
          text: `${submission.title}: ${submission.description}`,
          page: null,
          actionPath: "/admin/feature-requests",
        };
  try {
    await sendAdminAlert({
      idempotencyKey: `admin_moderation_submission:${data.id}`,
      subject: alert.subject,
      summary: alert.summary,
      fields: [
        { label: "Reference", value: data.id },
        { label: "From", value: submittedByEmail ?? "anonymous" },
        ...(alert.page ? [{ label: "Page", value: alert.page }] : []),
        { label: alert.kind === "feedback" ? "Message" : "Request", value: alert.text },
      ],
      actionPath: alert.actionPath,
      actionLabel: "Open the queue",
    });
  } catch (err) {
    console.error("[moderation POST] admin alert failed:", err);
  }

  if (submittedByEmail) {
    const ownAddress =
      !!auth.user?.email && auth.user.email.trim().toLowerCase() === submittedByEmail.trim().toLowerCase();
    const meta = (auth.user?.user_metadata ?? {}) as Record<string, unknown>;
    const displayName = typeof meta.display_name === "string" ? meta.display_name : "";
    await acknowledgeSubmission({
      referenceId: data.id,
      to: submittedByEmail,
      kind: alert.kind,
      excerpt: alert.text,
      verifiedUser:
        ownAddress && auth.user
          ? { id: auth.user.id, firstName: displayName.trim().split(" ").filter(Boolean)[0] || "there" }
          : null,
    });
  }

  return NextResponse.json({ status: "ok", id: data.id });
}
