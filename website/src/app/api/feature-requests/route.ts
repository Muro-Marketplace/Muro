// /api/feature-requests
//
// GET — list public feature requests (paginated, sorted by upvotes desc).
// POST — submit a new request. Auth optional; anonymous submissions
//        record an email for follow-up.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { sendEmail } from "@/lib/email/send";
import { unverifiedRecipientAllowed } from "@/lib/email/unverified-recipient";
import { FeedbackReceived } from "@/emails/templates/account/FeedbackReceived";

export const runtime = "nodejs";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk").replace(/\/$/, "");

const createSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(10).max(4000),
  category: z.string().max(40).optional(),
  email: z.string().email().max(320).optional(),
  role: z.enum(["artist", "venue", "customer", "other"]).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feature_requests")
    .select("id, title, description, category, status, upvotes, role, created_at")
    .eq("status", status)
    .order("upvotes", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[feature-requests GET]", error);
    return NextResponse.json({ error: "Could not load requests" }, { status: 500 });
  }
  return NextResponse.json({ requests: data || [] });
}

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 10, 60_000);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
  }

  // Auth is optional. If signed in we link the request to the user;
  // otherwise we just record the email.
  const auth = await getAuthenticatedUser(request);
  const userId = auth.error ? null : auth.user?.id || null;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feature_requests")
    .insert({
      user_id: userId,
      email: parsed.data.email || (userId ? auth.user?.email || null : null),
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      category: parsed.data.category || null,
      role: parsed.data.role || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[feature-requests POST]", error);
    return NextResponse.json({ error: "Could not save request" }, { status: 500 });
  }

  // The row is written; from here everything is best-effort and the response
  // is the same whatever the mail does. Until now a request went into the
  // table and nobody was told: no alert to the team and nothing to the sender.
  const requestId = data?.id ? String(data.id) : null;
  const contactEmail = parsed.data.email || (userId ? auth.user?.email || null : null);
  if (requestId) {
    try {
      await sendAdminAlert({
        idempotencyKey: `admin_feature_request:${requestId}`,
        subject: `New feature request: ${parsed.data.title.trim()}`,
        summary: "Someone submitted a feature request.",
        fields: [
          { label: "Reference", value: requestId },
          { label: "From", value: contactEmail ?? "anonymous" },
          ...(parsed.data.role ? [{ label: "Role", value: parsed.data.role }] : []),
          ...(parsed.data.category ? [{ label: "Category", value: parsed.data.category }] : []),
          { label: "Request", value: `${parsed.data.title.trim()}: ${parsed.data.description.trim()}` },
        ],
        actionPath: "/admin/feature-requests",
        actionLabel: "Open the queue",
      });
    } catch (err) {
      console.error("[feature-requests POST] admin alert failed:", err);
    }

    if (contactEmail) {
      // The sender's acknowledgement. `email` on the body is free text from an
      // optionally anonymous caller, so unless it is the signed-in caller's own
      // address off the token this is a REFLECTED send and the per-recipient
      // cap applies, as on the contact form: many IPs at one inbox is the
      // attack the per-IP limit above does not cover.
      const ownAddress =
        !!userId &&
        !!auth.user?.email &&
        auth.user.email.trim().toLowerCase() === contactEmail.trim().toLowerCase();
      const meta = (auth.user?.user_metadata ?? {}) as Record<string, unknown>;
      const displayName = typeof meta.display_name === "string" ? meta.display_name : "";
      try {
        const allowed =
          ownAddress || (await unverifiedRecipientAllowed({ to: contactEmail, template: "feedback_received" }));
        if (allowed) {
          await sendEmail({
            idempotencyKey: `feedback_ack:feature_request:${requestId}`,
            template: "feedback_received",
            category: "orders_and_payouts",
            to: contactEmail,
            // No userId for an unverified address: attaching one would apply
            // somebody's preferences to an address we have not tied to them.
            userId: ownAddress ? userId ?? undefined : undefined,
            subject: "Thanks for your feature request",
            react: FeedbackReceived({
              firstName: (ownAddress && displayName.trim().split(" ").filter(Boolean)[0]) || "there",
              referenceId: requestId,
              submittedType: "feature request",
              messageExcerpt: `${parsed.data.title.trim()}: ${parsed.data.description.trim()}`.slice(0, 300),
              supportUrl: `${SITE}/support`,
            }),
            metadata: { referenceId: requestId, kind: "feature request" },
          });
        }
      } catch (err) {
        console.error("[feature-requests POST] acknowledgement failed:", err);
      }
    }
  }

  return NextResponse.json({ success: true, id: data?.id });
}
