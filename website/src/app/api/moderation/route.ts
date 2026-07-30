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
import { assertNotDemo } from "@/lib/demo-guard";
import { withRateLimit, getIP } from "@/lib/rate-limit";
import {
  parsePayload,
  type ModerationEntityType,
  type ModerationPayload,
} from "@/lib/moderation/types";

export const runtime = "nodejs";

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
  // E23a: soft demo guard. Unauthenticated reports are allowed, so this fires
  // only for a real demo session.
  const demoResp = assertNotDemo(submittedByUserId);
  if (demoResp) return demoResp;
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

  return NextResponse.json({ status: "ok", id: data.id });
}
