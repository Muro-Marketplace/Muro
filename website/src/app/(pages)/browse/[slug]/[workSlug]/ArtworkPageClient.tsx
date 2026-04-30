"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ArtistWork } from "@/data/artists";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import SaveButton from "@/components/SaveButton";
import { useToast } from "@/context/ToastContext";
import WallVisualiser from "@/components/WallVisualiser";
import CustomerWallSheet from "@/components/visualizer/CustomerWallSheet";
import type { PanelWork } from "@/components/visualizer/WorksPanel";
import Dropdown from "@/components/Dropdown";
import MakeOfferModal from "@/components/offers/MakeOfferModal";
import { isFlagOn } from "@/lib/feature-flags";
import {
  buildSizeVariants,
  parseDimensions,
} from "@/lib/visualizer/dimensions";
import { resolveShippingCost, tierLabel, SIGNATURE_THRESHOLD_GBP } from "@/lib/shipping-calculator";
import { formatSizeLabelForDisplay } from "@/lib/format-size-label";
import { formatDimensionsForDisplay } from "@/lib/format-dimensions";
interface ArtworkPageClientProps {
  work: ArtistWork;
  artistName: string;
  artistSlug: string;
  shipsInternationally?: boolean;
  internationalShippingPrice?: number | null;
  /** Live count of `artwork_view` events for this work in the last 7
   *  days, computed in the parent server component. Hidden when 0
   *  so brand-new works don't show "0 views this week". */
  viewsThisWeek?: number;
}

