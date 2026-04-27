"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { geocodePostcode } from "@/lib/geocode";
import { useAuth } from "@/context/AuthContext";
import SpacesPlacementRequestForm, {
  type SpacesVenueOption,
} from "@/components/SpacesPlacementRequestForm";

interface ArtistWorkLite {
  id: string;
  title: string;
  image: string;
  dimensions?: string | null;
  medium?: string | null;
}

interface DemandVenue {
  slug: string;
  name: string;
  type: string;
  location: string;
  coordinates: { lat: number; lng: number } | null;
  wallSpace: string;
  approximateFootfall: string;
  preferredStyles: string[];
  preferredThemes: string[];
  interestedInFreeLoan: boolean;
  interestedInRevenueShare: boolean;
  interestedInDirectPurchase: boolean;
  description: string;
  image: string;
  images?: string[];
  displayWallSpace?: string;
  displayLighting?: string;
  displayInstallNotes?: string;
  displayRotationFrequency?: string;
}

interface DemandStats {
  total: number;
  openToDisplay: number;
  openToPurchase: number;
  openToRevenueShare: number;
  byType: Record<string, number>;
}

function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const VENUE_TYPES = ["All", "Café", "Restaurant", "Hotel", "Office", "Salon", "Gallery", "Coworking", "Wine Bar"];

