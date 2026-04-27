/**
 * Demo account configuration.
 *
 * The "Tour the platform" homepage CTA funnels through `/demo`, which
 * sends visitors into a representative artist or venue experience using
 * the slugs below. To swap in different demo content, point these at
 * different slugs (or wire env vars).
 *
 * Phase 1 (now): demo links land on the public artist / venue profile
 *   page — this is the same view a venue (or artist) sees when
 *   shopping the marketplace, so it's already the most-aspirational
 *   surface we have. No auth required, nothing can break.
 *
 * Phase 2 (future): a `/api/demo/login?role=artist|venue` endpoint
 *   signs the visitor into a sandboxed read-only demo account so they
 *   can also explore the artist-portal / venue-portal views.
 *   Mutations get blocked at the API layer via a `assertNotDemo`
 *   helper. See the demo-accounts task in the running brief.
 */

export const DEMO_ARTIST_SLUG =
  process.env.NEXT_PUBLIC_DEMO_ARTIST_SLUG || "maya-chen";

export const DEMO_VENUE_SLUG =
  process.env.NEXT_PUBLIC_DEMO_VENUE_SLUG || "the-copper-kettle";

/**
 * IDs of the future sandboxed demo Supabase users. Empty until Phase 2
 * is wired — the helper below short-circuits to `false` so no mutation
 * routes are accidentally blocked.
 */
export const DEMO_USER_IDS: readonly string[] = [
  // process.env.DEMO_ARTIST_USER_ID,
  // process.env.DEMO_VENUE_USER_ID,
].filter(Boolean) as string[];

export function isDemoUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return DEMO_USER_IDS.includes(userId);
}
