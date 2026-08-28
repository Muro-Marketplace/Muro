// Server-only persistence for in-flight cart data. Replaces Stripe
// metadata as the data-of-record so we can carry full cart contents
// (images, dimensions, source/venue refs) without the 500-char cap.

import { getSupabaseAdmin } from "./supabase-admin";

export interface SavedCart {
  cart: unknown[];
  shipping: Record<string, unknown>;
  source: string | null;
  venueSlug: string | null;
  artistSlugs: string[] | null;
  expectedSubtotalPence: number | null;
  expectedShippingPence: number | null;
  /**
   * artistSlug -> shipping pence for that artist's group (E9, migration 082).
   * calculateOrderShipping() computes this per artist and only the total used to
   * survive, so the webhook pooled postage onto the first artist. `{}` for rows
   * written before 082, which buildArtistLegs handles by pro-rata split.
   */
  artistShippingPence: Record<string, number>;
}

export interface SaveInput {
  stripeSessionId: string;
  cart: unknown[];
  shipping: Record<string, unknown>;
  source: string;
  venueSlug: string;
  artistSlugs: string[];
  expectedSubtotalPence: number;
  expectedShippingPence: number;
  artistShippingPence: Record<string, number>;
}

export async function saveCartSession(input: SaveInput): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("cart_sessions").insert({
    stripe_session_id: input.stripeSessionId,
    cart: input.cart,
    shipping: input.shipping,
    source: input.source,
    venue_slug: input.venueSlug || null,
    artist_slugs: input.artistSlugs.length > 0 ? input.artistSlugs : null,
    expected_subtotal_pence: input.expectedSubtotalPence,
    expected_shipping_pence: input.expectedShippingPence,
    artist_shipping_pence: input.artistShippingPence,
  });
  if (error) {
    console.error("[cart-sessions] save failed:", error);
    throw new Error("Failed to persist cart session");
  }
}

export async function loadCartSession(
  stripeSessionId: string,
): Promise<SavedCart | null> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("cart_sessions")
    .select(
      // One string literal on purpose: the typed client parses this at the type
      // level, and concatenating it collapses `data` to GenericStringError.
      "cart, shipping, source, venue_slug, artist_slugs, expected_subtotal_pence, expected_shipping_pence, artist_shipping_pence",
    )
    .eq("stripe_session_id", stripeSessionId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  return {
    cart: Array.isArray(data.cart) ? data.cart : [],
    shipping: typeof data.shipping === "object" && data.shipping !== null ? data.shipping : {},
    source: data.source,
    venueSlug: data.venue_slug,
    artistSlugs: data.artist_slugs,
    expectedSubtotalPence: data.expected_subtotal_pence,
    expectedShippingPence: data.expected_shipping_pence,
    artistShippingPence:
      typeof data.artist_shipping_pence === "object" && data.artist_shipping_pence !== null
        ? (data.artist_shipping_pence as Record<string, number>)
        : {},
  };
}
