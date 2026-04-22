"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import PlacementStepper, { type PlacementStepperData } from "@/components/PlacementStepper";
import PlacementActionItems from "@/components/PlacementActionItems";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { canRespond, isRequester } from "@/lib/placement-permissions";
import { normaliseStatus as sharedNormaliseStatus, statusBadgeClass } from "@/lib/placements/status";

function formatSlug(slug: string): string {
  if (!slug) return "";
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

type FilterTab = "All" | "Pending" | "Active" | "Completed";
type ArrangementType = "Paid Loan" | "Revenue Share" | "Direct Purchase";
type PlacementStatus = "Active" | "Pending" | "Declined" | "Completed" | "Sold";

interface PlacementRequest {
  id: string;
  artistName: string;
  artistSlug: string;
  workTitle: string;
  workImage: string;
  workSize?: string;
  type: ArrangementType;
  revenueSharePercent?: number;
  status: PlacementStatus;
  date: string;
  respondedAt?: string;
  message?: string;
  notes?: string;
  revenueEarned?: number;
  acceptedAt?: string | null;
  scheduledFor?: string | null;
  installedAt?: string | null;
  liveFrom?: string | null;
  collectedAt?: string | null;
  requesterUserId?: string | null;
  artistUserId?: string | null;
  venueUserId?: string | null;
  /** Raw ISO / timestamp used for sorting. Display `date` stays formatted. */
  createdAtTs?: number;
  qrScans?: number;
}

interface ArtistWork {
  id: string;
  title: string;
  image: string;
  medium: string;
  priceBand: string;
}

const statusBadge = (status: string) => statusBadgeClass(sharedNormaliseStatus(status));

const tabs: FilterTab[] = ["All", "Pending", "Active", "Completed"];

const normaliseStatus = (raw: string): PlacementStatus => sharedNormaliseStatus(raw) as PlacementStatus;

/**
 * Derive a "what happens next" message from placement status + lifecycle
 * timestamps. Surfaces the most useful next-action text at a glance so
 * venues don't have to expand each row to understand state.
 */
function nextActionText(p: {
  status: PlacementStatus;
  acceptedAt?: string | null;
  scheduledFor?: string | null;
  installedAt?: string | null;
  liveFrom?: string | null;
  collectedAt?: string | null;
}): string | null {
  // Pending status is already surfaced via the top-right badge as
  // "Awaiting response", so we suppress the "Awaiting artist response"
  // duplicate here to keep the card concise.
  if (p.status === "Pending") return null;
  if (p.status === "Declined") return null;
  if (p.status === "Completed" || p.status === "Sold") return null;
  // Active — walk lifecycle
  if (!p.scheduledFor) return "Next: schedule installation with the artist";
  if (!p.installedAt) return "Next: confirm the artwork is installed";
  if (!p.liveFrom) return "Next: mark live on wall";
  if (!p.collectedAt) return "Next: mark collected when the piece comes down";
  return null;
}

/**
 * Compact 5-dot progress indicator for use in placement card headers.
 * Mirrors the stages in PlacementStepper without the action buttons.
 */
function MiniStatusBar({ p }: { p: { status: PlacementStatus; acceptedAt?: string | null; scheduledFor?: string | null; installedAt?: string | null; liveFrom?: string | null; collectedAt?: string | null } }) {
  if (p.status === "Pending" || p.status === "Declined") return null;
  const stages = [
    { label: "Accepted", done: !!p.acceptedAt || p.status === "Active" },
    { label: "Scheduled", done: !!p.scheduledFor },
    { label: "Installed", done: !!p.installedAt },
    { label: "Live", done: !!p.liveFrom },
    { label: "Collected", done: !!p.collectedAt },
  ];
  return (
    <div className="flex items-center gap-1" aria-label="Placement progress">
      {stages.map((s, i) => (
        <span
          key={s.label}
          title={s.label}
          className={`h-1.5 rounded-full transition-colors ${s.done ? "bg-accent" : "bg-border"} ${i === stages.length - 1 ? "w-4" : "w-4"}`}
        />
      ))}
    </div>
  );
}

function normaliseType(raw: string): ArrangementType {
  const map: Record<string, ArrangementType> = {
    free_loan: "Paid Loan", revenue_share: "Revenue Share", purchase: "Direct Purchase",
  };
  return map[raw] || "Paid Loan";
}

interface PickerArtist {
  slug: string;
  name: string;
  group: "saved" | "messaged" | "placed" | "search";
  image?: string;
}

/**
 * Search-and-pick dropdown for venues requesting placements.
 * Data sources: saved_items, conversations, placement history, and free-text
 * search against /api/browse-artists. All bucketed by source and de-duped.
 */
function ArtistPickerDropdown({ onPick }: { onPick: (slug: string, name: string) => void }) {
  const [query, setQuery] = useState("");
  const [savedArtists, setSavedArtists] = useState<PickerArtist[]>([]);
  const [messagedArtists, setMessagedArtists] = useState<PickerArtist[]>([]);
  const [placedArtists, setPlacedArtists] = useState<PickerArtist[]>([]);
  const [allArtists, setAllArtists] = useState<PickerArtist[]>([]);

  useEffect(() => {
    // Fetch the full artists list once and use it to resolve display names
    // across every group. Every source (saved/messaged/placed) can then show
    // "Fin Coles" instead of "fin-coles".
    (async () => {
      let artistsList: Array<{ slug: string; name: string; works?: Array<{ id: string }> }> = [];
      try {
        const res = await fetch("/api/browse-artists");
        const browseData = await res.json();
        artistsList = browseData.artists || [];
        setAllArtists(artistsList.map((a) => ({ slug: a.slug, name: a.name, group: "search" as const })));
      } catch { /* keep empty */ }

      const nameFor = (slug: string): string => {
        const match = artistsList.find((a) => a.slug === slug);
        if (match) return match.name;
        // Fallback: slug → "Title Case" (fin-coles → Fin Coles)
        return slug.split("-").map((w) => (w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
      };

      // Saved artists (works saved → owning artist, plus direct type='artist')
      try {
        const savedRes = await authFetch("/api/saved");
        const savedData = await savedRes.json();
        const items: { type: string; itemId: string }[] = savedData.savedItems || [];
        const workIds = items.filter((i) => i.type === "work").map((i) => i.itemId);
        const artistSet = new Map<string, string>();
        for (const a of artistsList) {
          if (a.works?.some((w) => workIds.includes(w.id))) {
            artistSet.set(a.slug, a.name);
          }
        }
        for (const i of items.filter((x) => x.type === "artist")) {
          artistSet.set(i.itemId, nameFor(i.itemId));
        }
        setSavedArtists(
          Array.from(artistSet.entries()).map(([slug, name]) => ({ slug, name, group: "saved" as const }))
        );
      } catch { /* ignore */ }

      // Messaged artists — conversations endpoint
      try {
        const msgRes = await authFetch("/api/messages");
        const msgData = await msgRes.json();
        const convs: Array<{ otherParty: string; otherPartyDisplayName: string; otherPartyType?: string }> = msgData.conversations || [];
        const seen = new Set<string>();
        const picks: PickerArtist[] = [];
        for (const c of convs) {
          if (!c.otherParty || seen.has(c.otherParty)) continue;
          // Skip non-artist conversations (Wallplace Support, other venues, etc.)
          if (c.otherPartyType && c.otherPartyType !== "artist") continue;
          seen.add(c.otherParty);
          const name = c.otherPartyDisplayName && c.otherPartyDisplayName.trim().length > 0 && c.otherPartyDisplayName !== c.otherParty
            ? c.otherPartyDisplayName
            : nameFor(c.otherParty);
          picks.push({ slug: c.otherParty, name, group: "messaged" });
        }
        setMessagedArtists(picks);
      } catch { /* ignore */ }

      // Previously placed — placements history
      try {
        const placeRes = await authFetch("/api/placements");
        const placeData = await placeRes.json();
        const rows: Array<{ artist_slug?: string }> = placeData.placements || [];
        const seen = new Set<string>();
        const picks: PickerArtist[] = [];
        for (const p of rows) {
          if (!p.artist_slug || seen.has(p.artist_slug)) continue;
          seen.add(p.artist_slug);
          picks.push({ slug: p.artist_slug, name: nameFor(p.artist_slug), group: "placed" });
        }
        setPlacedArtists(picks);
      } catch { /* ignore */ }
    })();
  }, []);

  const q = query.trim().toLowerCase();
  const searchResults = q
    ? allArtists.filter((a) =>
        a.slug.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
      ).slice(0, 8)
    : [];

  const groups: Array<{ label: string; items: PickerArtist[] }> = [];
  if (!q) {
    if (savedArtists.length) groups.push({ label: "Saved", items: savedArtists.slice(0, 6) });
    if (messagedArtists.length) groups.push({ label: "Messaged", items: messagedArtists.slice(0, 6) });
    if (placedArtists.length) groups.push({ label: "Previously placed", items: placedArtists.slice(0, 6) });
  } else {
    groups.push({ label: `Search results (${searchResults.length})`, items: searchResults });
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2">Artist</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search artists by name, or pick below"
        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-sm focus:outline-none focus:border-accent/60 mb-3"
      />
      {groups.length === 0 ? (
        <p className="text-xs text-muted">Browse the marketplace, save an artist, or message one — they&rsquo;ll appear here.</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{g.label}</p>
              <div className="space-y-1">
                {g.items.map((a) => (
                  <button
                    key={`${g.label}-${a.slug}`}
                    type="button"
                    onClick={() => onPick(a.slug, a.name)}
                    className="w-full text-left px-3 py-2 text-sm bg-background hover:bg-accent/5 border border-border hover:border-accent/30 rounded-sm transition-colors"
                  >
                    <p className="font-medium text-foreground">{a.name}</p>
                    {a.slug !== a.name && <p className="text-xs text-muted">@{a.slug}</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VenuePlacementsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [placements, setPlacements] = useState<PlacementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Request form state
  const [showForm, setShowForm] = useState(false);
  const [artistSlug, setArtistSlug] = useState("");
  const [artistName, setArtistName] = useState("");
  const [artistWorks, setArtistWorks] = useState<ArtistWork[]>([]);
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());
  const [revenuePercent, setRevenuePercent] = useState<number | "">(0);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [monthlyFee, setMonthlyFee] = useState<number | "">("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
    async function loadPlacements() {
      try {
        const res = await authFetch("/api/placements");
        const data = await res.json();
        if (data.placements) {
          // Resolve artist names from browse-artists
          const artistNameMap: Record<string, string> = {};
          try {
            const artistRes = await fetch("/api/browse-artists");
            const artistData = await artistRes.json();
            for (const a of (artistData.artists || [])) {
              artistNameMap[a.slug] = a.name;
            }
          } catch { /* fallback to slug */ }

          const mapped: PlacementRequest[] = data.placements.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            artistName: artistNameMap[p.artist_slug as string] || formatSlug(p.artist_slug as string) || "Artist",
            artistSlug: (p.artist_slug as string) || "",
            workTitle: (p.work_title as string) || "Untitled",
            workImage: (p.work_image as string) || "",
            workSize: (p.work_size as string) || undefined,
            type: normaliseType((p.arrangement_type as string) || "free_loan"),
            revenueSharePercent: p.revenue_share_percent as number | undefined,
            status: normaliseStatus((p.status as string) || "pending"),
            date: p.created_at ? new Date(p.created_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
            respondedAt: p.responded_at ? new Date(p.responded_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : undefined,
            message: p.message as string | undefined,
            notes: p.notes as string | undefined,
            revenueEarned: typeof p.revenue_earned_gbp === "number" ? p.revenue_earned_gbp : 0,
            acceptedAt: (p.accepted_at as string | null) ?? null,
            scheduledFor: (p.scheduled_for as string | null) ?? null,
            installedAt: (p.installed_at as string | null) ?? null,
            liveFrom: (p.live_from as string | null) ?? null,
            collectedAt: (p.collected_at as string | null) ?? null,
            requesterUserId: (p.requester_user_id as string | null) ?? null,
            artistUserId: (p.artist_user_id as string | null) ?? null,
            venueUserId: (p.venue_user_id as string | null) ?? null,
            createdAtTs: p.created_at ? new Date(p.created_at as string).getTime() : 0,
            qrScans: typeof p.qr_scans === "number" ? p.qr_scans : 0,
          }));
          // Sort: Pending first (needs attention), then by most-recent created_at
          mapped.sort((a, b) => {
            const aPending = a.status === "Pending" ? 1 : 0;
            const bPending = b.status === "Pending" ? 1 : 0;
            if (aPending !== bPending) return bPending - aPending;
            return (b.createdAtTs || 0) - (a.createdAtTs || 0);
          });
          setPlacements(mapped);
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    loadPlacements();
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
    if (!artistSlug) {
      setSubmitError("Select an artist before sending a request.");
      return;
    }
    if (selectedWorks.size === 0) {
      setSubmitError("Select at least one work to request.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);

    const rev = typeof revenuePercent === "number" ? revenuePercent : 0;
    const fee = typeof monthlyFee === "number" ? monthlyFee : 0;
    const newPlacements = Array.from(selectedWorks).map((workTitle) => {
      const work = artistWorks.find((w) => w.title === workTitle);
      return {
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        workTitle,
        workImage: work?.image || "",
        venueSlug: "", // API resolves from auth
        type: qrEnabled && rev > 0 ? "revenue_share" as const : "free_loan" as const,
        revenueSharePercent: qrEnabled && rev > 0 ? rev : undefined,
        qrEnabled,
        monthlyFeeGbp: !qrEnabled && fee > 0 ? fee : undefined,
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

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg: string = body?.error || `Could not send request (HTTP ${res.status})`;
        setSubmitError(msg);
        setSubmitting(false);
        return;
      }

      const mapped: PlacementRequest[] = newPlacements.map((p) => ({
        id: p.id,
        artistName: artistName || artistSlug,
        artistSlug,
        workTitle: p.workTitle,
        workImage: p.workImage,
        type: qrEnabled && rev > 0 ? "Revenue Share" as ArrangementType : "Paid Loan" as ArrangementType,
        revenueSharePercent: p.revenueSharePercent,
        status: "Pending",
        date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        message: p.message,
      }));
      setPlacements([...mapped, ...placements]);
      setShowForm(false);
      setQrEnabled(true);
      setMonthlyFee("");
      setSelectedWorks(new Set());
      setMessage("");
      setRevenuePercent(0);
    } catch (err) {
      console.error("Placement request error:", err);
      setSubmitError("Network error — please try again.");
    }
    setSubmitting(false);
  }

  async function respond(id: string, accept: boolean) {
    setResponding(id);
    setRespondError(null);
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id, status: accept ? "active" : "declined" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPlacements((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, status: accept ? "Active" : "Declined", respondedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) }
              : p
          )
        );
      } else {
        setRespondError(data.error || "Could not update placement. Please try again.");
      }
    } catch (err) {
      console.error("Response error:", err);
      setRespondError("Network error. Please try again.");
    } finally {
      setResponding(null);
    }
  }

  function updateStatus(id: string, newStatus: PlacementStatus) {
    const statusMap: Record<string, string> = {
      Active: "active", Pending: "pending", Declined: "declined",
      Completed: "completed", Sold: "completed",
    };
    setPlacements(placements.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    authFetch("/api/placements", {
      method: "PATCH",
      body: JSON.stringify({ id, status: statusMap[newStatus] || "active" }),
    }).catch((err) => console.error("Status update error:", err));
  }

  async function removePlacement(id: string) {
    const snapshot = placements;
    // Optimistic remove
    setPlacements(placements.filter((p) => p.id !== id));
    try {
      const res = await authFetch(`/api/placements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      // 404 = already gone, treat as success.
      if (res.status === 404) return;
      if (!res.ok) {
        setPlacements(snapshot);
        const body = await res.json().catch(() => ({}));
        alert(body?.error || `Could not delete placement (HTTP ${res.status})`);
        return;
      }
      // Confirm by re-fetching fresh. If the row is STILL present after a
      // successful DELETE, Supabase silently ignored the request (usually
      // RLS or a FK constraint). Surface this to the user rather than
      // lying with an optimistic remove that gets undone on reload.
      const verifyRes = await authFetch(`/api/placements?_t=${Date.now()}`, { cache: "no-store" as RequestCache });
      const verifyData = await verifyRes.json().catch(() => ({}));
      const stillThere = Array.isArray(verifyData.placements)
        && verifyData.placements.some((p: { id?: string }) => p.id === id);
      if (stillThere) {
        setPlacements(snapshot);
        alert("Server said the placement was deleted, but it's still there on reload. This is usually a database permission policy — check Supabase logs. The placement has been put back on-screen.");
      }
    } catch (err) {
      setPlacements(snapshot);
      console.error("Placement delete error:", err);
      alert("Network error — placement not deleted. Please try again.");
    }
  }

  const filtered = placements.filter((p) => {
    if (activeTab === "All") return true;
    if (activeTab === "Completed") return p.status === "Completed" || p.status === "Sold";
    return p.status === activeTab;
  });

  const inputClass = "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors";

  return (
    <VenuePortalLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl lg:text-3xl">Placements</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {placements.filter((p) => p.status === "Active").length} active
          </span>
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

      {/* Request Placement Form — above the Action Items so venues
          aren't hunting past a long to-do list to send a new request */}
      {/* Request Placement Form */}
      {showForm && (
        <div className="bg-surface border border-border rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Request Placement</h2>
            <button onClick={() => { setShowForm(false); setArtistSlug(""); setArtistWorks([]); setSelectedWorks(new Set()); }} className="text-xs text-muted hover:text-foreground transition-colors">Cancel</button>
          </div>

          <div className="space-y-5">
            {/* Artist picker / info */}
            {artistSlug ? (
              <div className="bg-accent/5 border border-accent/20 rounded-sm px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm"><span className="text-accent font-medium">Artist:</span> {artistName || artistSlug}</p>
                <button
                  type="button"
                  onClick={() => { setArtistSlug(""); setArtistName(""); setArtistWorks([]); setSelectedWorks(new Set()); }}
                  className="text-xs text-muted hover:text-foreground underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <ArtistPickerDropdown onPick={(slug, name) => { setArtistSlug(slug); setArtistName(name); loadArtistWorks(slug); }} />
            )}

            {/* Placement type */}
            <div>
              <label className="block text-sm font-medium mb-2">Placement Type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className={`flex items-start gap-3 p-3 border rounded-sm cursor-pointer transition-colors ${qrEnabled ? "border-accent bg-accent/5" : "border-border hover:border-foreground/30"}`}>
                  <input
                    type="checkbox"
                    checked={qrEnabled}
                    onChange={() => setQrEnabled(true)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">QR Display</p>
                    <p className="text-xs text-muted">Display the work with a QR linking to sales. Revenue share applies.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 border rounded-sm cursor-pointer transition-colors ${!qrEnabled ? "border-accent bg-accent/5" : "border-border hover:border-foreground/30"}`}>
                  <input
                    type="checkbox"
                    checked={!qrEnabled}
                    onChange={() => setQrEnabled(false)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">Paid Loan</p>
                    <p className="text-xs text-muted">Venue pays the artist a monthly fee to display the work. No QR sales link.</p>
                  </div>
                </label>
              </div>
              {!qrEnabled && (
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-2">Monthly fee to artist (optional)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted">£</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={monthlyFee}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") { setMonthlyFee(""); return; }
                        const n = Number(v);
                        if (!Number.isNaN(n)) setMonthlyFee(n);
                      }}
                      placeholder="e.g. 50"
                      className="w-28 bg-background border border-border rounded-sm px-3 py-3 text-sm focus:outline-none focus:border-accent/60"
                    />
                    <span className="text-sm text-muted">per month</span>
                  </div>
                  <p className="text-xs text-muted mt-2">Billing is handled manually for now — use this to record the agreed amount.</p>
                </div>
              )}
            </div>

            {/* Revenue share (QR Display only) */}
            {qrEnabled && (
              <div>
                <label className="block text-sm font-medium mb-2">Revenue Share (optional)</label>
                <p className="text-xs text-muted mb-3">Propose a revenue share percentage on QR sales. Leave at 0 for a free display arrangement.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={revenuePercent}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") { setRevenuePercent(""); return; }
                      const n = Number(v);
                      if (!Number.isNaN(n)) setRevenuePercent(n);
                    }}
                    onBlur={() => { if (revenuePercent === "") setRevenuePercent(0); }}
                    className="w-20 bg-background border border-border rounded-sm px-3 py-3 text-sm text-center focus:outline-none focus:border-accent/60"
                  />
                  <span className="text-sm text-muted">% to the venue on sales</span>
                </div>
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
                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                  {artistWorks.map((work) => {
                    const selected = selectedWorks.has(work.title);
                    return (
                      <button
                        key={work.id}
                        type="button"
                        onClick={() => toggleWork(work.title)}
                        className={`relative aspect-square rounded-sm overflow-hidden border-2 transition-all ${
                          selected ? "border-accent shadow-sm" : "border-transparent hover:border-border"
                        }`}
                      >
                        {work.image && (
                          <Image src={work.image} alt={work.title} fill className="object-cover" sizes="80px" />
                        )}
                        {selected && (
                          <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Message to artist */}
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
            <div className="pt-2">
              {submitError && (
                <p className="text-sm text-red-600 mb-3">{submitError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleSubmitRequest}
                  disabled={selectedWorks.size === 0 || !artistSlug || submitting}
                  className="px-6 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Sending..." : `Request ${selectedWorks.size} Placement${selectedWorks.size !== 1 ? "s" : ""}`}
                </button>
                <button onClick={() => { setShowForm(false); setArtistSlug(""); setArtistWorks([]); setSelectedWorks(new Set()); setSubmitError(null); }} className="px-6 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outstanding placement actions — shown BELOW the request form
          so new-request flow isn't hidden behind a long to-do list */}
      <PlacementActionItems userId={user?.id} role="venue" heading="Needs your attention" />

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => {
          const count =
            tab === "All"
              ? placements.length
              : tab === "Completed"
              ? placements.filter((p) => p.status === "Completed" || p.status === "Sold").length
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
      ) : (
        <>
          {/* Table - desktop */}
          <div className="bg-surface border border-border rounded-sm hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background">
                    <th className="text-left text-xs text-muted font-medium px-6 py-3">Piece</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Artist</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Type</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Status</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Date</th>
                    <th className="text-right text-xs text-muted font-medium px-4 py-3">Earned</th>
                    <th className="text-right text-xs text-muted font-medium px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((p) => (
                    <React.Fragment key={p.id}>
                    <tr className="hover:bg-background/60 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                            {p.workImage && <Image src={p.workImage} alt={p.workTitle} fill className="object-cover" sizes="32px" />}
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium text-foreground block truncate">{p.workTitle}</span>
                            {nextActionText(p) && (
                              <span className="text-[11px] text-accent block truncate">{nextActionText(p)}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.artistName}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs border border-border rounded-sm px-2 py-0.5 text-muted">
                          {p.type}{p.revenueSharePercent ? ` (${p.revenueSharePercent}%)` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1.5">
                        {p.status === "Pending" ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full self-start ${statusBadge(p.status)}`}>
                            Awaiting response
                          </span>
                        ) : p.status === "Declined" ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full self-start ${statusBadge(p.status)}`}>
                            Declined
                          </span>
                        ) : (
                          <select
                            value={p.status}
                            onChange={(e) => updateStatus(p.id, e.target.value as PlacementStatus)}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border-none cursor-pointer self-start ${statusBadge(p.status)}`}
                          >
                            <option value="Active">Active</option>
                            <option value="Completed">Completed</option>
                            <option value="Sold">Sold</option>
                          </select>
                        )}
                        {/* Inline mini status bar on desktop too (web parity) */}
                        {(p.status === "Active" || p.status === "Completed" || p.status === "Sold") && (
                          <MiniStatusBar p={p} />
                        )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.date}</td>
                      <td className="px-4 py-3.5 text-right font-medium text-foreground">
                        {p.revenueSharePercent != null && p.revenueSharePercent > 0
                          ? `\u00a3${(p.revenueEarned ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : <span className="text-muted">-</span>}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm("Remove this placement?")) removePlacement(p.id); }}
                            className="p-1.5 rounded-sm text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                            aria-label="Remove placement"
                            title="Remove placement"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === p.id && (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 bg-background border-t border-border">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            <div>
                              <p className="text-muted mb-0.5">Artist</p>
                              <p className="text-foreground font-medium">{p.artistName}</p>
                            </div>
                            {p.workSize && (
                              <div>
                                <p className="text-muted mb-0.5">Size</p>
                                <p className="text-foreground font-medium">{p.workSize}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-muted mb-0.5">Arrangement</p>
                              <p className="text-foreground font-medium">{p.type}{p.revenueSharePercent ? ` (${p.revenueSharePercent}%)` : ""}</p>
                            </div>
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
                              <p className="text-muted mb-0.5">Earned so far</p>
                              <p className="text-foreground font-medium">
                                {p.revenueSharePercent != null && p.revenueSharePercent > 0
                                  ? `\u00a3${(p.revenueEarned ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : "No sales yet"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted mb-0.5">QR Scans</p>
                              <p className="text-foreground font-medium">{p.qrScans ?? 0}</p>
                            </div>
                          </div>

                          <PlacementStepper
                            placement={{
                              id: p.id,
                              status: p.status.toLowerCase(),
                              acceptedAt: p.acceptedAt,
                              scheduledFor: p.scheduledFor,
                              installedAt: p.installedAt,
                              liveFrom: p.liveFrom,
                              collectedAt: p.collectedAt,
                            }}
                            canAdvance={p.status === "Active"}
                            onChange={(next) => setPlacements((prev) => prev.map((x) => x.id === p.id ? {
                              ...x,
                              status: next.status === "completed" ? "Completed" : x.status,
                              acceptedAt: next.acceptedAt ?? x.acceptedAt,
                              scheduledFor: next.scheduledFor ?? x.scheduledFor,
                              installedAt: next.installedAt ?? x.installedAt,
                              liveFrom: next.liveFrom ?? x.liveFrom,
                              collectedAt: next.collectedAt ?? x.collectedAt,
                            } : x))}
                          />

                          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
                            <Link
                              href={`/venue-portal/messages?artist=${p.artistSlug}&artistName=${encodeURIComponent(p.artistName)}`}
                              className="text-xs text-muted hover:text-foreground transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Message Artist
                            </Link>
                            <div className="flex items-center gap-2 ml-auto">
                              {canRespond({ status: p.status, requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id, "venue") && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); respond(p.id, true); }}
                                    disabled={responding === p.id}
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-sm transition-colors disabled:opacity-50"
                                  >
                                    {responding === p.id ? "…" : "Accept"}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); respond(p.id, false); }}
                                    disabled={responding === p.id}
                                    className="px-4 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-50"
                                  >
                                    Decline
                                  </button>
                                </>
                              )}
                              {p.status === "Pending" && isRequester({ requester_user_id: p.requesterUserId }, user?.id) && (
                                <span className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm">
                                  Awaiting artist response
                                </span>
                              )}
                              <Link
                                href={`/placements/${encodeURIComponent(p.id)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 hover:bg-accent/5 rounded-sm transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                Add Loan / Consignment Record
                              </Link>
                              <Link
                                href={`/placements/${encodeURIComponent(p.id)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground bg-[#F5F3F0] border border-border hover:bg-[#EBE8E4] rounded-sm transition-colors"
                              >
                                Open full placement
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                              </Link>
                            </div>
                          </div>
                          {respondError && responding === null && (
                            <p className="mt-2 text-xs text-red-600">{respondError}</p>
                          )}
                          {p.message && (
                            <div className="mt-3 bg-surface border border-border rounded-sm p-3">
                              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Message from artist</p>
                              <p className="text-xs text-foreground">{p.message}</p>
                            </div>
                          )}
                          {p.notes && (
                            <div className="mt-2 bg-surface border border-border rounded-sm p-3">
                              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Notes</p>
                              <p className="text-xs text-foreground">{p.notes}</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="px-6 py-12 text-center text-muted text-sm">No placements found.</div>
            )}
          </div>

          {/* Cards - mobile */}
          <div className="sm:hidden space-y-3">
            {filtered.map((p) => (
              <div key={p.id} className="bg-surface border border-border rounded-sm overflow-hidden">
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                        {p.workImage && <Image src={p.workImage} alt={p.workTitle} fill className="object-cover" sizes="40px" />}
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm leading-snug">{p.workTitle}</p>
                        <p className="text-xs text-muted">{p.artistName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusBadge(p.status)}`}>
                        {p.status === "Pending" ? "Awaiting response" : p.status}
                      </span>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`text-muted transition-transform duration-200 ${expandedId === p.id ? "rotate-180" : ""}`}>
                        <polyline points="3 5 7 9 11 5" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted mt-2">
                    <div className="flex items-center gap-2">
                      <span className="border border-border rounded-sm px-1.5 py-0.5">
                        {p.type}{p.revenueSharePercent ? ` ${p.revenueSharePercent}%` : ""}
                      </span>
                      <span>{p.date}</span>
                    </div>
                    {p.revenueSharePercent != null && p.revenueSharePercent > 0 && (
                      <span className="font-medium text-foreground">
                        &pound;{(p.revenueEarned ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  {/* Mini status bar + next action — visible without expanding */}
                  {(p.status === "Active" || p.status === "Completed" || p.status === "Sold") && (
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <MiniStatusBar p={p} />
                    </div>
                  )}
                  {nextActionText(p) && (
                    <p className="mt-1.5 text-[11px] text-accent">
                      {nextActionText(p)}
                    </p>
                  )}
                </div>
                {/* Expanded details */}
                {expandedId === p.id && (
                  <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-muted mb-0.5">Artist</p>
                        <p className="text-foreground font-medium">{p.artistName || "Unknown"}</p>
                      </div>
                      {p.workSize && (
                        <div>
                          <p className="text-muted mb-0.5">Size</p>
                          <p className="text-foreground font-medium">{p.workSize}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-muted mb-0.5">Arrangement</p>
                        <p className="text-foreground font-medium">{p.type}{p.revenueSharePercent ? ` (${p.revenueSharePercent}%)` : ""}</p>
                      </div>
                      <div>
                        <p className="text-muted mb-0.5">Status</p>
                        <p className="text-foreground font-medium">{p.status}</p>
                      </div>
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
                        <p className="text-muted mb-0.5">Earned so far</p>
                        <p className="text-foreground font-medium">
                          {p.revenueSharePercent != null && p.revenueSharePercent > 0
                            ? `\u00a3${(p.revenueEarned ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "No sales yet"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted mb-0.5">QR Scans</p>
                        <p className="text-foreground font-medium">0</p>
                      </div>
                    </div>
                    {p.message && (
                      <div className="bg-background border border-border rounded-sm p-3">
                        <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Message from artist</p>
                        <p className="text-xs text-foreground">{p.message}</p>
                      </div>
                    )}
                    {p.notes && (
                      <div className="bg-background border border-border rounded-sm p-3">
                        <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Notes</p>
                        <p className="text-xs text-foreground">{p.notes}</p>
                      </div>
                    )}
                    <PlacementStepper
                      placement={{
                        id: p.id,
                        status: p.status.toLowerCase(),
                        acceptedAt: p.acceptedAt,
                        scheduledFor: p.scheduledFor,
                        installedAt: p.installedAt,
                        liveFrom: p.liveFrom,
                        collectedAt: p.collectedAt,
                      }}
                      canAdvance={p.status === "Active"}
                      onChange={(next) => setPlacements((prev) => prev.map((x) => x.id === p.id ? {
                        ...x,
                        status: next.status === "completed" ? "Completed" : x.status,
                        acceptedAt: next.acceptedAt ?? x.acceptedAt,
                        scheduledFor: next.scheduledFor ?? x.scheduledFor,
                        installedAt: next.installedAt ?? x.installedAt,
                        liveFrom: next.liveFrom ?? x.liveFrom,
                        collectedAt: next.collectedAt ?? x.collectedAt,
                      } : x))}
                    />

                    <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                      <Link
                        href={`/venue-portal/messages?artist=${p.artistSlug}&artistName=${encodeURIComponent(p.artistName)}`}
                        className="text-xs text-muted hover:text-foreground transition-colors"
                      >
                        Message Artist
                      </Link>
                      <div className="flex items-center gap-2 ml-auto">
                        {canRespond({ status: p.status, requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id, "venue") && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); respond(p.id, true); }}
                              disabled={responding === p.id}
                              className="px-4 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-sm transition-colors disabled:opacity-50"
                            >
                              {responding === p.id ? "…" : "Accept"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); respond(p.id, false); }}
                              disabled={responding === p.id}
                              className="px-4 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        {p.status === "Pending" && isRequester({ requester_user_id: p.requesterUserId }, user?.id) && (
                          <span className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm">
                            Awaiting artist response
                          </span>
                        )}
                        <Link
                          href={`/placements/${encodeURIComponent(p.id)}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 hover:bg-accent/5 rounded-sm transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          Add Loan / Consignment Record
                        </Link>
                        <Link
                          href={`/placements/${encodeURIComponent(p.id)}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground bg-[#F5F3F0] border border-border hover:bg-[#EBE8E4] rounded-sm transition-colors"
                        >
                          Open full placement
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </Link>
                      </div>
                    </div>
                    {respondError && responding === null && (
                      <p className="mt-1 text-xs text-red-600">{respondError}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted text-sm py-8">No placements found.</p>
            )}
          </div>
        </>
      )}
    </VenuePortalLayout>
  );
}
