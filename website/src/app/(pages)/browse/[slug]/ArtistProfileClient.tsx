"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { ArtistWork } from "@/data/artists";
import { slugify } from "@/lib/slugify";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { mutate, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/ToastContext";
import SaveButton from "@/components/SaveButton";
import ArtworkThumb from "@/components/ArtworkThumb";
import MakeOfferModal from "@/components/offers/MakeOfferModal";
import { saveQrContext } from "@/lib/qr-context";
import { getProfileTheme, themeCssVars, canCustomiseTheme, DEFAULT_PROFILE_THEME } from "@/lib/profile-themes";
import { formatSizeLabelForDisplay } from "@/lib/format-size-label";
import { formatDimensionsForDisplay } from "@/lib/format-dimensions";
import { ENQUIRY_TYPES } from "@/lib/enquiry-types";
import { filterWorksByTheme, largestPricedTier } from "./portfolio-filters";
import { physicalSizeLabel } from "@/lib/physical-size";

interface ArtistProfileClientProps {
  artistName: string;
  artistSlug: string;
  extendedBio: string;
  themes: string[];
  works: ArtistWork[];
  /** Premium+ profile theme id. Ignored if the artist is on Core. */
  profileTheme?: string;
  /** Subscription tier, drives the Premium+ theming gate. */
  subscriptionPlan?: string;
}

export default function ArtistProfileClient({
  artistName,
  artistSlug,
  extendedBio,
  themes,
  works,
  profileTheme,
  subscriptionPlan,
}: ArtistProfileClientProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const { user, displayName: authDisplayName, userType } = useAuth();
  const { showToast } = useToast();
  const [activeTheme, setActiveTheme] = useState("All");
  const [bioExpanded, setBioExpanded] = useState(false);
  // Column count for the row-major masonry. CSS `columns` gave us a
  // pretty layout but filled column-1 top-to-bottom before starting
  // column-2, visual reading order didn't match the works array.
  // Same pattern the marketplace gallery uses: distribute by
  // i % colCount so item order reads left-to-right, top-to-bottom.
  const [colCount, setColCount] = useState(3);
  useEffect(() => {
    function syncCols() {
      const w = typeof window !== "undefined" ? window.innerWidth : 0;
      if (w >= 1024) setColCount(3);
      else if (w >= 640) setColCount(2);
      else setColCount(1);
    }
    syncCols();
    window.addEventListener("resize", syncCols);
    return () => window.removeEventListener("resize", syncCols);
  }, []);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(0);
  const [selectedFrameIdx, setSelectedFrameIdx] = useState(0);
  const [showEnquiry, setShowEnquiry] = useState(false);
  const [selectedForPlacement, setSelectedForPlacement] = useState<Set<number>>(new Set());
  // Bulk-action sheet — drives Make Offer modal off the floating bar.
  // Buy Now is fired inline (cart push + redirect), no extra state.
  const [bulkOfferOpen, setBulkOfferOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const navigatingAway = useRef(false);

  function togglePlacementSelection(index: number) {
    setSelectedForPlacement((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // Theme-filtered works, declared up front so downstream computations
  // (selectedWorks, handleBulkBuyNow, handleRequestPlacement) can read
  // them without hitting a temporal dead zone when state changes. The
  // earlier layout declared this further down the component, which
  // worked while `selectedForPlacement` was empty (the .map callback
  // never ran) but crashed the page the moment the first tick was
  // ticked, surfacing as the "We couldn't load this artist's profile"
  // error boundary.
  // B6: the theme picker used to ask whether `title + medium` contained
  // the theme string, so a work's own theme tags were never consulted.
  // filterWorksByTheme matches tags where a work carries them and keeps
  // the substring behaviour (widened to the description) only for
  // untagged works. See portfolio-filters.ts.
  const filteredWorks = filterWorksByTheme(works, activeTheme);

  // Selected works as resolved ArtistWork records, in array order. Used
  // by the bulk Buy Now / Make Offer flows so we don't recompute the
  // map in three places.
  const selectedWorks = Array.from(selectedForPlacement)
    .map((i) => filteredWorks[i])
    .filter(Boolean) as ArtistWork[];

  // Stable IDs to feed the offers API. Falls back to the slugified
  // title when no DB id is attached (legacy seed records).
  const selectedWorkIds = selectedWorks.map((w) => w.id || slugify(w.title));

  // Aggregate asking price = sum of the largest-tier price across the
  // selected works. Mirrors the server-side default for the 60% offer
  // floor so the modal's hint matches what the API will enforce.
  const bulkAskingPrice = selectedWorks.reduce((sum, w) => {
    const max = Math.max(0, ...((w.pricing || []).map((t) => Number(t.price) || 0)));
    return sum + max;
  }, 0);

  function handleBulkBuyNow() {
    if (selectedWorks.length === 0) return;
    let okCount = 0;
    for (const w of selectedWorks) {
      // B7: this used to take tiers[tiers.length - 1] and call it the
      // largest tier. Pricing arrays keep the artist's entry order and
      // are never sorted, so the last row is just the last one typed,
      // while bulkAskingPrice above takes the max. Same rule for both
      // now, so the offer hint and the cart line agree.
      const tier = largestPricedTier(w.pricing);
      if (!tier) continue;
      const result = addItem({
        type: "work",
        workId: w.id,
        artistSlug,
        artistName,
        title: w.title,
        image: w.image || "",
        size: tier.label,
        price: tier.price,
        quantity: 1,
        quantityAvailable: tier.quantityAvailable ?? null,
        dimensions: w.dimensions,
      });
      if (result.ok) okCount++;
    }
    if (okCount > 0) {
      router.push(`/checkout?backTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    } else {
      showToast("Couldn't add any of these works to the cart.");
    }
  }

  function handleRequestPlacement() {
    const workTitles = Array.from(selectedForPlacement).map((i) => filteredWorks[i]?.title).filter(Boolean) as string[];
    const firstWork = filteredWorks[Array.from(selectedForPlacement)[0]];
    if (userType === "venue") {
      // Pass ALL ticked works through so every one of them is
      // preselected on the request form, not just the first. The
      // legacy `work` / `workImage` params stay for compat; the new
      // `works` param is the full comma-joined list that drives the
      // multi-artwork preselection.
      const params = new URLSearchParams();
      params.set("artist", artistSlug);
      params.set("artistName", artistName);
      if (workTitles.length > 0) {
        params.set("work", workTitles[0]);
        if (firstWork?.image) params.set("workImage", firstWork.image);
        params.set("works", workTitles.join(","));
      }
      router.push(`/venue-portal/placements?${params.toString()}`);
    } else if (userType === "artist") {
      router.push(`/artist-portal/placements`);
    }
  }
  const [enquirySent, setEnquirySent] = useState(false);
  // Per-card tap reveal on touch devices. Desktop uses :hover via the
  // existing group-hover overlay; mobile keeps a single revealed-index
  // so a first tap shows the action overlay and a second tap on the
  // card itself navigates. Auto-clears after a short window so cards
  // don't stay "revealed" indefinitely.
  const [revealedWorkIndex, setRevealedWorkIndex] = useState<number | null>(null);
  const revealClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armRevealAutoHide = useCallback(() => {
    if (revealClearTimer.current) clearTimeout(revealClearTimer.current);
    revealClearTimer.current = setTimeout(() => setRevealedWorkIndex(null), 6000);
  }, []);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const qrSize = searchParams.get("size") || null;
  const isQrScan = searchParams.get("ref") === "qr";

  // B9/F19: the signed-in messaging API rejects customers (403) and
  // guests (401), so only artists and venues take the /api/messages
  // path. Everyone else sends through /api/enquiry, which stores the
  // enquiry, drops it into the artist's inbox and emails the artist,
  // who replies to the visitor's email address.
  const isPortalSender = !!user && (userType === "artist" || userType === "venue");

  // B12/F17/H9: "Message the artist" CTAs for customers and guests now
  // land on /browse/<slug>?enquiry=1 so the enquiry form opens straight
  // away instead of funnelling into a portal inbox customers cannot use.
  useEffect(() => {
    if (searchParams.get("enquiry") === "1" && !showEnquiry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowEnquiry(true);
      setEnquirySent(false);
    }
    // Depend only on the params: re-running on showEnquiry would reopen
    // the modal the moment the user closed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Closing the modal strips ?enquiry=1 from the URL, so a second click
  // on a Message CTA (which pushes the same URL) re-triggers the
  // auto-open effect instead of being ignored as a no-op navigation.
  const closeEnquiry = useCallback(() => {
    setShowEnquiry(false);
    if (searchParams.get("enquiry")) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("enquiry");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  // Auto-open lightbox if ?work= param is present
  useEffect(() => {
    const workParam = searchParams.get("work");
    if (workParam && works.length > 0 && lightboxIndex === null) {
      const index = works.findIndex((w) => slugify(w.title) === workParam || w.id === workParam);
      if (index >= 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLightboxIndex(index);
        // Pre-select size if specified in URL
        if (qrSize) {
          const work = works[index];
          const sizeIdx = work.pricing.findIndex((p) => p.label === qrSize);
          if (sizeIdx >= 0) setSelectedSizeIdx(sizeIdx);
        }
      }
    }
  }, [searchParams, works, lightboxIndex, qrSize]);

  const allThemes = ["All", ...themes];

  // Keyboard navigation for lightbox
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        else setLightboxIndex(null);
      }
      if (e.key === "ArrowRight") setLightboxIndex((prev) => (prev !== null && prev < filteredWorks.length - 1 ? prev + 1 : prev));
      if (e.key === "ArrowLeft") setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
    },
    [lightboxIndex, filteredWorks.length, isFullscreen]
  );

  // Reset fullscreen when lightbox closes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lightboxIndex === null) setIsFullscreen(false);
  }, [lightboxIndex]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (lightboxIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [lightboxIndex]);

  // Track venue views of artist profiles
  useEffect(() => {
    if (userType === "venue" && user?.id) {
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "venue_viewed_artist",
          artist_slug: artistSlug,
          venue_user_id: user.id,
        }),
      }).catch(() => {});
    }
  }, [artistSlug, user?.id, userType]);

  // Track artwork views in lightbox
  useEffect(() => {
    if (lightboxIndex !== null && filteredWorks[lightboxIndex]) {
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "artwork_view",
          artist_slug: artistSlug,
          work_id: filteredWorks[lightboxIndex].id || filteredWorks[lightboxIndex].title,
        }),
      }).catch(() => {});
    }
  }, [lightboxIndex, artistSlug, filteredWorks]);

  // Sync URL with lightbox state so each artwork gets a shareable link
  useEffect(() => {
    if (navigatingAway.current) return;
    // B L730. "Message the artist" on an artwork page sends the visitor here
    // as /browse/<slug>?enquiry=1&work=<id>. The work param opens the lightbox,
    // which is intended, since the enquiry scopes itself to the open work. This
    // effect then rewrote the URL to the artwork permalink and dropped the
    // query string with it, so roughly 1.7 seconds after the modal appeared the
    // address bar was back on the artwork page. Reloading or sharing that link
    // reopened the artwork rather than the enquiry, and watching the address
    // bar rather than the page made the whole control look inert.
    //
    // While the enquiry is open, the URL the visitor arrived on is the one that
    // matters. closeEnquiry strips ?enquiry=1 when they dismiss it, which lets
    // this effect claim the URL again with the lightbox in the foreground.
    if (showEnquiry) return;
    if (lightboxIndex !== null && filteredWorks[lightboxIndex]) {
      const workSlug = slugify(filteredWorks[lightboxIndex].title);
      window.history.pushState(null, "", `/browse/${artistSlug}/${workSlug}`);
    } else if (lightboxIndex === null) {
      // Only restore if URL currently has a workSlug segment
      const segments = window.location.pathname.split("/").filter(Boolean);
      if (segments.length > 2) {
        window.history.pushState(null, "", `/browse/${artistSlug}`);
      }
    }
  }, [lightboxIndex, filteredWorks, artistSlug, showEnquiry]);

  // Handle browser back button closing the lightbox
  useEffect(() => {
    const handlePop = () => {
      const segments = window.location.pathname.split("/").filter(Boolean);
      if (segments.length <= 2) {
        setLightboxIndex(null);
      }
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const currentWork = lightboxIndex !== null ? filteredWorks[lightboxIndex] : null;

  // QR-scan venue banner (#8). When the visitor has just scanned a
  // QR code at a venue, the redirect carries `?ref=qr&venue=<slug>
  // &venueName=<display>`. We show a small "Seen in [venue name]"
  // line at the top of the portfolio so the visitor has the context
  // the physical scan gives them, and the venue gets a soft brand
  // mention on the page that landed them here.
  //
  // Legacy fallback: older QR redirects put the display name in the
  // `venue` slot. If `venueName` is missing we use whatever's there
  // so the banner still reads sensibly. The slug-vs-name split is
  // necessary because the checkout API needs the slug to credit the
  // venue's revenue-share cut.
  const qrVenueSlug = isQrScan ? searchParams.get("venue") : null;
  const qrVenueNameParam = isQrScan ? searchParams.get("venueName") : null;
  const qrVenueName = qrVenueNameParam || qrVenueSlug;
  // D10: the signed venue attribution minted by the QR redirect (`va`). Stored
  // alongside the slug and preferred at checkout.
  const qrAttributionToken = isQrScan ? searchParams.get("va") : null;

  // Stash the QR context in localStorage so the venue attribution
  // survives the navigation away from this page (buy buttons push
  // `/checkout?backTo=…` which strips the `?venue=` param). The
  // checkout page reads this back to pass venueSlug to the API.
  useEffect(() => {
    if (!isQrScan || !qrVenueSlug) return;
    saveQrContext({
      venueSlug: qrVenueSlug,
      venueName: qrVenueNameParam || undefined,
      source: "qr",
      attributionToken: qrAttributionToken || undefined,
    });
  }, [isQrScan, qrVenueSlug, qrVenueNameParam, qrAttributionToken]);

  // Premium+ artists pick a profile theme via the artist portal; Core
  // artists see the picker locked behind an upsell, so render-side we
  // ignore any saved theme for Core and fall through to the default
  // light scheme. canCustomiseTheme keeps the gate in one place.
  const themeId =
    profileTheme && canCustomiseTheme(subscriptionPlan)
      ? profileTheme
      : DEFAULT_PROFILE_THEME;
  const theme = getProfileTheme(themeId);
  const themeStyle = {
    ...themeCssVars(theme),
    backgroundColor: theme.bg,
    color: theme.fg,
  } as React.CSSProperties;

  return (
    <div
      style={themeStyle}
      data-theme={theme.id}
      data-theme-dark={theme.isDark ? "true" : "false"}
      className="min-h-screen"
    >
      {qrVenueName && (
        <div
          className="border-y"
          style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        >
          <div
            className="max-w-[1200px] mx-auto px-6 py-2.5 flex items-center gap-2 text-xs"
            style={{ color: theme.fg }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: theme.accent }}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3h-3z" />
              <path d="M20 14v7M14 20h7" />
            </svg>
            <span>
              Seen in <strong style={{ color: theme.fg }}>{qrVenueName}</strong>
            </span>
          </div>
        </div>
      )}
      {/* Portfolio section. Top padding reduced 2026-08-28: the hero above
          now carries the gap below its terms pills. */}
      <section className="pt-8 pb-14 lg:pt-10 lg:pb-18">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl">Portfolio</h2>
            {themes.length > 0 && (
              <select
                value={activeTheme}
                onChange={(e) => setActiveTheme(e.target.value)}
                className="px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
              >
                {allThemes.map((theme) => (
                  <option key={theme} value={theme}>{theme}</option>
                ))}
              </select>
            )}
          </div>

          {/* Masonry grid, row-major distribution so the artwork
              order matches reading order (left-to-right,
              top-to-bottom). The previous CSS `columns` layout filled
              column 1 fully before starting column 2, which was
              confusing when the artist had ordered works
              deliberately. We split into N flex columns by index
              modulo, so items still flow with variable heights but
              the *order* in the rendered grid matches the works
              array. Same pattern the marketplace gallery uses. */}
          {(() => {
            // B6: a theme that selects nothing used to render a blank
            // space with no explanation and no way out except finding
            // the picker again and choosing All. Say what happened and
            // give the visitor the button.
            if (filteredWorks.length === 0) {
              return (
                <div className="py-16 text-center">
                  <p className="text-sm text-muted mb-3">
                    No works under this theme.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTheme("All")}
                    className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer"
                  >
                    Show the whole portfolio
                  </button>
                </div>
              );
            }
            const cols: typeof filteredWorks[] = Array.from(
              { length: colCount },
              () => [],
            );
            filteredWorks.forEach((w, i) => cols[i % colCount].push(w));
            return (
          <div className="flex gap-3 sm:gap-5 items-start">
          {cols.map((colItems, ci) => (
          <div key={ci} className="flex-1 min-w-0 flex flex-col gap-3 sm:gap-5">
          {colItems.map((work) => {
            const index = filteredWorks.indexOf(work);
            return (
              <div
                key={work.id}
                id={`work-${slugify(work.title)}`}
                data-revealed={revealedWorkIndex === index ? "true" : undefined}
                className="group relative overflow-hidden rounded-sm scroll-mt-24 cursor-pointer"
                onClick={() => {
                  const href = `/browse/${artistSlug}/${slugify(work.title)}`;
                  // Touch devices (no :hover): first tap reveals the
                  // overlay, second tap opens the work. Desktop keeps
                  // the original "click anywhere on card → open" behaviour.
                  const isTouch = typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches;
                  if (isTouch && revealedWorkIndex !== index) {
                    setRevealedWorkIndex(index);
                    armRevealAutoHide();
                    return;
                  }
                  if (typeof window !== "undefined") window.open(href, "_blank", "noopener,noreferrer");
                }}
              >
                {/* Image with protection overlay. Square off-white
                    matting so portrait, landscape, and panoramic
                    works sit uniformly in the portfolio grid; the
                    artwork itself stays at true aspect ratio. The
                    full-detail / lightbox views below render the
                    image at its real proportions. */}
                <div
                  className="relative select-none"
                  onContextMenu={(e) => e.preventDefault()}
                  draggable={false}
                >
                  <ArtworkThumb
                    src={work.image}
                    alt={work.title}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    quality={60}
                    imageClassName="group-hover:scale-[1.02] transition-transform duration-500"
                  />
                  {/* Transparent overlay to block save-as */}
                  <div className="absolute inset-0" />

                  {/* Hover overlay (desktop) + tap-reveal overlay
                      (mobile, gated by data-revealed). Surfaces title,
                      medium, sizes summary, price, the placed-at-venue
                      chip when applicable, and a row of three actions:
                      Quick view (opens the lightbox in this tab), Open
                      (full artwork page), Buy now (adds to cart and
                      routes to checkout). Subtitle reads off sizes from
                      pricing rather than the raw `dimensions` field,
                      which often holds a "1920 × 1080 px" string from
                      upload that means nothing to a buyer. */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/55 group-data-[revealed=true]:bg-black/55 transition-colors duration-300 flex items-end pointer-events-none group-hover:pointer-events-auto group-data-[revealed=true]:pointer-events-auto">
                    <div className="p-5 w-full opacity-0 group-hover:opacity-100 group-data-[revealed=true]:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 group-data-[revealed=true]:translate-y-0">
                      <h3 className="text-white font-sans font-medium text-sm leading-snug mb-1">
                        {work.title}
                      </h3>
                      {(() => {
                        const sizesText =
                          work.pricing.length === 0
                            ? null
                            : work.pricing.length === 1
                              ? formatSizeLabelForDisplay(work.pricing[0].label)
                              : `${work.pricing.length} sizes available`;
                        const subtitleParts = [work.medium, sizesText].filter(
                          (p): p is string => Boolean(p),
                        );
                        if (subtitleParts.length === 0) return null;
                        return (
                          <p className="text-white/70 text-xs mb-1.5">
                            {subtitleParts.join(" · ")}
                          </p>
                        );
                      })()}
                      {work.placed_at_venue && (
                        <p className="text-[10px] text-white/85 mb-2 inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
                          Placed at {work.placed_at_venue}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white text-sm font-medium shrink-0">
                          {work.priceBand}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxIndex(index);
                            }}
                            className="px-2 py-1 text-[10px] text-white/90 border border-white/30 hover:border-white hover:bg-white/10 rounded-sm transition-colors"
                          >
                            Quick view
                          </button>
                          <Link
                            href={`/browse/${artistSlug}/${slugify(work.title)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 text-[10px] text-white/90 border border-white/30 hover:border-white hover:bg-white/10 rounded-sm transition-colors"
                          >
                            Open
                          </Link>
                          {work.available && work.pricing.length > 0 && (() => {
                            const sp = work.pricing[0];
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addItem({
                                    type: "work",
                                    workId: work.id,
                                    artistSlug,
                                    artistName,
                                    title: work.title,
                                    image: work.image,
                                    size: sp.label,
                                    price: sp.price,
                                    quantity: 1,
                                    quantityAvailable: typeof work.quantityAvailable === "number" ? work.quantityAvailable : null,
                                    shippingPrice: typeof work.shippingPrice === "number" ? work.shippingPrice : undefined,
                                    dimensions: sp.label || physicalSizeLabel(work.dimensions, ""),
                                    framed: false,
                                  });
                                  router.push(`/checkout?backTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                                }}
                                className="px-2 py-1 text-[10px] bg-accent hover:bg-accent-hover text-white rounded-sm transition-colors"
                              >
                                Buy now
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Top-left cluster: selection tick (venue only) then
                      the heart (Save) to its right. Same checkmark in
                      both states, transparent-ish when unselected,
                      filled accent circle with white tick once ticked. */}
                  {user && userType === "venue" && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); togglePlacementSelection(index); }}
                      // pointer-events-auto + z-20: ensure the tick
                      // sits above the data-revealed overlay (which
                      // becomes pointer-events-auto on tap) so a
                      // second tap on the tick toggles selection
                      // instead of being swallowed by the overlay.
                      // Also drop the opacity-0 default on touch
                      // devices — without :hover the tick was
                      // permanently invisible on mobile, so venues
                      // couldn't multi-select at all.
                      className={`absolute top-3 left-3 w-7 h-7 rounded-full flex items-center justify-center transition-all z-20 pointer-events-auto ${
                        selectedForPlacement.has(index)
                          ? "bg-accent text-white shadow-md"
                          : "bg-white/85 text-accent shadow-sm sm:bg-white/60 sm:opacity-0 sm:group-hover:opacity-100 sm:group-data-[revealed=true]:opacity-100 hover:bg-white backdrop-blur-sm"
                      }`}
                      title={selectedForPlacement.has(index) ? "Deselect" : "Select for placement"}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2 7 5.5 10.5 12 3.5" />
                      </svg>
                    </button>
                  )}
                  <div className={`absolute top-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-data-[revealed=true]:opacity-100 transition-opacity duration-300 z-20 ${user && userType === "venue" ? "left-12" : "left-3"}`}>
                    <SaveButton type="work" itemId={work.id} />
                  </div>
                  {/* Availability, hidden on hover, replaced by action buttons */}
                  <div className="absolute top-3 right-3 transition-opacity duration-200 group-hover:opacity-0 pointer-events-none">
                    {work.available ? (
                      <span className="inline-block px-2 py-0.5 bg-accent/90 text-white text-[10px] rounded-sm backdrop-blur-sm">
                        Available
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 bg-black/60 text-white text-[10px] rounded-sm backdrop-blur-sm">
                        Sold
                      </span>
                    )}
                  </div>
                  {/* Hover action buttons */}
                  <div className="absolute top-3 right-3 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxIndex(index); }}
                      title="Quick look"
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-white/95 text-foreground hover:bg-white hover:text-accent shadow-sm backdrop-blur-sm transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <Link
                      href={`/browse/${artistSlug}/${slugify(work.title)}`}
                      title="Full artwork page"
                      onClick={(e) => e.stopPropagation()}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-white/95 text-foreground hover:bg-white hover:text-accent shadow-sm backdrop-blur-sm transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                      </svg>
                    </Link>
                  </div>
                </div>

                {/* Always-visible caption beneath the thumbnail. QA
                    flagged /browse/fin-coles cards showing only an
                    "Available" pill, the title + medium + price band
                    were hidden inside the hover overlay so visitors on
                    touch (or anyone who didn't hover) had to tap the
                    card just to see what the artwork was. Pulling the
                    label down here keeps the hover overlay for the
                    quick-view + buy buttons but gives every visitor
                    the basic context up front. Mirrors how the other
                    demo artist pages already render their grid. */}
                <div className="px-1 pt-2 pb-1">
                  <p className="text-sm font-medium text-foreground line-clamp-1">
                    {work.title}
                  </p>
                  {(() => {
                    const sizesText =
                      work.pricing.length === 0
                        ? null
                        : work.pricing.length === 1
                          ? formatSizeLabelForDisplay(work.pricing[0].label)
                          : `${work.pricing.length} sizes`;
                    const subtitleParts = [work.medium, sizesText].filter(
                      (p): p is string => Boolean(p),
                    );
                    if (subtitleParts.length === 0) return null;
                    return (
                      <p className="text-xs text-muted line-clamp-1">
                        {subtitleParts.join(" · ")}
                      </p>
                    );
                  })()}
                  {work.priceBand && (
                    <p className="text-xs text-foreground/80 mt-0.5">
                      {work.priceBand}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          </div>
          ))}
          </div>
            );
          })()}
        </div>
      </section>

      {/* Extended bio */}
      <section className="py-10 lg:py-14 border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl mb-6">About the Artist</h2>
            <div
              className={`overflow-hidden transition-all duration-500 ${
                bioExpanded ? "max-h-[600px]" : "max-h-[4.5rem]"
              }`}
            >
              <p className="text-foreground/75 leading-relaxed">{extendedBio}</p>
            </div>
            <button
              type="button"
              onClick={() => setBioExpanded(!bioExpanded)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors duration-200 cursor-pointer"
            >
              {bioExpanded ? "Read less" : "Read more"}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className={`transition-transform duration-300 ${bioExpanded ? "rotate-180" : ""}`}
              >
                <polyline points="3 5 7 9 11 5" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {currentWork && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

          {/* Content */}
          <div
            className={
              isFullscreen
                ? "relative z-10 flex flex-col w-full h-full bg-black"
                : "relative z-10 flex flex-col lg:flex-row max-w-5xl w-full mx-2 sm:mx-4 mt-12 sm:mt-0 max-h-[85vh] sm:max-h-[90vh] bg-white rounded-sm overflow-hidden shadow-2xl"
            }
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image side, swipeable on mobile */}
            <div
              className={
                isFullscreen
                  ? "relative flex-1 bg-black select-none"
                  : "relative flex-1 min-h-[200px] sm:min-h-[350px] lg:min-h-[500px] bg-[#f5f5f3] select-none"
              }
              onContextMenu={(e) => e.preventDefault()}
              draggable={false}
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (touchStartX.current === null) return;
                const diff = e.changedTouches[0].clientX - touchStartX.current;
                touchStartX.current = null;
                if (Math.abs(diff) < 50) return;
                if (diff < 0 && lightboxIndex !== null && lightboxIndex < filteredWorks.length - 1) {
                  setLightboxIndex(lightboxIndex + 1);
                } else if (diff > 0 && lightboxIndex !== null && lightboxIndex > 0) {
                  setLightboxIndex(lightboxIndex - 1);
                }
              }}
            >
              <Image
                src={currentWork.image}
                alt={`${currentWork.title}, ${currentWork.medium}`}
                fill
                className={`object-contain select-none touch-pinch-zoom ${isFullscreen ? "p-0" : "p-4"}`}
                style={{ touchAction: "pinch-zoom" }}
                sizes={isFullscreen ? "100vw" : "(max-width: 640px) 100vw, 800px"}
                quality={isFullscreen ? 85 : 60}
                draggable={false}
                priority
                onContextMenu={(e) => e.preventDefault()}
              />
              {/* Overlay to block right-click save, allows touch through on mobile */}
              <div className="absolute inset-0 sm:pointer-events-auto pointer-events-none" onContextMenu={(e) => e.preventDefault()} />

              {/* Fullscreen toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); setIsFullscreen((v) => !v); }}
                className={`absolute ${isFullscreen ? "top-4 right-4 flex" : "top-3 left-3 flex sm:hidden"} w-10 h-10 rounded-full ${isFullscreen ? "bg-white/15 hover:bg-white/25 text-white" : "bg-white/80 hover:bg-white text-foreground"} items-center justify-center shadow-lg transition-colors z-10`}
                aria-label={isFullscreen ? "Exit fullscreen" : "Expand image"}
                title={isFullscreen ? "Exit fullscreen" : "Expand image"}
              >
                {isFullscreen ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4" /><path d="M15 3h4a2 2 0 0 1 2 2v4" /><path d="M15 21h4a2 2 0 0 0 2-2v-4" /><path d="M9 21H5a2 2 0 0 1-2-2v-4" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                )}
              </button>

              {/* Nav arrows */}
              {lightboxIndex > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-lg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
              )}
              {lightboxIndex < filteredWorks.length - 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-lg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              )}
            </div>

            {/* Details side */}
            <div className={`lg:w-80 shrink-0 p-3 sm:p-6 lg:p-8 flex flex-col border-t lg:border-t-0 lg:border-l border-border ${isFullscreen ? "hidden" : ""}`}>
              {/* Close button */}
              <button
                onClick={() => setLightboxIndex(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
              </button>

              {/* Artist + inline Message CTA
                  (moved from the bottom secondary-links stack so it's
                  immediately obvious how to contact the artist without
                  scrolling past the details, pricing, and CTAs.) */}
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-xs text-muted uppercase tracking-wider">{artistName}</p>
                <button
                  type="button"
                  onClick={() => { setShowEnquiry(true); setEnquirySent(false); }}
                  className="inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 text-[11px] font-medium text-accent border border-accent/30 hover:border-accent hover:bg-accent/5 rounded-full transition-colors"
                  aria-label={`Message ${artistName}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Message
                </button>
              </div>

              {/* Title */}
              <h3 className="text-base sm:text-xl font-serif text-foreground leading-snug mb-2 sm:mb-3">
                {currentWork.title}
              </h3>

              {/* Details. Dimensions row is suppressed entirely when
                  formatDimensionsForDisplay returns empty so a row
                  with an empty value (which is what happens when the
                  stored dimensions are implausibly large) doesn't
                  render. */}
              <div className="space-y-1.5 sm:space-y-2 mb-3 sm:mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Medium</span>
                  <span className="text-foreground font-medium">{currentWork.medium}</span>
                </div>
                {(() => {
                  const dims = formatDimensionsForDisplay(currentWork.dimensions);
                  if (!dims) return null;
                  return (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Dimensions</span>
                      <span className="text-foreground font-medium">{dims}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Availability + Save */}
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                {currentWork.available ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-accent">
                    <span className="w-2 h-2 rounded-full bg-accent" />
                    {typeof currentWork.quantityAvailable === "number"
                      ? currentWork.quantityAvailable > 0
                        ? `${currentWork.quantityAvailable} left`
                        : "Sold out"
                      : "Available"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                    <span className="w-2 h-2 rounded-full bg-muted" />
                    Sold
                  </span>
                )}
                <SaveButton type="work" itemId={currentWork.id} size="sm" />
              </div>

              {/* Size & Price dropdown */}
              {currentWork.available && currentWork.pricing.length > 0 && (
                <div className="mb-2 sm:mb-4">
                  <p className="text-xs text-muted uppercase tracking-wider mb-2">Size & Price</p>
                  <select
                    value={selectedSizeIdx}
                    onChange={(e) => setSelectedSizeIdx(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
                  >
                    {currentWork.pricing.map((sp, i) => {
                      // Mirror the detail page: some variants carry an empty
                      // label, which rendered a bare ", £X". Fall back to a
                      // formatted size and drop the comma when there's none.
                      const sizeText = formatSizeLabelForDisplay(sp.label);
                      return (
                        <option key={sp.label || i} value={i}>
                          {sizeText ? `${sizeText}, £${sp.price}` : `£${sp.price}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Frame selector */}
              {currentWork.available && currentWork.frameOptions && currentWork.frameOptions.length > 0 && (
                <div className="mb-2 sm:mb-4">
                  <p className="text-xs text-muted uppercase tracking-wider mb-2">Frame</p>
                  <select
                    value={selectedFrameIdx}
                    onChange={(e) => setSelectedFrameIdx(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
                  >
                    {currentWork.frameOptions.map((f, i) => (
                      <option key={f.label} value={i}>
                        {f.label}{f.priceUplift > 0 ? `, +\u00a3${f.priceUplift}` : ""}
                      </option>
                    ))}
                  </select>
                  {currentWork.frameOptions[selectedFrameIdx]?.imageUrl && (
                    <div className="mt-2 relative aspect-video rounded-sm overflow-hidden border border-border/60 bg-surface select-none" onContextMenu={(e) => e.preventDefault()}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentWork.frameOptions[selectedFrameIdx].imageUrl}
                        alt={`${currentWork.frameOptions[selectedFrameIdx].label} preview`}
                        className="w-full h-full object-cover pointer-events-none select-none"
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* CTA */}
              <div className="mt-auto space-y-2">
                {user && userType === "venue" && (
                  <button
                    onClick={() => {
                      navigatingAway.current = true;
                      setLightboxIndex(null);
                      router.push(`/venue-portal/placements?artist=${artistSlug}&artistName=${encodeURIComponent(artistName)}&work=${encodeURIComponent(currentWork.title)}&workImage=${encodeURIComponent(currentWork.image)}`);
                    }}
                    className="w-full px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
                  >
                    Request Placement
                  </button>
                )}
                {currentWork.available && currentWork.pricing.length > 0 && (() => {
                  const selected = currentWork.pricing[selectedSizeIdx] || currentWork.pricing[0];
                  const frameOpts = currentWork.frameOptions || [];
                  const currentFrame = frameOpts[selectedFrameIdx];
                  const frameUplift = currentFrame?.priceUplift || 0;
                  const sizeLabel = currentFrame ? `${selected.label} + ${currentFrame.label}` : selected.label;
                  const totalPrice = Math.round((selected.price + frameUplift) * 100) / 100;
                  // Per-size stock cap with fallback to work-level
                  // quantity for legacy works. Without this the lightbox
                  // happily over-adds and the toast lies, the original
                  // bug behind item #10.
                  const sizeStock: number | null = (() => {
                    const perSize = selected?.quantityAvailable;
                    if (typeof perSize === "number") return perSize;
                    if (typeof currentWork.quantityAvailable === "number") return currentWork.quantityAvailable;
                    return null;
                  })();
                  const soldOut = typeof sizeStock === "number" && sizeStock <= 0;
                  return (
                    <>
                      <button
                        disabled={soldOut}
                        onClick={() => {
                          const r = addItem({
                            type: "work",
                            workId: currentWork.id,
                            artistSlug,
                            artistName,
                            title: currentWork.title,
                            image: currentWork.image,
                            size: sizeLabel,
                            price: totalPrice,
                            quantity: 1,
                            quantityAvailable: sizeStock ?? null,
                            shippingPrice: currentWork.shippingPrice ?? undefined,
                          });
                          if (!r.ok) {
                            showToast(
                              r.reason === "out-of-stock"
                                ? "This size is sold out"
                                : `Only ${r.available} left at this size`,
                            );
                            return;
                          }
                          navigatingAway.current = true;
                          setLightboxIndex(null);
                          router.push(`/checkout?backTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                        }}
                        className="w-full px-5 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {soldOut ? "Sold out" : `Buy Now, £${totalPrice}`}
                      </button>
                      <button
                        disabled={soldOut}
                        onClick={() => {
                          const r = addItem({
                            type: "work",
                            workId: currentWork.id,
                            artistSlug,
                            artistName,
                            title: currentWork.title,
                            image: currentWork.image,
                            size: sizeLabel,
                            price: totalPrice,
                            quantity: 1,
                            quantityAvailable: sizeStock ?? null,
                            shippingPrice: currentWork.shippingPrice ?? undefined,
                          });
                          if (!r.ok) {
                            showToast(
                              r.reason === "out-of-stock"
                                ? "This size is sold out"
                                : `Only ${r.available} left at this size`,
                            );
                          } else {
                            showToast("Added to basket");
                          }
                        }}
                        className="w-full px-5 py-2 text-sm font-medium text-foreground border border-border hover:border-foreground/30 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add to Basket
                      </button>
                    </>
                  );
                })()}
              </div>

              {/* Secondary link, just the "full page" link now; the
                  Message CTA moved up next to the artist name. */}
              <div className="mt-4 text-xs">
                <Link
                  href={`/browse/${artistSlug}/${slugify(currentWork.title)}`}
                  onClick={() => { navigatingAway.current = true; setLightboxIndex(null); }}
                  className="inline-flex items-center gap-1 text-accent hover:text-accent-hover transition-colors"
                >
                  View full artwork page
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {/* Counter */}
              <p className="text-[10px] text-muted text-center mt-3">
                {lightboxIndex + 1} of {filteredWorks.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Floating venue actions bar — now multi-action. Earlier this
          only surfaced "Request Placement", but venues told us they
          regularly want to bulk-buy or open one offer for several
          works. The buttons all operate over the same selection set. */}
      {user && userType === "venue" && selectedForPlacement.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-foreground/95 backdrop-blur-sm border-t border-white/10 shadow-2xl">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-white text-sm font-medium">{selectedForPlacement.size} work{selectedForPlacement.size !== 1 ? "s" : ""} selected</span>
              <button onClick={() => setSelectedForPlacement(new Set())} className="text-white/50 text-xs hover:text-white transition-colors">Clear</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleBulkBuyNow}
                className="px-4 py-2 bg-white text-foreground text-sm font-medium rounded-sm hover:bg-white/90 transition-colors"
              >
                Buy Now
              </button>
              <button
                onClick={() => setBulkOfferOpen(true)}
                className="px-4 py-2 bg-white/10 text-white text-sm font-medium rounded-sm border border-white/20 hover:bg-white/15 transition-colors"
              >
                Make Offer
              </button>
              <button
                onClick={handleRequestPlacement}
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
              >
                Request Placement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Make Offer modal. Reuses the per-work component; we
          just hand it the selected work ids + an aggregate asking
          price so the 60% floor hint matches what the server will
          enforce. Empty workIds is filtered out by the API. */}
      <MakeOfferModal
        open={bulkOfferOpen}
        onClose={() => setBulkOfferOpen(false)}
        artistSlug={artistSlug}
        artistName={artistName}
        workIds={selectedWorkIds}
        workTitle={selectedWorks.length === 1 ? selectedWorks[0].title : `${selectedWorks.length} works`}
        askingPriceGbp={bulkAskingPrice > 0 ? bulkAskingPrice : null}
        onSubmitted={() => {
          setBulkOfferOpen(false);
          setSelectedForPlacement(new Set());
        }}
      />


      {/* Enquiry modal */}
      {showEnquiry && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={closeEnquiry}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 bg-white rounded-sm w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={closeEnquiry} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
            </button>
            {enquirySent ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h3 className="text-lg font-serif mb-2">Message Sent</h3>
                <p className="text-sm text-muted">
                  {isPortalSender
                    ? `Your enquiry has been sent to ${artistName}. They typically respond within 48 hours.`
                    : `Your enquiry has been sent to ${artistName}. They will reply to you by email, typically within 48 hours.`}
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-serif mb-1">Message {artistName}</h3>
                <p className="text-xs text-muted mb-4">
                  {currentWork ? `Re: ${currentWork.title}` : "General enquiry"}
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const data = new FormData(form);
                    const senderName = (data.get("senderName") as string) || authDisplayName || "Anonymous";
                    try {
                      // The enquiry type used to live as a [bracket]
                      // tag at the start of the content, which then
                      // surfaced in inbox previews ("[venue_looking] Re:
                      // Last Light o…"). The tag is for internal
                      // routing only, the artist shouldn't see the raw
                      // enum value. Now we tuck the type into metadata
                      // so the messaging UI can read it without
                      // contaminating the human-readable content.
                      const enquiryType = (data.get("enquiryType") as string) || "general";
                      // E43-h: the primary send goes through mutate (throws on a
                      // non-2xx), so the "enquiry sent" confirmation is shown ONLY when
                      // the message actually lands. The old code used authFetch (resolves
                      // on a 403/500) AND set enquirySent in the catch, so a failed
                      // enquiry told the visitor it had been sent.
                      //
                      // B9/F19: /api/messages 401s guests and 403s customers, and
                      // this form used to post there for everyone, so its main
                      // audience filled the form and then failed. Artists and
                      // venues keep the messages path; everyone else sends
                      // through /api/enquiry (which also drops the enquiry into
                      // the artist's inbox and emails them).
                      if (isPortalSender) {
                        await mutate("/api/messages", {
                          method: "POST",
                          body: JSON.stringify({
                            senderId: user?.id || null,
                            senderName,
                            senderType: userType || "anonymous",
                            recipientSlug: artistSlug,
                            content: `${currentWork ? `Re: ${currentWork.title}\n\n` : ""}${data.get("message")}`,
                            metadata: { enquiryType },
                          }),
                        });
                        // Also save to the enquiries table for backward compatibility.
                        // Best-effort: a failure here must not undo the confirmation, since
                        // the message itself already landed.
                        try {
                          await fetch("/api/enquiry", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              senderName,
                              senderEmail: data.get("senderEmail") || user?.email || "",
                              artistSlug,
                              workTitle: currentWork?.title || null,
                              enquiryType,
                              message: data.get("message"),
                            }),
                          });
                        } catch { /* best-effort secondary notification */ }
                      } else {
                        await mutate("/api/enquiry", {
                          method: "POST",
                          body: JSON.stringify({
                            senderName,
                            senderEmail: (data.get("senderEmail") as string) || user?.email || "",
                            artistSlug,
                            workTitle: currentWork?.title || null,
                            enquiryType,
                            message: data.get("message"),
                          }),
                        });
                      }
                      setEnquirySent(true);
                    } catch (err) {
                      showToast(
                        err instanceof ApiError ? err.message : "Could not send your enquiry. Please try again.",
                        { variant: "error" },
                      );
                    }
                  }}
                  className="space-y-3"
                >
                  <input type="text" name="senderName" placeholder="Your name" required defaultValue={authDisplayName || ""} className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                  <input type="email" name="senderEmail" placeholder="Your email" required defaultValue={user?.email || ""} className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                  <select name="enquiryType" className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm text-muted focus:outline-none focus:border-accent/50">
                    {ENQUIRY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.option}</option>
                    ))}
                  </select>
                  <textarea name="message" placeholder="Your message..." rows={3} required className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                  <button type="submit" className="w-full px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors">
                    Send Message
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
