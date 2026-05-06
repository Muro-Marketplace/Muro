"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { ArtistCollection } from "@/data/collections";
import type { ArtistWork } from "@/data/artists";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import Breadcrumbs from "@/components/Breadcrumbs";
import SaveButton from "@/components/SaveButton";
import MakeOfferModal from "@/components/offers/MakeOfferModal";
import { formatDimensionsForDisplay } from "@/lib/format-dimensions";
import { SIZE_BANDS, bandsForWork, type SizeBandKey } from "@/components/browse/SizeBands";

type CollectionWork = ArtistWork & {
  selectedSize?: string;
  selectedSizePrice?: number;
};

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addItem } = useCart();
  const collectionId = params.collectionId as string;
  const { user, userType } = useAuth();
  const [collection, setCollection] = useState<ArtistCollection | null>(null);
  const [works, setWorks] = useState<CollectionWork[]>([]);
  const [offerOpen, setOfferOpen] = useState(false);
  const [arrangements, setArrangements] = useState<{
    openToFreeLoan: boolean;
    openToRevenueShare: boolean;
    revenueSharePercent: number | null;
    openToOutrightPurchase: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Size filter — same band aesthetic as /browse + portfolio surfaces
  // so the collection detail behaves as a first-class browsing surface.
  const [activeSizes, setActiveSizes] = useState<Set<SizeBandKey>>(new Set());
  // Per-card tap reveal on touch devices. Desktop uses :hover; mobile
  // taps reveal the action overlay before navigating.
  const [revealedWorkIndex, setRevealedWorkIndex] = useState<number | null>(null);
  const revealClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armRevealAutoHide = useCallback(() => {
    if (revealClearTimer.current) clearTimeout(revealClearTimer.current);
    revealClearTimer.current = setTimeout(() => setRevealedWorkIndex(null), 6000);
  }, []);
  function toggleSize(b: SizeBandKey) {
    setActiveSizes((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    fetch(`/api/collections/${encodeURIComponent(collectionId)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = await r.json();
        if (cancelled) return;
        if (data.collection) {
          setCollection(data.collection);
          setWorks((data.works || []) as CollectionWork[]);
          if (data.artistArrangements) setArrangements(data.artistArrangements);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-muted text-sm">Loading collection...</p>
      </div>
    );
  }

  if (notFound || !collection) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-serif mb-3">Collection not found</h1>
          <Link href="/browse" className="text-sm text-accent hover:text-accent-hover">
            Back to marketplace
          </Link>
        </div>
      </div>
    );
  }

  const individualTotal = works.reduce(
    (sum, w) => sum + (w.selectedSizePrice || 0),
    0
  );
  const savings =
    individualTotal > 0 && collection.bundlePrice > 0
      ? Math.max(0, individualTotal - collection.bundlePrice)
      : 0;

  function handleBuyCollection() {
    if (!collection) return;
    addItem({
      type: "collection",
      collectionId: collection.id,
      artistSlug: collection.artistSlug,
      artistName: collection.artistName,
      title: collection.name + " (Collection)",
      image: collection.coverImage,
      size: `${collection.workIds.length} works`,
      price: collection.bundlePrice,
      quantity: 1,
    });
    router.push(`/checkout?backTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }

  return (
    <div>
      <div className="max-w-[1200px] mx-auto px-6 pt-5">
        <Breadcrumbs
          items={[
            { label: "Collections", href: "/browse?view=collections" },
            { label: collection.name },
          ]}
        />
      </div>
      {/* Banner */}
      <section className="relative h-64 lg:h-80 overflow-hidden">
        <Image
          src={collection.bannerImage || collection.thumbnail || collection.coverImage}
          alt={collection.name}
          fill
          className="object-cover"
          priority
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="relative h-full flex items-end">
          <div className="max-w-[1200px] mx-auto px-6 pb-8 w-full">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Link
                  href={`/browse/${collection.artistSlug}`}
                  className="text-white/60 text-xs hover:text-white transition-colors mb-2 inline-block"
                >
                  &larr; {collection.artistName}
                </Link>
                <h1 className="text-3xl lg:text-4xl font-serif text-white mb-2">{collection.name}</h1>
                <p className="text-white/60 text-sm">
                  {collection.workIds.length} works &middot; {collection.bundlePriceBand}
                </p>
              </div>
              {/* Heart up top, beside the artist name + collection title.
                  Used to live way down by the secondary actions, where it
                  was easy to miss. */}
              <SaveButton type="collection" itemId={collection.id} size="md" />
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-3 gap-10">
          {/* Works grid */}
          <div className="lg:col-span-2">
            {collection.description && (
              <p className="text-muted leading-relaxed mb-8">{collection.description}</p>
            )}
            {/* Size filter — same shape and bands as the /browse and
                portfolio surfaces so collection detail reads as a
                first-class browsing surface, not a stripped-down
                lookup page. Renders nothing if the collection only
                contains a handful of works (filtering one or two
                items is noise). */}
            {works.length > 3 && (
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-widest text-muted mr-1">Size</span>
                {SIZE_BANDS.map((b) => {
                  const active = activeSizes.has(b.key);
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => toggleSize(b.key)}
                      className={`px-2.5 py-1 rounded-sm border text-left transition-colors flex items-center gap-2 ${
                        active ? "border-accent bg-accent/5 text-foreground" : "border-border bg-white text-muted hover:border-foreground/30"
                      }`}
                    >
                      <span className="text-[11px] font-medium leading-tight">{b.label}</span>
                      <span className="text-[9px] text-muted leading-tight tabular-nums">{b.dimensionHint}</span>
                    </button>
                  );
                })}
                {activeSizes.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveSizes(new Set())}
                    className="text-[11px] text-muted hover:text-foreground transition-colors ml-1"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(() => {
                // Match the /browse surface: a work passes if ANY of
                // its sizes (work-level dimensions, the artist-selected
                // collection size, or any pricing tier label) lands in
                // an active band. Previously this page only inspected
                // `w.dimensions` and a collection where the artist
                // had set per-bundle sizes but left dimensions blank
                // would render an empty grid under any active filter.
                const visible = activeSizes.size === 0
                  ? works
                  : works.filter((w) => {
                      const bands = bandsForWork(w);
                      for (const b of bands) {
                        if (activeSizes.has(b)) return true;
                      }
                      return false;
                    });
                if (visible.length === 0) {
                  return (
                    <p className="text-sm text-muted col-span-2">
                      {activeSizes.size > 0
                        ? "No works match the selected size filter."
                        : "This collection has no works to display yet."}
                    </p>
                  );
                }
                return visible.map((work) => {
                  const index = works.indexOf(work);
                  return (
                <div
                  key={work.id}
                  data-revealed={revealedWorkIndex === index ? "true" : undefined}
                  className="group relative rounded-sm overflow-hidden bg-border/20 cursor-pointer"
                  onClick={() => {
                    const isTouch = typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches;
                    if (isTouch && revealedWorkIndex !== index) {
                      setRevealedWorkIndex(index);
                      armRevealAutoHide();
                      return;
                    }
                    router.push(`/browse/${collection.artistSlug}/${work.id}`);
                  }}
                >
                  <div
                    className="relative select-none"
                    onContextMenu={(e) => e.preventDefault()}
                    data-protected="artwork"
                  >
                    <Image
                      src={work.image}
                      alt={work.title}
                      width={600}
                      height={400}
                      className="w-full h-auto object-cover pointer-events-none"
                      sizes="(max-width: 640px) 100vw, 50vw"
                      draggable={false}
                      unoptimized
                    />
                    <div className="absolute inset-0" />
                    <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 group-data-[revealed=true]:opacity-100 transition-opacity">
                      <SaveButton type="work" itemId={work.id} />
                    </div>
                    {/* Hover / tap-reveal action row */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent text-white p-3 opacity-0 group-hover:opacity-100 group-data-[revealed=true]:opacity-100 transition-opacity">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium truncate">{work.title}</p>
                          <p className="text-[10px] text-white/75 truncate">
                            {work.medium}
                            {work.selectedSizePrice != null ? ` · £${work.selectedSizePrice}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Link
                            href={`/browse/${collection.artistSlug}/${work.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 text-[10px] text-white/90 border border-white/30 hover:border-white hover:bg-white/10 rounded-sm transition-colors"
                          >
                            Open
                          </Link>
                          {work.available && work.selectedSize && work.selectedSizePrice != null && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                addItem({
                                  type: "work",
                                  workId: work.id,
                                  artistSlug: collection.artistSlug,
                                  artistName: collection.artistName,
                                  title: work.title,
                                  image: work.image,
                                  size: work.selectedSize!,
                                  price: work.selectedSizePrice!,
                                  quantity: 1,
                                  quantityAvailable: typeof work.quantityAvailable === "number" ? work.quantityAvailable : null,
                                  shippingPrice: typeof work.shippingPrice === "number" ? work.shippingPrice : undefined,
                                  dimensions: work.selectedSize || work.dimensions,
                                  framed: false,
                                });
                                router.push(`/checkout?backTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                              }}
                              className="px-2 py-1 text-[10px] bg-accent hover:bg-accent-hover text-white rounded-sm transition-colors"
                            >
                              Buy now
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-medium">{work.title}</h3>
                    <p className="text-xs text-muted">
                      {work.medium}
                      {work.dimensions ? ` · ${formatDimensionsForDisplay(work.dimensions)}` : ""}
                    </p>
                    {work.placed_at_venue && (
                      <p className="text-[10px] text-muted mt-1 inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
                        Placed at {work.placed_at_venue}
                      </p>
                    )}
                    {work.selectedSize && (
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] text-muted uppercase tracking-wider">
                          Size
                        </span>
                        <span className="text-xs font-medium">
                          {work.selectedSize}
                          {work.selectedSizePrice != null
                            ? ` · £${work.selectedSizePrice}`
                            : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="bg-surface border border-border rounded-sm p-6 lg:sticky lg:top-24">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">
                {collection.artistName}
              </p>
              <h2 className="text-lg font-serif mb-2">{collection.name}</h2>
              <p className="text-2xl font-serif text-accent mb-1">
                {collection.bundlePriceBand}
              </p>
              {savings > 0 && (
                <p className="text-xs text-green-700 mb-3">
                  Save £{savings} vs. buying individually (£{individualTotal})
                </p>
              )}
              <p className="text-xs text-muted mb-4">
                All {collection.workIds.length} works at the sizes selected by the artist, one price.
              </p>

              {/* Arrangement chips (#42), same shape as gallery cards
                  so the collection page reads the same way. Surfaces
                  what the underlying artist is open to. */}
              {arrangements && (
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {arrangements.openToFreeLoan && (
                    <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-sm">
                      Display
                    </span>
                  )}
                  {arrangements.openToRevenueShare && (
                    <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded-sm">
                      Rev share{arrangements.revenueSharePercent ? ` · ${arrangements.revenueSharePercent}%` : ""}
                    </span>
                  )}
                  {arrangements.openToOutrightPurchase && (
                    <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-sm">
                      Purchase
                    </span>
                  )}
                </div>
              )}

              {works.length > 0 && (
                <div className="mb-6 space-y-1.5">
                  {works.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between text-[11px] text-muted"
                    >
                      <span className="truncate pr-2">{w.title}</span>
                      <span className="shrink-0">
                        {w.selectedSize || "–"}
                        {w.selectedSizePrice != null ? ` · £${w.selectedSizePrice}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {collection.available && (
                  <button
                    onClick={handleBuyCollection}
                    className="w-full px-5 py-3 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
                  >
                    Buy Collection – {collection.bundlePriceBand}
                  </button>
                )}
                {/* Request placement (#41). Always shown when the
                    collection has resolvable works, routing depends
                    on who's looking:
                      - venue: straight into /venue-portal/placements
                        with artist + work IDs prefilled
                      - logged-out: bounce through /signup?next=…
                      - artist viewing their own work: send to their
                        portal placements page with venue context
                        cleared so they understand it's the venue
                        side that triggers
                      - customer: prompt sign-up as venue
                    The button stays visible so the affordance is
                    always discoverable. */}
                {(() => {
                  if (!collection.available) return null;
                  // Venue-portal placements form keys preselection by
                  // work TITLE (not id), so pass titles here. Filter
                  // out anything blank so an empty entry doesn't slip
                  // into the comma-joined list and create a phantom
                  // selection.
                  const workTitlesParam = works.map((w) => w.title).filter(Boolean).join(",");
                  if (!workTitlesParam) return null;
                  const params = new URLSearchParams({
                    artist: collection.artistSlug,
                    artistName: collection.artistName,
                    works: workTitlesParam,
                    prefillMessage: `Hi, we'd love to host the "${collection.name}" collection in our venue. Open to revenue share or paid loan, happy to discuss.`,
                  });
                  const venueHref = `/venue-portal/placements?${params.toString()}`;
                  let href = venueHref;
                  let label = "Request placement";
                  if (!user) {
                    href = `/signup?next=${encodeURIComponent(venueHref)}`;
                    label = "Sign up to request placement";
                  } else if (userType === "artist") {
                    href = "/artist-portal/placements";
                    label = "View your placements";
                  } else if (userType === "customer") {
                    href = `/signup?next=${encodeURIComponent(venueHref)}`;
                    label = "Switch to a venue account to request";
                  }
                  return (
                    <Link
                      href={href}
                      className="block w-full px-5 py-3 text-sm font-medium text-foreground border border-foreground hover:bg-foreground hover:text-white rounded-sm transition-colors text-center"
                    >
                      {label}
                    </Link>
                  );
                })()}
                {/* Make an Offer (venue-only). Visible alongside Buy
                    Collection so venues can negotiate a bundle price. */}
                {(!user || userType === "venue") && collection.available && (
                  <button
                    type="button"
                    onClick={() => setOfferOpen(true)}
                    className="w-full px-5 py-3 text-sm font-medium text-foreground border border-border hover:border-foreground/50 rounded-sm transition-colors"
                  >
                    Make an offer
                  </button>
                )}
                <Link
                  href={`/browse/${collection.artistSlug}`}
                  className="block w-full text-center px-5 py-3 text-sm font-medium text-foreground hover:text-accent transition-colors"
                >
                  View artist <span className="ml-1">→</span>
                </Link>
                <MakeOfferModal
                  open={offerOpen}
                  onClose={() => setOfferOpen(false)}
                  artistSlug={collection.artistSlug}
                  artistName={collection.artistName}
                  collectionId={collection.id}
                  collectionTitle={collection.name}
                  askingPriceGbp={(() => {
                    // Sum the largest size price per work, in pounds.
                    const total = works.reduce((sum, w) => {
                      const tiers = w.pricing || [];
                      if (tiers.length === 0) return sum;
                      const maxP = Math.max(...tiers.map((t) => Number(t.price) || 0));
                      return sum + (maxP > 0 ? maxP : 0);
                    }, 0);
                    return total > 0 ? total : null;
                  })()}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
