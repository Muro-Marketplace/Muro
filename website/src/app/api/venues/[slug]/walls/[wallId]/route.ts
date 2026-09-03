/**
 * GET /api/venues/[slug]/walls/[wallId]
 *
 * One wall a venue has put on its public profile, for the artist's propose
 * page. Answers only when the wall belongs to the venue at `slug` and is
 * `is_public_on_profile`; every other case is a 404, so a wall id cannot be
 * probed for existence.
 *
 * Entitlement is the same gate as /api/venues/[slug]/profile, which is the
 * only place these walls are otherwise listed: the venue's owner, a
 * subscribed artist, or a customer. Anyone else gets the same 404, so the
 * wall photo (a signed URL from the private bucket) never reaches a caller
 * the profile would have shown a locked teaser to.
 *
 * WALL_VISUALIZER_V1 is the kill-switch for every wall surface, this one
 * included (D6 item 3).
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getOptionalUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveSubscription } from "@/lib/subscriptions";
import { canSeeVenueIdentity } from "@/lib/venue-visibility";
import { findPublicVenueWall, toPublicVenueWall } from "@/lib/venues/public-walls";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string; wallId: string }>;
}

function notFound() {
  return NextResponse.json({ error: "Wall not found" }, { status: 404 });
}

export async function GET(request: Request, ctx: RouteContext) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }
  const { slug, wallId } = await ctx.params;
  if (!slug || slug.length > 100 || !wallId || wallId.length > 64) {
    return NextResponse.json({ error: "Valid slug and wall id required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const found = await findPublicVenueWall(slug, wallId, db);
  if (!found) return notFound();

  const { user } = await getOptionalUser(request);
  let entitled = false;
  if (user) {
    if (user.id === found.venue.user_id) {
      entitled = true;
    } else {
      const role = (user.user_metadata?.user_type as string | undefined) ?? null;
      const sub = await resolveSubscription(user.id);
      entitled = canSeeVenueIdentity(role, sub.active);
    }
  }
  if (!entitled) return notFound();

  const wall = await toPublicVenueWall(found.wall, db);
  return NextResponse.json({ wall });
}
