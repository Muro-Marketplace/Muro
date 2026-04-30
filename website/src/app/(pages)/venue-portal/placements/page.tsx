"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import PlacementStepper, { type PlacementStepperData } from "@/components/PlacementStepper";
import PaidLoanPaymentChip from "@/components/PaidLoanPaymentChip";
import PlacementActionItems from "@/components/PlacementActionItems";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { canRespond, isRequester } from "@/lib/placement-permissions";
import { normaliseStatus as sharedNormaliseStatus, statusBadgeClass, arrangementLabel } from "@/lib/placements/status";
import PlacementDirectionTag, { directionFor } from "@/components/PlacementDirectionTag";
import CounterPlacementDialog from "@/components/CounterPlacementDialog";

function formatSlug(slug: string): string {
  if (!slug) return "";
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

type FilterTab = "All" | "Pending" | "Active" | "Completed" | "Archived";
// Open-ended so combined labels ("Paid loan + QR") can come through the
// shared arrangementLabel helper.
type ArrangementType = string;
type PlacementStatus = "Active" | "Pending" | "Declined" | "Completed" | "Sold" | "Cancelled";

interface PlacementRequest {
  id: string;
  artistName: string;
  artistSlug: string;
  workTitle: string;
  workImage: string;
  workSize?: string;
  /** Additional works sharing this placement (#16). Empty / undefined
      means single-work placement. */
  extraWorks?: Array<{ title: string; image: string | null; size: string | null }>;
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
  updatedAtTs?: number;
  qrScans?: number;
  monthlyFeeGbp?: number | null;
  qrEnabledOnPlacement?: boolean | null;
  /** Bilateral-confirmation proposal fields for installed / collected. */
  proposedStage?: "installed" | "collected" | null;
  proposedByUserId?: string | null;
  /** Stripe subscription state for paid-loan placements. Null until
   *  the venue runs the Checkout flow at /placements/[id]/payment. */
  subscriptionStatus?: string | null;
}

interface ArtistWork {
  id: string;
  title: string;
  image: string;
  medium: string;
  priceBand: string;
  dimensions?: string;
  pricing?: { label: string; price: number }[];
}

const statusBadge = (status: string) => statusBadgeClass(sharedNormaliseStatus(status));

const tabs: FilterTab[] = ["All", "Pending", "Active", "Completed", "Archived"];

const normaliseStatus = (raw: string): PlacementStatus => sharedNormaliseStatus(raw) as PlacementStatus;

/**
 * Derive a "what happens next" message from placement status + lifecycle
 * timestamps. Surfaces the most useful next-action text at a glance so
 * venues don't have to expand each row to understand state.
 */
function nextActionText(_p: {
  status: PlacementStatus;
  acceptedAt?: string | null;
  scheduledFor?: string | null;
  installedAt?: string | null;
  liveFrom?: string | null;
  collectedAt?: string | null;
}): string | null {
  // "Next: …" hints removed — the stepper + action buttons already
  // make the next step obvious, and the duplicate copy felt
  // patronising once users knew the lifecycle.
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

function normaliseType(
  rawType: string,
  extras?: { monthly_fee_gbp?: number | null; qr_enabled?: boolean | null; message?: string | null },
): ArrangementType {
  return arrangementLabel({
    arrangement_type: rawType,
    monthly_fee_gbp: extras?.monthly_fee_gbp,
    qr_enabled: extras?.qr_enabled,
    message: extras?.message,
  });
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

      // Saved artists, ONLY entries the venue explicitly hearted at
      // the artist level (saved_items with type='artist'). The
      // earlier "saving a work counts as saving the artist" logic
      // bled every artist whose work was hearted into the picker
      // and the saved-artist count, which surprised venues
      // (saving "this artwork I like" ≠ "I want to follow this
      // artist"). Both signals are still useful, works saved
      // surface as a separate "Saved works → these artists" hint
      // elsewhere if needed, but they don't merge into the
      // saved-artist count any more.
      try {
        const savedRes = await authFetch("/api/saved");
        const savedData = await savedRes.json();
        const items: { type: string; itemId: string }[] = savedData.savedItems || [];
        const artistSet = new Map<string, string>();
        for (const i of items.filter((x) => x.type === "artist")) {
          artistSet.set(i.itemId, nameFor(i.itemId));
        }
        setSavedArtists(
          Array.from(artistSet.entries()).map(([slug, name]) => ({ slug, name, group: "saved" as const }))
        );
      } catch { /* ignore */ }

      // Messaged artists, conversations endpoint
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

      // Previously placed, placements history
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
        <p className="text-xs text-muted">Browse the marketplace, save an artist, or message one, they&rsquo;ll appear here.</p>
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Count of archived placements shown on the 'Archived' tab badge.
  // Updated on mount + after every archive / unarchive action so the
  // number stays fresh regardless of which tab the user is on.
  const [archivedCount, setArchivedCount] = useState(0);
  // The Archived filter tab controls what we fetch, ?archived=1
  // returns the user's archive rather than their live list.
  const showArchived = activeTab === "Archived";
  const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d" | "90d" | "year">("all");
  const [placements, setPlacements] = useState<PlacementRequest[]>([]);
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Request form state
  const [showForm, setShowForm] = useState(false);
  const [artistSlug, setArtistSlug] = useState("");
  const [artistName, setArtistName] = useState("");
  const [artistWorks, setArtistWorks] = useState<ArtistWork[]>([]);
  // Map of work title → chosen size label. Empty string means "any
  // size" (venue has no preference). A work is selected iff it appears
  // as a key in this map.
  const [selectedWorkSizes, setSelectedWorkSizes] = useState<Record<string, string>>({});
  // Which work's size picker popover is currently open, if any.
  const [sizePickerFor, setSizePickerFor] = useState<string | null>(null);
  const [revenuePercent, setRevenuePercent] = useState<number | "">(0);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [monthlyFee, setMonthlyFee] = useState<number | "">("");
  // "Paid loan" toggle is now independent of the fee input so the user
  // can clear the field and retype a new number without the checkbox
  // toggling off. The form maps monthlyFee=0/"" → no fee only when the
  // toggle itself is off on submit.
  const [paidLoanEnabled, setPaidLoanEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [worksLoading, setWorksLoading] = useState(false);

  // Pre-populate from URL params (from browse lightbox / artist page)
  useEffect(() => {
    const paramArtist = searchParams.get("artist");
    const paramName = searchParams.get("artistName");
    const paramWork = searchParams.get("work");
    const paramWorkImage = searchParams.get("workImage");
    // `works` carries the comma-joined list of every tick the venue
    // made on the artist's profile so ALL of them preselect here,
    // not just the first. Falls back to `work` when only one piece
    // was passed (lightbox Request-Placement button).
    const paramWorks = searchParams.get("works");

    if (paramArtist) {
      setArtistSlug(paramArtist);
      setArtistName(paramName || paramArtist);
      setShowForm(true);

      // Build the preselection map. Empty-string value = "Any size"
      // default; the user can open each card's picker to refine.
      const titles = paramWorks
        ? paramWorks.split(",").map((t) => t.trim()).filter(Boolean)
        : paramWork
          ? [paramWork]
          : [];
      if (titles.length > 0) {
        const next: Record<string, string> = {};
        for (const t of titles) next[t] = "";
        setSelectedWorkSizes(next);
        // Only auto-pop the size picker on a single-work entry; with
        // multiple it just clutters the screen.
        if (titles.length === 1) setSizePickerFor(titles[0]);
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
        // Preserve pricing + dimensions so the per-work size picker has
        // real options instead of an empty dropdown.
        setArtistWorks(artist.works.map((w: ArtistWork) => ({
          id: w.id,
          title: w.title,
          image: w.image,
          medium: w.medium,
          priceBand: w.priceBand,
          dimensions: w.dimensions,
          pricing: Array.isArray(w.pricing) ? w.pricing : undefined,
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

  // Fire-and-forget archived count, keeps the Archived tab badge in
  // sync regardless of which tab is active. Runs alongside the main
  // placements load and on every mutation that could change it.
  const loadArchivedCount = React.useCallback(async () => {
    try {
      const res = await authFetch("/api/placements?archived=1");
      const data = await res.json();
      const count = Array.isArray(data?.placements) ? data.placements.length : 0;
      setArchivedCount(count);
    } catch { /* badge falls back to 0 */ }
  }, []);

  // Load existing placements. Exposed via useCallback so callers
  // (e.g. counter-dialog onSuccess) can trigger a fresh fetch.
  const loadPlacements = React.useCallback(async () => {
    try {
      setLoading(true);
      const url = showArchived ? "/api/placements?archived=1" : "/api/placements";
      const res = await authFetch(url);
      const data = await res.json();
      if (!data.placements) return;

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
        extraWorks: Array.isArray(p.extra_works)
          ? (p.extra_works as Array<{ title: string; image: string | null; size: string | null }>)
          : undefined,
        type: normaliseType((p.arrangement_type as string) || "free_loan", {
          monthly_fee_gbp: p.monthly_fee_gbp as number | null,
          qr_enabled: p.qr_enabled as boolean | null,
          message: p.message as string | null,
        }),
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
        subscriptionStatus: (p.subscription_status as string | null) ?? null,
        collectedAt: (p.collected_at as string | null) ?? null,
        requesterUserId: (p.requester_user_id as string | null) ?? null,
        monthlyFeeGbp: (p.monthly_fee_gbp as number | null) ?? null,
        qrEnabledOnPlacement: (p.qr_enabled as boolean | null) ?? null,
        proposedStage: (p.proposed_stage as "installed" | "collected" | null) ?? null,
        proposedByUserId: (p.proposed_by_user_id as string | null) ?? null,
        artistUserId: (p.artist_user_id as string | null) ?? null,
        venueUserId: (p.venue_user_id as string | null) ?? null,
        createdAtTs: p.created_at ? new Date(p.created_at as string).getTime() : 0,
        // Most-recent timestamp on the row, powers "last updated"
        // ordering so a just-accepted or just-declined placement stays
        // at the top instead of dropping back to its created_at slot.
        updatedAtTs: Math.max(
          p.created_at ? new Date(p.created_at as string).getTime() : 0,
          p.responded_at ? new Date(p.responded_at as string).getTime() : 0,
          p.accepted_at ? new Date(p.accepted_at as string).getTime() : 0,
          p.scheduled_for ? new Date(p.scheduled_for as string).getTime() : 0,
          p.installed_at ? new Date(p.installed_at as string).getTime() : 0,
          p.live_from ? new Date(p.live_from as string).getTime() : 0,
          p.collected_at ? new Date(p.collected_at as string).getTime() : 0,
        ),
        qrScans: typeof p.qr_scans === "number" ? p.qr_scans : 0,
      }));
      // Sort purely by last-updated, newest first. We used to put
      // Pending above everything else so new requests jumped the queue
      //, but that fought with the user's mental model when they'd
      // just acted on a placement and it dropped back down the list.
      mapped.sort((a, b) => (b.updatedAtTs || 0) - (a.updatedAtTs || 0));
      setPlacements(mapped);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { loadPlacements(); }, [loadPlacements]);
  useEffect(() => { loadArchivedCount(); }, [loadArchivedCount]);

  // Listen for any placement mutation dispatched from Messages / Counter
  // dialog / Stepper so the list refreshes without a manual reload.
  useEffect(() => {
    const handler = () => { loadPlacements(); };
    window.addEventListener("wallplace:placement-changed", handler);
    return () => window.removeEventListener("wallplace:placement-changed", handler);
  }, [loadPlacements]);

  function setWorkSize(title: string, sizeLabel: string) {
    setSelectedWorkSizes((prev) => ({ ...prev, [title]: sizeLabel }));
    setSizePickerFor(null);
  }
  function removeWork(title: string) {
    setSelectedWorkSizes((prev) => {
      const next = { ...prev };
      delete next[title];
      return next;
    });
    setSizePickerFor(null);
  }
  // Clicking a card toggles selection with "Any size" as the default.
  // The picker no longer opens automatically, picking a size is an
  // opt-in action, so a quick single click selects the work without
  // forcing the user to also pick a size. Clicking again deselects.
  function handleCardClick(title: string) {
    setSelectedWorkSizes((prev) => {
      if (title in prev) {
        const next = { ...prev };
        delete next[title];
        return next;
      }
      return { ...prev, [title]: "" }; // Any size by default
    });
    setSizePickerFor(null);
  }

  async function handleSubmitRequest() {
    if (!artistSlug) {
      setSubmitError("Select an artist before sending a request.");
      return;
    }
    const selectedTitles = Object.keys(selectedWorkSizes);
    if (selectedTitles.length === 0) {
      setSubmitError("Select at least one work to request.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);

    const rev = typeof revenuePercent === "number" ? revenuePercent : 0;
    // Paid loan is on when the toggle is on, regardless of whether the
    // user has filled in the fee box yet. Empty fee + enabled = £0 paid
    // loan (still counts as a paid-loan arrangement). Toggle off = no
    // monthly fee, even if the input retains a leftover number.
    const fee = paidLoanEnabled && typeof monthlyFee === "number" ? monthlyFee : 0;
    const paidLoan = paidLoanEnabled;
    // Compose the outbound message. Each work now carries its own
    // requested size so the artist sees exactly what was asked for
    // per piece, not a single lumped "preferred size".
    const perWorkSizeLines = selectedTitles
      .filter((t) => (selectedWorkSizes[t] || "").trim())
      .map((t) => `\u2022 ${t}: ${selectedWorkSizes[t]}`);
    const composed = [
      perWorkSizeLines.length > 0 ? `Requested sizes:\n${perWorkSizeLines.join("\n")}` : "",
      message.trim(),
    ].filter(Boolean).join("\n\n");

    // Multi-artwork placements (#16): every work the venue ticked
    // is now rolled into ONE placement with a shared lifecycle and
    // terms. The first selection is the primary (stored on the
    // placements row directly); the rest ride along in extra_works
    // so they share the same pending → accepted → installed → live
    // → collected progression. Previously this shape created one
    // placement per work, which forced duplicate counter-offers and
    // split the negotiation log across identical threads.
    const [primaryTitle, ...extraTitles] = selectedTitles;
    const primaryWork = artistWorks.find((w) => w.title === primaryTitle);
    const primarySize = (selectedWorkSizes[primaryTitle] || "").trim();
    const extraWorks = extraTitles.map((title) => {
      const w = artistWorks.find((x) => x.title === title);
      const size = (selectedWorkSizes[title] || "").trim();
      return {
        title,
        image: w?.image || "",
        size: size || undefined,
      };
    });
    const newPlacements = [{
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      workTitle: primaryTitle,
      workImage: primaryWork?.image || "",
      venueSlug: "", // API resolves from auth
      // Paid loan is on when the toggle is on (may also be QR-enabled);
      // otherwise it's a QR revenue share. "free_loan" here is our
      // historical label for the paid-loan variant.
      type: paidLoan ? "free_loan" as const : "revenue_share" as const,
      revenueSharePercent: qrEnabled && rev > 0 ? rev : undefined,
      qrEnabled,
      monthlyFeeGbp: paidLoan ? fee : undefined,
      message: composed || undefined,
      requestedDimensions: primarySize || undefined,
      extraWorks: extraWorks.length > 0 ? extraWorks : undefined,
    }];

    try {
      const res = await authFetch("/api/placements", {
        method: "POST",
        body: JSON.stringify({
          placements: newPlacements.map((p) => ({
            ...p,
            venueSlug: "self", // Placeholder, API resolves venue from auth for fromVenue requests
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
        type: paidLoan ? "Paid Loan" as ArrangementType : "Revenue Share" as ArrangementType,
        revenueSharePercent: p.revenueSharePercent,
        status: "Pending",
        date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        message: p.message,
      }));
      setPlacements([...mapped, ...placements]);
      setShowForm(false);
      setQrEnabled(true);
      setMonthlyFee("");
      setPaidLoanEnabled(false);
      setSelectedWorkSizes({});
      setSizePickerFor(null);
      setMessage("");
      setRevenuePercent(0);
    } catch (err) {
      console.error("Placement request error:", err);
      setSubmitError("Network error, please try again.");
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
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("wallplace:placement-changed", { detail: { placementId: id, action: accept ? "accept" : "decline" } }));
        }
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
    const apiStatus = statusMap[newStatus] || "active";
    setPlacements(placements.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    authFetch("/api/placements", {
      method: "PATCH",
      body: JSON.stringify({ id, status: apiStatus }),
    })
      .then(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("wallplace:placement-changed", {
            detail: { placementId: id, action: apiStatus === "declined" ? "decline" : apiStatus === "active" ? "accept" : "status" },
          }));
        }
      })
      .catch((err) => console.error("Status update error:", err));
  }

  // Bulk archive, fires one DELETE per selected id, then reloads.
  // Uses the same endpoint the single-row bin icon uses so there's
  // no new code path to keep in sync.
  async function bulkArchiveSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    const verb = showArchived ? "unarchive" : "archive";
    if (!confirm(`${verb === "archive" ? "Archive" : "Unarchive"} ${count} placement${count === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    const snapshot = placements;
    // Optimistic: drop them from the current view.
    setPlacements((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    let failed = 0;
    for (const id of ids) {
      try {
        const url = `/api/placements?id=${encodeURIComponent(id)}${showArchived ? "&unarchive=1" : ""}`;
        const res = await authFetch(url, { method: "DELETE" });
        if (!res.ok && res.status !== 404) failed++;
      } catch { failed++; }
    }
    setSelectedIds(new Set());
    setBulkBusy(false);
    if (failed > 0) {
      setPlacements(snapshot);
      alert(`Couldn't ${verb} ${failed} of ${count} placements. They've been put back on-screen.`);
      return;
    }
    loadPlacements();
    loadArchivedCount();
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Archive or unarchive, the bin icon on the list. Hides the row
  // from the caller's own view only (the counterparty is untouched).
  // Reversible via the "Show archived" toggle.
  async function archivePlacement(id: string, unarchive: boolean) {
    const snapshot = placements;
    setPlacements(placements.filter((p) => p.id !== id));
    try {
      const url = `/api/placements?id=${encodeURIComponent(id)}${unarchive ? "&unarchive=1" : ""}`;
      const res = await authFetch(url, { method: "DELETE" });
      if (res.status === 404) return;
      if (!res.ok) {
        setPlacements(snapshot);
        const body = await res.json().catch(() => ({}));
        alert(body?.error || `Could not ${unarchive ? "unarchive" : "archive"} placement (HTTP ${res.status})`);
        return;
      }
      // Reload so the current tab (main / archived) picks up the
      // change, and refresh the archived-count badge on the tab row.
      loadPlacements();
      loadArchivedCount();
    } catch (err) {
      setPlacements(snapshot);
      console.error("Placement archive error:", err);
      alert("Network error, placement not archived. Please try again.");
    }
  }

  // Cancel, status transition for an active or pending placement.
  // Keeps the row visible to both parties (the counterparty sees
  // "Cancelled"). Separate from archive: archive is personal; cancel
  // is shared and changes the deal.
  async function cancelPlacement(id: string) {
    const snapshot = placements;
    setPlacements((prev) => prev.map((p) => p.id === id ? { ...p, status: "Cancelled" } : p));
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id, status: "cancelled" }),
      });
      if (!res.ok) {
        setPlacements(snapshot);
        const body = await res.json().catch(() => ({}));
        alert(body?.error || `Could not cancel placement (HTTP ${res.status})`);
        return;
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("wallplace:placement-changed", { detail: { placementId: id, action: "cancel" } }));
      }
      loadPlacements();
    } catch (err) {
      setPlacements(snapshot);
      console.error("Placement cancel error:", err);
      alert("Network error, placement not cancelled. Please try again.");
    }
  }

  const dateCutoff = (() => {
    if (dateFilter === "all") return 0;
    const d = new Date();
    if (dateFilter === "7d") d.setDate(d.getDate() - 7);
    else if (dateFilter === "30d") d.setDate(d.getDate() - 30);
    else if (dateFilter === "90d") d.setDate(d.getDate() - 90);
    else if (dateFilter === "year") d.setMonth(0, 1);
    return d.getTime();
  })();
  const search = searchTerm.trim().toLowerCase();
  const filtered = placements.filter((p) => {
    // 'Archived' is its own tab, the placements state already holds
    // only archived rows when that tab is active, so no extra filter.
    if (activeTab !== "All" && activeTab !== "Archived") {
      if (activeTab === "Completed") {
        if (p.status !== "Completed" && p.status !== "Sold") return false;
      } else if (p.status !== activeTab) {
        return false;
      }
    }
    if (dateCutoff && p.createdAtTs && p.createdAtTs < dateCutoff) return false;
    if (search) {
      const haystack = `${p.workTitle} ${p.artistName} ${p.type}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
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

      {/* Request Placement Form, above the Action Items so venues
          aren't hunting past a long to-do list to send a new request */}
      {/* Request Placement Form */}
      {showForm && (
        <div className="bg-surface border border-border rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Request Placement</h2>
            <button onClick={() => { setShowForm(false); setArtistSlug(""); setArtistWorks([]); setSelectedWorkSizes({}); setSizePickerFor(null); }} className="text-xs text-muted hover:text-foreground transition-colors">Cancel</button>
          </div>

          <div className="space-y-5">
            {/* Artist picker / info */}
            {artistSlug ? (
              <div className="bg-accent/5 border border-accent/20 rounded-sm px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm"><span className="text-accent font-medium">Artist:</span> {artistName || artistSlug}</p>
                <button
                  type="button"
                  onClick={() => { setArtistSlug(""); setArtistName(""); setArtistWorks([]); setSelectedWorkSizes({}); setSizePickerFor(null); }}
                  className="text-xs text-muted hover:text-foreground underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <ArtistPickerDropdown onPick={(slug, name) => { setArtistSlug(slug); setArtistName(name); loadArtistWorks(slug); }} />
            )}

            {/* Arrangement, QR and Paid loan are independent toggles so
                a placement can be paid-loan-with-QR (venue pays a monthly
                fee and also splits QR sales). Rev share input below stays
                live whenever QR is enabled. */}
            <div>
              <label className="block text-sm font-medium mb-2">Arrangement</label>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 border rounded-sm cursor-pointer transition-colors ${qrEnabled ? "border-accent bg-accent/5" : "border-border hover:border-foreground/30"}`}>
                  <input
                    type="checkbox"
                    checked={qrEnabled}
                    onChange={() => setQrEnabled(!qrEnabled)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">QR-enabled display</p>
                    <p className="text-xs text-muted">Display the work with a QR code linking to the artist&rsquo;s shop. You split QR sales via the share below.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 border rounded-sm cursor-pointer transition-colors ${paidLoanEnabled ? "border-accent bg-accent/5" : "border-border hover:border-foreground/30"}`}>
                  <input
                    type="checkbox"
                    checked={paidLoanEnabled}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setPaidLoanEnabled(on);
                      // Seed a sensible default the first time the user
                      // turns paid loan on. Don't overwrite an existing
                      // value; don't zero them out when turning it off
                      // either, keeps the field state predictable while
                      // they toggle back and forth.
                      if (on && (monthlyFee === "" || monthlyFee === 0)) {
                        setMonthlyFee(50);
                      }
                    }}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">Paid loan (monthly fee)</p>
                    <p className="text-xs text-muted">You pay the artist a monthly fee to display the work. Combine with QR above if you want both.</p>
                  </div>
                </label>
              </div>
              {paidLoanEnabled && (
                <div className="mt-3 pl-3">
                  <label className="block text-xs font-medium text-muted mb-1.5">Monthly fee to artist</label>
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
                  <p className="text-xs text-muted mt-2">Billing is handled manually for now, use this to record the agreed amount.</p>
                </div>
              )}
            </div>

            {/* Revenue share (only relevant when QR is on) */}
            {qrEnabled && (
              <div>
                <label className="block text-sm font-medium mb-2">Revenue share on QR sales <span className="text-muted font-normal">(optional)</span></label>
                <p className="text-xs text-muted mb-3">Propose a revenue share percentage on QR-linked sales. Leave at 0 for a free display arrangement.</p>
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
                {Object.keys(selectedWorkSizes).length > 0 && (
                  <span className="text-accent ml-2 font-normal">{Object.keys(selectedWorkSizes).length} selected</span>
                )}
              </label>
              <p className="text-xs text-muted mb-3">
                Click a work to pick the size you&rsquo;d like. The artist will confirm what&rsquo;s available.
              </p>
              {worksLoading ? (
                <p className="text-sm text-muted">Loading portfolio...</p>
              ) : artistWorks.length === 0 ? (
                <p className="text-sm text-muted">No works found. Browse an artist&rsquo;s profile to select works for placement.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {artistWorks.map((work) => {
                    const selected = work.title in selectedWorkSizes;
                    const chosenSize = selectedWorkSizes[work.title] || "";
                    const pickerOpen = sizePickerFor === work.title;
                    const sizes = Array.isArray(work.pricing) && work.pricing.length > 0
                      ? work.pricing
                      : (work.dimensions ? [{ label: work.dimensions, price: 0 }] : []);
                    return (
                      <div key={work.id} className="relative">
                        <button
                          type="button"
                          onClick={() => handleCardClick(work.title)}
                          className={`relative block w-full aspect-square rounded-sm overflow-hidden border-2 transition-all ${
                            selected ? "border-accent shadow-sm" : "border-transparent hover:border-border"
                          }`}
                        >
                          {work.image && (
                            <Image src={work.image} alt={work.title} fill className="object-cover" sizes="160px" />
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5">
                            <p className="text-[11px] font-medium text-white truncate text-left">{work.title}</p>
                          </div>
                          {selected && (
                            <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                              <span className="px-1.5 py-0.5 rounded-sm bg-accent text-white text-[10px] font-medium">
                                {chosenSize || "Any size"}
                              </span>
                            </div>
                          )}
                        </button>
                        {/* "Change size" affordance, visible only when
                            the work is selected, so the card-click keeps
                            its simple toggle behaviour and size selection
                            is an explicit opt-in. */}
                        {selected && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSizePickerFor((prev) => (prev === work.title ? null : work.title)); }}
                            className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-sm bg-white/90 text-foreground text-[10px] font-medium border border-border hover:border-foreground/30 z-10"
                          >
                            {chosenSize ? "Change size" : "Pick size"}
                          </button>
                        )}
                        {pickerOpen && (
                          <div
                            className="absolute left-0 right-0 mt-1 bg-background border border-border rounded-sm shadow-lg z-20 overflow-hidden"
                            style={{ top: "100%" }}
                          >
                            <div className="px-3 py-2 border-b border-border">
                              <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Pick a size</p>
                              <p className="text-[11px] text-foreground truncate">{work.title}</p>
                            </div>
                            <ul className="max-h-56 overflow-y-auto py-1">
                              {sizes.length === 0 && (
                                <li className="px-3 py-2 text-[11px] text-muted">No sizes published yet.</li>
                              )}
                              {sizes.map((s) => (
                                <li key={s.label}>
                                  <button
                                    type="button"
                                    onClick={() => setWorkSize(work.title, s.label)}
                                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] hover:bg-surface transition-colors ${
                                      chosenSize === s.label ? "bg-accent/5 text-accent font-medium" : "text-foreground"
                                    }`}
                                  >
                                    <span className="truncate">{s.label}</span>
                                    {s.price > 0 && <span className="text-muted text-[11px]">&pound;{s.price.toFixed(0)}</span>}
                                  </button>
                                </li>
                              ))}
                              <li>
                                <button
                                  type="button"
                                  onClick={() => setWorkSize(work.title, "")}
                                  className={`w-full flex items-center px-3 py-2 text-[12px] hover:bg-surface transition-colors ${
                                    selected && !chosenSize ? "bg-accent/5 text-accent font-medium" : "text-muted"
                                  }`}
                                >
                                  Any size, let the artist suggest
                                </button>
                              </li>
                              {selected && (
                                <li className="border-t border-border mt-1">
                                  <button
                                    type="button"
                                    onClick={() => removeWork(work.title)}
                                    className="w-full flex items-center px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    Remove from selection
                                  </button>
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
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
                {(() => {
                  const count = Object.keys(selectedWorkSizes).length;
                  return (
                    <button
                      onClick={handleSubmitRequest}
                      disabled={count === 0 || !artistSlug || submitting}
                      className="px-6 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Sending..." : `Request ${count} Placement${count !== 1 ? "s" : ""}`}
                    </button>
                  );
                })()}
                <button
                  onClick={() => {
                    setShowForm(false);
                    setArtistSlug("");
                    setArtistWorks([]);
                    setSelectedWorkSizes({});
                    setSizePickerFor(null);
                    setSubmitError(null);
                  }}
                  className="px-6 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outstanding placement actions, shown BELOW the request form
          so new-request flow isn't hidden behind a long to-do list */}
      <PlacementActionItems userId={user?.id} role="venue" heading="Needs your attention" />

      {/* Filter tabs, horizontal scroll on mobile so narrow screens
          don't break 'Completed' / 'Archived' onto a second row. */}
      <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 flex-nowrap">
        {tabs.map((tab) => {
          // Archived uses a separately-fetched count (archivedCount)
          // so the badge is accurate regardless of which tab is
          // active. Other tabs compute from the currently-loaded
          // placements; when the Archived tab is selected those
          // counts hide since `placements` only holds archived rows.
          const onArchivedTab = activeTab === "Archived";
          let count: number | null;
          if (tab === "Archived") {
            count = archivedCount;
          } else if (onArchivedTab) {
            count = null;
          } else if (tab === "All") {
            count = placements.length;
          } else if (tab === "Completed") {
            count = placements.filter((p) => p.status === "Completed" || p.status === "Sold").length;
          } else {
            count = placements.filter((p) => p.status === tab).length;
          }
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab}
              {count !== null && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? "bg-accent/10 text-accent" : "bg-border text-muted"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + date filter, narrow the list by artist / work / type
          and a quick time window. Together with the status tabs above
          these cover the 80% of "I'm looking for X" cases. */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by artist, work or type…"
            className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
          />
        </div>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
          className="wp-select px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
        >
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="year">This year</option>
        </select>
      </div>

      {loading ? (
        <p className="text-muted text-sm py-12 text-center">Loading placements...</p>
      ) : (
        <>
          {/* Bulk-select action bar, appears only when at least one
              row is ticked so the normal view isn't cluttered with
              an empty toolbar. */}
          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 px-4 py-2.5 bg-accent/5 border border-accent/30 rounded-sm">
              <p className="text-sm text-foreground">
                <span className="font-medium">{selectedIds.size}</span>
                <span className="text-muted"> selected</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={bulkArchiveSelected}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent bg-background border border-accent/30 hover:bg-accent/10 rounded-sm transition-colors disabled:opacity-60"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7h18v4H3zM5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" />
                    <line x1="10" y1="16" x2="14" y2="16" />
                  </svg>
                  {bulkBusy
                    ? (showArchived ? "Unarchiving…" : "Archiving…")
                    : (showArchived ? "Unarchive selected" : "Archive selected")}
                </button>
              </div>
            </div>
          )}
          {/* Table - desktop */}
          <div className="bg-surface border border-border rounded-sm hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background">
                    <th className="w-10 px-3 py-3">
                      {(() => {
                        const allSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));
                        const someSelected = filtered.some((p) => selectedIds.has(p.id));
                        return (
                          <input
                            type="checkbox"
                            aria-label={allSelected ? "Clear selection" : "Select all placements"}
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedIds(new Set(filtered.map((p) => p.id)));
                              else setSelectedIds(new Set());
                            }}
                            className="w-3.5 h-3.5 rounded-sm border border-border accent-accent cursor-pointer align-middle"
                          />
                        );
                      })()}
                    </th>
                    <th className="text-left text-xs text-muted font-medium px-6 py-3">Piece</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Artist</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3 whitespace-nowrap">Type</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Status</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Date</th>
                    <th className="text-right text-xs text-muted font-medium px-4 py-3">Earned</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3 whitespace-nowrap">Request</th>
                    <th className="text-right text-xs text-muted font-medium px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((p) => (
                    <React.Fragment key={p.id}>
                    <tr className="hover:bg-background/60 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                      <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.workTitle}`}
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelected(p.id)}
                          className="w-3.5 h-3.5 rounded-sm border border-border accent-accent cursor-pointer align-middle"
                        />
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                            {p.workImage && <Image src={p.workImage} alt={p.workTitle} fill className="object-cover" sizes="32px" />}
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium text-foreground block truncate">
                              {p.workTitle}
                              {p.extraWorks && p.extraWorks.length > 0 && (
                                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-accent bg-accent/10 rounded-sm align-middle">
                                  +{p.extraWorks.length} more
                                </span>
                              )}
                            </span>
                            {nextActionText(p) && (
                              <span className="text-[11px] text-accent block truncate">{nextActionText(p)}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.artistName}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="text-xs border border-border rounded-sm px-2 py-0.5 text-muted whitespace-nowrap">
                          {p.type}{p.revenueSharePercent ? ` (${p.revenueSharePercent}%)` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {(() => {
                          const dir = directionFor({ requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id);
                          return (
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {p.status === "Pending" ? (
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(p.status)}`}>
                                    {dir === "sent" ? "Awaiting their reply" : dir === "received" ? "Your turn" : "Pending"}
                                  </span>
                                ) : p.status === "Declined" ? (
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(p.status)}`}>
                                    Declined
                                  </span>
                                ) : p.status === "Cancelled" ? (
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(p.status)}`}>
                                    Cancelled
                                  </span>
                                ) : (
                                  <select
                                    value={p.status}
                                    onChange={(e) => updateStatus(p.id, e.target.value as PlacementStatus)}
                                    className={`text-xs font-medium px-2 py-0.5 rounded-full border-none cursor-pointer ${statusBadge(p.status)}`}
                                  >
                                    <option value="Active">Active</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Sold">Sold</option>
                                  </select>
                                )}
                              </div>
                              {(p.status === "Active" || p.status === "Completed" || p.status === "Sold") && (
                                <MiniStatusBar p={p} />
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.date}</td>
                      <td className="px-4 py-3.5 text-right font-medium text-foreground">
                        {p.revenueSharePercent != null && p.revenueSharePercent > 0
                          ? `\u00a3${(p.revenueEarned ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : <span className="text-muted">-</span>}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {(() => {
                          const dir = directionFor({ requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id);
                          return dir ? <PlacementDirectionTag direction={dir} /> : <span className="text-[11px] text-muted">–</span>;
                        })()}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(p.status === "Active" || p.status === "Pending") && (
                            <button
                              onClick={(e) => { e.stopPropagation(); if (confirm("Cancel this placement? The other party will see it as cancelled.")) cancelPlacement(p.id); }}
                              className="px-2.5 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-sm transition-colors"
                              title="Cancel placement"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); const word = showArchived ? "Unarchive" : "Archive"; if (confirm(`${word} this placement? It ${showArchived ? "will return to your main list" : "moves to your archive and stays visible to the other party"}.`)) archivePlacement(p.id, showArchived); }}
                            className="p-1.5 rounded-sm text-muted hover:text-accent hover:bg-accent/5 transition-colors"
                            aria-label={showArchived ? "Unarchive placement" : "Archive placement"}
                            title={showArchived ? "Unarchive placement" : "Archive placement"}
                          >
                            {showArchived ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 7h18M3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7l2-4h14l2 4" />
                                <path d="M12 11l3 3-3 3M9 14h6" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 7h18v4H3zM5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" />
                                <line x1="10" y1="16" x2="14" y2="16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === p.id && (
                      <tr>
                        <td colSpan={9} className="px-6 py-4 bg-background border-t border-border">
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
                              <p className="text-foreground font-medium">{p.type}</p>
                            </div>
                            {typeof p.revenueSharePercent === "number" && p.revenueSharePercent > 0 && (
                              <div>
                                <p className="text-muted mb-0.5">Revenue share</p>
                                <p className="text-foreground font-medium">{p.revenueSharePercent}% to artist</p>
                              </div>
                            )}
                            {typeof p.monthlyFeeGbp === "number" && p.monthlyFeeGbp > 0 && (
                              <div>
                                <p className="text-muted mb-0.5">Monthly fee</p>
                                <p className="text-foreground font-medium">&pound;{p.monthlyFeeGbp.toFixed(2)}</p>
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
                              createdAt: p.createdAtTs ? new Date(p.createdAtTs).toISOString() : null,
                              acceptedAt: p.acceptedAt,
                              scheduledFor: p.scheduledFor,
                              installedAt: p.installedAt,
                              liveFrom: p.liveFrom,
                              collectedAt: p.collectedAt,
                            }}
                            canAdvance={p.status === "Active"}
                            currentUserId={user?.id}
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

                          {/* Actions, divided from the details block by a
                              hairline border, primary response buttons on
                              the left, secondary links (Message / Add Loan
                              / Open) on the right. */}
                          <div className="mt-5 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                            <div className="flex flex-wrap items-center gap-2">
                              {canRespond({ status: p.status, requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id, "venue") && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); respond(p.id, true); }}
                                    disabled={responding === p.id}
                                    className="px-3.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-sm transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                                  >
                                    {responding === p.id ? (
                                      <>
                                        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
                                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" opacity="0.4" />
                                          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                        </svg>
                                        Accepting
                                      </>
                                    ) : "Accept"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setCounteringId(p.id); }}
                                    className="px-3.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-sm transition-colors"
                                  >
                                    Counter
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); respond(p.id, false); }}
                                    disabled={responding === p.id}
                                    className="px-3.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-sm transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                                  >
                                    {responding === p.id ? (
                                      <>
                                        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
                                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" opacity="0.4" />
                                          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                        </svg>
                                        Declining
                                      </>
                                    ) : "Decline"}
                                  </button>
                                </>
                              )}
                              {p.status === "Pending" && isRequester({ requester_user_id: p.requesterUserId }, user?.id) && (
                                <span className="px-3 py-1.5 text-[11px] font-medium text-amber-700 border border-amber-200 rounded-sm">
                                  Awaiting their response
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                              <Link
                                href={`/venue-portal/messages?artist=${p.artistSlug}&artistName=${encodeURIComponent(p.artistName)}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted border border-transparent hover:text-foreground hover:border-border rounded-sm transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Message artist
                              </Link>
                              {/* QR labels, deep-link to the labels page
                                  with this placement preselected. The
                                  labels page reads ?placement=<id> and
                                  ticks every work in the placement at
                                  the agreed requested size, so for
                                  multi-work placements the venue can
                                  print every sticker in one go without
                                  manual selection. Subtle outlined
                                  button so it doesn't compete with the
                                  primary Accept/Decline row above. */}
                              <Link
                                href={`/venue-portal/labels?placement=${encodeURIComponent(p.id)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-[#F5F3F0] rounded-sm transition-colors"
                                title="Generate QR labels for this placement"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="7" height="7" rx="1" />
                                  <rect x="14" y="3" width="7" height="7" rx="1" />
                                  <rect x="3" y="14" width="7" height="7" rx="1" />
                                  <line x1="14" y1="14" x2="14" y2="17" />
                                  <line x1="17" y1="14" x2="21" y2="14" />
                                  <line x1="14" y1="20" x2="21" y2="20" />
                                  <line x1="21" y1="14" x2="21" y2="20" />
                                </svg>
                                QR labels
                              </Link>
                              <Link
                                href={`/placements/${encodeURIComponent(p.id)}?record=open`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 hover:bg-accent/5 rounded-sm transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                Add Loan / Consignment
                              </Link>
                              <Link
                                href={`/placements/${encodeURIComponent(p.id)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-[#F5F3F0] rounded-sm transition-colors"
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
                        <p className="font-medium text-foreground text-sm leading-snug">
                          {p.workTitle}
                          {p.extraWorks && p.extraWorks.length > 0 && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-accent bg-accent/10 rounded-sm align-middle">
                              +{p.extraWorks.length} more
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">{p.artistName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {directionFor({ requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id) && (
                        <PlacementDirectionTag direction={directionFor({ requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id)!} size="compact" />
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusBadge(p.status)}`}>
                        {p.status === "Pending"
                          ? (directionFor({ requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id) === "sent"
                              ? "Awaiting their reply"
                              : directionFor({ requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id) === "received"
                                ? "Your turn"
                                : "Pending")
                          : p.status}
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
                  {/* Mini status bar + next action, visible without expanding */}
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
                    {/* Paid-loan payment status, only shown once the
                        work is actually live on the wall. Venues get
                        an action chip linking to /placements/[id]/payment;
                        artists see the info-only variant. */}
                    <PaidLoanPaymentChip
                      placementId={p.id}
                      arrangementType={p.type as string}
                      monthlyFeeGbp={p.monthlyFeeGbp}
                      liveFrom={p.liveFrom}
                      subscriptionStatus={p.subscriptionStatus}
                      role="venue"
                    />

                    {/* Mobile actions, outline-only buttons, primary on
                        top row, secondary on bottom. Hairline separator
                        from the details block above. */}
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      {canRespond({ status: p.status, requester_user_id: p.requesterUserId, artist_user_id: p.artistUserId, venue_user_id: p.venueUserId }, user?.id, "venue") && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); respond(p.id, true); }}
                            disabled={responding === p.id}
                            className="flex-1 px-3.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-sm transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                          >
                            {responding === p.id ? (
                              <>
                                <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
                                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" opacity="0.4" />
                                  <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                </svg>
                                Accepting
                              </>
                            ) : "Accept"}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setCounteringId(p.id); }}
                            className="flex-1 px-3.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-sm transition-colors"
                          >
                            Counter
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); respond(p.id, false); }}
                            disabled={responding === p.id}
                            className="flex-1 px-3.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-sm transition-colors disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      {p.status === "Pending" && isRequester({ requester_user_id: p.requesterUserId }, user?.id) && (
                        <span className="inline-block px-3 py-1.5 text-[11px] font-medium text-amber-700 border border-amber-200 rounded-sm">
                          Awaiting their response
                        </span>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/placements/${encodeURIComponent(p.id)}`}
                          className="inline-flex items-center justify-center gap-1 flex-1 min-w-[140px] px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-[#F5F3F0] rounded-sm transition-colors"
                        >
                          Open full placement
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </Link>
                        <Link
                          href={`/placements/${encodeURIComponent(p.id)}`}
                          className="inline-flex items-center justify-center gap-1 flex-1 min-w-[140px] px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 hover:bg-accent/5 rounded-sm transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          Loan record
                        </Link>
                        {/* QR labels, same deep-link as the desktop
                            expanded action. Mobile flex-wrap means it
                            falls to its own row below the primary
                            actions on narrow screens. */}
                        <Link
                          href={`/venue-portal/labels?placement=${encodeURIComponent(p.id)}`}
                          className="inline-flex items-center justify-center gap-1 flex-1 min-w-[140px] px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-[#F5F3F0] rounded-sm transition-colors"
                          title="Generate QR labels for this placement"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                            <line x1="14" y1="14" x2="14" y2="17" />
                            <line x1="17" y1="14" x2="21" y2="14" />
                            <line x1="14" y1="20" x2="21" y2="20" />
                            <line x1="21" y1="14" x2="21" y2="20" />
                          </svg>
                          QR labels
                        </Link>
                        <Link
                          href={`/venue-portal/messages?artist=${p.artistSlug}&artistName=${encodeURIComponent(p.artistName)}`}
                          className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
                        >
                          Message artist
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

      {/* Inline counter dialog, lives at the portal root so opening a
          counter from any row simply toggles counteringId. On success we
          bust the placements state so the updated terms reload. */}
      {counteringId && (() => {
        const target = placements.find((x) => x.id === counteringId);
        return (
          <CounterPlacementDialog
            placementId={counteringId}
            currentUserId={user?.id}
            initial={{
              monthly_fee_gbp: target?.monthlyFeeGbp,
              revenue_share_percent: target?.revenueSharePercent,
              qr_enabled: target?.qrEnabledOnPlacement,
            }}
            onClose={() => setCounteringId(null)}
            onSuccess={(result) => {
              // Optimistic update so the row shows the new terms AND hides
              // the Accept/Decline buttons for the counter sender without
              // waiting for a round-trip. The background reload then
              // reconciles with server truth.
              setPlacements((prev) => prev.map((p) => p.id === result.placementId ? {
                ...p,
                monthlyFeeGbp: result.monthlyFeeGbp,
                qrEnabledOnPlacement: result.qrEnabled,
                revenueSharePercent: result.revenueSharePercent ?? undefined,
                requesterUserId: result.senderUserId ?? p.requesterUserId,
              } : p));
              setCounteringId(null);
              loadPlacements();
            }}
          />
        );
      })()}
    </VenuePortalLayout>
  );
}
