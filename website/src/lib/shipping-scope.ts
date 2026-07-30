// Per-artist shipping scope, resolved server side.
//
// G-C / Bug 10: api/checkout validated the delivery country only against the
// platform-wide supported-country list (isSupportedCountry), never against the
// artist's own scope. A buyer could therefore pay for delivery to a country the
// artist had never agreed to ship to, while the artwork page they bought it from
// said "Ships to UK only". Nothing downstream caught it: the shipping calculator
// happily prices an international tier for an artist who does not ship abroad.
//
// The scope lives on artist_profiles.ships_internationally (migration 081, which
// created the column the rest of the app was already written against). It is read
// HERE, from the database, and never taken from the request body. The cart is
// localStorage-backed, so a client that could assert its own shipping scope could
// assert its way straight past this check.
//
// Fails closed. An artist with no profile row, or a cart line with no artist
// slug, counts as UK only: we cannot confirm consent to ship abroad, and the
// wrong answer in that direction is a refused order rather than a delivery
// promise nobody made.

import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Returns the input slugs whose artist is NOT confirmed to ship outside the UK,
 * de-duplicated and lower-cased. An empty result means every artist in the cart
 * has opted in to international delivery.
 *
 * Slugs are compared case-insensitively. Every slug in the live table is already
 * lower-case, but the cart's copy is client-held and a difference in case must
 * not silently reclassify an artist.
 */
export async function findUkOnlyArtists(slugs: string[]): Promise<string[]> {
  const wanted = [...new Set(slugs.map((s) => (s || "").trim().toLowerCase()))];

  // A blank slug can never be matched to a profile, so it is UK only by the
  // fail-closed rule above. Kept in the result, kept out of the query.
  const blank = wanted.filter((s) => s === "");
  const lookup = wanted.filter((s) => s !== "");
  if (lookup.length === 0) return blank;

  const { data, error } = await getSupabaseAdmin()
    .from("artist_profiles")
    .select("slug, ships_internationally")
    .in("slug", lookup);

  // A failed read is not permission to ship abroad. Treat every slug as UK only
  // so an outage refuses the order instead of promising a delivery.
  if (error || !data) return wanted;

  const international = new Set(
    (data as { slug: string | null; ships_internationally: boolean | null }[])
      .filter((row) => row.ships_internationally === true)
      .map((row) => (row.slug || "").toLowerCase()),
  );

  return [...blank, ...lookup.filter((s) => !international.has(s))];
}
