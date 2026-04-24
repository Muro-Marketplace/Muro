// Vercel Cron — daily 11:00 UTC. Asks each party for a review ~7 days after
// their placement ended (status=completed, collected_at in a 24h window).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { PlacementReviewRequest } from "@/emails/templates/placements/PlacementReviewRequest";
import { requireCronAuth, runBatch } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();
  const nowMs = Date.now();
  // 7 days ± 12h, same reasoning as the ending-soon job.
  const lower = new Date(nowMs - 7.5 * 24 * 60 * 60 * 1000).toISOString();
  const upper = new Date(nowMs - 6.5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: placements } = await db
    .from("placements")
    .select("id, artist_user_id, venue_user_id, venue, collected_at, venue_slug, artist_slug")
    .eq("status", "completed")
    .gte("collected_at", lower)
    .lte("collected_at", upper);

  const result = await runBatch((placements || []), async (p) => {
    const placementUrl = `${SITE}/placements/${encodeURIComponent(p.id)}`;

    // Artist reviews the venue; venue reviews the artist. Separate sends,
    // separate idempotency keys, each addressed to their counterparty.
    const [{ data: artistP }, { data: venueP }] = await Promise.all([
      p.artist_user_id
        ? db.from("artist_profiles").select("name").eq("user_id", p.artist_user_id).single()
        : Promise.resolve({ data: null } as { data: { name: string } | null }),
      p.venue_user_id
        ? db.from("venue_profiles").select("name").eq("user_id", p.venue_user_id).single()
        : Promise.resolve({ data: null } as { data: { name: string } | null }),
    ]);
    const artistName = artistP?.name || "Artist";
    const venueName = venueP?.name || p.venue || "Venue";

    const parties: Array<{ userId: string | null; counterparty: string }> = [
      { userId: p.artist_user_id, counterparty: venueName },
      { userId: p.venue_user_id, counterparty: artistName },
    ];

    for (const party of parties) {
      if (!party.userId) continue;
      const { data: { user } } = await db.auth.admin.getUserById(party.userId);
      if (!user?.email) continue;

      await sendEmail({
        idempotencyKey: `placement_review_request:${p.id}:${party.userId}`,
        template: "placement_review_request",
        category: "placements",
        to: user.email,
        subject: `A quick review for ${party.counterparty}?`,
        userId: party.userId,
        react: PlacementReviewRequest({
          firstName: user.user_metadata?.first_name || "there",
          placementUrl,
          counterpartyName: party.counterparty,
          reviewUrl: `${placementUrl}/review`,
        }),
        metadata: { placementId: p.id },
      });
    }
  });

  return NextResponse.json({ ok: true, ...result });
}
