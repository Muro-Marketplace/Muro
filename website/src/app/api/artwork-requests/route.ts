// /api/artwork-requests — venue-led artwork demand.
//
// GET — list artwork requests. Public for visibility=public. The venue
//       owner sees their own regardless.
// POST — venue creates a request.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  // Lower title min so a "Test" submission doesn't 400 — venues
  // typically write 4–10-word titles. Description min relaxed to 2 too.
  title: z.string().min(2).max(160),
  description: z.string().min(2).max(4000),
  artworkTypes: z.array(z.string()).max(10).optional().default([]),
  styles: z.array(z.string()).max(10).optional().default([]),
  subjects: z.array(z.string()).max(10).optional().default([]),
  mediums: z.array(z.string()).max(10).optional().default([]),
  minDimensionCm: z.number().int().nonnegative().optional(),
  maxDimensionCm: z.number().int().nonnegative().optional(),
  budgetMinPence: z.number().int().nonnegative().optional(),
  budgetMaxPence: z.number().int().nonnegative().optional(),
  intent: z.array(z.enum(["purchase", "commission", "display", "loan"])).min(1).max(4),
  // Optional rev-share % — only meaningful when intent includes
  // "display" (which the UI now labels "QR-enabled display").
  qrRevenueSharePercent: z.number().int().min(0).max(100).optional(),
  location: z.string().max(160).optional(),
  timescale: z.enum(["asap", "weeks", "months", "flexible"]).optional(),
  images: z.array(z.object({
    url: z.string().url(),
    caption: z.string().max(160).optional(),
  })).max(8).optional().default([]),
  // Drop "public" — venues only want to surface to verified artists or
  // an explicit invitation list.
  visibility: z.enum(["semi_public", "private"]).default("semi_public"),
  invitedArtistSlugs: z.array(z.string().min(1).max(100)).max(50).optional().default([]),
  wallId: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (
    typeof data.budgetMinPence === "number" &&
    typeof data.budgetMaxPence === "number" &&
    data.budgetMaxPence < data.budgetMinPence
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["budgetMaxPence"],
      message: "Budget max must be greater than or equal to budget min.",
    });
  }
  if (
    typeof data.minDimensionCm === "number" &&
    typeof data.maxDimensionCm === "number" &&
    data.maxDimensionCm < data.minDimensionCm
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxDimensionCm"],
      message: "Max dimension must be greater than or equal to min dimension.",
    });
  }
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mine = url.searchParams.get("mine") === "1";
  const status = url.searchParams.get("status") || "open";

  const db = getSupabaseAdmin();

  if (mine) {
    const auth = await getAuthenticatedUser(request);
    if (auth.error) return auth.error;
    // No FK between artwork_requests.venue_user_id and
    // venue_profiles.user_id (both reference auth.users.id), so
    // PostgREST's `venue:venue_profiles!venue_user_id(name)` embed
    // silently 500s here. That dropped the list to empty, the page's
    // local-cache fallback kicked in for every just-submitted row,
    // and every row showed a "Syncing" badge forever. We don't need
    // the venue name on a venue looking at their own list — drop the
    // join and just fan in the venue's own name below.
    const { data, error } = await db
      .from("artwork_requests")
      .select("*")
      .eq("venue_user_id", auth.user!.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[artwork-requests GET mine]", error);
      return NextResponse.json({ error: "Could not load requests" }, { status: 500 });
    }
    const { data: venueRow } = await db
      .from("venue_profiles")
      .select("name")
      .eq("user_id", auth.user!.id)
      .maybeSingle<{ name: string | null }>();
    const venueName = venueRow?.name ?? null;
    return NextResponse.json({
      requests: (data || []).map((r) => ({
        ...r,
        venue_name: venueName,
      })),
    });
  }

  // Browse — verified-artist requests for everyone, plus any private
  // requests that have invited the calling artist by slug.
  // Need the caller's artist slug (if signed in as an artist) so we
  // can include private invitations they're listed on.
  const auth = await getAuthenticatedUser(request);
  let invitedSlugs: string[] = [];
  if (!auth.error && auth.user) {
    const { data: artistRow } = await db
      .from("artist_profiles")
      .select("slug")
      .eq("user_id", auth.user.id)
      .maybeSingle<{ slug: string | null }>();
    if (artistRow?.slug) invitedSlugs = [artistRow.slug];
  }

  let query = db
    .from("artwork_requests")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (invitedSlugs.length > 0) {
    // OR: visibility=semi_public  OR  (visibility=private AND invited_artist_slugs @> [my_slug])
    query = query.or(
      `visibility.eq.semi_public,and(visibility.eq.private,invited_artist_slugs.cs.{${invitedSlugs[0]}})`,
    );
  } else {
    query = query.eq("visibility", "semi_public");
  }

  const { data, error } = await query;
  if (error) {
    console.error("[artwork-requests GET]", error);
    return NextResponse.json({ error: "Could not load requests" }, { status: 500 });
  }
  // Fan in venue names with a batch lookup. There's no FK between
  // artwork_requests and venue_profiles (both reference auth.users)
  // so PostgREST can't embed venue_profiles directly — when we tried,
  // the whole list endpoint returned 500. Doing the join in the app
  // layer keeps the list working and still surfaces the name.
  const venueIds = [...new Set((data || []).map((r) => (r as { venue_user_id: string }).venue_user_id))];
  const venueNameById = new Map<string, string>();
  if (venueIds.length > 0) {
    const { data: venueRows } = await db
      .from("venue_profiles")
      .select("user_id, name")
      .in("user_id", venueIds);
    for (const v of (venueRows || []) as Array<{ user_id: string; name: string | null }>) {
      if (v.name) venueNameById.set(v.user_id, v.name);
    }
  }
  // Plan G #3: surface the resolved venue name alongside the slug so
  // the artist-portal list shows "Copper Kettle" instead of a slug or
  // bare uuid.
  return NextResponse.json({
    requests: (data || []).map((r) => ({
      ...r,
      venue_name: venueNameById.get((r as { venue_user_id: string }).venue_user_id) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    // Surface zod's first-issue path + message so the form can show
    // exactly what failed instead of a flat "invalid request".
    const first = parsed.error.issues[0];
    const fieldPath = first?.path.join(".") || "input";
    return NextResponse.json(
      { error: "validation_failed", message: `${fieldPath}: ${first?.message || "invalid"}` },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();

  // Venue-only: must have a venue profile to post artwork demand.
  const { data: venue } = await db
    .from("venue_profiles")
    .select("user_id, slug")
    .eq("user_id", auth.user!.id)
    .maybeSingle();
  if (!venue) {
    return NextResponse.json(
      { error: "venue_only", message: "Only venues can post artwork requests." },
      { status: 403 },
    );
  }

  const id = `arq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await db.from("artwork_requests").insert({
    id,
    venue_user_id: auth.user!.id,
    venue_slug: venue.slug,
    wall_id: parsed.data.wallId || null,
    title: parsed.data.title.trim(),
    description: parsed.data.description.trim(),
    artwork_types: parsed.data.artworkTypes,
    styles: parsed.data.styles,
    subjects: parsed.data.subjects,
    mediums: parsed.data.mediums,
    min_dimension_cm: parsed.data.minDimensionCm ?? null,
    max_dimension_cm: parsed.data.maxDimensionCm ?? null,
    budget_min_pence: parsed.data.budgetMinPence ?? null,
    budget_max_pence: parsed.data.budgetMaxPence ?? null,
    intent: parsed.data.intent,
    qr_revenue_share_percent: parsed.data.qrRevenueSharePercent ?? null,
    location: parsed.data.location || null,
    timescale: parsed.data.timescale || null,
    images: parsed.data.images,
    visibility: parsed.data.visibility,
    invited_artist_slugs: parsed.data.invitedArtistSlugs,
  });

  if (error) {
    console.error("[artwork-requests POST]", error);
    return NextResponse.json({ error: "Could not save request" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id });
}
