// Per-entity write allowlists (CC2, see docs/plans/implementation/06-validation-massassign.md §5.1).
//
// The rule: no route may spread a request body into a DB write. Every write
// payload is built by pickWritable() from one of the frozen sets below.
//
// Server-owned columns are set server-side or are immutable:
//   subscription_plan / subscription_status  → Stripe webhook ONLY
//                                              (api/webhooks/stripe/route.ts)
//   review_status / approved_at              → admin routes ONLY
//                                              (api/admin/applications/[id])
//   user_id / slug / artist_id / id          → never client-writable
//   (total_* counters dropped by migration 114; live counts come from analytics)
//   stripe_*                                 → Stripe onboarding + webhooks ONLY
//   lat / lng                                → derived server-side from postcode
//
// Column lists verified column-by-column against the live project
// uwkuhygwvasdzwsusiym on 2026-07-29 (information_schema.columns), not against
// the migration files: prod was bootstrapped from supabase-all-migrations.sql
// rather than from 001, so the numbered sequence is not authoritative.
//
// Being on the server-owned list is what fails safe, so a column wrongly placed
// there is harmless, while a column wrongly placed on a writable list is not.

/** Columns a signed-in artist may set on their own artist_profiles row. */
export const ARTIST_PROFILE_WRITABLE = Object.freeze([
  // Identity and presentation
  "name",
  "profile_image",
  "banner_image",
  "short_bio",
  "extended_bio",
  "location",
  "profile_color",
  // Taxonomy
  "primary_medium",
  "style_tags",
  "themes",
  "discipline",
  "sub_styles",
  // Links
  "instagram",
  "website",
  // Offering
  "offers_originals",
  "offers_prints",
  "offers_framed",
  "available_sizes",
  "open_to_commissions",
  "open_to_free_loan",
  "open_to_revenue_share",
  "revenue_share_percent",
  "open_to_outright_purchase",
  "offers_pickup",
  "can_provide_frames",
  "can_arrange_framing",
  // Logistics
  "delivery_radius",
  "venue_types_suited_for",
  "postcode", // validated + upper-cased by the route; drives lat/lng
  "default_shipping_price",
  // Migration 081 created both of the next two. Before it they existed in no
  // migration and not in the live table, so they had to stay OFF this list:
  // allowlisting a phantom column makes PostgREST reject the whole UPDATE,
  // turning one stray field into a total save failure. The cost was that the
  // artist portal's "Ships internationally" toggle silently dropped the answer
  // on every save, so no artist could ever ship outside the UK. They persist
  // now, and api/checkout enforces the scope (G-C / Bug 10).
  "ships_internationally",
  "international_shipping_price",
  // Notification preferences (001_analytics_events.sql, 050_notification_prefs.sql)
  "message_notifications_enabled",
  "email_digest_enabled",
  "order_notifications_enabled",
  // Tier-gated: on the allowlist, then stripped by the Premium check in
  // api/artist-profile/route.ts. Allowlisting alone is not the gate.
  "profile_theme",
  "label_theme",
] as const);

/**
 * Never accepted from a client on artist_profiles. Denial is what fails safe,
 * so when in doubt a column belongs on this list, not the one above.
 */
export const ARTIST_PROFILE_SERVER_OWNED = Object.freeze([
  // Identity
  "id",
  "user_id",
  "slug",
  "created_at",
  "updated_at",
  // Derived server-side from postcode
  "lat",
  "lng",
  // Admin / moderation only
  "review_status",
  "approved_at",
  "reviewed_by",
  // Stripe webhook only
  "subscription_plan",
  "subscription_status",
  "subscription_period_end",
  "trial_end",
  "stripe_customer_id",
  "stripe_subscription_id",
  // Stripe Connect onboarding + webhooks only
  "stripe_connect_account_id",
  "stripe_connect_onboarding_complete",
  "stripe_charges_enabled",
  "stripe_charges_checked_at",
  // K5: these were "maintained by lib/stats-cache.ts", which is deleted. They
  // are now written by nothing, and the two surfaces that displayed them count
  // live from analytics_events instead. They stay DENIED here regardless: a
  // client must never be able to write its own view or sale count, whether or
  // not anything else does.
  // Billing / referral
  "referral_code", // unique, auto-generated
  "referred_by_code", // write-once at signup, drives a payout
  "referral_credited_at",
  "is_founding_artist",
  // `free_until` and `signup_order` are NOT in the live table. Kept on the deny
  // list anyway: listing a non-existent column here costs nothing and fails
  // closed if a later migration introduces it.
  "free_until",
  "signup_order",
  // Lifecycle stamps
  "last_digest_sent_at",
  "welcomed_at",
] as const);