export default function SpacesLookingForArtPage() {
  const [venues, setVenues] = useState<DemandVenue[]>([]);
  const [stats, setStats] = useState<DemandStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [postcode, setPostcode] = useState("");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [postcodeError, setPostcodeError] = useState(false);
  const [searching, setSearching] = useState(false);

  const [filterType, setFilterType] = useState("All");
  const [filterArrangement, setFilterArrangement] = useState<"all" | "display" | "revenue" | "purchase">("all");
  const [maxDistance, setMaxDistance] = useState(9999);
  const DISTANCE_OPTIONS = [
    { label: "5 mi", value: 5 },
    { label: "10 mi", value: 10 },
    { label: "25 mi", value: 25 },
    { label: "50 mi", value: 50 },
    { label: "All", value: 9999 },
  ];

  const { user, userType, loading: authLoading, subscriptionStatus, subscriptionPlan, session } = useAuth();
  const router = useRouter();
  const [ownVenueSlug, setOwnVenueSlug] = useState<string | null>(null);

  // Artist-side state for the inline placement-request flow.
  // - `myWorks` is loaded once per session (artists only).
  // - `requestOpenSlug` tracks which venue card has the form expanded.
  // - `sentRequests` records venues the artist has just requested in
  //   this session, so the card flips to a success state.
  const [myWorks, setMyWorks] = useState<ArtistWorkLite[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);
  const [requestOpenSlug, setRequestOpenSlug] = useState<string | null>(null);
  const [sentRequests, setSentRequests] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/venues/demand")
      .then((r) => r.json())
      .then((data) => { setVenues(data.venues || []); setStats(data.stats || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Venues shouldn't browse other venues — this page is for artists.
  // We fetch the venue's own slug so we can point them at their own
  // public profile rather than exposing the discovery UI to them.
  useEffect(() => {
    if (userType !== "venue" || !user) return;
    (async () => {
      try {
        const { authFetch } = await import("@/lib/api-client");
        const res = await authFetch("/api/venue-profile");
        const data = await res.json();
        if (data.profile?.slug) setOwnVenueSlug(data.profile.slug);
      } catch { /* ignore */ }
    })();
  }, [user, userType]);

  // Load the signed-in artist's portfolio works once. The placement
  // request form lets them pick which work they're proposing for the
  // venue, so we need this list available when they expand a card.
  useEffect(() => {
    if (userType !== "artist" || !session?.access_token) return;
    let cancelled = false;
    setWorksLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/artist-works", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Works fetch ${res.status}`);
        const data = (await res.json()) as { works?: ArtistWorkLite[] };
        if (!cancelled) setMyWorks(data.works || []);
      } catch {
        if (!cancelled) setMyWorks([]);
      } finally {
        if (!cancelled) setWorksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userType, session?.access_token]);

  const isSubscribed = subscriptionStatus === "active" || subscriptionStatus === "trialing";
  // Venues are locked out of viewing other venues — this page is for artists/customers
  // discovering venue demand. Venues manage their own profile through /venue-portal.
  const canSeeDetails = userType !== "venue" && (isSubscribed || userType === "customer");
  const canMessageVenues = userType !== "venue" && (isSubscribed || userType === "customer");
  // Inline placement requests are artist-only — customers and unauthenticated
  // visitors can browse and message but not formally propose terms.
  const canRequestPlacement = userType === "artist" && isSubscribed;

  async function handlePostcodeSearch() {
    if (!postcode.trim()) return;
    setSearching(true);
    setPostcodeError(false);
    const coords = await geocodePostcode(postcode.trim());
    if (coords) {
      setUserCoords(coords);
    } else {
      setPostcodeError(true);
    }
    setSearching(false);
  }

  const filtered = useMemo(() => {
    let list = venues;
    if (filterType !== "All") list = list.filter((v) => v.type === filterType);
    if (filterArrangement === "display") list = list.filter((v) => v.interestedInFreeLoan || v.interestedInRevenueShare);
    if (filterArrangement === "revenue") list = list.filter((v) => v.interestedInRevenueShare);
    if (filterArrangement === "purchase") list = list.filter((v) => v.interestedInDirectPurchase);

    if (userCoords) {
      list = list
        .filter((v) => v.coordinates)
        .map((v) => ({ ...v, distance: calcDistance(userCoords.lat, userCoords.lng, v.coordinates!.lat, v.coordinates!.lng) }))
        .filter((v) => v.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
    }

    return list;
  }, [venues, filterType, filterArrangement, userCoords, maxDistance]);

  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="pt-24 lg:pt-28 pb-16 lg:pb-20 relative overflow-hidden -mt-14 lg:-mt-16">
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1920&h=1200&fit=crop&crop=center" alt="" className="w-full h-full min-h-full object-cover" />
          <div className="absolute inset-0 bg-black/75" />
        </div>
        <div className="max-w-[1000px] mx-auto px-6 text-center relative z-10">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">For Artists</p>
          <h1 className="font-serif text-2xl sm:text-4xl lg:text-5xl text-white mb-4">Venues Looking for Art</h1>
          <p className="text-base sm:text-lg text-white/50 max-w-lg mx-auto mb-8">
            Real venues actively seeking artwork. Enter your postcode to see demand near you.
          </p>

          {/* Postcode search */}
          <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
            <input
              type="text"
              value={postcode}
              onChange={(e) => { setPostcode(e.target.value.toUpperCase()); setPostcodeError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handlePostcodeSearch(); }}
              placeholder="ENTER YOUR POSTCODE"
              className="flex-1 px-4 py-3 bg-white border border-white/80 rounded-sm text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent uppercase"
            />
            <button
              onClick={handlePostcodeSearch}
              disabled={searching}
              className="px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>
          {postcodeError && <p className="text-red-400 text-xs mt-2">Postcode not found, try again</p>}
          {userCoords && (
            <div className="mt-4 space-y-3">
              <p className="text-accent text-xs flex items-center justify-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                Showing venues near {postcode}
                <button onClick={() => { setUserCoords(null); setPostcode(""); setMaxDistance(9999); }} className="ml-1 text-white/50 underline">clear</button>
              </p>
              {/* Distance toggle */}
              <div className="flex items-center justify-center gap-1.5">
                {DISTANCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMaxDistance(opt.value)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      maxDistance === opt.value ? "bg-white text-foreground border-white" : "border-white/30 text-white/60 hover:border-white/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Stats — computed from filtered results */}
      <section className="border-b border-border">
        <div className="max-w-[1200px] mx-auto px-6 py-4">
          <div className="flex items-center justify-center gap-6 sm:gap-10 text-sm">
            <div className="text-center">
              <p className="text-2xl font-serif text-foreground">{filtered.length}</p>
              <p className="text-xs text-muted">Venues</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-serif text-foreground">{filtered.filter((v) => v.interestedInFreeLoan || v.interestedInRevenueShare).length}</p>
              <p className="text-xs text-muted">Open to Display</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-serif text-foreground">{filtered.filter((v) => v.interestedInRevenueShare).length}</p>
              <p className="text-xs text-muted">Revenue Share</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-serif text-foreground">{filtered.filter((v) => v.interestedInDirectPurchase).length}</p>
              <p className="text-xs text-muted">Looking to Buy</p>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b border-border bg-[#FAF8F5]">
        <div className="max-w-[1200px] mx-auto px-6 py-3">
          <div className="flex items-center gap-4 overflow-x-auto">
            <div className="flex items-center gap-1.5">
              {VENUE_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap cursor-pointer ${
                    filterType === t ? "bg-foreground text-white border-foreground" : "border-border text-muted hover:border-foreground/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="w-px h-6 bg-border shrink-0" />
            <div className="flex items-center gap-1.5">
              {([
                { key: "all", label: "All Arrangements" },
                { key: "display", label: "Display" },
                { key: "revenue", label: "Revenue Share" },
                { key: "purchase", label: "Purchase" },
              ] as const).map((a) => (
                <button
                  key={a.key}
                  onClick={() => setFilterArrangement(a.key)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap cursor-pointer ${
                    filterArrangement === a.key ? "bg-accent text-white border-accent" : "border-border text-muted hover:border-foreground/30"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted shrink-0">{filtered.length} venue{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </section>

      {/* Venue cards */}
      <section className="py-10 lg:py-14">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Venue users: block the discovery grid entirely. They can
              preview their OWN public venue page (so they know what
              artists see) but shouldn't be browsing other venues. */}
          {userType === "venue" && !authLoading && (
            <div className="max-w-xl mx-auto bg-surface border border-border rounded-sm p-8 text-center">
              <p className="text-sm font-medium text-foreground mb-1">Spaces is for artists</p>
              <p className="text-xs text-muted mb-5">
                This is where artists discover venues to place their work. To keep browsing fair, venues don&rsquo;t see other venues here — but you can preview how artists see YOUR space.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {ownVenueSlug && (
                  <Link href={`/venues/${ownVenueSlug}`} className="inline-flex items-center justify-center px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors">
                    Preview my venue page
                  </Link>
                )}
                <Link href="/venue-portal/profile" className="inline-flex items-center justify-center px-5 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground hover:border-foreground/30 transition-colors">
                  Edit my profile
                </Link>
              </div>
            </div>
          )}
          {userType !== "venue" && (loading || authLoading ? (
            <p className="text-muted text-sm text-center py-16">Loading venues...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted text-lg mb-2">No venues match these filters</p>
              <button onClick={() => { setFilterType("All"); setFilterArrangement("all"); }} className="text-sm text-accent hover:text-accent-hover">Clear filters</button>
            </div>
          ) : (
            <>
            {!canSeeDetails && filtered.length >= 1 && (
              <div className="bg-accent/5 border border-accent/20 rounded-sm p-6 mb-8 text-center">
                <p className="text-sm font-medium text-foreground mb-1">Subscribe to see full venue details</p>
                <p className="text-xs text-muted mb-4">Get venue names, contact details, and connect directly. Plans from £9.99/month.</p>
                <Link href="/pricing" className="inline-flex items-center justify-center px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors">
                  View Plans
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((venue) => (
                <div id={`venue-${venue.slug}`} key={venue.slug} className={`bg-surface border border-border rounded-sm overflow-hidden transition-all scroll-mt-24 target:ring-2 target:ring-accent ${canSeeDetails ? "hover:border-accent/30 hover:shadow-sm" : ""}`}>
                  {/* Hero image: prefer the venue's own gallery (uploaded
                      via the venue portal). Falls back to the legacy single
                      image if no gallery exists. */}
                  {(() => {
                    const gallery = (venue.images || []).filter(Boolean);
                    const hero = gallery[0] || venue.image;
                    if (!hero) return null;
                    return (
                      <div className={`h-40 relative bg-border/20 ${!canSeeDetails ? "blur-sm" : ""}`}>
                        <Image src={hero} alt={canSeeDetails ? venue.name : "Venue"} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
                        {gallery.length > 1 && canSeeDetails && (
                          <span className="absolute bottom-2 right-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded-full">
                            {gallery.length} photos
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {/* Thumbnail strip — additional uploaded photos shown
                      under the hero so artists get a real sense of the
                      space, not just the headline shot. */}
                  {canSeeDetails && (venue.images || []).length > 1 && (
                    <div className="flex gap-1 px-2 pt-2 overflow-x-auto">
                      {(venue.images || []).slice(1, 5).map((url, i) => (
                        <div key={i} className="relative w-16 h-12 shrink-0 rounded-sm overflow-hidden border border-border bg-background">
                          <Image src={url} alt="" fill className="object-cover" sizes="64px" />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h3 className="text-base font-medium text-foreground">
                          {canSeeDetails ? venue.name : `${venue.type} in ${venue.location}`}
                        </h3>
                        <p className="text-xs text-muted">{venue.type} &middot; {venue.location}</p>
                      </div>
                      {"distance" in venue && (
                        <span className="text-xs text-accent font-medium shrink-0">{(venue as DemandVenue & { distance: number }).distance.toFixed(1)} mi</span>
                      )}
                    </div>

                    {/* What they want */}
                    {venue.preferredStyles.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Looking for</p>
                        <div className="flex flex-wrap gap-1">
                          {venue.preferredStyles.slice(0, 4).map((s) => (
                            <span key={s} className="text-[10px] px-2 py-0.5 bg-accent/5 text-accent border border-accent/15 rounded-full">{s}</span>
                          ))}
                          {venue.preferredStyles.length > 4 && <span className="text-[10px] text-muted">+{venue.preferredStyles.length - 4}</span>}
                        </div>
                      </div>
                    )}

                    {/* Arrangement badges */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(venue.interestedInFreeLoan || venue.interestedInRevenueShare) && (
                        <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-sm">
                          Display{venue.interestedInRevenueShare ? " + Rev Share" : ""}
                        </span>
                      )}
                      {venue.interestedInDirectPurchase && (
                        <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-sm">Purchase</span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
                      {venue.wallSpace && <span>{venue.wallSpace}</span>}
                      {venue.approximateFootfall && <><span className="w-0.5 h-0.5 rounded-full bg-muted" /><span>{venue.approximateFootfall}</span></>}
                    </div>

                    {/* Description + display needs — only shown to subscribers
                        so the venue's full pitch isn't leaked to drive-by
                        visitors, but is visible to artists who can act on it. */}
                    {canSeeDetails && (
                      <>
                        {venue.description && (
                          <p className="mt-3 text-xs text-foreground/80 leading-relaxed line-clamp-3">{venue.description}</p>
                        )}
                        {(venue.displayWallSpace || venue.displayLighting || venue.displayInstallNotes || venue.displayRotationFrequency) && (
                          <div className="mt-3 grid grid-cols-1 gap-1.5">
                            {venue.displayWallSpace && (
                              <p className="text-[10px] text-muted"><span className="text-foreground/70 font-medium">Wall:</span> {venue.displayWallSpace}</p>
                            )}
                            {venue.displayLighting && (
                              <p className="text-[10px] text-muted"><span className="text-foreground/70 font-medium">Lighting:</span> {venue.displayLighting}</p>
                            )}
                            {venue.displayInstallNotes && (
                              <p className="text-[10px] text-muted"><span className="text-foreground/70 font-medium">Install:</span> {venue.displayInstallNotes}</p>
                            )}
                            {venue.displayRotationFrequency && (
                              <p className="text-[10px] text-muted"><span className="text-foreground/70 font-medium">Rotation:</span> {venue.displayRotationFrequency}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Message button for subscribers / Lock for non-subscribers */}
                    {canSeeDetails && canMessageVenues ? (
                      <>
                        {sentRequests[venue.slug] ? (
                          // Just-sent confirmation — flips back to normal CTAs
                          // once the artist clicks "Send another"; the placement
                          // record itself stays in the artist's portal.
                          <div className="mt-3 pt-3 border-t border-border bg-green-50/40 -mx-5 -mb-5 px-5 py-4 rounded-b-sm">
                            <div className="flex items-start gap-2 mb-2">
                              <span className="w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground">Request sent to {venue.name}</p>
                                <p className="text-[11px] text-muted mt-0.5">
                                  They&rsquo;ll get an email; you&rsquo;ll see their reply in your portal.
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-3 mt-2">
                              <Link
                                href={`/placements/${encodeURIComponent(sentRequests[venue.slug])}`}
                                className="text-[11px] font-medium text-accent hover:text-accent-hover transition-colors"
                              >
                                View placement &rarr;
                              </Link>
                              <button
                                onClick={() => {
                                  setSentRequests((prev) => {
                                    const next = { ...prev };
                                    delete next[venue.slug];
                                    return next;
                                  });
                                }}
                                className="text-[11px] text-muted hover:text-foreground transition-colors"
                              >
                                Send another
                              </button>
                            </div>
                          </div>
                        ) : requestOpenSlug === venue.slug && canRequestPlacement ? (
                          // Inline form — artist picks a work + arrangement,
                          // submits straight to /api/placements.
                          <SpacesPlacementRequestForm
                            venue={{
                              slug: venue.slug,
                              name: venue.name,
                              interestedInRevenueShare: venue.interestedInRevenueShare,
                              interestedInFreeLoan: venue.interestedInFreeLoan,
                              interestedInDirectPurchase: venue.interestedInDirectPurchase,
                            } as SpacesVenueOption}
                            works={myWorks}
                            worksLoading={worksLoading}
                            authToken={session?.access_token ?? null}
                            onCancel={() => setRequestOpenSlug(null)}
                            onSuccess={(placementId) => {
                              setSentRequests((prev) => ({ ...prev, [venue.slug]: placementId }));
                              setRequestOpenSlug(null);
                            }}
                          />
                        ) : (
                          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 flex-wrap">
                              {canRequestPlacement && (
                                <button
                                  onClick={() => setRequestOpenSlug(venue.slug)}
                                  className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
                                >
                                  Request placement &rarr;
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const portalBase = userType === "artist" ? "/artist-portal" : "/venue-portal";
                                  router.push(`${portalBase}/messages?artist=${venue.slug}&artistName=${encodeURIComponent(venue.name)}`);
                                }}
                                className="text-xs font-medium text-muted hover:text-foreground transition-colors"
                              >
                                Message
                              </button>
                            </div>
                            <Link href={`/venues/${venue.slug}`} className="text-xs text-muted hover:text-foreground transition-colors">
                              View full profile
                            </Link>
                          </div>
                        )}
                      </>
                    ) : canSeeDetails && !canMessageVenues ? (
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                        <Link href="/artist-portal/billing" className="flex items-center gap-1.5 text-xs text-muted hover:text-accent transition-colors">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                          Upgrade to Premium to message venues
                        </Link>
                        <Link href={`/venues/${venue.slug}`} className="text-xs text-muted hover:text-foreground transition-colors">
                          View full profile
                        </Link>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-border">
                        <Link href="/pricing" className="flex items-center gap-2 text-xs text-accent hover:text-accent-hover transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                          Subscribe to see venue name &amp; connect
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </>
          ))}

          {/* CTA — artists only; venues already see the dedicated
              "Spaces is for artists" block above. */}
          {userType !== "venue" && (
            <div className="mt-12 text-center">
              <p className="text-muted mb-4">Ready to connect with these venues?</p>
              <Link href="/apply" className="inline-flex items-center justify-center px-8 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                Apply to Join Wallplace
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
