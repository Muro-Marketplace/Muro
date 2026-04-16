"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { authFetch } from "@/lib/api-client";

function formatSlug(slug: string): string {
  if (!slug) return "";
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

type FilterTab = "All" | "Pending" | "Active" | "Completed";
type PlacementStatus = "Active" | "Pending" | "Declined" | "Completed";

interface PlacementRequest {
  id: string;
  artistName: string;
  artistSlug: string;
  workTitle: string;
  workImage: string;
  arrangementType: string;
  revenueSharePercent?: number;
  status: PlacementStatus;
  date: string;
  respondedAt?: string;
  message?: string;
}

interface ArtistWork {
  id: string;
  title: string;
  image: string;
  medium: string;
  priceBand: string;
}

const statusStyles: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  Pending: "bg-amber-100 text-amber-700",
  Declined: "bg-red-100 text-red-600",
  Completed: "bg-gray-100 text-gray-600",
};

const tabs: FilterTab[] = ["All", "Pending", "Active", "Completed"];

function normaliseStatus(raw: string): PlacementStatus {
  const map: Record<string, PlacementStatus> = {
    active: "Active", pending: "Pending", declined: "Declined",
    completed: "Completed", paused: "Completed",
  };
  return map[raw.toLowerCase()] || "Pending";
}

function typeLabel(raw: string, pct?: number): string {
  if (raw === "revenue_share") return `Revenue Share${pct ? ` (${pct}%)` : ""}`;
  if (raw === "free_loan") return "Free Loan";
  return raw;
}

