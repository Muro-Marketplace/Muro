/**
 * Demo account configuration.
 *
 * The "Tour the platform" homepage CTA funnels through `/demo`, which
 * sends visitors into a representative artist or venue experience using
 * the slugs below. To swap in different demo content, point these at
 * different slugs (or wire env vars).
 *
 * Phase 1 (now): demo links land on the public artist / venue profile
 *   page, this is the same view a venue (or artist) sees when
 *   shopping the marketplace, so it's already the most-aspirational
 *   surface we have. No auth required, nothing can break.
 *
 * Phase 2 (SHIPPED, contrary to the "future" this used to say):
 *   `/api/demo/login?role=artist|venue` signs the visitor into a
 *   sandboxed demo account, and mutations are blocked at the API layer
 *   by `assertNotDemo` from `src/lib/demo-guard.ts`. E23a wired that
 *   helper across every outward-facing and in-portal route; 07 §8.3's
 *   claim that it "has zero call sites in the entire repo" is stale.
 */

export const DEMO_ARTIST_SLUG =
  process.env.NEXT_PUBLIC_DEMO_ARTIST_SLUG || "maya-chen";

export const DEMO_VENUE_SLUG =
  process.env.NEXT_PUBLIC_DEMO_VENUE_SLUG || "the-copper-kettle";

// K8 (07 §13.19). `DEMO_USER_IDS` and an `isDemoUser` lived here, a dead
// duplicate of the real pair in `src/lib/demo-guard.ts`. The array's two entries
// were commented out, so it was permanently empty and this `isDemoUser` returned
// false for everyone, including the actual demo accounts. Nothing outside this
// file imported either. The live implementation reads DEMO_ARTIST_USER_ID /
// DEMO_VENUE_USER_ID from the environment; import from demo-guard.
