"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import PlacementActionItems from "@/components/PlacementActionItems";
import PlacementStepper, { type PlacementStepperData } from "@/components/PlacementStepper";
import PaidLoanPaymentChip from "@/components/PaidLoanPaymentChip";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import { normaliseStatus as sharedNormaliseStatus, statusBadgeClass, arrangementLabel } from "@/lib/placements/status";
import PlacementDirectionTag, { directionFor } from "@/components/PlacementDirectionTag";
import CounterPlacementDialog from "@/components/CounterPlacementDialog";

type FilterTab = "All" | "Pending" | "Active" | "Completed" | "Archived";
// Display-only strings, arrangementLabel() can return combined values
// like "Paid loan + QR" so this is deliberately open.
type ArrangementType = string;
type PlacementStatus = "Active" | "Pending" | "Declined" | "Completed" | "Sold" | "Cancelled";

interface Placement {
  id: string;
  workTitle: string;
  /** Additional works sharing this placement (#16). */
  extraWorks?: Array<{ title: string; image: string | null; size: string | null }>;
  workImage: string;
  workSize?: string;
  venue: string;
  venueSlug: string;
  type: ArrangementType;
  revenueSharePercent?: number;
  status: PlacementStatus;
  date: string;
  respondedAt?: string;
  revenue: string | null;
  notes?: string;
  message?: string;
  canRespond?: boolean;
  direction?: "sent" | "received" | null;
  monthlyFeeGbp?: number | null;
  qrEnabled?: boolean | null;
  proposedStage?: "installed" | "collected" | null;
  proposedByUserId?: string | null;
  acceptedAt?: string | null;
  scheduledFor?: string | null;
  installedAt?: string | null;
  liveFrom?: string | null;
  collectedAt?: string | null;
  createdAtTs?: number;
  updatedAtTs?: number;
  /** Stripe subscription state for paid-loan placements. Null until
   *  the venue runs the Checkout flow at /placements/[id]/payment. */
  subscriptionStatus?: string | null;
}

interface InteractedVenue {
  slug: string;
  name: string;
  type?: string;
  location?: string;
}

const statusBadge = (status: string) => statusBadgeClass(sharedNormaliseStatus(status));

/**
 * What happens next for the artist on this placement?
 * Mirrors the venue-side helper but phrased from the artist's side.
 * Returns null when nothing actionable applies (Pending is already
 * surfaced via the "Awaiting response" chip; Declined/Completed/Sold
 * are terminal states).
 */
// "Next: …" hints used to live alongside the status pill on every
// placement row. They duplicated information already obvious from the
// stepper + the action buttons, and felt patronising once you knew
// the lifecycle. The placement progress bar + status badges carry the
// signal on their own.
function nextActionText(_p: Placement): string | null {
  return null;
}

/**
 * 5-dot progress indicator matching the venue-side MiniStatusBar,
 * shows the lifecycle at a glance without the user needing to expand
 * the row.
 */
function MiniStatusBar({ p }: { p: Placement }) {
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
      {stages.map((s) => (
        <span
          key={s.label}
          title={s.label}
          className={`h-1.5 w-4 rounded-full transition-colors ${s.done ? "bg-accent" : "bg-border"}`}
        />
      ))}
    </div>
  );
}

const tabs: FilterTab[] = ["All", "Pending", "Active", "Completed", "Archived"];

const normaliseStatus = (raw: string): PlacementStatus => sharedNormaliseStatus(raw) as PlacementStatus;

function normaliseType(
  rawType: string,
  extras?: { monthly_fee_gbp?: number | null; qr_enabled?: boolean | null; message?: string | null },
): string {
  // Use the shared arrangement-label helper so "Paid Loan + QR" /
  // "Revenue Share" etc. all come out of one source of truth.
  return arrangementLabel({
    arrangement_type: rawType,
    monthly_fee_gbp: extras?.monthly_fee_gbp,
    qr_enabled: extras?.qr_enabled,
    message: extras?.message,
  });
}