/** Columns a signed-in venue may set on their own venue_profiles row. */
export const VENUE_PROFILE_WRITABLE = Object.freeze([
  "name",
  "type",
  "location",
  "description",
  "image",
  "images",
  // Contact PII. Anon SELECT on these is revoked by migration 071
  // (see VENUE_PUBLIC_COLUMNS in lib/db/venue-profiles.ts).
  "contact_name",
  "email",
  "phone",
  "address_line1",
  "address_line2",
  "city",
  "postcode",
  // Space
  "wall_space",
  "approximate_footfall",
  "audience_type",
  // Arrangement interest
  "interested_in_free_loan",
  "interested_in_revenue_share",
  "interested_in_direct_purchase",
  "interested_in_collections",
  // Row 23a / migration 103. The control shipped long before the column: the
  // save dropped it here and the transform hardcoded `true` on the way back, so
  // a venue could untick the box, save, reload and see it ticked again.
  "interested_in_local_artists",
  // Taste
  "preferred_styles",
  "preferred_themes",
  // Display needs
  "display_wall_space",
  "display_lighting",
  "display_install_notes",
  "display_rotation_frequency",
  // Notification preferences
  "message_notifications_enabled",
  "email_digest_enabled",
] as const);
//
// Two names are deliberately NOT on the list, and they are not the same case
// (row 23, D66):
//
//   - `preferred_sizes` is VESTIGIAL. It exists in no schema, no UI collects it,
//     nothing reads it, and no row holds it. `preferred_styles` does exist in
//     prod, so this was an incomplete migration rather than a design decision.
//     There is nothing to build: if the name turns up again, delete it.
//   - `interested_in_local_artists` is a REAL shipped control
//     (venue-portal/profile) that is bound to state and hydrated, but whose value
//     is discarded on save because the column does not exist. That is row 23(a):
//     add the nullable boolean and the allowlist entry so the tick persists.
//
// The strip-and-retry in upsertVenueProfile that used to compensate for both is
// already gone (E42-c); the allowlist is what keeps them out now.

/** Never accepted from a client on venue_profiles. */
export const VENUE_PROFILE_SERVER_OWNED = Object.freeze([
  "id",
  "user_id",
  "slug",
  "created_at",
  "updated_at",
  "welcomed_at",
  "subscription_plan",
  "subscription_status",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_connect_account_id",
  "stripe_connect_onboarding_complete",
] as const);
//
// venue_profiles has no lat/lng (the transform hardcodes London coordinates), no
// review_status and no total_* counters. Verified against prod.

/**
 * Columns an artist may set on their own artist_works rows.
 * `id` is client-supplied by design (the portal generates it and upserts), but
 * the row is always scoped to the caller's artist_id server-side, so it is
 * handled by the route rather than listed here.
 */
export const ARTIST_WORK_WRITABLE = Object.freeze([
  "title",
  "medium",
  "dimensions",
  "price_band",
  "pricing",
  "available", // gated by GATING_V1 in api/artist-works/route.ts
  "color",
  "image",
  "images",
  "orientation",
  "sort_order",
  "shipping_price",
  // Owner decision 14 / migration 118: real column now. Retired as a UI input
  // on 2026-08-28 (the tick box below replaced the price model); stays listed
  // so a legacy payload cannot fail a save.
  "in_store_price",
  // Migration 120: the "Available to buy in store?" tick box.
  "available_in_store",
  "quantity_available",
  "frame_options",
  "description",
] as const);

export const ARTIST_WORK_SERVER_OWNED = Object.freeze([
  "artist_id", // ownership key
  "created_at",
  "placed_at_venue", // denormalised by the placements PATCH handler
  "current_placement_id", // same
  "mockups", // written by the visualizer API
  "featured_until", // Artwork of the Week, written only by /api/artist-works/[id]/feature
] as const);