export default function VenuePlacementsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [placements, setPlacements] = useState<PlacementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Request form state
  const [showForm, setShowForm] = useState(false);
  const [artistSlug, setArtistSlug] = useState("");
  const [artistName, setArtistName] = useState("");
  const [artistWorks, setArtistWorks] = useState<ArtistWork[]>([]);
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());
  const [revenuePercent, setRevenuePercent] = useState(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [worksLoading, setWorksLoading] = useState(false);

  // Pre-populate from URL params (from browse lightbox)
  useEffect(() => {
    const paramArtist = searchParams.get("artist");
    const paramName = searchParams.get("artistName");
    const paramWork = searchParams.get("work");
    const paramWorkImage = searchParams.get("workImage");

    if (paramArtist) {
      setArtistSlug(paramArtist);
      setArtistName(paramName || paramArtist);
      setShowForm(true);

      // Pre-select the work from lightbox
      if (paramWork) {
        setSelectedWorks(new Set([paramWork]));
      }

      // Load artist's full portfolio
      loadArtistWorks(paramArtist, paramWork || undefined, paramWorkImage || undefined);
    }
  }, [searchParams]);

  async function loadArtistWorks(slug: string, preselectedWork?: string, preselectedImage?: string) {
    setWorksLoading(true);
    try {
      const res = await fetch(`/api/browse-artists`);
      const data = await res.json();
      const artist = (data.artists || []).find((a: { slug: string }) => a.slug === slug);
      if (artist?.works) {
        setArtistWorks(artist.works.map((w: ArtistWork) => ({
          id: w.id,
          title: w.title,
          image: w.image,
          medium: w.medium,
          priceBand: w.priceBand,
        })));
        if (!artistName && artist.name) setArtistName(artist.name);
      } else if (preselectedWork) {
        // Fallback: at least show the pre-selected work
        setArtistWorks([{ id: "pre", title: preselectedWork, image: preselectedImage || "", medium: "", priceBand: "" }]);
      }
    } catch {
      if (preselectedWork) {
        setArtistWorks([{ id: "pre", title: preselectedWork, image: preselectedImage || "", medium: "", priceBand: "" }]);
      }
    }
    setWorksLoading(false);
  }

  // Load existing placements
  useEffect(() => {
    authFetch("/api/placements")
      .then((res) => res.json())
      .then((data) => {
        if (data.placements) {
          // Resolve artist names from browse-artists
          let artistNameMap: Record<string, string> = {};
          try {
            const artistRes = await fetch("/api/browse-artists");
            const artistData = await artistRes.json();
            for (const a of (artistData.artists || [])) {
              artistNameMap[a.slug] = a.name;
            }
          } catch { /* fallback to slug */ }

          const mapped: PlacementRequest[] = data.placements.map((p: Record<string, unknown>) => ({
            id: p.id,
            artistName: artistNameMap[p.artist_slug as string] || formatSlug(p.artist_slug as string) || "Artist",
            artistSlug: p.artist_slug || "",
            workTitle: p.work_title || "Untitled",
            workImage: (p.work_image as string) || "",
            arrangementType: p.arrangement_type as string || "free_loan",
            revenueSharePercent: p.revenue_share_percent as number | undefined,
            status: normaliseStatus(p.status as string || "pending"),
            date: p.created_at ? new Date(p.created_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
            respondedAt: p.responded_at ? new Date(p.responded_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : undefined,
            message: p.message as string | undefined,
          }));
          setPlacements(mapped);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleWork(title: string) {
    setSelectedWorks((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  async function handleSubmitRequest() {
    if (!artistSlug || selectedWorks.size === 0) return;
    setSubmitting(true);

    const newPlacements = Array.from(selectedWorks).map((workTitle) => {
      const work = artistWorks.find((w) => w.title === workTitle);
      return {
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        workTitle,
        workImage: work?.image || "",
        venueSlug: "", // API resolves from auth
        type: revenuePercent > 0 ? "revenue_share" as const : "free_loan" as const,
        revenueSharePercent: revenuePercent > 0 ? revenuePercent : undefined,
        message: message || undefined,
      };
    });

    try {
      const res = await authFetch("/api/placements", {
        method: "POST",
        body: JSON.stringify({
          placements: newPlacements.map((p) => ({
            ...p,
            venueSlug: "self", // Placeholder — API resolves venue from auth for fromVenue requests
          })),
          fromVenue: true,
          artistSlug,
        }),
      });

      if (res.ok) {
        const mapped: PlacementRequest[] = newPlacements.map((p) => ({
          id: p.id,
          artistName: artistName || artistSlug,
          artistSlug,
          workTitle: p.workTitle,
          workImage: p.workImage,
          arrangementType: revenuePercent > 0 ? "revenue_share" : "free_loan",
          revenueSharePercent: p.revenueSharePercent,
          status: "Pending",
          date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          message: p.message,
        }));
        setPlacements([...mapped, ...placements]);
        setShowForm(false);
        setSelectedWorks(new Set());
        setMessage("");
        setRevenuePercent(0);
      }
    } catch (err) {
      console.error("Placement request error:", err);
    }
    setSubmitting(false);
  }

  async function respond(id: string, accept: boolean) {
    setResponding(id);
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id, status: accept ? "active" : "declined" }),
      });
      if (res.ok) {
        setPlacements((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, status: accept ? "Active" : "Declined", respondedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) }
              : p
          )
        );
      }
    } catch (err) {
      console.error("Response error:", err);
    } finally {
      setResponding(null);
    }
  }

  const filtered = placements.filter((p) => {
    if (activeTab === "All") return true;
    if (activeTab === "Completed") return p.status === "Completed" || p.status === "Declined";
    return p.status === activeTab;
  });

  const pendingCount = placements.filter((p) => p.status === "Pending").length;
  const inputClass = "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors";

  return (
    <VenuePortalLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl">Placements</h1>
          <p className="text-sm text-muted mt-1">Request and manage artwork placements</p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-medium rounded-full">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {pendingCount} pending
            </span>
          )}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
            >
              + Request Placement
            </button>
          )}
        </div>
      </div>

      {/* Request Placement Form */}
      {showForm && (
        <div className="bg-surface border border-border rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Request Placement</h2>
            <button onClick={() => { setShowForm(false); setArtistSlug(""); setArtistWorks([]); setSelectedWorks(new Set()); }} className="text-xs text-muted hover:text-foreground transition-colors">Cancel</button>
          </div>

          <div className="space-y-5">
            {/* Artist info */}
            {artistName && (
              <div className="bg-accent/5 border border-accent/20 rounded-sm px-4 py-3">
                <p className="text-sm"><span className="text-accent font-medium">Artist:</span> {artistName}</p>
              </div>
            )}

            {/* Select works from artist portfolio */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Works <span className="text-accent">*</span>
                {selectedWorks.size > 0 && <span className="text-accent ml-2 font-normal">{selectedWorks.size} selected</span>}
              </label>
              {worksLoading ? (
                <p className="text-sm text-muted">Loading portfolio...</p>
              ) : artistWorks.length === 0 ? (
                <p className="text-sm text-muted">No works found. Browse an artist&rsquo;s profile to select works for placement.</p>
              ) : (
                <div className="flex gap-2.5 overflow-x-auto pb-2">
                  {artistWorks.map((work) => {
                    const selected = selectedWorks.has(work.title);
                    return (
                      <button
                        key={work.id}
                        type="button"
                        onClick={() => toggleWork(work.title)}
                        className={`relative w-24 h-24 shrink-0 rounded-sm overflow-hidden border-2 transition-all ${
                          selected ? "border-accent shadow-sm" : "border-transparent hover:border-border"
                        }`}
                      >
                        {work.image && (
                          <Image src={work.image} alt={work.title} fill className="object-cover" sizes="96px" />
                        )}
                        {selected && (
                          <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                          <p className="text-[8px] text-white truncate">{work.title}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Revenue share */}
            <div>
              <label className="block text-sm font-medium mb-2">Revenue Share (optional)</label>
              <p className="text-xs text-muted mb-3">Propose a revenue share percentage. Leave at 0 for a free display arrangement.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={revenuePercent}
                  onChange={(e) => setRevenuePercent(Number(e.target.value) || 0)}
                  className="w-20 bg-background border border-border rounded-sm px-3 py-3 text-sm text-center focus:outline-none focus:border-accent/60"
                />
                <span className="text-sm text-muted">% revenue share</span>
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium mb-2">Message to artist (optional)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell the artist about your space, why their work would suit it..."
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSubmitRequest}
                disabled={selectedWorks.size === 0 || !artistSlug || submitting}
                className="px-6 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending..." : `Request ${selectedWorks.size} Placement${selectedWorks.size !== 1 ? "s" : ""}`}
              </button>
              <button onClick={() => { setShowForm(false); setArtistSlug(""); setArtistWorks([]); setSelectedWorks(new Set()); }} className="px-6 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => {
          const count =
            tab === "All"
              ? placements.length
              : tab === "Completed"
              ? placements.filter((p) => p.status === "Completed" || p.status === "Declined").length
              : placements.filter((p) => p.status === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? "bg-accent/10 text-accent" : "bg-border text-muted"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-muted text-sm py-12 text-center">Loading placements...</p>
      ) : filtered.length === 0 && !showForm ? (
        <div className="bg-surface border border-border rounded-sm px-6 py-12 text-center">
          <p className="text-muted text-sm">
            {activeTab === "Pending" ? "No pending requests." : "No placements found."}
          </p>
          <p className="text-muted text-xs mt-2">Browse artist portfolios and click &ldquo;Request Placement&rdquo; to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className={`bg-surface border rounded-sm overflow-hidden transition-all ${
              p.status === "Pending" ? "border-amber-200 shadow-sm" : "border-border"
            }`}>
              <div
                className="p-4 sm:p-5 cursor-pointer"
                onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
              >
                <div className="flex items-start gap-4">
                  {p.workImage && (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                      <Image src={p.workImage} alt={p.workTitle} fill className="object-cover" sizes="80px" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium text-foreground">{p.workTitle}</h3>
                        <p className="text-xs text-muted mt-0.5">by {p.artistName}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusStyles[p.status] || statusStyles.Pending}`}>
                          {p.status}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`text-muted transition-transform duration-200 ${expandedId === p.id ? "rotate-180" : ""}`}>
                          <polyline points="3 5 7 9 11 5" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted">
                      <span className="border border-border rounded-sm px-1.5 py-0.5">
                        {typeLabel(p.arrangementType, p.revenueSharePercent)}
                      </span>
                      <span>Requested {p.date}</span>
                      {p.respondedAt && <span>Responded {p.respondedAt}</span>}
                    </div>
                  </div>
                </div>
              </div>
              {/* Expanded details */}
              {expandedId === p.id && (
                <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-border pt-4 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted mb-0.5">Artist</p>
                      <p className="text-foreground font-medium">{p.artistName}</p>
                    </div>
                    <div>
                      <p className="text-muted mb-0.5">Arrangement</p>
                      <p className="text-foreground font-medium">{typeLabel(p.arrangementType, p.revenueSharePercent)}</p>
                    </div>
                    {p.revenueSharePercent != null && p.revenueSharePercent > 0 && (
                      <div>
                        <p className="text-muted mb-0.5">Revenue Share</p>
                        <p className="text-foreground font-medium">{p.revenueSharePercent}%</p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted mb-0.5">Requested</p>
                      <p className="text-foreground font-medium">{p.date}</p>
                    </div>
                    {p.respondedAt && (
                      <div>
                        <p className="text-muted mb-0.5">Responded</p>
                        <p className="text-foreground font-medium">{p.respondedAt}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted mb-0.5">Status</p>
                      <p className="text-foreground font-medium">{p.status}</p>
                    </div>
                  </div>
                  {p.message && (
                    <div className="bg-background border border-border rounded-sm p-3">
                      <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Message from artist</p>
                      <p className="text-xs text-foreground">{p.message}</p>
                    </div>
                  )}
                {p.status === "Pending" && (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                    <button
                      onClick={() => respond(p.id, true)}
                      disabled={responding === p.id}
                      className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-sm transition-colors disabled:opacity-50"
                    >
                      {responding === p.id ? "..." : "Accept"}
                    </button>
                    <button
                      onClick={() => respond(p.id, false)}
                      disabled={responding === p.id}
                      className="px-5 py-2 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </VenuePortalLayout>
  );
}
