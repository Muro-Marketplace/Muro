// Vercel Cron, daily 10:00 UTC. Finds placements whose `end_date` is ~14 days
// out and emails both parties once.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { PlacementEndingSoon } from "@/emails/templates/placements/PlacementEndingSoon";
import { requireCronAuth, runBatch } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();
  // Window: anything ending between 13.5 and 14.5 days from now. Catches a
  // single daily run without risking double-sends across timezones.
  const nowMs = Date.now();
  const lower = new Date(nowMs + 13.5 * 24 * 60 * 60 * 1000).toISOString();
  const upper = new Date(nowMs + 14.5 * 24 * 60 * 60 * 1000).toISOString();

  // `end_date` is the column we document publicly, map from whichever DB
  // column holds it. Common options: `end_date`, `ends_at`, `collected_at`.
  // Adjust the column name if your schema differs.
  const { data: placements } = await db
    .from("placements")
    .select("id, artist_user_id, venue_user_id, venue, venue_slug, end_date")
    .eq("status", "active")
    .gte("end_date", lower)
    .lte("end_date", upper);

  const result = await runBatch((placements || []), async (p) => {
    const endLabel = p.end_date
      ? new Date(p.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "soon";
    const placementUrl = `${SITE}/placements/${encodeURIComponent(p.id)}`;

    const parties: Array<{ userId: string | null; kind: "artist" | "venue" }> = [
      { userId: p.artist_user_id, kind: "artist" },
      { userId: p.venue_user_id, kind: "venue" },
    ];

    for (const party of parties) {
      if (!party.userId) continue;
      const { data: { user } } = await db.auth.admin.getUserById(party.userId);
      if (!user?.email) continue;

      await sendEmail({
        idempotencyKey: `placement_ending_soon:${p.id}:${party.userId}`,
        template: "placement_ending_soon",
        category: "placements",
        to: user.email,
        subject: `Placement at ${p.venue || "your venue"} ends ${endLabel}`,
        userId: party.userId,
        react: PlacementEndingSoon({
          firstName: user.user_metadata?.first_name || "there",
          placementUrl,
          venueName: p.venue || "your venue",
          endDate: endLabel,
          returnInstructionsUrl: `${placementUrl}?record=open`,
          extendPlacementUrl: `${placementUrl}?extend=1`,
        }),
        metadata: { placementId: p.id, party: party.kind },
      });
    }
  });

  return NextResponse.json({ ok: true, ...result });
}
