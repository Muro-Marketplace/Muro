"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { geocodePostcode } from "@/lib/geocode";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

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

  const { user, userType } = useAuth();
  const router = useRouter();
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    fetch("/api/venues/demand")
      .then((r) => r.json())
      .then((data) => { setVenues(data.venues || []); setStats(data.stats || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Check if artist has active subscription
  useEffect(() => {
    if (!user) return;
    if (userType === "venue" || userType === "customer") { setIsSubscribed(true); return; }
    authFetch("/api/artist-profile")
      .then((r) => r.json())
      .then((data) => {
        const status = data.profile?.subscription_status;
        if (status === "active" || status === "trialing") setIsSubscribed(true);
      })
      .catch(() => {});
  }, [user, userType]);

  const canSeeDetails = isSubscribed || userType === "venue" || userType === "customer";

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
          {postcodeError && <p className="text-red-400 text-xs mt-2">Postcode not found — try again</p>}
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
          {loading ? (
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
                <div key={venue.slug} className={`bg-surface border border-border rounded-sm overflow-hidden transition-all ${canSeeDetails ? "hover:border-accent/30 hover:shadow-sm" : ""}`}>
                  {venue.image && (
                    <div className={`h-40 relative bg-border/20 ${!canSeeDetails ? "blur-sm" : ""}`}>
                      <Image src={venue.image} alt={canSeeDetails ? venue.name : "Venue"} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
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
                    <div className="flex items-center gap-3 text-[10px] text-muted">
                      {venue.wallSpace && <span>{venue.wallSpace}</span>}
                      {venue.approximateFootfall && <><span className="w-0.5 h-0.5 rounded-full bg-muted" /><span>{venue.approximateFootfall}</span></>}
                    </div>

                    {/* Message button for subscribers / Lock for non-subscribers */}
                    {canSeeDetails ? (
                      <div className="mt-3 pt-3 border-t border-border">
                        <button
                          onClick={() => {
                            const portalBase = userType === "artist" ? "/artist-portal" : "/venue-portal";
                            router.push(`${portalBase}/messages?artist=${venue.slug}&artistName=${encodeURIComponent(venue.name)}`);
                          }}
                          className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                        >
                          Message this venue &rarr;
                        </button>
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
          )}

          {/* CTA */}
          <div className="mt-12 text-center">
            <p className="text-muted mb-4">Ready to connect with these venues?</p>
            <Link href="/apply" className="inline-flex items-center justify-center px-8 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
              Apply to Join Wallplace
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
