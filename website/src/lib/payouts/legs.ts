// Turns a cart into one payout leg per artist (E9, 04 §B2 + §C2).
//
// The webhook used to compute ONE fee tier from the first artist's plan, pool
// every artist's money into one `artistRevenue`, and schedule ONE transfer to the
// first artist. In a two-artist cart that pays artist A the money owed to artist
// B, and charges B's sale at A's plan rate.
//
// Everything here is integer pence. The doc's version carries GBP floats and
// converts back with `Math.round(l.netGbp * 100)` at every use site, which is a
// rounding-drift generator; pence is the single source of truth and `penceToGbp`
// exists for the order columns, which are numeric GBP.

import type { SupabaseClient } from "@supabase/supabase-js";
import { platformFeePercentForArtist } from "@/lib/platform-fee";

export interface CartLine {
  artistSlug?: string;
  price?: number;
  qty?: number;
  quantity?: number;
}

export interface ArtistLeg {
  artistSlug: string;
  artistUserId: string;
  /** Artwork value for this artist, before any deduction. */
  grossPence: number;
  /** Venue revenue share taken from this artist's lines. */
  venueCutPence: number;
  platformFeePercent: number;
  platformFeePence: number;
  /** Shipping attributed to this artist's group. Not fee-bearing. */
  shippingPence: number;
  /** gross - venueCut - platformFee + shipping. What we transfer. */
  netPence: number;
}

export const penceToGbp = (pence: number): number => pence / 100;

/** Line value in pence. Prices are GBP floats in the cart payload. */
function linePence(item: CartLine): number {
  const qty = Number(item.qty ?? item.quantity ?? 1);
  return Math.round((item.price || 0) * 100) * (Number.isFinite(qty) ? qty : 1);
}

/**
 * Attribute the shipping actually charged across the legs, exactly.
 *
 * `byArtistSlug` comes from `calculateOrderShipping().artistGroups`, persisted on
 * cart_sessions by the checkout route. Three cases have to work:
 *
 *  - Sums to the charged total: use it as-is, which is the normal path.
 *  - Sums to LESS: a session created before migration 082 has no per-artist
 *    figures at all, so the residual is split pro rata by artwork value. Without
 *    this, every in-flight cart would silently hand its shipping to the platform.
 *  - Sums to MORE: a collection order charges no shipping (`total - subtotal` is
 *    0) while the map still holds what postage would have cost, so it scales
 *    down. Without this the artists would be paid shipping the buyer never paid.
 *
 * The remainder penny goes to the largest gross, ties broken by slug, so the
 * result is deterministic across webhook replays.
 */
function allocateShipping(
  grossBySlug: Map<string, number>,
  byArtistSlug: Record<string, number>,
  totalPence: number,
): Map<string, number> {
  const slugs = [...grossBySlug.keys()];
  const out = new Map<string, number>();
  if (slugs.length === 0) return out;

  const named = slugs.map((s) => Math.max(0, Math.round(byArtistSlug[s] ?? 0)));
  const namedSum = named.reduce((a, b) => a + b, 0);
  const grossSum = slugs.reduce((s, slug) => s + (grossBySlug.get(slug) ?? 0), 0);

  if (namedSum > totalPence) {
    // Scale down proportionally. totalPence of 0 zeroes every leg.
    slugs.forEach((slug, i) => {
      out.set(slug, namedSum === 0 ? 0 : Math.floor((named[i] * totalPence) / namedSum));
    });
  } else {
    const residual = totalPence - namedSum;
    slugs.forEach((slug, i) => {
      const share =
        grossSum === 0
          ? Math.floor(residual / slugs.length)
          : Math.floor((residual * (grossBySlug.get(slug) ?? 0)) / grossSum);
      out.set(slug, named[i] + share);
    });
  }

  // Hand the rounding remainder to the largest gross so the sum is exact.
  const drift = totalPence - slugs.reduce((s, slug) => s + (out.get(slug) ?? 0), 0);
  if (drift !== 0) {
    const anchor = [...slugs].sort(
      (a, b) => (grossBySlug.get(b) ?? 0) - (grossBySlug.get(a) ?? 0) || a.localeCompare(b),
    )[0];
    out.set(anchor, (out.get(anchor) ?? 0) + drift);
  }
  return out;
}

