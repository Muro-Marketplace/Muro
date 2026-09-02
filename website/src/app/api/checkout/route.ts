import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { checkoutSchema } from "@/lib/validations";
import { calculateOrderShipping } from "@/lib/shipping-checkout";
import { resolveLineShipping } from "@/lib/checkout-shipping-source";
import { regionForCountry, isSupportedCountry, labelForCountry } from "@/lib/iso-countries";
import { findUkOnlyArtists } from "@/lib/shipping-scope";
import { isWorkSold } from "@/lib/work-stock";
import { verifyQrAttribution } from "@/lib/qr-attribution-token";
import { saveCartSession } from "@/lib/cart-sessions";
import { canReceivePayout } from "@/lib/payouts/capability";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Fulfilment methods. Earlier revisions also handled "digital", but the
// validations schema never accepted it and no client emits it, so that branch
// was dead code (G2-15 follow-up). `collect_venue` is T9: the buyer pays online
// and picks the work up from the venue wall it hangs on.
type FulfilmentMethod = "ship" | "collection" | "collect_venue";

/** Row shape we need for cart re-validation. Narrow on purpose, the
 *  table has many more columns we never read here. */
type WorkRow = {
  id: string;
  available: boolean | null;
  quantity_available: number | null;
  pricing: Array<{ label: string; price: number; inStorePrice?: number | null; shippingPrice?: number | null }> | null;
  // A1.2. Shipping inputs, resolved server-side instead of trusting the cart.
  // See lib/checkout-shipping-source.ts for the precedence and the exploit.
  shipping_price: number | null;
  dimensions: string | null;
  title: string | null;
  // Migration 118. Work-level in-store price, the number a collect-from-venue
  // buyer is shown when the work has no per-size in-store pricing.
  in_store_price: number | null;
  available_in_store?: boolean | null;
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
    const fulfilmentMethod: FulfilmentMethod =
      rawFulfilment === "collection" || rawFulfilment === "collect_venue"
        ? rawFulfilment
        : "ship";

    // T9 (N2d). Collect-from-venue lines are CLAIMS about what is hanging
    // where, and every claim is re-validated against the live placements table
    // before any money is taken. The client's collectVenueSlug and
    // collectPlacementId prove nothing on their own — a browser console can
    // send any pair — so the placement row is the authority on venue, artist,
    // liveness and size.
    let collectVenueAddress: string | null = null;
    // Row 727. The venue slug taken from the PLACEMENT row, not from the
    // client. Set only on a collect order, where the placement is already the
    // authority on venue, artist, liveness, size and price.
    let collectVenueSlug: string | null = null;
    // 121: the placement's buy-off-the-wall price, keyed by placement id, for
    // the pricing ladder below. The PLACEMENT is the price authority for a
    // collect line; the work-level paths further down are legacy fallbacks.
    const offerByPlacementId = new Map<string, number>();
    if (fulfilmentMethod === "collect_venue") {
      const placementIds = items
        .map((i) => i.collectPlacementId)
        .filter((x): x is string => Boolean(x));
      if (placementIds.length !== items.length) {
        return NextResponse.json(
          { error: "Every item must name its collection placement." },
          { status: 400 },
        );
      }
      // One venue per collect order: a buyer cannot pick up from two bars in
      // one checkout, and the order row has one collection_address.
      const venues = new Set(items.map((i) => i.collectVenueSlug ?? ""));
      if (venues.size !== 1 || venues.has("")) {
        return NextResponse.json(
          { error: "Collection orders can only cover one venue at a time." },
          { status: 400 },
        );
      }

      const { data: places } = await getSupabaseAdmin()
        .from("placements")
        .select("id, venue_slug, artist_slug, status, collection_address, placed_size_label, in_store_price")
        .in("id", placementIds)
        .eq("status", "active");
      const byId = new Map((places || []).map((pl) => [pl.id, pl]));
      for (const line of items) {
        const pl = byId.get(line.collectPlacementId!);
        if (!pl || pl.venue_slug !== line.collectVenueSlug || pl.artist_slug !== line.artistSlug) {
          return NextResponse.json(
            {
              error: `"${line.title}" is no longer available for collection.`,
              code: "collection_unavailable",
            },
            { status: 409 },
          );
        }
        // NULL placed_size_label = not recorded = no size restriction; every
        // live placement predates the column (migration 119).
        if (pl.placed_size_label && pl.placed_size_label !== line.size) {
          return NextResponse.json(
            {
              error: `Only the ${pl.placed_size_label} of "${line.title}" is at the venue.`,
              code: "collection_size_mismatch",
            },
            { status: 409 },
          );
        }
        collectVenueAddress = pl.collection_address ?? collectVenueAddress;
        collectVenueSlug = pl.venue_slug;
        if (typeof pl.in_store_price === "number" && pl.in_store_price > 0) {
          offerByPlacementId.set(pl.id, pl.in_store_price);
        }
      }
    }
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
    //
    // D39: enforcement is a loaded gun without the signing secret. If
    // QR_ATTRIBUTION_ENFORCE=1 but ORDER_TOKEN_SECRET is unset, verifyQrAttribution
    // throws on every token and the bare-slug fallback is disabled, so `venueSlug`
    // would be "" for EVERY sale — silently zeroing every venue's revenue share on
    // the order row, the placement lookup and the venue transfer. Fail closed and
    // loud: refuse to price the sale. A 503 is recoverable in minutes; months of
    // unpaid venue shares is not.
    if (process.env.QR_ATTRIBUTION_ENFORCE === "1" && !process.env.ORDER_TOKEN_SECRET) {
      console.error(
        "[checkout] QR_ATTRIBUTION_ENFORCE=1 but ORDER_TOKEN_SECRET is unset. Refusing checkout so venue revenue shares are not silently zeroed. Set ORDER_TOKEN_SECRET before enabling enforcement.",
      );
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable due to a server configuration issue. Please try again shortly." },
        { status: 503 },
      );
    }
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
    // Row 727 / PASS2-placement-lifecycle-log. A GBP 120 off-the-wall sale
    // produced an order with placement_id NULL, venue_slug NULL,
    // venue_revenue_share_percent 0 and venue_revenue 0, and no venue transfer,
    // while the venue was emailed to say the piece had sold and would be
    // collected from them. The venue was credited nothing for the sale it
    // physically facilitated.
    //
    // The cause is the block above: `venueSlug` came only from a QR attribution
    // token or a raw client field, and an off-the-wall purchase starts on the
    // public artwork page rather than a QR scan. The webhook then filters
    // placements by `.eq("venue_slug", venueSlug)`, finds nothing, and every
    // venue figure on the order lands at zero.
    //
    // The rule is the one offer sales already follow (see the venue-share block
    // in api/offers/[id]/checkout): a work hanging on a venue's wall earns that
    // venue its placement share on ANY platform sale of the work. It does NOT
    // need the QR attribution token, because there is nothing to attribute:
    // this order names the placement, the placement has been validated above,
    // and the piece is handed over by the venue. Overriding rather than
    // defaulting is deliberate — a collect line's venue is a fact about where
    // the work is, so a QR token naming a different venue must not win.
    if (collectVenueSlug) {
      venueSlug = collectVenueSlug;
    }
    const collectionNotes = parsed.data.collectionNotes || "";
    const expectedShippingCost = parsed.data.expectedShippingCost;

    // Self-purchase guard. Auth is optional (guest checkout still
    // allowed). If the caller IS authenticated and is the artist behind
    // any cart item, refuse — money would cycle through Stripe Connect
    // and the platform would skim a fee from the artist's own card.
    // Also the only place the buyer's identity is known. orders.buyer_user_id
    // exists in the schema and was written by nothing at all: 18 production
    // orders, 0 with an id, 15 of them placed against an email that matches a
    // real account. Stripe's session metadata is the only channel from here to
    // the webhook that creates the order, so the id rides along there.
    let buyerUserId: string | null = null;
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      const auth = await getAuthenticatedUser(request);
      if (auth.user) {
        buyerUserId = auth.user.id;
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
        .select("id, available, quantity_available, pricing, title, frame_options, in_store_price, available_in_store, shipping_price, dimensions")
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
      // B28: the quantity is client-supplied and the stock decrement happens
      // after payment, so a cart asking for 5 of a 2-piece run charged for 5
      // and oversold. Finite stock caps the line here, before Stripe; a null
      // quantity_available means unlimited (migration 120).
      const qty = Number(line.quantity ?? 1);
      if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
        return NextResponse.json(
          {
            error: `Invalid quantity for "${row.title || line.title}".`,
            code: "bad_quantity",
            workId: line.workId,
          },
          { status: 400 },
        );
      }
      if (row.quantity_available != null && qty > row.quantity_available) {
        return NextResponse.json(
          {
            error: `Only ${row.quantity_available} of "${row.title || line.title}" ${row.quantity_available === 1 ? "is" : "are"} available.`,
            code: "insufficient_stock",
            workId: line.workId,
            available: row.quantity_available,
          },
          { status: 409 },
        );
      }
    }

    // Collections were the last fully client-priced line (2026-08-28 audit):
    // the server never opened artist_collections, so the bundle price on the
    // wire was the bundle price charged. Same treatment as works now: the row
    // must exist and be available, and the DB's bundle_price is the number.
    const collectionIds = items
      .map((it) => (!it.workId && it.collectionId ? it.collectionId : null))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const collectionById = new Map<string, { id: string; available: boolean | null; bundle_price: number | null; name: string | null }>();
    if (collectionIds.length > 0) {
      const { data: colRows, error: colErr } = await getSupabaseAdmin()
        .from("artist_collections")
        .select("id, available, bundle_price, name")
        .in("id", collectionIds);
      if (colErr) {
        console.error("[checkout] collection re-validation lookup failed:", colErr);
        return NextResponse.json(
          { error: "Couldn't validate your cart, please try again." },
          { status: 500 },
        );
      }
      for (const row of colRows || []) {
        collectionById.set(row.id, row);
      }
      for (const line of items) {
        if (line.workId || !line.collectionId) continue;
        const col = collectionById.get(line.collectionId);
        if (!col || col.available === false || typeof col.bundle_price !== "number" || col.bundle_price <= 0) {
          return NextResponse.json(
            {
              error: `"${line.title}" is no longer available. Please remove it from your cart.`,
              code: "collection_unavailable",
              collectionId: line.collectionId,
            },
            { status: 409 },
          );
        }
      }
    }

    // A line naming neither a work nor a collection cannot be priced from the
    // DB, so it used to ride through on the client's own number. Nothing the
    // product ships creates such a line any more; the only sources are
    // localStorage carts from before line identity existed, and hand-rolled
    // requests. Both get the same answer: refresh the cart.
    for (const line of items) {
      if (!line.workId && !line.collectionId) {
        return NextResponse.json(
          {
            error: `"${line.title}" could not be verified. Please remove it from your cart and add it again.`,
            code: "cart_line_unidentified",
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

    // 2026-08-28 audit: the client's price no longer survives to Stripe on ANY
    // line. Works price from their pricing tier (in-store tier for a
    // collect-from-venue line), framed lines from the server-computed uplift,
    // collections from bundle_price, and a line the DB cannot price is refused
    // above rather than trusted. `priceLine` returns pence, or a refusal.
    const unresolvableSize = (item: { workId?: string; size?: string; title: string }) =>
      NextResponse.json(
        {
          error: `The size "${item.size}" for "${item.title}" could not be verified. Please remove it from your cart and add it again.`,
          code: "size_label_unresolvable",
          workId: item.workId,
        },
        { status: 409 },
      );

    type CheckoutLine = (typeof items)[number];
    const priceLine = (item: CheckoutLine): number | NextResponse => {
      const clientPence = Math.round(item.price * 100);

      // Collections: DB bundle_price, validated present above.
      if (!item.workId && item.collectionId) {
        const col = collectionById.get(item.collectionId)!;
        const dbPence = Math.round((col.bundle_price as number) * 100);
        if (dbPence !== clientPence) {
          console.warn("[checkout] collection price corrected", {
            collectionId: item.collectionId,
            clientPence,
            dbPence,
          });
        }
        return dbPence;
      }

      const row = workById.get(item.workId as string)!;
      const isFramedLine =
        item.framed === true || (typeof item.size === "string" && item.size.includes(" + "));
      if (isFramedLine) {
        // E46c: the server-computed base + uplift, set in the loop above.
        const server = framedPence.get(item.workId as string);
        return typeof server === "number" ? server : unresolvableSize(item);
      }

      const tiers = Array.isArray(row.pricing) ? row.pricing : [];
      const dbTier = tiers.find(
        (t) => t?.label?.toLowerCase?.() === item.size?.toLowerCase?.(),
      );
      // QA flag B27: a line's collect CLAIM only earns the in-store price when
      // the ORDER is a collect-from-venue order, because that is the only mode
      // where the T9 placement re-validation runs. A cart whose lines say
      // collect_venue but whose order says ship would otherwise be charged the
      // cheaper in-store price for goods we then post out.
      const isCollectLine =
        item.lineFulfilment === "collect_venue" && fulfilmentMethod === "collect_venue";

      if (isCollectLine) {
        // 121: the placement's own off-the-wall offer is THE price for this
        // physical piece. The artist set it at live-on-wall; nothing the
        // client sends can move it.
        const offer = item.collectPlacementId
          ? offerByPlacementId.get(item.collectPlacementId)
          : undefined;
        if (typeof offer === "number") {
          const dbPence = Math.round(offer * 100);
          if (dbPence !== clientPence) {
            console.warn("[checkout] off-the-wall price corrected", {
              workId: item.workId, placementId: item.collectPlacementId, clientPence, dbPence,
            });
          }
          return dbPence;
        }
        // Legacy ladders below: the 120 tick box (tier price) and the pre-120
        // in-store prices, for placements that have no offer of their own yet.
        if (row.available_in_store !== true) {
          const perSize = dbTier && typeof dbTier.inStorePrice === "number" && dbTier.inStorePrice > 0
            ? dbTier.inStorePrice
            : null;
          const workLevel = typeof row.in_store_price === "number" && row.in_store_price > 0
            ? row.in_store_price
            : null;
          const legacy = perSize ?? workLevel;
          if (legacy !== null) {
            const dbPence = Math.round(legacy * 100);
            if (dbPence !== clientPence) {
              console.warn("[checkout] legacy in-store price corrected", {
                workId: item.workId, clientPence, dbPence,
              });
            }
            return dbPence;
          }
        }
        if (dbTier && typeof dbTier.price === "number" && dbTier.price > 0) {
          return Math.round(dbTier.price * 100);
        }
        return unresolvableSize(item);
      }

      if (dbTier && typeof dbTier.price === "number" && dbTier.price > 0) {
        const dbPence = Math.round(dbTier.price * 100);
        if (dbPence !== clientPence) {
          console.warn("[checkout] price drift corrected", {
            workId: item.workId,
            clientPence,
            dbPence,
          });
        }
        return dbPence;
      }

      // No tier carries this label. Until the 2026-08-28 audit the client's
      // price stood here; every line the product creates uses a real tier
      // label, so an unmatched one is a stale or forged cart.
      return unresolvableSize(item);
    };

    const pricedLines: Array<{ item: CheckoutLine; unitPence: number }> = [];
    for (const item of items) {
      const priced = priceLine(item);
      if (priced instanceof NextResponse) return priced;
      pricedLines.push({ item, unitPence: priced });
    }

    const lineItems = pricedLines.map(({ item, unitPence }) => {
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

    // A1.2. International shipping is an artist-level setting, so it is read
    // from artist_profiles rather than from whatever the cart claimed. Only
    // international orders read it, so UK orders, which are nearly all of
    // them, do not pay for the round trip.
    const artistShippingBySlug = new Map<string, { international_shipping_price: number | null }>();
    if (region !== "uk" && uniqueArtistSlugs.length > 0) {
      const { data: shipRows, error: shipErr } = await payoutDb
        .from("artist_profiles")
        .select("slug, international_shipping_price")
        .in("slug", uniqueArtistSlugs);
      if (shipErr) {
        // Fail closed. Continuing here would silently drop back to the cart's
        // own international figure, which is the value this is replacing.
        console.error("[checkout] artist shipping lookup failed:", shipErr);
        return NextResponse.json(
          { error: "Couldn't work out delivery for your order, please try again." },
          { status: 500 },
        );
      }
      for (const row of shipRows || []) {
        artistShippingBySlug.set(row.slug, {
          international_shipping_price: row.international_shipping_price ?? null,
        });
      }
    }
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
    // A1.2 (production pass, 2026-08-30). Every money input below used to come
    // straight off the request body. A cart posted with `shippingPrice: 0`
    // minted a live Stripe session for £49.99 against an honest £53.49, with
    // no shipping line at all. Item prices were already re-priced from the
    // database, which is why forging those did nothing; shipping was the one
    // that was still trusted. `price` here is the re-priced figure too, since
    // it drives both the dimensional estimate and the order-level signature
    // threshold. `framed` stays client-supplied: it is a genuine buyer choice,
    // and its price uplift is already resolved server-side from frame_options.
    const { totalShipping, artistGroups } = calculateOrderShipping(
      pricedLines.map(({ item: it, unitPence }) => {
        const work = it.workId ? workById.get(it.workId) : null;
        const resolved = resolveLineShipping({
          work,
          artist: artistShippingBySlug.get(it.artistSlug || "") ?? null,
          sizeLabel: it.size,
          fallback: {
            shippingPrice: it.shippingPrice ?? null,
            internationalShippingPrice: it.internationalShippingPrice ?? null,
            dimensions: it.dimensions || null,
          },
        });
        return {
          artistSlug: it.artistSlug || "",
          artistName: it.artistName || "Artist",
          shippingPrice: resolved.shippingPrice,
          internationalShippingPrice: resolved.internationalShippingPrice,
          dimensions: resolved.dimensions,
          framed: it.framed ?? false,
          price: unitPence / 100,
          quantity: it.quantity,
        };
      }),
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
        // Empty string rather than omitted: Stripe metadata values must be
        // strings, and the webhook reads a missing key the same as a blank one.
        buyer_user_id: buyerUserId || "",
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
      // The SERVER-priced lines, not the request's. The webhook books the
      // order (items, subtotal, splits) from this row, so a drifted or forged
      // client price must not become the order of record while Stripe charges
      // the corrected amount.
      cart: pricedLines.map(({ item, unitPence }) => ({ ...item, price: unitPence / 100 })),
      shipping: {
        ...shipping,
        fulfilmentMethod,
        collectionNotes,
        // T9: the address the buyer collects from, resolved server-side from
        // the placement row, never from the client.
        ...(collectVenueAddress ? { collectionAddress: collectVenueAddress } : {}),
      },
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
