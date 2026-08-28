// /api/placements/[id]/review
//
// POST: either party of a placement can submit a 1–5 star review of the
// counterparty after the placement has wound down. The cron at
// /api/cron/placement-review-request emails both parties ~7 days after
// collection — this is the endpoint that backs the email link.
//
// F38 (QA 2026-08-28): "after the placement has wound down" is enforced
// now, not just described. Both POST and the page gate on the terminal
// statuses (completed / sold / cancelled); a pending or active placement
// refuses the review, so neither party can rate the other before anything
// has happened.
//
// GET: the reviews on this placement, visible only to its two parties.
// Backs the review page's display of received reviews (F39: the "read
// your review" notification used to link somewhere that rendered none).
//
// One review per reviewer per placement (DB unique index enforces it).
// On submit we send `review_posted_notification` to the reviewee + drop
// a bell notification.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { ReviewPostedNotification } from "@/emails/templates/messages/ReviewPostedNotification";
import { isReviewablePlacementStatus } from "@/lib/placement-review-status";

export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(2000).optional(),
});

// GET /api/placements/[id]/review — the placement's reviews, party-only.
// Returns { status, reviewable, reviews } where each review carries a
// `direction` ("given" | "received") relative to the caller.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const { id: placementId } = await context.params;
  const db = getSupabaseAdmin();
  const { data: placement } = await db
    .from("placements")
    .select("id, status, artist_user_id, venue_user_id")
    .eq("id", placementId)
    .single();

  if (!placement) {
    return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  }

  const callerId = auth.user!.id;
  if (callerId !== placement.artist_user_id && callerId !== placement.venue_user_id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { data: reviews, error } = await db
    .from("placement_reviews")
    .select("id, placement_id, reviewer_user_id, reviewee_user_id, rating, text, created_at")
    .eq("placement_id", placementId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[placement-review] GET error:", error);
    return NextResponse.json({ error: "Could not load reviews" }, { status: 500 });
  }

  return NextResponse.json({
    status: placement.status,
    reviewable: isReviewablePlacementStatus(placement.status),
    reviews: (reviews || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      created_at: r.created_at,
      direction: r.reviewer_user_id === callerId ? "given" : "received",
    })),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
  // unwinding optimistic state. The helper had zero call sites while two doc
  // comments claimed it was enforced.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  const { id: placementId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: placement } = await db
    .from("placements")
    .select("id, status, artist_user_id, venue_user_id, venue, work_title")
    .eq("id", placementId)
    .single();

  if (!placement) {
    return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  }

  // F38: reviews open once the placement has actually ended. Before this
  // gate, either party could rate the other on a pending or active
  // placement, before anything had happened.
  if (!isReviewablePlacementStatus(placement.status)) {
    return NextResponse.json(
      { error: "Reviews open once the placement has ended" },
      { status: 409 },
    );
  }

  // Reviewer must be one of the two parties; reviewee is the other.
  const reviewerId = auth.user!.id;
  let revieweeId: string | null = null;
  if (reviewerId === placement.artist_user_id) revieweeId = placement.venue_user_id;
  else if (reviewerId === placement.venue_user_id) revieweeId = placement.artist_user_id;

  if (!revieweeId) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  // Insert. The unique (placement_id, reviewer_user_id) index makes
  // double-submits a 23505 we surface as a clear 409.
  const { error } = await db.from("placement_reviews").insert({
    placement_id: placementId,
    reviewer_user_id: reviewerId,
    reviewee_user_id: revieweeId,
    rating: parsed.data.rating,
    text: parsed.data.text || null,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You've already reviewed this placement" }, { status: 409 });
    }
    console.error("[placement-review] insert error:", error);
    return NextResponse.json({ error: "Could not save review" }, { status: 500 });
  }

  // Bell + email — fire-and-forget so the user gets a fast 200 even if
  // a downstream service is slow.
  //
  // F39: both links land on the review page, which renders the placement's
  // reviews. They used to point at /placements/[id], which displays no
  // review anywhere, so "Tap to read your review" led nowhere useful.
  const reviewPageUrl = `${SITE}/placements/${encodeURIComponent(placementId)}/review`;
  createNotification({
    userId: revieweeId,
    kind: "review",
    title: `New ${parsed.data.rating}-star review`,
    body: parsed.data.text ? parsed.data.text.slice(0, 140) : "Tap to read your review",
    // Relative on purpose (R6.F11): an absolute link persists whatever domain
    // was configured at insert time, so preview/staging bells jumped to
    // production. The email below keeps the absolute reviewPageUrl.
    link: `/placements/${encodeURIComponent(placementId)}/review`,
  }).catch((err) => console.warn("[placement-review] bell failed:", err));

  try {
    const { data: { user: revieweeUser } } = await db.auth.admin.getUserById(revieweeId);
    const { data: { user: reviewerUser } } = await db.auth.admin.getUserById(reviewerId);

    // Pull a friendly reviewer name. Prefer the artist/venue display
    // name; fall back to the email local-part.
    const [{ data: revArtist }, { data: revVenue }] = await Promise.all([
      db.from("artist_profiles").select("name").eq("user_id", reviewerId).maybeSingle(),
      db.from("venue_profiles").select("name").eq("user_id", reviewerId).maybeSingle(),
    ]);
    const reviewerName =
      revArtist?.name ||
      revVenue?.name ||
      (reviewerUser?.email ? reviewerUser.email.split("@")[0] : "Someone");

    if (revieweeUser?.email) {
      const [{ data: targetArtist }, { data: targetVenue }] = await Promise.all([
        db.from("artist_profiles").select("name").eq("user_id", revieweeId).maybeSingle(),
        db.from("venue_profiles").select("name").eq("user_id", revieweeId).maybeSingle(),
      ]);
      const revieweeFirstName = (targetArtist?.name || targetVenue?.name || revieweeUser.email.split("@")[0]).split(" ")[0];

      await sendEmail({
        idempotencyKey: `review_posted:${placementId}:${reviewerId}`,
        template: "review_posted_notification",
        category: "placements",
        to: revieweeUser.email,
        subject: `${reviewerName} left you a ${parsed.data.rating}-star review`,
        userId: revieweeId,
        react: ReviewPostedNotification({
          firstName: revieweeFirstName,
          reviewerName,
          reviewRating: parsed.data.rating,
          reviewText: parsed.data.text,
          reviewUrl: reviewPageUrl,
        }),
        metadata: { placementId, rating: parsed.data.rating },
      });
    }
  } catch (err) {
    console.warn("[placement-review] email skipped:", err);
  }

  return NextResponse.json({ success: true });
}