export default function PlacementsPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const { user } = useAuth();
  const [responding, setResponding] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const showArchived = activeTab === "Archived";
  // Archived tab badge: always shows the real count regardless of
  // which tab is active, via a separate lightweight GET that fires
  // on mount and after any archive / unarchive mutation.
  const [archivedCount, setArchivedCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d" | "90d" | "year">("all");
  // Archived is a filter tab rather than a separate toggle, derive
  // from activeTab so all the fetch / filter / bulk-archive logic can
  // keep reading the same boolean.
  // (intentionally no setShowArchived; tab change drives it)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>([]);
  // id of the placement currently being countered via the dialog. null = closed.
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [venueSlug, setVenueSlug] = useState("");
  // Ref for the new-placement form so we can scroll to it when an
  // external link (e.g. /spaces-looking-for-art) deep-links here with
  // ?venue=<slug>.
  const formRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const venuePrefill = searchParams?.get("venue") || "";
  const messagePrefill = searchParams?.get("prefillMessage") || "";
  const wallNamePrefill = searchParams?.get("wallName") || "";
  const wallDimsPrefill = searchParams?.get("wallDims") || "";

  // When a `?venue=<slug>` param is present (e.g. from the Spaces page
  // "Open in My Placements" link), prefill the form's venue and open
  // it. Runs once per pathname change, using prefillAppliedRef so a
  // user who manually clears the venue can still clear it without us
  // re-prefilling on rerender. If the deep-linked venue isn't in the
  // user's "interacted with" list yet, we fetch its public profile so
  // the dropdown still has it as a selectable option.
  const prefillAppliedRef = useRef<string>("");
  useEffect(() => {
    if (!venuePrefill) return;
    if (prefillAppliedRef.current === venuePrefill) return;
    prefillAppliedRef.current = venuePrefill;
    setVenueSlug(venuePrefill);
    setShowForm(true);
    if (messagePrefill) setMessage(messagePrefill);

    // Make sure the venue picker has this slug as an option even if
    // the artist hasn't messaged the venue before, fetch the public
    // profile and synthesise an InteractedVenue entry. Soft-fail: if
    // the lookup 404s we still leave venueSlug set; the form's
    // post-submit error path will surface the issue.
    setVenues((prev) => {
      if (prev.some((v) => v.slug === venuePrefill)) return prev;
      return [{ slug: venuePrefill, name: venuePrefill }, ...prev];
    });
    fetch(`/api/venues/${encodeURIComponent(venuePrefill)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const venue = data?.venue;
        if (!venue?.slug) return;
        setVenues((prev) => {
          const idx = prev.findIndex((v) => v.slug === venue.slug);
          const entry: InteractedVenue = {
            slug: venue.slug,
            name: venue.name || venue.slug,
            type: venue.type,
            location: venue.location,
          };
          if (idx === -1) return [entry, ...prev];
          const next = prev.slice();
          next[idx] = entry;
          return next;
        });
      })
      .catch(() => { /* ignore, synthetic entry already in place */ });

    // Scroll once the form has rendered. requestAnimationFrame waits
    // for layout, then a small extra delay lets the form's expand
    // animation settle before we scroll into view.
    requestAnimationFrame(() => {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    });
  }, [venuePrefill]);
  // arrangementType derived from revenuePercent, no separate state needed
  const [revenuePercent, setRevenuePercent] = useState<number | "">(10);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [monthlyFee, setMonthlyFee] = useState<number | "">("");
  const [selectedWorks, setSelectedWorks] = useState<Set<number>>(new Set());
  const [workSizes, setWorkSizes] = useState<Record<number, string>>({});
  // Which card's size picker is currently open. Only one picker can be
  // open at a time so the dropdowns don't overlap each other's bounds.
  const [sizePickerFor, setSizePickerFor] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Interacted venues for dropdown
  const [venues, setVenues] = useState<InteractedVenue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);

  // Fire-and-forget archived count, keeps the Archived tab badge
  // live whether the user is on that tab or not.
  const loadArchivedCount = React.useCallback(async () => {
    if (!artist) return;
    try {
      const res = await authFetch("/api/placements?archived=1");
      const data = await res.json();
      setArchivedCount(Array.isArray(data?.placements) ? data.placements.length : 0);
    } catch { /* badge falls back to 0 */ }
  }, [artist]);

  // Load placements. Exposed via useCallback so callers (e.g. counter
  // dialog onSuccess) can trigger a fresh fetch.
  const loadPlacements = React.useCallback(() => {
    if (!artist) return;
    const url = showArchived ? "/api/placements?archived=1" : "/api/placements";
    return authFetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.placements && data.placements.length > 0) {
          const mapped: Placement[] = data.placements.map((p: Record<string, unknown>) => {
            const requesterId = (p.requester_user_id as string) || null;
            // Strict: only the recipient of a request can respond. Requests
            // the viewer sent themselves show a "Sent" tag and no
            // Accept/Counter/Decline buttons.
            const canRespond = !!requesterId && !!user?.id && requesterId !== user.id;
            // Use the shared helper so legacy rows without
            // requester_user_id still resolve to a "Received" chip (see
            // directionFor() fallback).
            const direction = directionFor(
              {
                requester_user_id: requesterId,
                artist_user_id: p.artist_user_id as string | null,
                venue_user_id: p.venue_user_id as string | null,
              },
              user?.id,
            );
            return {
              id: p.id as string,
              workTitle: (p.work_title as string) || "Untitled",
              workImage: (p.work_image as string) || "",
              workSize: (p.work_size as string) || undefined,
              extraWorks: Array.isArray(p.extra_works)
                ? (p.extra_works as Array<{ title: string; image: string | null; size: string | null }>)
                : undefined,
              venue: (p.venue as string) || "",
              venueSlug: (p.venue_slug as string) || "",
              type: normaliseType((p.arrangement_type as string) || "free_loan", {
                monthly_fee_gbp: p.monthly_fee_gbp as number | null,
                qr_enabled: p.qr_enabled as boolean | null,
                message: p.message as string | null,
              }) as ArrangementType,
              revenueSharePercent: p.revenue_share_percent as number | undefined,
              status: normaliseStatus((p.status as string) || "active"),
              date: p.created_at ? new Date(p.created_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
              respondedAt: p.responded_at ? new Date(p.responded_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : undefined,
              revenue: p.revenue ? `\u00a3${p.revenue}` : null,
              notes: p.notes as string | undefined,
              message: p.message as string | undefined,
              canRespond,
              direction,
              monthlyFeeGbp: (p.monthly_fee_gbp as number | null) ?? null,
              qrEnabled: (p.qr_enabled as boolean | null) ?? null,
              proposedStage: (p.proposed_stage as "installed" | "collected" | null) ?? null,
              proposedByUserId: (p.proposed_by_user_id as string | null) ?? null,
              acceptedAt: (p.accepted_at as string | null) ?? null,
              scheduledFor: (p.scheduled_for as string | null) ?? null,
              installedAt: (p.installed_at as string | null) ?? null,
              liveFrom: (p.live_from as string | null) ?? null,
              collectedAt: (p.collected_at as string | null) ?? null,
              subscriptionStatus: (p.subscription_status as string | null) ?? null,
              createdAtTs: p.created_at ? new Date(p.created_at as string).getTime() : 0,
              // The latest timestamp on the row, used to sort the list
              // so a just-accepted or just-declined placement bubbles to
              // the top (matches "last updated" ordering).
              updatedAtTs: Math.max(
                p.created_at ? new Date(p.created_at as string).getTime() : 0,
                p.responded_at ? new Date(p.responded_at as string).getTime() : 0,
                p.accepted_at ? new Date(p.accepted_at as string).getTime() : 0,
                p.scheduled_for ? new Date(p.scheduled_for as string).getTime() : 0,
                p.installed_at ? new Date(p.installed_at as string).getTime() : 0,
                p.live_from ? new Date(p.live_from as string).getTime() : 0,
                p.collected_at ? new Date(p.collected_at as string).getTime() : 0,
              ),
            };
          });
          mapped.sort((a, b) => (b.updatedAtTs || 0) - (a.updatedAtTs || 0));
          setPlacements(mapped);
        } else {
          setPlacements([]);
        }
      })
      .catch(() => {})
      .finally(() => setInitialised(true));
  }, [artist, user?.id, showArchived]);

  useEffect(() => {
    if (!artist || initialised) return;
    loadPlacements();
    loadArchivedCount();
  }, [artist, initialised, loadPlacements, loadArchivedCount]);

  // Re-fetch when the user toggles the Archived filter.
  useEffect(() => {
    if (!artist || !initialised) return;
    loadPlacements();
  }, [showArchived, artist, initialised, loadPlacements]);

  // Refresh when an accept / counter / advance fires anywhere else.
  useEffect(() => {
    const handler = () => { if (artist) loadPlacements(); };
    window.addEventListener("wallplace:placement-changed", handler);
    return () => window.removeEventListener("wallplace:placement-changed", handler);
  }, [artist, loadPlacements]);

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
    } catch {
      setRespondError("Network error. Please try again.");
    } finally {
      setResponding(null);
    }
  }

  // Tracks whether the API said "your application is still under
  // review". Surfaced in the request form as a friendly notice so a
  // pending applicant sees WHY the venue list is empty (rather than
  // "you haven't messaged anyone yet").
  const [applicationPending, setApplicationPending] = useState(false);

  // Load interacted venues when form opens
  useEffect(() => {
    if (!showForm || venues.length > 0) return;
    setVenuesLoading(true);
    authFetch("/api/placements/venues")
      .then((res) => res.json())
      .then((data) => {
        if (data.venues) setVenues(data.venues);
        if (data.pending) setApplicationPending(true);
      })
      .catch(() => {})
      .finally(() => setVenuesLoading(false));
  }, [showForm, venues.length]);

  // Card click toggles selection with "Any size" as the default.
  // Picking a specific size is an explicit opt-in via the "Pick size" /
  // "Change size" corner button, mirrors the venue-side UX so the two
  // portals feel consistent.
  function toggleWork(index: number) {
    setSelectedWorks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        // Also clear the size on deselect so a re-select starts from
        // "Any size", not whatever was picked previously.
        setWorkSizes((prevSizes) => {
          const nextSizes = { ...prevSizes };
          delete nextSizes[index];
          return nextSizes;
        });
      } else {
        next.add(index);
      }
      return next;
    });
    setSizePickerFor(null);
  }
  function setWorkSize(index: number, sizeLabel: string) {
    setWorkSizes((prev) => ({ ...prev, [index]: sizeLabel }));
    setSelectedWorks((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    setSizePickerFor(null);
  }
  function removeWork(index: number) {
    setSelectedWorks((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setWorkSizes((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setSizePickerFor(null);
  }

  async function handleSubmit() {
    if (!venueSlug || selectedWorks.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);

    const rev = typeof revenuePercent === "number" ? revenuePercent : 0;
    const fee = typeof monthlyFee === "number" ? monthlyFee : 0;
    // Bundle every selected work into a SINGLE placement: first selection
    // becomes the headline work, the rest ride along in extraWorks. This
    // matches the venue-side flow and keeps the multi-work selection from
    // exploding into N separate placements that share nothing but a venue.
    const orderedIndices = Array.from(selectedWorks);
    const headIdx = orderedIndices[0];
    const restIndices = orderedIndices.slice(1);
    const headWork = works[headIdx];
    const extraWorks = restIndices.map((i) => {
      const w = works[i];
      return {
        title: w.title,
        // Zod's optionalString accepts string / "" / undefined (and now
        // null via coercion), keep undefined on the client side so the
        // payload is cleanly typed when "Any size" or no image is the
        // intended value.
        image: w.image || undefined,
        size: workSizes[i] || undefined,
      };
    });
    const newPlacement = {
      id: `p-${Date.now()}-${headIdx}`,
      workTitle: headWork.title,
      workImage: headWork.image || undefined,
      // Keep workSize on the local object for the optimistic UI update,
      // and send it as requestedDimensions so it flows through the zod
      // schema and lands in placements.work_size on the server.
      workSize: workSizes[headIdx] || undefined,
      requestedDimensions: workSizes[headIdx] || undefined,
      venueSlug,
      // QR and paid-loan are independent now. If there's a monthly fee
      // this is a paid loan (optionally also QR-enabled); otherwise it's
      // a revenue share. Monthly fee always flows through when set.
      type: fee > 0 ? "free_loan" as const : "revenue_share" as const,
      revenueSharePercent: qrEnabled && rev > 0 ? rev : undefined,
      notes: notes || undefined,
      message: message || undefined,
      qrEnabled,
      monthlyFeeGbp: fee > 0 ? fee : undefined,
      extraWorks: extraWorks.length > 0 ? extraWorks : undefined,
    };

    try {
      const res = await authFetch("/api/placements", {
        method: "POST",
        body: JSON.stringify({ placements: [newPlacement] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body?.error || `Could not send request (HTTP ${res.status}).`);
        setSubmitting(false);
        return;
      }
      {
        const selectedVenue = venues.find((v) => v.slug === venueSlug);
        const mapped: Placement = {
          id: newPlacement.id,
          workTitle: newPlacement.workTitle,
          workImage: newPlacement.workImage || "",
          workSize: newPlacement.workSize,
          venue: selectedVenue?.name || venueSlug,
          venueSlug: newPlacement.venueSlug,
          type: rev > 0 ? "Revenue Share" as ArrangementType : "Paid Loan" as ArrangementType,
          revenueSharePercent: newPlacement.revenueSharePercent,
          status: "Pending",
          date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          revenue: null,
          notes: newPlacement.notes,
          message: newPlacement.message,
          extraWorks: newPlacement.extraWorks?.map((w) => ({
            title: w.title,
            image: w.image || null,
            size: w.size || null,
          })),
        };
        setPlacements([mapped, ...placements]);
        setShowForm(false);
        setVenueSlug("");
        setSelectedWorks(new Set());
        setNotes("");
        setMessage("");
        setRevenuePercent(0);
        setQrEnabled(true);
        setMonthlyFee("");
      }
    } catch (err) {
      console.error("Placement save error:", err);
    } finally {
      setSubmitting(false);
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
          // Fan out so the inbox and any other open surface refreshes
          // immediately instead of waiting for the next poll.
          window.dispatchEvent(new CustomEvent("wallplace:placement-changed", {
            detail: { placementId: id, action: apiStatus === "declined" ? "decline" : apiStatus === "active" ? "accept" : "status" },
          }));
        }
      })
      .catch((err) => console.error("Status update error:", err));
  }

  // Bulk archive / unarchive, mirrors the single-row bin, just
  // looped over every ticked row so the venue / artist can clean
  // up multiple placements at once.
  async function bulkArchiveSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    const verb = showArchived ? "unarchive" : "archive";
    if (!confirm(`${verb === "archive" ? "Archive" : "Unarchive"} ${count} placement${count === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    const snapshot = placements;
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

  // Archive / unarchive, soft-hide from the caller's own list. The
  // counterparty's view is untouched; archive is reversible via the
  // "Archived" toggle in the filter bar.
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
      loadPlacements();
      loadArchivedCount();
    } catch (err) {
      setPlacements(snapshot);
      console.error("Placement archive error:", err);
      alert("Network error, placement not archived. Please try again.");
    }
  }

  // Cancel an active/pending placement. Status transition only,
  // stays visible to both parties (the other side sees 'Cancelled').
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
    // 'Archived' is its own tab, placements already holds only the
    // archived rows when it's active, so no extra status filter.
    if (activeTab !== "All" && activeTab !== "Archived") {
      if (activeTab === "Completed") {
        if (p.status !== "Completed" && p.status !== "Sold") return false;
      } else if (p.status !== activeTab) {
        return false;
      }
    }
    if (dateCutoff && p.createdAtTs && p.createdAtTs < dateCutoff) return false;
    if (search) {
      const haystack = `${p.workTitle} ${p.venue} ${p.type}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const inputClass = "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors";

  if (artistLoading || !artist) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/placements">
        <p className="text-muted text-sm py-12 text-center">{artistLoading ? "Loading..." : "No artist profile found. Complete your profile setup first."}</p>
      </ArtistPortalLayout>
    );
  }

  const works = artist.works;

  return (
    <ArtistPortalLayout activePath="/artist-portal/placements">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl lg:text-3xl">Placements</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {placements.filter((p) => p.status === "Active").length} active
          </span>
          <Link
            href="/artist-portal/labels"
            className="px-4 py-2 text-sm font-medium text-foreground border border-border hover:bg-background rounded-sm transition-colors"
          >
            Print QR Labels
          </Link>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            + Request Placement
          </button>
        </div>
      </div>

      {/* Request Placement Form, rendered before Needs your attention
          when open, so clicking Request Placement takes the artist
          straight into the form without making them scroll past the
          action items. Matches the venue-side behaviour. */}
      {showForm && (
        <div ref={formRef} className="bg-surface border border-border rounded-sm p-6 mb-6 scroll-mt-24">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Request Placement</h2>
            <button onClick={() => setShowForm(false)} className="text-xs text-muted hover:text-foreground transition-colors">Cancel</button>
          </div>

          {/* Wall context, shown when the artist arrived here from a
              specific venue wall (via /venues/[slug] wall card). The
              wall info is in the URL params; we surface it as a visible
              chip so the form clearly belongs to "this wall" not just
              "this venue". The message field is also pre-filled with a
              wall-aware opener. */}
          {wallNamePrefill && (
            <div className="mb-4 inline-flex items-center gap-2 px-3 py-2 rounded-sm bg-accent/8 border border-accent/30 text-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 12h18M12 3v18" /></svg>
              <span className="text-foreground/90">
                Proposing for{" "}
                <span className="font-semibold">{wallNamePrefill}</span>
                {wallDimsPrefill ? (
                  <span className="text-muted"> · {wallDimsPrefill}</span>
                ) : null}
              </span>
            </div>
          )}

          <div className="space-y-5">
            {/* Venue selector */}
            <div>
              <label className="block text-sm font-medium mb-2">Venue <span className="text-accent">*</span></label>
              {venuesLoading ? (
                <p className="text-sm text-muted">Loading venues...</p>
              ) : applicationPending ? (
                <div className="bg-amber-50 border border-amber-200 rounded-sm p-4">
                  <p className="text-sm font-medium text-amber-900 mb-1">
                    Your application is still under review
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Venue requests open up once we&rsquo;ve approved your
                    profile, we aim to respond within 5 business days.
                    In the meantime, set up your portfolio and profile so
                    you&rsquo;re ready to go live as soon as you&rsquo;re
                    approved.
                  </p>
                </div>
              ) : venues.length === 0 ? (
                <div className="bg-background border border-border rounded-sm p-4">
                  <p className="text-sm text-muted">No venues available. You can only request placements with venues you&rsquo;ve interacted with via messages or enquiries.</p>
                </div>
              ) : (
                <select
                  value={venueSlug}
                  onChange={(e) => setVenueSlug(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select a venue</option>
                  {venues.map((v) => (
                    <option key={v.slug} value={v.slug}>
                      {v.name}{v.location ? `, ${v.location}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Arrangement, independent toggles so a paid loan can also
                have a QR code (venue splits QR sales while still paying a
                monthly fee). */}
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
                    <p className="text-xs text-muted">Venue displays the work with a QR code linking to your profile and sales. You share a % of QR-linked sales with the venue (set below).</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 border rounded-sm cursor-pointer transition-colors ${typeof monthlyFee === "number" && monthlyFee > 0 ? "border-accent bg-accent/5" : "border-border hover:border-foreground/30"}`}>
                  <input
                    type="checkbox"
                    checked={typeof monthlyFee === "number" && monthlyFee > 0}
                    onChange={(e) => setMonthlyFee(e.target.checked ? 50 : "")}
                    className="mt-0.5 accent-accent"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Paid loan (monthly fee)</p>
                    <p className="text-xs text-muted">Venue pays you a monthly fee to display the work. Can be combined with QR above.</p>
                  </div>
                </label>
              </div>
              {typeof monthlyFee === "number" && monthlyFee > 0 && (
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

            {/* Revenue share, only meaningful when the arrangement is
                QR-enabled (no QR code = no QR-linked sales to share). */}
            {qrEnabled && (
              <div>
                <label className="block text-sm font-medium mb-2">Revenue share on QR sales <span className="text-muted font-normal">(optional)</span></label>
                <p className="text-xs text-muted mb-3">Offer the venue a percentage of any QR-linked sales. Leave at 0 for a pure display arrangement.</p>
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

            {/* Select works, card-overlay picker matching the venue
                side. A plain click toggles selection with "Any size" as
                the default; a corner Pick size / Change size button
                opens an inline dropdown to choose a specific size. */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Works <span className="text-accent">*</span>
                {selectedWorks.size > 0 && (
                  <span className="text-accent ml-2 font-normal">{selectedWorks.size} selected</span>
                )}
              </label>
              <p className="text-xs text-muted mb-3">
                Click a work to include it. Leave size on &ldquo;Any size&rdquo; if you&rsquo;re flexible, or pick one to propose a specific size.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {works.map((work, i) => {
                  const selected = selectedWorks.has(i);
                  const chosenSize = workSizes[i] || "";
                  const pickerOpen = sizePickerFor === i;
                  const sizes = Array.isArray(work.pricing) && work.pricing.length > 0
                    ? work.pricing
                    : (work.dimensions ? [{ label: work.dimensions, price: 0 }] : []);
                  return (
                    <div key={i} className="relative">
                      <button
                        type="button"
                        onClick={() => toggleWork(i)}
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
                      {selected && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSizePickerFor((prev) => (prev === i ? null : i)); }}
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
                                  onClick={() => setWorkSize(i, s.label)}
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
                                onClick={() => setWorkSize(i, "")}
                                className={`w-full flex items-center px-3 py-2 text-[12px] hover:bg-surface transition-colors ${
                                  selected && !chosenSize ? "bg-accent/5 text-accent font-medium" : "text-muted"
                                }`}
                              >
                                Any size, let the venue pick
                              </button>
                            </li>
                            <li className="border-t border-border mt-1">
                              <button
                                type="button"
                                onClick={() => removeWork(i)}
                                className="w-full flex items-center px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 transition-colors"
                              >
                                Remove from selection
                              </button>
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Message to venue */}
            <div>
              <label className="block text-sm font-medium mb-2">Message to venue (optional)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Introduce yourself or explain why your work would suit their space..."
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-2">Private notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes for your own records..."
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Submit */}
            {submitError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-500 shrink-0 mt-0.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <p className="text-xs text-red-700 flex-1">{submitError}</p>
                <button onClick={() => setSubmitError(null)} className="text-red-400 hover:text-red-600">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                </button>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={!venueSlug || selectedWorks.size === 0 || submitting}
                className="px-6 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Sending..."
                  : selectedWorks.size > 1
                    ? `Request placement (${selectedWorks.size} works)`
                    : "Request placement"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-6 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outstanding placement actions, now sits below the request form
          so the click-path from "+ Request Placement" shows the form
          before anything else. */}
      <PlacementActionItems userId={user?.id} role="artist" heading="Needs your attention" />

      {/* Filter tabs, horizontal scroll on mobile so narrow screens
          don't break Completed / Archived onto a second row. */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 flex-nowrap">
        {tabs.map((tab) => {
          // Archived count comes from the separate fetch so the badge
          // stays accurate on every tab. Other tabs derive from the
          // currently-loaded placements; when viewing the archive
          // those counts hide (placements only holds archived rows).
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

      {/* Search + date filter, narrow by venue / work / type and a
          quick time window. Mirrors the venue-side controls. */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by venue, work or type…"
            className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
          />
        </div>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
          className="px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
        >
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="year">This year</option>
        </select>
      </div>

      {/* Table - desktop */}
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
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Venue</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3 whitespace-nowrap">Type</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Status</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Date</th>
                <th className="text-right text-xs text-muted font-medium px-4 py-3">Payout</th>
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
                        <Image src={p.workImage} alt={p.workTitle} fill className="object-cover" sizes="32px" />
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
                  <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.venue}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-xs border border-border rounded-sm px-2 py-0.5 text-muted whitespace-nowrap">
                      {p.type}{p.revenueSharePercent ? ` (${p.revenueSharePercent}%)` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.status === "Pending" ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(p.status)}`}>
                          {p.direction === "sent" ? "Awaiting their reply" : p.direction === "received" ? "Your turn" : "Pending"}
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
                  </td>
                  <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.date}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-foreground">
                    {p.revenue ?? <span className="text-muted">-</span>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {p.direction
                      ? <PlacementDirectionTag direction={p.direction} />
                      : <span className="text-[11px] text-muted">–</span>}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {/* QR Label icon used to live here in the un-expanded
                          row; moved into the expanded actions below so the
                          row chrome stays minimal and the QR flow lives
                          alongside the other secondary actions
                          (Message, Add Loan, Open full placement). */}
                      {(p.status === "Active" || p.status === "Pending") && (
                        <button
                          onClick={() => { if (confirm("Cancel this placement? The other party will see it as cancelled.")) cancelPlacement(p.id); }}
                          className="px-2.5 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-sm transition-colors"
                          title="Cancel placement"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => { const word = showArchived ? "Unarchive" : "Archive"; if (confirm(`${word} this placement? It ${showArchived ? "will return to your main list" : "moves to your archive and stays visible to the other party"}.`)) archivePlacement(p.id, showArchived); }}
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
                          <p className="text-muted mb-0.5">Venue</p>
                          <p className="text-foreground font-medium">{p.venue}</p>
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
                          <p className="text-muted mb-0.5">Payout</p>
                          <p className="text-foreground font-medium">{p.revenue || "No sales yet"}</p>
                        </div>
                        <div>
                          <p className="text-muted mb-0.5">QR Scans</p>
                          <p className="text-foreground font-medium">0</p>
                        </div>
                      </div>

                      <PlacementStepper
                        placement={{
                          id: p.id,
                          status: p.status.toLowerCase(),
                          createdAt: p.date ? new Date(p.date).toISOString() : null,
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

                      {/* Actions, split by a hairline from the details
                          grid. Primary (outlined green/amber/red) on the
                          left, secondary links on the right. */}
                      <div className="mt-5 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.status === "Pending" && p.canRespond && (
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
                                className="px-3.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-sm transition-colors disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {p.status === "Pending" && !p.canRespond && p.direction === "sent" && (
                            <span className="px-3 py-1.5 text-[11px] font-medium text-amber-700 border border-amber-200 rounded-sm">
                              Awaiting their response
                            </span>
                          )}
                          {/* Decline isn't the end of the deal, the
                              original offerer can revise terms from here
                              without having to open the full placement
                              page or the message thread. */}
                          {p.status === "Declined" && p.direction === "sent" && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setCounteringId(p.id); }}
                              className="px-3.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-sm transition-colors"
                            >
                              Counter with new terms
                            </button>
                          )}
                          {p.status === "Declined" && p.direction === "received" && (
                            <span className="px-3 py-1.5 text-[11px] font-medium text-muted border border-border rounded-sm">
                              Waiting on them to come back
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                          <Link
                            href={`/artist-portal/messages?artist=${p.venueSlug}&artistName=${encodeURIComponent(p.venue)}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted border border-transparent hover:text-foreground hover:border-border rounded-sm transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Message venue
                          </Link>
                          {/* QR labels, only relevant once the placement
                              is active (artwork is up; venue can scan).
                              Deep-links to the artist labels page with
                              the venue + work + size pre-selected so
                              the artist gets a printable sticker
                              without re-entering anything. */}
                          {p.status === "Active" && (
                            <Link
                              // Multi-work placements: build comma-separated
                              // works + sizes lists so the labels page can
                              // tick every work in the placement at the
                              // size that was agreed when the placement was
                              // created. Falls back to a single work for
                              // legacy placements without extra_works.
                              href={(() => {
                                const all = [
                                  { title: p.workTitle, size: p.workSize ?? "" },
                                  ...(p.extraWorks ?? []).map((w) => ({
                                    title: w.title,
                                    size: w.size ?? "",
                                  })),
                                ];
                                const titles = all.map((w) => w.title).join(",");
                                const sizes = all.map((w) => w.size).join(",");
                                return `/artist-portal/labels?venue=${encodeURIComponent(p.venue)}&works=${encodeURIComponent(titles)}&sizes=${encodeURIComponent(sizes)}`;
                              })()}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-[#F5F3F0] rounded-sm transition-colors"
                              title="Generate QR labels"
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
                          )}
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
                          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Message</p>
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
                    <Image src={p.workImage} alt={p.workTitle} fill className="object-cover" sizes="40px" />
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
                    <p className="text-xs text-muted">{p.venue}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.direction && <PlacementDirectionTag direction={p.direction} size="compact" />}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusBadge(p.status)}`}>
                    {p.status === "Pending"
                      ? (p.direction === "sent" ? "Awaiting their reply" : p.direction === "received" ? "Your turn" : "Pending")
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
                {p.revenue && <span className="font-medium text-foreground">{p.revenue}</span>}
              </div>
              {/* Mini status bar + next action, visible without expanding */}
              {(p.status === "Active" || p.status === "Completed" || p.status === "Sold") && (
                <div className="mt-2.5">
                  <MiniStatusBar p={p} />
                </div>
              )}
              {nextActionText(p) && (
                <p className="mt-1.5 text-[11px] text-accent">{nextActionText(p)}</p>
              )}
            </div>
            {/* Expanded details */}
            {expandedId === p.id && (
              <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-muted mb-0.5">Venue</p>
                    <p className="text-foreground font-medium">{p.venue || "Unknown"}</p>
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
                    <p className="text-muted mb-0.5">Payout</p>
                    <p className="text-foreground font-medium">{p.revenue || "No sales yet"}</p>
                  </div>
                  <div>
                    <p className="text-muted mb-0.5">QR Scans</p>
                    <p className="text-foreground font-medium">0</p>
                  </div>
                </div>
                {p.message && (
                  <div className="bg-background border border-border rounded-sm p-3">
                    <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Message</p>
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
                {/* Paid-loan payment status, only shown once the work is
                    actually live on the venue's wall. Self-hides for any
                    placement that doesn't qualify (non-paid-loan, not yet
                    live, subscription already healthy). */}
                <PaidLoanPaymentChip
                  placementId={p.id}
                  arrangementType={p.type as string}
                  monthlyFeeGbp={p.monthlyFeeGbp}
                  liveFrom={p.liveFrom}
                  subscriptionStatus={p.subscriptionStatus}
                  role="artist"
                />

                {/* Mobile actions, outline-only buttons, split by a
                    hairline from the details block above. */}
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {p.status === "Pending" && p.canRespond && (
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
                  {p.status === "Pending" && !p.canRespond && p.direction === "sent" && (
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
                    {p.status === "Active" && (
                      <Link
                        href={`/artist-portal/labels?venue=${encodeURIComponent(p.venue)}&works=${encodeURIComponent(p.workTitle)}${p.workSize ? `&size=${encodeURIComponent(p.workSize)}` : ""}`}
                        className="inline-flex items-center justify-center gap-1 flex-1 min-w-[140px] px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-[#F5F3F0] rounded-sm transition-colors"
                        title="Generate QR labels"
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
                    )}
                    <Link
                      href={`/artist-portal/messages?artist=${p.venueSlug}&artistName=${encodeURIComponent(p.venue)}`}
                      className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
                    >
                      Message venue
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

      {/* Counter-offer dialog, opens inline on Counter click, no
          navigation. On success we just reload the list so the updated
          terms and the auto-generated counter message appear. */}
      {counteringId && (() => {
        const target = placements.find((x) => x.id === counteringId);
        return (
          <CounterPlacementDialog
            placementId={counteringId}
            currentUserId={user?.id}
            initial={{
              monthly_fee_gbp: target?.monthlyFeeGbp,
              revenue_share_percent: target?.revenueSharePercent,
              qr_enabled: target?.qrEnabled,
            }}
            onClose={() => setCounteringId(null)}
            onSuccess={(result) => {
              // Optimistic update, the row now shows the new terms, and
              // canRespond flips to false on the sender's side so they
              // can't accept their own counter while waiting for the
              // reload to finish.
              setPlacements((prev) => prev.map((p) => p.id === result.placementId ? {
                ...p,
                monthlyFeeGbp: result.monthlyFeeGbp,
                qrEnabled: result.qrEnabled,
                revenueSharePercent: result.revenueSharePercent ?? undefined,
                canRespond: false,
                direction: "sent",
              } : p));
              setCounteringId(null);
              loadPlacements();
            }}
          />
        );
      })()}
    </ArtistPortalLayout>
  );
}
