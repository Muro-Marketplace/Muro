import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { checkoutSchema } from "@/lib/validations";
import { calculateOrderShipping } from "@/lib/shipping-checkout";
import { regionForCountry, isSupportedCountry, labelForCountry } from "@/lib/iso-countries";
import { findUkOnlyArtists } from "@/lib/shipping-scope";
import { saveCartSession } from "@/lib/cart-sessions";
import { canArtistAcceptOrders } from "@/lib/stripe-connect-status";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Fulfilment method narrowed to ship | collection. Earlier revisions
// also handled "digital", but the validations schema never accepted it
// and no client emits it, so the branch was dead code (G2-15 follow-up).
type FulfilmentMethod = "ship" | "collection";

/** Row shape we need for cart re-validation. Narrow on purpose, the
 *  table has many more columns we never read here. */
type WorkRow = {
  id: string;
  available: boolean | null;
  quantity_available: number | null;
  pricing: Array<{ label: string; price: number }> | null;
  title: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Cart items and shipping required" }, { status: 400 });
    }

    const { items, shipping, fulfilmentMethod: rawFulfilment } = parsed.data;
    // The schema now narrows fulfilmentMethod to "ship" | "collection";
    // the cast is defensive against a future schema widening.
    const fulfilmentMethod: FulfilmentMethod =
      rawFulfilment === "collection" ? "collection" : "ship";
    // Task 1 review-deferred follow-up: read the metadata fields off
    // `parsed.data` rather than the raw `body`, so they go through the
    // same trim + cap as the rest of the schema-validated input.
    const source = parsed.data.source || "direct";
    const venueSlug = parsed.data.venueSlug || "";
    const collectionNotes = parsed.data.collectionNotes || "";
    const expectedShippingCost = parsed.data.expectedShippingCost;

    // Self-purchase guard. Auth is optional (guest checkout still
    // allowed). If the caller IS authenticated and is the artist behind
    // any cart item, refuse — money would cycle through Stripe Connect
    // and the platform would skim a fee from the artist's own card.
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      const auth = await getAuthenticatedUser(request);
      if (auth.user) {
        const db = getSupabaseAdmin();
        const { data: artistProfile } = await db
          .from("artist_profiles")
          .select("slug")
          .eq("user_id", auth.user.id)
          .single();
        if (artistProfile?.slug) {
          const conflict = items.some(
            (it) => (it.artistSlug || "").toLowerCase() === artistProfile.slug.toLowerCase(),
          );
          if (conflict) {
            return NextResponse.json(
              { error: "You can't purchase your own work." },
              { status: 403 },
            );
          }
        }
      }
    }

    // Plan G2 Task 2 (G2-15): re-validate the cart against the DB
    // before minting a Stripe session. localStorage-persisted carts
    // can carry stale prices for works the artist re-priced, marked
    // sold, or deleted. Without this gate the route trusts the
    // client-supplied price and Stripe gets billed for the wrong
    // amount. We:
    //   1. Look up every workId-bearing line in artist_works.
    //   2. Reject (409) if any row is missing, marked unavailable, or
    //      out of stock — the cart UI surfaces the offending workId
    //      so it can be removed and the buyer re-tries.
    //   3. Recompute the per-line `unit_amount` from the DB's
    //      `pricing` JSON (matched to the cart's selected size label),
    //      so a stale client price is silently corrected to today's
    //      DB value.
    // Cart lines without a workId (legacy carts, collections) skip
    // re-validation; the longer-term fix is to require workId/
    // collectionId on every cart line, tracked separately.
    const workIds = items
      .map((it) => it.workId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const workById = new Map<string, WorkRow>();
    if (workIds.length > 0) {
      const { data: rows, error: worksErr } = await getSupabaseAdmin()
        .from("artist_works")
        .select("id, available, quantity_available, pricing, title")
        .in("id", workIds);
      if (worksErr) {
        console.error("[checkout] cart re-validation lookup failed:", worksErr);
        return NextResponse.json(
          { error: "Couldn't validate your cart, please try again." },
          { status: 500 },
        );
      }
      for (const row of (rows || []) as WorkRow[]) {
        workById.set(row.id, row);
      }
    }

    for (const line of items) {
      // Skip lines without a workId. Collections (collectionId) and
      // legacy carts fall through here; they're not the G2-15 risk
      // surface (no per-size DB price drift to correct).
      if (!line.workId) continue;
      const row = workById.get(line.workId);
      if (!row) {
        return NextResponse.json(
          {
            error: `"${line.title}" is no longer available. Please remove it from your cart.`,
            code: "work_unavailable",
            workId: line.workId,
          },
          { status: 409 },
        );
      }
      const sold =
        row.available === false ||
        (typeof row.quantity_available === "number" && row.quantity_available <= 0);
      if (sold) {
        return NextResponse.json(
          {
            error: `"${row.title || line.title}" has just been sold.`,
            code: "work_sold",
            workId: line.workId,
          },
          { status: 409 },
        );
      }
    }

    // Build Stripe line items from cart. For each line with a known
    // DB row we use the DB's price for the matching size; for legacy
    // lines without a workId (or where the size label doesn't match
    // any pricing entry, e.g. "Original" for in-store buy) we fall
    // back to the client price. The size-match is intentionally case-
    // insensitive — labels in the cart may differ in casing from the
    // DB ("8x10" vs "8X10"), and we'd rather charge the DB price than
    // refuse to checkout because of a cosmetic mismatch.
    //
    // Frame uplift edge case: cart lines for framed orders carry size
    // "<base> + <frame label>" which won't match any DB pricing tier
    // (DB tiers are bare base sizes). For these lines:
    // - Availability gate (sold/deleted/out-of-stock) STILL fires — the
    //   workId lookup is size-independent.
    // - Price-recompute is partial: we parse the base size, look up the
    //   base tier, and reject 409 ("price_below_base") if the client's
    //   total is below the DB base. Above-base lines fall back to the
    //   client price for unit_amount and emit a warn log so we can
    //   observe how often the fallback runs.
    // Residual risk: the frame UPLIFT itself remains fully client-trusted
    // for resolvable lines — a buyer can obtain the frame at or below cost
    // (down to the bare base price). Fully closing this gap requires
    // server-side uplift resolution (either carrying frame identity on the
    // cart line or resolving the uplift from a server-held price table).
    // Full price-correction for framed lines requires either parsing the
    // uplift server-side or carrying frame identity on the cart line.
    const unresolvableFramed = (workId: string) =>
      NextResponse.json(
        {
          error: "This framed item's price could not be verified. Please refresh your cart and try again.",
          code: "size_label_unresolvable",
          workId,
        },
        { status: 409 },
      );
    for (const item of items) {
      if (!item.workId) continue;
      const isFramedLine = item.framed === true || (typeof item.size === "string" && item.size.includes(" + "));
      if (!isFramedLine) continue;
      const row = workById.get(item.workId);
      if (!row?.pricing || !Array.isArray(row.pricing)) {
        return unresolvableFramed(item.workId);
      }
      const baseSize = typeof item.size === "string" ? item.size.split(" + ")[0] : "";
      if (!baseSize) {
        return unresolvableFramed(item.workId);
      }
      const dbBaseTier = row.pricing.find(
        (p) => p?.label?.toLowerCase?.() === baseSize.toLowerCase(),
      );
      if (!dbBaseTier || typeof dbBaseTier.price !== "number" || dbBaseTier.price <= 0) {
        return unresolvableFramed(item.workId);
      }
      if (item.price < dbBaseTier.price) {
        return NextResponse.json(
          {
            error: `"${row.title || item.title}" has been re-priced. Please refresh your cart.`,
            code: "price_below_base",
            workId: item.workId,
          },
          { status: 409 },
        );
      }
    }

    const lineItems = items.map((item) => {
      const row = item.workId ? workById.get(item.workId) : undefined;
      let unitPence = Math.round(item.price * 100);
      if (row?.pricing && Array.isArray(row.pricing)) {
        const dbTier = row.pricing.find(
          (p) => p?.label?.toLowerCase?.() === item.size?.toLowerCase?.(),
        );
        if (dbTier && typeof dbTier.price === "number" && dbTier.price > 0) {
          unitPence = Math.round(dbTier.price * 100);
          if (unitPence !== Math.round(item.price * 100)) {
            console.warn("[checkout] price drift corrected", {
              workId: item.workId,
              clientPence: Math.round(item.price * 100),
              dbPence: unitPence,
            });
          }
        } else {
          // No DB tier matched — for framed lines this is the expected
          // path (size has " + <frame>" suffix). The above floor check
          // already guarded against an artist re-pricing the base down;
          // here we just observe how often we fall back to the client
          // price so we can prioritise the full server-side uplift fix.
          const isFramedLine = item.framed === true || (typeof item.size === "string" && item.size.includes(" + "));
          if (isFramedLine) {
            const baseSize = typeof item.size === "string" ? item.size.split(" + ")[0] : "";
            const dbBaseTier = baseSize
              ? row.pricing.find((p) => p?.label?.toLowerCase?.() === baseSize.toLowerCase())
              : undefined;
            if (dbBaseTier && typeof dbBaseTier.price === "number") {
              console.warn("[checkout] framed line uses client price", {
                workId: item.workId,
                clientPence: Math.round(item.price * 100),
                dbBasePence: Math.round(dbBaseTier.price * 100),
              });
            }
          }
        }
      }
      return {
        price_data: {
          currency: "gbp",
          product_data: {
            name: item.title,
            description: `${item.artistName}, ${item.size}`,
            ...(item.image && !item.image.startsWith("data:") ? { images: [item.image] } : {}),
          },
          unit_amount: unitPence,
        },
        quantity: item.quantity,
      };
    });

    // Cart-level shipping via the shared helper. Uses the same per-artist
    // consolidation rule (largest piece full + 50% per additional) as the
    // checkout display page, so the £ shown to the buyer matches what
    // Stripe charges to the card. Before this, the API used a flat
    // (item.shippingPrice ?? 9.95) * quantity calc and could produce a
    // different total, the £80.49 vs £79.94 mismatch.
    if (!isSupportedCountry(shipping.country)) {
      return NextResponse.json(
        { error: `We don't ship to ${shipping.country} yet.` },
        { status: 400 },
      );
    }
    const region = regionForCountry(shipping.country);

    // G-C / Bug 10: the check above is the platform's supported-country list,
    // not the artist's scope, so it let a buyer pay for delivery to a country
    // the artist had never agreed to ship to while the artwork page they bought
    // from said "Ships to UK only". Scope is read from the database inside
    // findUkOnlyArtists, never from the cart, and fails closed. Collection
    // involves no delivery, so it is exempt.
    if (region !== "uk" && fulfilmentMethod === "ship") {
      const ukOnly = await findUkOnlyArtists(items.map((i) => i.artistSlug || ""));
      if (ukOnly.length > 0) {
        const destination = labelForCountry(shipping.country);
        const named = items.find(
          (i) => (i.artistSlug || "").trim().toLowerCase() === ukOnly[0],
        );
        return NextResponse.json(
          {
            error: "shipping_scope",
            message:
              ukOnly.length === 1
                ? `${named?.artistName || "This artist"} ships to the UK only, so we can't deliver to ${destination}.`
                : `${ukOnly.length} artists in this cart ship to the UK only, so we can't deliver to ${destination}.`,
            ukOnly,
          },
          { status: 400 },
        );
      }
    }

    // Pre-flight Stripe Connect status — refuse to mint a session if any
    // artist in the cart isn't charges_enabled. Without this, money lands
    // in Stripe but can't be paid out (escrow) until KYC completes.
    const uniqueArtistSlugs = [...new Set(items.map((i) => i.artistSlug || "").filter(Boolean))];
    const checks = await Promise.all(
      uniqueArtistSlugs.map(async (slug) => ({ slug, ok: await canArtistAcceptOrders(slug) })),
    );
    const blocked = checks.filter((c) => !c.ok).map((c) => c.slug);
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error:
            blocked.length === 1
              ? `${blocked[0]} isn't ready to take orders yet. Try again in a few minutes.`
              : `${blocked.length} artists in this cart aren't ready to take orders yet.`,
          blocked,
        },
        { status: 422 },
      );
    }
    const { totalShipping } = calculateOrderShipping(
      items.map((it) => ({
        artistSlug: it.artistSlug || "",
        artistName: it.artistName || "Artist",
        shippingPrice: it.shippingPrice ?? null,
        internationalShippingPrice: it.internationalShippingPrice ?? null,
        dimensions: it.dimensions || null,
        framed: it.framed ?? false,
        price: it.price,
        quantity: it.quantity,
      })),
      region,
    );

    // Defensive divergence check, the frontend passes the figure it
    // computed; if the API computes something different, we trust the
    // API's number (it's the one Stripe sees) but log a warning so we
    // can chase any data drift.
    if (typeof expectedShippingCost === "number" &&
        Math.abs(expectedShippingCost - totalShipping) > 0.01) {
      console.warn("[checkout] shipping divergence", {
        expected: expectedShippingCost,
        computed: totalShipping,
      });
    }

    // Collection skips shipping costs by definition — buyer
    // picks up from the artist (or the work is intangible).
    if (totalShipping > 0 && fulfilmentMethod === "ship") {
      lineItems.push({
        price_data: {
          currency: "gbp",
          product_data: {
            name: "Shipping",
            description: "Delivery costs set by artist",
          },
          unit_amount: Math.round(totalShipping * 100),
        },
        quantity: 1,
      });
    }

    // Prefer the caller's origin so local dev redirects back to
    // localhost instead of hitting the production domain. Fall back to
    // the configured site URL (set on Vercel) and finally localhost for
    // completeness. NEXT_PUBLIC_SITE_URL can be pinned to production
    // via env to stop spoofing in server-to-server callers that don't
    // set Origin.
    const requestOrigin = request.headers.get("origin");
    const origin = requestOrigin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const artistSlugs = [...new Set(items.map((i) => i.artistSlug || "").filter(Boolean))];
    // Subtotal is computed off the DB-corrected line items so the saved
    // expected_subtotal_pence on cart_sessions can never be a stale
    // client number.
    const subtotalPence = lineItems
      .filter((li) => li.price_data?.product_data?.name !== "Shipping")
      .reduce((sum, li) => sum + (li.price_data?.unit_amount ?? 0) * (li.quantity ?? 1), 0);

    // Create Stripe Checkout Session. Metadata is intentionally slim —
    // full cart + shipping live in cart_sessions (Plan B Task 6). Stripe
    // caps each metadata value at 500 chars, which used to truncate
    // large carts; that's no longer a constraint here.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      customer_email: shipping.email,
      metadata: {
        kind: "cart_checkout",
        source,
        venue_slug: venueSlug,
        artist_slugs: artistSlugs.join(","),
        fulfilment_method: fulfilmentMethod,
      },
      success_url: `${origin}/checkout/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
    });

    // Persist the full cart server-side so the webhook + confirmation
    // page have the un-truncated payload available. Failure here is
    // fatal — without the row, the webhook can't process the order.
    await saveCartSession({
      stripeSessionId: session.id,
      cart: items,
      shipping: { ...shipping, fulfilmentMethod, collectionNotes },
      source,
      venueSlug,
      artistSlugs,
      expectedSubtotalPence: subtotalPence,
      expectedShippingPence: Math.round(totalShipping * 100),
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