export default function ArtworkPageClient({
  work,
  artistName,
  artistSlug,
  shipsInternationally,
  internationalShippingPrice,
  viewsThisWeek,
}: ArtworkPageClientProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const { user, userType } = useAuth();
  const { showToast } = useToast();
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(0);
  const frameOptions = work.frameOptions && work.frameOptions.length > 0 ? work.frameOptions : [];
  // -1 means "no frame", the buyer wants the bare canvas. Default is no
  // frame so the price quoted above is exactly what they pay until they
  // explicitly opt in to a frame.
  const [selectedFrameIdx, setSelectedFrameIdx] = useState(-1);
  const selectedFrame = selectedFrameIdx >= 0 ? frameOptions[selectedFrameIdx] : undefined;
  const [wallVizOpen, setWallVizOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  // ── Wall visualiser swap ──────────────────────────────────────────
  // When the WALL_VISUALIZER_V1 flag is on we use the new react-konva
  // editor; otherwise the legacy CSS-overlay component continues to
  // ship. Decoupled here so flipping the flag is a one-line change.
  const useNewVisualizer = isFlagOn("WALL_VISUALIZER_V1");
  const panelWorkForVisualizer = useMemo<PanelWork>(() => {
    const parsed = parseDimensions(work.dimensions);
    const sizes = buildSizeVariants(work.pricing ?? []);
    return {
      id: work.id,
      title: work.title,
      imageUrl: work.image,
      artistName,
      dimensions: work.dimensions,
      widthCm: parsed?.widthCm,
      heightCm: parsed?.heightCm,
      sizes: sizes.length > 0 ? sizes : undefined,
      orientation: work.orientation,
    };
  }, [work, artistName]);

  // The "View on your wall" button now lives on the image itself; it
  // dispatches a window event that this component listens for so the
  // modal state can stay here without prop-drilling through the server
  // page component.
  useEffect(() => {
    const handler = () => setWallVizOpen(true);
    window.addEventListener("wallplace:open-wall-viz", handler);
    return () => window.removeEventListener("wallplace:open-wall-viz", handler);
  }, []);

  const selectedPricing = work.pricing[selectedSizeIdx] || work.pricing[0];

  // Frame uplift scales by size. The artist's `priceUplift` value is
  // treated as the price for the SMALLEST listed size; for larger
  // sizes we scale by perimeter (≈ frame moulding cost) which gives
  // a much more realistic ramp than a flat number across an A4 print
  // and a 100×80cm canvas. The smallest size is picked deterministically
  // by ascending area so the baseline doesn't depend on which size
  // the buyer has selected. Falls back to the flat uplift if the
  // size labels can't be parsed.
  const frameUplift = (() => {
    if (!selectedFrame) return 0;
    // Explicit per-size override wins. Set in the artist portfolio
    // form; an artist who's said "A4 = £20, A2 = £45" gets exactly
    // those values rather than the perimeter ramp.
    const explicit = selectedPricing
      ? (selectedFrame as { pricesBySize?: Record<string, number> }).pricesBySize?.[selectedPricing.label]
      : undefined;
    if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
      return Math.round(explicit * 100) / 100;
    }

    const baseUplift = selectedFrame.priceUplift || 0;
    if (baseUplift <= 0) return 0;
    if (!work.pricing || work.pricing.length === 0) return baseUplift;
    const parsedSizes = work.pricing
      .map((p) => ({ pricing: p, dims: parseDimensions(p.label) }))
      .filter(
        (x): x is { pricing: typeof work.pricing[0]; dims: { widthCm: number; heightCm: number } } =>
          Boolean(x.dims),
      );
    if (parsedSizes.length === 0) return baseUplift;
    let smallestArea = Infinity;
    let baselinePerimeter = 0;
    for (const s of parsedSizes) {
      const a = s.dims.widthCm * s.dims.heightCm;
      if (a < smallestArea) {
        smallestArea = a;
        baselinePerimeter = 2 * (s.dims.widthCm + s.dims.heightCm);
      }
    }
    if (!baselinePerimeter) return baseUplift;
    const selectedDims = selectedPricing
      ? parseDimensions(selectedPricing.label)
      : null;
    if (!selectedDims) return baseUplift;
    const selectedPerimeter =
      2 * (selectedDims.widthCm + selectedDims.heightCm);
    return Math.round(baseUplift * (selectedPerimeter / baselinePerimeter));
  })();

  const displayPrice = selectedPricing
    ? Math.round((selectedPricing.price + frameUplift) * 100) / 100
    : null;
  // Effective per-size shipping. When the artist set a row-level
  // shippingPrice on the selected size we use it; otherwise we fall
  // back to the work-level shippingPrice. The cart already knows how
  // to read the per-size value but the artwork page was passing
  // work.shippingPrice unconditionally, which silently overrode any
  // size-specific values the artist had configured.
  const effectiveShippingPrice =
    typeof selectedPricing?.shippingPrice === "number"
      ? selectedPricing.shippingPrice
      : (work.shippingPrice ?? undefined);
  // In-store / pickup price for the selected size. We prefer the
  // per-size `inStorePricing[]` array (current model) and fall back
  // to the legacy work-level `inStorePrice` (single number) so older
  // works without per-size data still surface a pickup CTA.
  const selectedInStorePrice: number | null = (() => {
    if (Array.isArray(work.inStorePricing) && selectedPricing) {
      const match = work.inStorePricing.find(
        (p) =>
          p.label.toLowerCase() === selectedPricing.label.toLowerCase(),
      );
      if (match && match.price > 0) return match.price;
    }
    if (typeof work.inStorePrice === "number" && work.inStorePrice > 0) {
      return work.inStorePrice;
    }
    return null;
  })();
  // Per-size stock cap, falling back to the work-level quantity for
  // legacy artworks that don't track stock per size yet.
  const sizeStock: number | null = (() => {
    const perSize = selectedPricing?.quantityAvailable;
    if (typeof perSize === "number") return perSize;
    if (typeof work.quantityAvailable === "number") return work.quantityAvailable;
    return null;
  })();

  // The number we surface here is the SELECTED size's stock cap when
  // the artist set a per-size quantity. Saying just "2 available"
  // misleads buyers, they read it as "2 of this artwork in total"
  // when it's actually "2 of this size". When the cap is per-size,
  // tag it explicitly. Falls back to the work-level unqualified
  // label for legacy artworks tracking stock at the work level.
  const sizeStockIsPerSize = typeof selectedPricing?.quantityAvailable === "number";
  const availabilityLabel = (() => {
    if (!work.available) return "Sold";
    if (typeof sizeStock === "number") {
      if (sizeStock <= 0) return "Sold out at this size";
      return sizeStockIsPerSize
        ? `${sizeStock} available in this size`
        : `${sizeStock} available`;
    }
    return "Available";
  })();

  return (
    <div className="flex flex-col">
      {/* Artist (#40), clickable so visitors can hop straight to the
          artist's portfolio without backing out to /browse first. */}
      <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-3">
        <Link href={`/browse/${artistSlug}`} className="hover:text-accent hover:underline transition-colors">
          {artistName}
        </Link>
      </p>

      {/* Title */}
      <h1 className="text-3xl lg:text-[2.5rem] leading-[1.15] font-serif text-foreground mb-3">
        {work.title}
      </h1>

      {/* Currently-placed chip, only when the work is on display at a
          venue right now. Sourced from artist_works.placed_at_venue,
          kept in sync by the placements PATCH handler. */}
      {work.placed_at_venue && (
        <p className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted bg-foreground/5 rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
          Currently placed at {work.placed_at_venue}
        </p>
      )}

      {/* Availability + Save */}
      <div className="flex items-center justify-between pb-5 mb-5 border-b border-border">
        <span className={`inline-flex items-center gap-2 text-sm ${work.available ? "text-foreground" : "text-muted"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${work.available ? "bg-accent" : "bg-muted"}`} />
          {availabilityLabel}
        </span>
        <SaveButton type="work" itemId={work.id} size="sm" />
      </div>

      {/* Views this week (#6). Real analytics_events count, computed
          in the parent server component from `artwork_view` events
          over the last 7 days. Hidden for brand-new works with no
          views yet so we don't show "0 views this week". The
          venues-looking-for-similar chip was removed in favour of
          this single live signal. */}
      {typeof viewsThisWeek === "number" && viewsThisWeek > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {viewsThisWeek} {viewsThisWeek === 1 ? "view" : "views"} this week
          </span>
        </div>
      )}

      {/* About this piece, the artist's own description. Was being
          stored but never rendered, so it looked like saving the
          description on portfolio did nothing. */}
      {work.description && work.description.trim() && (
        <div className="mb-6">
          <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-2">About this piece</p>
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{work.description.trim()}</p>
        </div>
      )}

      {/* Details */}
      <dl className="space-y-2.5 mb-6 text-[13px]">
        <div className="flex justify-between items-baseline">
          <dt className="text-muted uppercase tracking-wider text-[10px]">Medium</dt>
          <dd className="text-foreground text-right">{work.medium}</dd>
        </div>
        {work.dimensions && (
          <div className="flex justify-between items-baseline">
            <dt className="text-muted uppercase tracking-wider text-[10px]">Dimensions</dt>
            <dd className="text-foreground text-right">{formatDimensionsForDisplay(work.dimensions)}</dd>
          </div>
        )}
      </dl>

      {/* Size & Price */}
      {work.available && work.pricing.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-2.5">
            Size &amp; Price
          </p>
          {work.pricing.length === 1 ? (
            <div className="flex items-baseline justify-between py-3 border-y border-border">
              <span className="text-sm text-foreground">{formatSizeLabelForDisplay(work.pricing[0].label)}</span>
              <span className="font-serif text-xl text-foreground">
                £{work.pricing[0].price}
              </span>
            </div>
          ) : (
            <>
              <Dropdown
                value={String(selectedSizeIdx)}
                onChange={(v) => setSelectedSizeIdx(Number(v))}
                options={work.pricing.map((sp, i) => {
                  const stock = sp.quantityAvailable;
                  return {
                    value: String(i),
                    label: `${formatSizeLabelForDisplay(sp.label)}, £${sp.price}`,
                    description: typeof stock === "number"
                      ? (stock <= 0 ? "Sold out" : `${stock} available`)
                      : undefined,
                    disabled: typeof stock === "number" && stock <= 0,
                  };
                })}
                ariaLabel="Choose size"
              />
              {/* Per-size availability list, only shown when the
                  artist has split stock by size, so the default
                  "one number fits all" flow stays uncluttered. */}
              {work.pricing.some((sp) => typeof sp.quantityAvailable === "number") && (
                <ul className="mt-2 space-y-0.5">
                  {work.pricing.map((sp) => {
                    const stock = sp.quantityAvailable;
                    const label = typeof stock !== "number"
                      ? "–"
                      : stock <= 0
                        ? "Sold out"
                        : `${stock} available`;
                    return (
                      <li key={sp.label} className="flex justify-between text-[11px]">
                        <span className="text-muted">{formatSizeLabelForDisplay(sp.label)}</span>
                        <span className={`${typeof stock === "number" && stock <= 0 ? "text-red-600" : "text-foreground/70"}`}>
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {/* Frame selector */}
      {work.available && frameOptions.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-2.5">Frame</p>
          <Dropdown
            value={String(selectedFrameIdx)}
            onChange={(v) => setSelectedFrameIdx(Number(v))}
            options={[
              { value: "-1", label: "No frame" },
              ...frameOptions.map((f, i) => {
                // Show the per-size scaled uplift in the dropdown so
                // the buyer sees the actual price they'll pay for the
                // currently-selected size, not the artist's small-size
                // baseline. Uses the same scaling logic as the live
                // frameUplift used on the buy button.
                const scaledForRow = (() => {
                  const baseUplift = f.priceUplift || 0;
                  if (baseUplift <= 0) return 0;
                  const parsedSizes = work.pricing
                    .map((p) => ({ pricing: p, dims: parseDimensions(p.label) }))
                    .filter(
                      (
                        x,
                      ): x is {
                        pricing: typeof work.pricing[0];
                        dims: { widthCm: number; heightCm: number };
                      } => Boolean(x.dims),
                    );
                  if (parsedSizes.length === 0) return baseUplift;
                  let smallestArea = Infinity;
                  let baselinePerimeter = 0;
                  for (const s of parsedSizes) {
                    const a = s.dims.widthCm * s.dims.heightCm;
                    if (a < smallestArea) {
                      smallestArea = a;
                      baselinePerimeter =
                        2 * (s.dims.widthCm + s.dims.heightCm);
                    }
                  }
                  if (!baselinePerimeter) return baseUplift;
                  const selectedDims = selectedPricing
                    ? parseDimensions(selectedPricing.label)
                    : null;
                  if (!selectedDims) return baseUplift;
                  const selectedPerimeter =
                    2 * (selectedDims.widthCm + selectedDims.heightCm);
                  return Math.round(
                    baseUplift * (selectedPerimeter / baselinePerimeter),
                  );
                })();
                return {
                  value: String(i),
                  label: f.label,
                  description:
                    scaledForRow > 0 ? `+£${scaledForRow}` : undefined,
                };
              }),
            ]}
            ariaLabel="Choose frame"
          />
          {selectedFrame?.imageUrl && (
            <div className="mt-3 relative aspect-video rounded-sm overflow-hidden border border-border/60 bg-surface select-none" onContextMenu={(e) => e.preventDefault()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedFrame.imageUrl}
                alt={`${selectedFrame.label} preview`}
                className="w-full h-full object-cover pointer-events-none select-none"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          )}
        </div>
      )}

      {/* Shipping info, uses the calculator when the artist hasn't set
          a manual shippingPrice. Shows tier + delivery window + signature
          line so buyers know what they're getting. */}
      {(() => {
        const sizeLabelForCalc = selectedPricing?.label || work.dimensions;
        const totalPriceForCalc = (displayPrice ?? selectedPricing?.price) || 0;
        const uk = resolveShippingCost({
          manualPrice: typeof work.shippingPrice === "number" ? work.shippingPrice : null,
          dimensions: sizeLabelForCalc,
          framed: !!selectedFrame,
          priceGbp: totalPriceForCalc,
          region: "uk",
        });
        const intl = shipsInternationally
          ? resolveShippingCost({
              manualPrice: typeof internationalShippingPrice === "number" ? internationalShippingPrice : null,
              dimensions: sizeLabelForCalc,
              framed: !!selectedFrame,
              priceGbp: totalPriceForCalc,
              region: "international",
            })
          : null;

        const ukLabel = uk.cost === 0
          ? "Free UK shipping"
          : uk.cost != null
            ? `UK shipping £${uk.cost.toFixed(2)}`
            : "UK shipping calculated at checkout";

        return (
          <div className="text-[11px] text-muted space-y-0.5 mb-6">
            <p>{ukLabel}</p>
            {uk.estimate && (
              <p className="text-[10px] text-muted/80">
                {tierLabel(uk.estimate.tier)} · {uk.estimate.estimatedDays}
                {uk.estimate.requiresSignature ? " · Signed-for" : ""}
              </p>
            )}
            {intl ? (
              <p>
                {intl.cost != null ? `International £${intl.cost.toFixed(2)}` : "International calculated at checkout"}
              </p>
            ) : (
              <p>Ships to UK only</p>
            )}
            {totalPriceForCalc >= SIGNATURE_THRESHOLD_GBP && uk.estimate && !uk.estimate.requiresSignature && (
              <p className="text-[10px] text-accent">Signed-for delivery included (£{SIGNATURE_THRESHOLD_GBP}+ orders)</p>
            )}
          </div>
        );
      })()}

      {/* CTAs */}
      <div className="space-y-2">
        {user && userType === "venue" && (
          <button
            onClick={() => {
              router.push(
                `/venue-portal/placements?artist=${artistSlug}&artistName=${encodeURIComponent(artistName)}&work=${encodeURIComponent(work.title)}&workImage=${encodeURIComponent(work.image)}`
              );
            }}
            className="w-full px-5 py-3 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            Request Placement
          </button>
        )}
        {work.available && selectedPricing && (() => {
          const frameLabel = selectedFrame ? ` + ${selectedFrame.label}` : "";
          const sizeLabel = `${selectedPricing.label}${frameLabel}`;
          const totalPrice = displayPrice ?? selectedPricing.price;
          return (
            <>
              {typeof sizeStock === "number" && sizeStock <= 3 && sizeStock > 0 && (
                <p className="text-xs text-amber-700 -mt-1">Only {sizeStock} left at this size</p>
              )}
              {typeof sizeStock === "number" && sizeStock === 0 ? (
                <button disabled className="w-full px-5 py-3.5 text-[13px] font-medium tracking-wider uppercase text-muted bg-border rounded-sm cursor-not-allowed">
                  Sold out
                </button>
              ) : (
              <>
              <div className="flex gap-2">
              <button
                onClick={() => {
                  const r = addItem({
                    type: "work",
                    workId: work.id,
                    artistSlug,
                    artistName,
                    title: work.title,
                    image: work.image,
                    size: sizeLabel,
                    price: totalPrice,
                    quantity: 1,
                    quantityAvailable: sizeStock ?? null,
                    shippingPrice: effectiveShippingPrice,
                    internationalShippingPrice: shipsInternationally && internationalShippingPrice != null ? internationalShippingPrice : undefined,
                    dimensions: selectedPricing.label || work.dimensions,
                    framed: !!selectedFrame,
                  });
                  if (!r.ok) {
                    showToast(r.reason === "out-of-stock" ? "This size is sold out" : `Only ${r.available} left at this size`);
                    return;
                  }
                  router.push("/checkout");
                }}
                className="flex-1 px-5 py-3.5 text-[13px] font-medium tracking-wider uppercase text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors"
              >
                Buy Now, £{totalPrice}
              </button>
              {/* Compact basket icon — keeps the page from getting two
                  competing CTAs while still giving multi-item buyers a
                  single-tap "save for later" affordance. */}
              <button
                aria-label="Add to basket"
                title="Add to basket"
                onClick={() => {
                  const r = addItem({
                    type: "work",
                    workId: work.id,
                    artistSlug,
                    artistName,
                    title: work.title,
                    image: work.image,
                    size: sizeLabel,
                    price: totalPrice,
                    quantity: 1,
                    quantityAvailable: sizeStock ?? null,
                    shippingPrice: effectiveShippingPrice,
                    internationalShippingPrice: shipsInternationally && internationalShippingPrice != null ? internationalShippingPrice : undefined,
                    dimensions: selectedPricing.label || work.dimensions,
                    framed: !!selectedFrame,
                  });
                  if (!r.ok) {
                    showToast(r.reason === "out-of-stock" ? "This size is sold out" : `Only ${r.available} left at this size`);
                  } else {
                    showToast("Added to basket");
                  }
                }}
                className="px-3.5 py-3.5 text-foreground border border-border hover:border-foreground/50 rounded-sm transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
                </svg>
              </button>
              </div>
              </>
              )}
            </>
          );
        })()}
        {/* In-store / collect-from-venue option. Renders for the
            selected size when the artist set an in-store price for it
            (per-size `inStorePricing[]`), or for the legacy
            work-level `inStorePrice` if that's all that's set. The
            label distinguishes the two so buyers know what they're
            buying, for per-size in-store the label includes the
            size; for the legacy original-only flow it stays
            "Original". Shipping is £0 because the buyer collects in
            person, that's the entire point of the pickup option. */}
        {work.available && selectedInStorePrice != null && (
          <button
            onClick={() => {
              const isPerSize =
                Array.isArray(work.inStorePricing) &&
                work.inStorePricing.some(
                  (p) =>
                    p.label.toLowerCase() ===
                    (selectedPricing?.label.toLowerCase() ?? ""),
                );
              addItem({
                type: "work",
                workId: work.id,
                artistSlug,
                artistName,
                title:
                  isPerSize && selectedPricing
                    ? `${work.title} (Collect, ${selectedPricing.label})`
                    : `${work.title} (Original)`,
                image: work.image,
                size: isPerSize && selectedPricing ? selectedPricing.label : "Original",
                price: selectedInStorePrice,
                quantity: 1,
                shippingPrice: 0,
              });
              router.push("/checkout");
            }}
            className="w-full px-5 py-3 text-sm font-medium text-accent border border-accent/60 hover:bg-accent/5 rounded-sm transition-colors"
          >
            {Array.isArray(work.inStorePricing) &&
            work.inStorePricing.some(
              (p) =>
                p.label.toLowerCase() ===
                (selectedPricing?.label.toLowerCase() ?? ""),
            )
              ? `Collect from venue, £${selectedInStorePrice}`
              : `Buy Original, £${selectedInStorePrice}`}
          </button>
        )}
        {/* Venues see Make-an-Offer as a primary secondary CTA. Other
            user types still see the modal if they tap into it (it
            handles the non-venue explainer), but only venues get the
            visible button so the page stays clean for customers. */}
        {(!user || userType === "venue") && (
          <button
            type="button"
            onClick={() => setOfferOpen(true)}
            className="w-full px-5 py-3 text-sm font-medium text-foreground border border-border hover:border-foreground/50 rounded-sm transition-colors"
          >
            Make an offer
          </button>
        )}

        {/* Message the artist — quiet text link beneath the
            primary CTAs. The artwork-page actions used to be three
            stacked buttons which read as crowded. */}
        <button
          onClick={() => {
            const nameParam = artistName ? `&artistName=${encodeURIComponent(artistName)}` : "";
            if (user && userType === "venue") {
              router.push(`/venue-portal/messages?artist=${artistSlug}${nameParam}`);
            } else if (user && userType === "artist") {
              router.push(`/artist-portal/messages?artist=${artistSlug}${nameParam}`);
            } else if (user) {
              router.push(`/customer-portal/messages?artist=${artistSlug}${nameParam}`);
            } else {
              router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            }
          }}
          className="w-full px-5 py-2 text-xs text-muted hover:text-accent transition-colors border-t border-border"
        >
          Message the artist <span className="ml-0.5">→</span>
        </button>
      </div>

      <MakeOfferModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        artistSlug={artistSlug}
        artistName={artistName}
        workIds={[work.id]}
        // Surface the selected size in the modal heading so the venue
        // knows exactly which variant the offer covers.
        workTitle={selectedPricing?.label ? `${work.title} (${selectedPricing.label})` : work.title}
        sizeLabel={selectedPricing?.label}
        // Asking price reflects the SELECTED size (with frame uplift if
        // the buyer ticked one). Previously this was the largest size's
        // price across the whole work, which made the 60% floor wildly
        // off when the buyer was offering on a smaller variant.
        askingPriceGbp={displayPrice ?? selectedPricing?.price ?? null}
      />

      {/* Wall visualiser, opens as a modal from the "View on your wall"
          CTA. The new react-konva visualizer takes over when the
          WALL_VISUALIZER_V1 flag is on; otherwise the legacy CSS-overlay
          fallback ships unchanged. */}
      {wallVizOpen && useNewVisualizer && (
        <CustomerWallSheet
          open={wallVizOpen}
          onClose={() => setWallVizOpen(false)}
          work={panelWorkForVisualizer}
        />
      )}
      {wallVizOpen && !useNewVisualizer && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={() => setWallVizOpen(false)}>
          <div className="bg-background rounded-sm max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <p className="text-sm font-medium text-foreground">View on your wall</p>
              <button
                type="button"
                onClick={() => setWallVizOpen(false)}
                className="p-1 text-muted hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="p-4">
              <WallVisualiser
                artworkImage={work.image}
                artworkTitle={work.title}
                artworkWidthCm={null}
                artworkHeightCm={null}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