/**
 * Server-owned columns on `placements`. Task 6 (Wallplace Programmes rent
 * accrual, migration 122): `programme_request_id` links a placement to the
 * programme paying for it, and `programme_rent_gbp` is the artist's agreed
 * monthly rent for it. Both drive real money -- accrueProgrammeRent()
 * (src/lib/curation/programme-rent.ts) inserts one accrual row per linked
 * placement on every paid programme invoice -- so a client setting either
 * would let an artist or venue fabricate rent income.
 *
 * Review fix (E23a repeat): this constant used to have ZERO call sites --
 * exactly the shape flagged elsewhere in this codebase (see the E23a comment
 * in api/placements/route.ts): a control that exists, is unit-tested, and
 * protects nothing. It is now enforced by `assertNoServerOwned(payload,
 * PLACEMENT_SERVER_OWNED, "placements")` at every write site in
 * api/placements/route.ts -- the POST insert and both PATCH updates (the
 * counter-terms write and the status/stage write).
 *
 * Still NOT the same shape as the ARTIST_PROFILE_SERVER_OWNED /
 * VENUE_PROFILE_SERVER_OWNED pair above, where ONE upsert function
 * (upsertArtistProfile / upsertVenueProfile) is the single choke point every
 * write funnels through, so ONE assertNoServerOwned() call guards all of
 * them. `placements` has no equivalent choke point -- api/placements/route.ts
 * builds each write payload inline at its own call site rather than through a
 * shared pickWritable()-fed upsert -- so there is no single function to hang
 * one call off. Guarded at each of the three sites instead, which is also why
 * none of them can throw today: `placementUpdateSchema` (lib/validations.ts)
 * has no field for either column and every payload here is built from
 * explicitly named fields, never a body spread, so there is no live path that
 * reaches either column with a client-supplied value. Each call is
 * currently a no-op that passes -- which is the point: defence in depth
 * against the day a future edit adds a body-sourced field to one of these
 * payloads without checking this list first, e.g. an admin route linking a
 * placement to a programme, deliberately left unbuilt by this task.
 */
export const PLACEMENT_SERVER_OWNED = Object.freeze([
  "programme_request_id",
  "programme_rent_gbp",
] as const);

export type WritableKeys<T extends readonly string[]> = T[number];

/**
 * Build a DB write payload containing only allowlisted keys.
 *
 * Keys absent from `body` are omitted entirely rather than written as
 * undefined, so a partial PATCH stays partial and never nulls a column the
 * caller did not mention. Only own properties are read, so neither a JSON
 * `__proto__` key nor anything inherited can contribute a value.
 */
export function pickWritable<T extends readonly string[]>(
  body: unknown,
  allow: T,
): Partial<Record<WritableKeys<T>, unknown>> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return out as Partial<Record<WritableKeys<T>, unknown>>;
  }
  const src = body as Record<string, unknown>;
  for (const key of allow) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = src[key];
    }
  }
  return out as Partial<Record<WritableKeys<T>, unknown>>;
}

/**
 * Defence in depth for the db helpers. Throws if a server-owned column reached a
 * write path, so a future route that forgets pickWritable fails loudly in dev
 * and CI instead of silently reintroducing E44.
 *
 * Throws rather than strips: a payload carrying these keys means a caller is
 * wrong, and silently dropping them would hide the bug.
 */
export function assertNoServerOwned(
  payload: Record<string, unknown>,
  serverOwned: readonly string[],
  table: string,
  /**
   * Server-owned columns THIS call site is entitled to set (A5/A7).
   *
   * Needed because a handful of writes legitimately set a server-owned column
   * with a server-computed value: the artist PUT derives lat/lng from the
   * postcode, and the two creation paths choose the slug and the initial
   * review_status. A blanket refusal would have made the guard unusable and it
   * would have been dropped, which is how controls end up existing and doing
   * nothing (cf. E23a).
   *
   * It is an allowlist per call, not a global widening: everything not named
   * here is still refused, so a client-supplied subscription_plan is caught even
   * on a call site that is allowed to set lat.
   */
  allow: readonly string[] = [],
): void {
  const violations = serverOwned.filter(
    (k) => Object.prototype.hasOwnProperty.call(payload, k) && !allow.includes(k),
  );
  if (violations.length > 0) {
    throw new Error(
      `[writable-fields] Refusing to write server-owned column(s) on ${table}: ` +
        `${violations.join(", ")}. Build the payload with pickWritable(), or, if the ` +
        `SERVER computes the value, name the column in the call's allowServerOwned.`,
    );
  }
}
