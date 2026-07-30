import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { checkoutSchema } from "@/lib/validations";
import { calculateOrderShipping } from "@/lib/shipping-checkout";
import { regionForCountry, isSupportedCountry, labelForCountry } from "@/lib/iso-countries";
import { findUkOnlyArtists } from "@/lib/shipping-scope";
import { isWorkSold } from "@/lib/work-stock";
import { verifyQrAttribution } from "@/lib/qr-attribution-token";
import { saveCartSession } from "@/lib/cart-sessions";
import { canReceivePayout } from "@/lib/payouts/capability";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemoStrict } from "@/lib/demo-guard";
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
  // E46c: the uplift is resolved from here, server-side, instead of trusting the
  // client's framed total. Real jsonb column; 6 of 35 live works carry frames.
  frame_options: Array<{
    label: string;
    priceUplift: number;
    pricesBySize?: Record<string, number> | null;
  }> | null;
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
    // D10: never trust a raw venueSlug for revenue attribution. A real slug for a
    // venue where the artist holds an active placement moves the venue's share out
    // of the artist's net, so a venue operator could divert an artist's money on a
    // sale that never came through their QR. The QR redirect mints a signed token
    // binding the venue to the scanned artist; honour it only when that artist is
    // in the cart.
    //
    // The bare venueSlug is still accepted as a backward-compat fallback for QR
    // codes printed before the token existed, UNLESS QR_ATTRIBUTION_ENFORCE=1. The
    // fallback is the transition the plan calls for; flipping enforcement on is
    // what actually closes the hole once old codes have aged out (owner decision).
    let venueSlug = "";
    const attributionToken = parsed.data.venueAttributionToken;
    if (attributionToken) {
      try {
        const claim = await verifyQrAttribution(attributionToken);
        const cartArtistSlugs = new Set(items.map((i) => (i.artistSlug || "").toLowerCase()));
        if (cartArtistSlugs.has(claim.artistSlug.toLowerCase())) {
          venueSlug = claim.venueSlug;
        } else {
          console.warn("[checkout] venue attribution token artist not in cart", {
            claimArtist: claim.artistSlug,
          });
        }
      } catch (err) {
        console.warn("[checkout] rejected venue attribution token", { err: String(err) });
      }
    } else if (process.env.QR_ATTRIBUTION_ENFORCE !== "1") {
      venueSlug = parsed.data.venueSlug || "";
    }
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
        // E23a. Guarded only inside the authenticated branch, because guest
        // checkout is supported and an anonymous caller has no id to test. A
        // demo session reaching Stripe would take real money, so this is the
        // strict variant.
        const demoBlocked = assertNotDemoStrict(auth.user.id);
        if (demoBlocked) return demoBlocked;
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
        .select("id, available, quantity_available, pricing, title, frame_options")
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
      // Shared with the offer checkout since D7, so the two paths cannot drift
      // on what "sold" means.
      if (isWorkSold(row)) {
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
    // E46c (06 B6). The frame uplift used to be fully client-trusted.
    //
    // Framed lines carry size "<base> + <frame label>", which never matches a DB
    // pricing tier (tiers are bare base sizes), so the line-item builder found no
    // tier and kept the CLIENT's price. The only guard was a floor at the bare
    // unframed price, which meant a buyer could post the base price for a framed
    // piece and get the frame free: DB tier £100 plus an £85 oak frame, charged
    // £100. The old comment here called that a "residual risk"; it was an open
    // hole with a warn log next to it.
    //
    // Now the server computes the whole number from the work's own row:
    //   base tier price + (frame.pricesBySize[tier] ?? frame.priceUplift)
    // and the client's figure is never used for a framed line. Frame identity
    // comes from the new frameLabel field, falling back to splitting `size` on
    // " + " so carts already in localStorage keep working with no migration
    // window.
    //
    // This retires the price_below_base special case: the server owns the number,
    // so a mismatch is a corrected charge plus a warn, exactly as unframed lines
    // already behave.
    const unresolvableFramed = (workId: string) =>
      NextResponse.json(
        {
          error: "This framed item's price could not be verified. Please refresh your cart and try again.",
          code: "size_label_unresolvable",
          workId,
        },
        { status: 409 },
      );

    /** workId -> server-computed unit price in pence, for framed lines only. */
    const framedPence = new Map<string, number>();

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

      // Frame identity: explicit field first, then the legacy " + " split.
      const rawLabel =
        item.frameLabel ??
        (typeof item.size === "string" ? item.size.split(" + ")[1] : "") ??
        "";
      const frameLabel = rawLabel.trim().toLowerCase();
      const frame = (row.frame_options ?? []).find(
        (f) => typeof f?.label === "string" && f.label.trim().toLowerCase() === frameLabel,
      );
      // A framed line naming a frame the artist does not offer is refused rather
      // than charged at the client's number.
      if (!frameLabel || !frame || typeof frame.priceUplift !== "number") {
        return unresolvableFramed(item.workId);
      }

      const sizeOverride = frame.pricesBySize?.[dbBaseTier.label];
      const uplift = typeof sizeOverride === "number" ? sizeOverride : frame.priceUplift;
      if (!Number.isFinite(uplift) || uplift < 0) {
        return unresolvableFramed(item.workId);
      }

      const serverPence = Math.round((dbBaseTier.price + uplift) * 100);
      framedPence.set(item.workId, serverPence);

      const clientPence = Math.round(item.price * 100);
      if (clientPence !== serverPence) {
        console.warn("[checkout] framed line price corrected", {
          workId: item.workId,
          clientPence,
          serverPence,
        });
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
            // E46c: the server-computed price, set above. Never item.price.
            const server = item.workId ? framedPence.get(item.workId) : undefined;
            if (typeof server === "number") unitPence = server;
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
    const payoutDb = getSupabaseAdmin();
    const checks = await Promise.all(
      uniqueArtistSlugs.map(async (slug) => ({
        slug,
        ok: (await canReceivePayout(payoutDb, { kind: "artist", slug })).ok,
      })),
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
    const { totalShipping, artistGroups } = calculateOrderShipping(
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
      // E9: per-artist postage, so the webhook can pay each artist for the parcel
      // they actually post instead of pooling it onto the first one.
      artistShippingPence: Object.fromEntries(
        artistGroups.map((g) => [g.artistSlug.toLowerCase(), Math.round(g.shipping * 100)]),
      ),
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
