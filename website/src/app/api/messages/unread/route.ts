// Unread message count for the header badge.
//
// This is the most-called authenticated route on the site: Header.tsx polls it
// every 60 seconds for every signed-in user, alongside the notifications badge.
// Two things follow, and both are why this file is shaped the way it is.
//
// 1. It must not be allowed to hang. It timed out twice on 2026-08-31 at
//    Vercel's 300-second default (runtime error cluster 4 in the 2026-09-05
//    launch audit). Nothing here should take longer than a few hundred
//    milliseconds, so `maxDuration` caps it: a hang becomes a fast failure the
//    caller already tolerates, instead of five minutes of billed function time
//    and a held connection, repeated per user per minute.
//
// 2. The two profile lookups are independent, so they run together. They used
//    to be sequential and gated on each other, which made a venue user (and
//    anyone with neither profile) pay two round trips before the count even
//    started. Same shape as resolveSubscription in @/lib/subscriptions.
//
// The failure path still answers `{ count: 0 }`, because a badge that cannot
// be read must not break the header. It no longer does so silently: a count
// that is always zero because of an error is indistinguishable from an empty
// inbox, which is the exact confusion the "a failed request is not an empty
// list" convention exists to stop. Here the empty answer is deliberate and the
// log is what makes it visible.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

/** Seconds. Three short queries; anything beyond this is a hang, not work. */
export const maxDuration = 10;

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();

    // maybeSingle, not single: "this user has no artist profile" is the normal
    // case for a venue or a customer, not an error worth constructing.
    const [artist, venue] = await Promise.all([
      db
        .from("artist_profiles")
        .select("slug")
        .eq("user_id", auth.user!.id)
        .maybeSingle<{ slug: string | null }>(),
      db
        .from("venue_profiles")
        .select("slug")
        .eq("user_id", auth.user!.id)
        .maybeSingle<{ slug: string | null }>(),
    ]);

    // Artist wins when an account owns both, matching resolveSubscription and
    // the header's own portal precedence.
    const slug = artist.data?.slug || venue.data?.slug;
    if (!slug) return NextResponse.json({ count: 0 });

    const { count } = await db
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("recipient_slug", slug)
      .eq("is_read", false);

    return NextResponse.json({ count: count || 0 });
  } catch (err) {
    console.error("[messages/unread] count failed, badge will read 0:", err);
    return NextResponse.json({ count: 0 });
  }
}