export async function buildArtistLegs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Pick<SupabaseClient<any, any, any>, "from">,
  input: {
    cartItems: CartLine[];
    /** artistSlug -> { id, revenue_share_percent }, from the placements lookup. */
    placementByArtistSlug: Map<string, { id: string; revenue_share_percent: number }>;
    /** artistSlug -> shipping pence, persisted on cart_sessions by the checkout. */
    artistShippingPence: Record<string, number>;
    /** Shipping actually charged, i.e. amount_total - subtotal, in pence. */
    shippingTotalPence: number;
  },
): Promise<ArtistLeg[]> {
  // 1. Aggregate artwork value per artist. Two lines from the same artist must
  //    become ONE leg: stripe_transfers is UNIQUE on (order_id,
  //    recipient_user_id), so a second leg for the same artist would be dropped
  //    by the index and that artist would be underpaid.
  const grossBySlug = new Map<string, number>();
  for (const item of input.cartItems) {
    const slug = (item.artistSlug || "").toLowerCase();
    if (!slug) continue;
    grossBySlug.set(slug, (grossBySlug.get(slug) ?? 0) + linePence(item));
  }
  const slugs = [...grossBySlug.keys()];
  if (slugs.length === 0) return [];

  // 2. One round trip for every artist's plan and user id.
  //
  //    NOT `free_until`: §C2's version selects it, but that column exists in no
  //    migration and not in the live table, so PostgREST would reject this
  //    statement whole, `profiles` would be null, every slug would land in
  //    `missing` below, and this would throw on EVERY multi-artist cart. The real
  //    column is `trial_end` (D17.1), which is what platformFeePercentForArtist
  //    reads.
  const { data: profiles, error } = await db
    .from("artist_profiles")
    .select("user_id, slug, subscription_plan, trial_end")
    .in("slug", slugs);
  if (error) throw new Error(`buildArtistLegs: profile lookup failed: ${error.message}`);

  type ProfileRow = {
    user_id: string;
    slug: string;
    subscription_plan: string | null;
    trial_end: string | null;
  };
  const bySlug = new Map<string, ProfileRow>(
    ((profiles || []) as ProfileRow[]).map((p) => [(p.slug || "").toLowerCase(), p]),
  );

  // Every artist in the cart must resolve. A missing profile means we cannot pay
  // someone, which must abort rather than silently pool their money into another
  // artist's leg, which is the bug this whole module exists to remove.
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    throw new Error(`buildArtistLegs: no artist_profiles rows for ${missing.join(", ")}`);
  }

  const shippingBySlug = allocateShipping(
    grossBySlug,
    input.artistShippingPence || {},
    Math.max(0, Math.round(input.shippingTotalPence)),
  );

  return slugs.map((slug) => {
    const profile = bySlug.get(slug)!;
    const grossPence = grossBySlug.get(slug) ?? 0;
    const venuePct = input.placementByArtistSlug.get(slug)?.revenue_share_percent ?? 0;
    const venueCutPence = Math.round(grossPence * (venuePct / 100));
    const platformFeePercent = platformFeePercentForArtist(profile);
    const platformFeePence = Math.round(grossPence * (platformFeePercent / 100));
    const shippingPence = shippingBySlug.get(slug) ?? 0;
    return {
      artistSlug: slug,
      artistUserId: profile.user_id,
      grossPence,
      venueCutPence,
      platformFeePercent,
      platformFeePence,
      shippingPence,
      netPence: grossPence - venueCutPence - platformFeePence + shippingPence,
    };
  });
}

/**
 * Reconcile the split against what Stripe actually collected.
 *
 * Returns the platform fee to persist. Any residual lands on the platform fee,
 * never on a recipient: the alternatives are paying someone money that was not
 * collected, or throwing, which would abandon an order the buyer has already paid
 * for. A residual larger than a penny per leg means something structural (a cart
 * line with no artistSlug, for instance), so it is logged rather than absorbed
 * quietly.
 */
export function reconcilePlatformFee(args: {
  totalPence: number;
  venuePence: number;
  legs: ArtistLeg[];
  intendedFeePence: number;
  orderId?: string;
}): number {
  const legsPence = args.legs.reduce((s, l) => s + l.netPence, 0);
  const residual = args.totalPence - args.venuePence - legsPence - args.intendedFeePence;
  if (residual !== 0 && Math.abs(residual) > Math.max(1, args.legs.length)) {
    console.warn("[payouts] split residual larger than rounding, absorbed by the platform fee", {
      orderId: args.orderId,
      residual,
      totalPence: args.totalPence,
      venuePence: args.venuePence,
      legsPence,
      intendedFeePence: args.intendedFeePence,
    });
  }
  return args.intendedFeePence + residual;
}

/** Throws unless the split reconciles exactly. Call before writing anything. */
export function assertLegsReconcile(args: {
  totalPence: number;
  venuePence: number;
  platformFeePence: number;
  legs: ArtistLeg[];
}): void {
  const legsPence = args.legs.reduce((s, l) => s + l.netPence, 0);
  const sum = args.venuePence + args.platformFeePence + legsPence;
  if (sum !== args.totalPence) {
    throw new Error(
      `payout split does not reconcile: legs=${legsPence} venue=${args.venuePence} ` +
        `fee=${args.platformFeePence} sum=${sum} total=${args.totalPence}`,
    );
  }
}
