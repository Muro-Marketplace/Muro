// The two people an order belongs to, resolved once.
//
// 09 §D.1 and §D.2 both need "email both parties of this order", and both would
// otherwise have hand-rolled it: read the buyer off `buyer_email`, look the
// artist's auth user up by `artist_user_id`, dig a first name out of the
// shipping blob. Two copies of that is two chances to email one side and not the
// other, which on a dispute is the difference between a fair process and a
// silent one.

import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderPartyRole = "buyer" | "artist";

export interface OrderParty {
  role: OrderPartyRole;
  email: string;
  userId: string | null;
  firstName: string;
}

/** The order columns this needs. Deliberately minimal. */
export interface OrderPartySource {
  id: string;
  buyer_email?: string | null;
  buyer_user_id?: string | null;
  artist_user_id?: string | null;
  artist_slug?: string | null;
  shipping?: unknown;
}

/** "fin-coles" -> "Fin Coles". Empty for an empty slug. */
function deSlug(slug: string | null | undefined): string {
  return (slug ?? "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function firstNameFrom(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.split(" ")[0] || fallback;
}

/**
 * Both parties, in a stable order (buyer first), skipping any without an
 * address.
 *
 * A party with no email is DROPPED rather than faked, and the caller can see the
 * length: a guest-checkout order with no artist attributed (the D4 signature) has
 * one party, and pretending otherwise would mean a dispute where only one side is
 * ever told.
 */
export async function orderParties(
  db: SupabaseClient,
  order: OrderPartySource,
): Promise<OrderParty[]> {
  const parties: OrderParty[] = [];

  const shippingName = (order.shipping as { fullName?: string } | null)?.fullName ?? null;

  if (order.buyer_email) {
    parties.push({
      role: "buyer",
      email: order.buyer_email,
      userId: order.buyer_user_id ?? null,
      firstName: firstNameFrom(shippingName, order.buyer_email.split("@")[0] || "there"),
    });
  }

  if (order.artist_user_id) {
    const [{ data: authUser }, { data: profile }] = await Promise.all([
      db.auth.admin.getUserById(order.artist_user_id),
      db
        .from("artist_profiles")
        .select("name")
        .eq("user_id", order.artist_user_id)
        .maybeSingle<{ name: string | null }>(),
    ]);
    const email = authUser?.user?.email ?? null;
    if (email) {
      parties.push({
        role: "artist",
        email,
        userId: order.artist_user_id,
        // Owner-reported 2026-08-30: never fall back to the slug in an email
        // greeting. "Hi fin-coles" is worse than "Hi there", and the slug is a
        // lookup key rather than anything the person calls themselves.
        // Passing the de-slugged name as the VALUE, not the fallback, so it
        // goes through the same first-word logic: the greeting wants "Maya",
        // not "Maya Chen", and certainly not "maya-chen".
        firstName: firstNameFrom(profile?.name || deSlug(order.artist_slug), "there"),
      });
    }
  }

  return parties;
}
