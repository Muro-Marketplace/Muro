"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import PlacementActionItems from "@/components/PlacementActionItems";
import PlacementStepper, { type PlacementStepperData } from "@/components/PlacementStepper";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import { normaliseStatus as sharedNormaliseStatus, statusBadgeClass, arrangementLabel } from "@/lib/placements/status";
import PlacementDirectionTag, { directionFor } from "@/components/PlacementDirectionTag";
import CounterPlacementDialog from "@/components/CounterPlacementDialog";

type FilterTab = "All" | "Pending" | "Active" | "Completed";
// Display-only strings — arrangementLabel() can return combined values
// like "Paid loan + QR" so this is deliberately open.
type ArrangementType = string;
type PlacementStatus = "Active" | "Pending" | "Declined" | "Completed" | "Sold";

interface Placement {
  id: string;
  workTitle: string;
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
function nextActionText(p: Placement): string | null {
  if (p.status === "Pending") return null;
  if (p.status === "Declined") return null;
  if (p.status === "Completed" || p.status === "Sold") return null;
  if (!p.scheduledFor) return "Next: agree an installation date with the venue";
  if (!p.installedAt) return "Next: confirm installation once the venue has hung the work";
  if (!p.liveFrom) return "Next: mark live on wall";
  if (!p.collectedAt) return "Next: mark collected when the piece comes down";
  return null;
}

/**
 * 5-dot progress indicator matching the venue-side MiniStatusBar —
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

const tabs: FilterTab[] = ["All", "Pending", "Active", "Completed"];

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
  const [placements, setPlacements] = useState<Placement[]>([]);
  // id of the placement currently being countered via the dialog. null = closed.
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [venueSlug, setVenueSlug] = useState("");
  // arrangementType derived from revenuePercent — no separate state needed
  const [revenuePercent, setRevenuePercent] = useState<number | "">(10);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [monthlyFee, setMonthlyFee] = useState<number | "">("");
  const [selectedWorks, setSelectedWorks] = useState<Set<number>>(new Set());
  const [workSizes, setWorkSizes] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Interacted venues for dropdown
  const [venues, setVenues] = useState<InteractedVenue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);

  // Load placements from API
  useEffect(() => {
    if (!artist || initialised) return;
    authFetch("/api/placements")
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
            };
          });
          setPlacements(mapped);
        }
      })
      .catch(() => {})
      .finally(() => setInitialised(true));
  }, [artist, initialised, user?.id]);

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
    } catch {
      setRespondError("Network error. Please try again.");
    } finally {
      setResponding(null);
    }
  }

  // Load interacted venues when form opens
  useEffect(() => {
    if (!showForm || venues.length > 0) return;
    setVenuesLoading(true);
    authFetch("/api/placements/venues")
      .then((res) => res.json())
      .then((data) => { if (data.venues) setVenues(data.venues); })
      .catch(() => {})
      .finally(() => setVenuesLoading(false));
  }, [showForm, venues.length]);

  function toggleWork(index: number) {
    setSelectedWorks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleSubmit() {
    if (!venueSlug || selectedWorks.size === 0) return;
    setSubmitting(true);

    const rev = typeof revenuePercent === "number" ? revenuePercent : 0;
    const fee = typeof monthlyFee === "number" ? monthlyFee : 0;
    const newPlacements = Array.from(selectedWorks).map((workIndex) => {
      const work = works[workIndex];
      return {
        id: `p-${Date.now()}-${workIndex}`,
        workTitle: work.title,
        workImage: work.image,
        workSize: workSizes[workIndex] || undefined,
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
      };
    });

    try {
      const res = await authFetch("/api/placements", {
        method: "POST",
        body: JSON.stringify({ placements: newPlacements }),
      });
      if (res.ok) {
        const selectedVenue = venues.find((v) => v.slug === venueSlug);
        const mapped: Placement[] = newPlacements.map((p) => ({
          id: p.id,
          workTitle: p.workTitle,
          workImage: p.workImage,
          workSize: p.workSize,
          venue: selectedVenue?.name || venueSlug,
          venueSlug: p.venueSlug,
          type: rev > 0 ? "Revenue Share" as ArrangementType : "Paid Loan" as ArrangementType,
          revenueSharePercent: p.revenueSharePercent,
          status: "Pending",
          date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          revenue: null,
          notes: p.notes,
          message: p.message,
        }));
        setPlacements([...mapped, ...placements]);
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
    setPlacements(placements.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    authFetch("/api/placements", {
      method: "PATCH",
      body: JSON.stringify({ id, status: statusMap[newStatus] || "active" }),
    }).catch((err) => console.error("Status update error:", err));
  }

  async function removePlacement(id: string) {
    const snapshot = placements;
    setPlacements(placements.filter((p) => p.id !== id));
    try {
      const res = await authFetch(`/api/placements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.status === 404) return;
      if (!res.ok) {
        setPlacements(snapshot);
        const body = await res.json().catch(() => ({}));
        alert(body?.error || `Could not delete placement (HTTP ${res.status})`);
        return;
      }
      // Verify the row really is gone — catches silent DB permission blocks.
      const verifyRes = await authFetch(`/api/placements?_t=${Date.now()}`, { cache: "no-store" as RequestCache });
      const verifyData = await verifyRes.json().catch(() => ({}));
      const stillThere = Array.isArray(verifyData.placements)
        && verifyData.placements.some((p: { id?: string }) => p.id === id);
      if (stillThere) {
        setPlacements(snapshot);
        alert("Server said the placement was deleted, but it's still there on reload. This is usually a database permission policy — check Supabase logs.");
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

      {/* Request Placement Form — rendered before Needs your attention
          when open, so clicking Request Placement takes the artist
          straight into the form without making them scroll past the
          action items. Matches the venue-side behaviour. */}
      {showForm && (
        <div className="bg-surface border border-border rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Request Placement</h2>
            <button onClick={() => setShowForm(false)} className="text-xs text-muted hover:text-foreground transition-colors">Cancel</button>
          </div>

          <div className="space-y-5">
            {/* Venue selector */}
            <div>
              <label className="block text-sm font-medium mb-2">Venue <span className="text-accent">*</span></label>
              {venuesLoading ? (
                <p className="text-sm text-muted">Loading venues...</p>
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

            {/* Arrangement — independent toggles so a paid loan can also
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
                  <p className="text-xs text-muted mt-2">Billing is handled manually for now — use this to record the agreed amount.</p>
                </div>
              )}
            </div>

            {/* Revenue share — only meaningful when the arrangement is
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

            {/* Select works */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Works <span className="text-accent">*</span>
                {selectedWorks.size > 0 && (
                  <span className="text-accent ml-2 font-normal">{selectedWorks.size} selected</span>
                )}
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                {works.map((work, i) => {
                  const selected = selectedWorks.has(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleWork(i)}
                      className={`relative aspect-square rounded-sm overflow-hidden border-2 transition-all ${
                        selected ? "border-accent shadow-sm" : "border-transparent hover:border-border"
                      }`}
                    >
                      <Image src={work.image} alt={work.title} fill className="object-cover" sizes="80px" />
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
              {/* Size selector for selected works */}
              {selectedWorks.size > 0 && (
                <div className="mt-3 space-y-2">
                  {Array.from(selectedWorks).map((workIndex) => {
                    const work = works[workIndex];
                    if (!work) return null;
                    return (
                      <div key={workIndex} className="flex items-center gap-3 text-xs">
                        <span className="text-foreground font-medium w-32 truncate">{work.title}</span>
                        <select
                          value={workSizes[workIndex] || ""}
                          onChange={(e) => setWorkSizes((prev) => ({ ...prev, [workIndex]: e.target.value }))}
                          className="px-2 py-1.5 bg-background border border-border rounded-sm text-xs text-foreground focus:outline-none focus:border-accent/50"
                        >
                          <option value="">Select size</option>
                          {work.pricing?.map((p) => (
                            <option key={p.label} value={p.label}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
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
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={!venueSlug || selectedWorks.size === 0 || submitting}
                className="px-6 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending..." : `Request ${selectedWorks.size} Placement${selectedWorks.size !== 1 ? "s" : ""}`}
              </button>
              <button onClick={() => setShowForm(false)} className="px-6 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outstanding placement actions — now sits below the request form
          so the click-path from "+ Request Placement" shows the form
          before anything else. */}
      <PlacementActionItems userId={user?.id} role="artist" heading="Needs your attention" />

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

      {/* Table - desktop */}
      <div className="bg-surface border border-border rounded-sm hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left text-xs text-muted font-medium px-6 py-3">Piece</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Venue</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Type</th>
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
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                        <Image src={p.workImage} alt={p.workTitle} fill className="object-cover" sizes="32px" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-foreground block truncate">{p.workTitle}</span>
                        {nextActionText(p) && (
                          <span className="text-[11px] text-accent block truncate">{nextActionText(p)}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.venue}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs border border-border rounded-sm px-2 py-0.5 text-muted">
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
                      : <span className="text-[11px] text-muted">—</span>}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {p.status === "Active" && (
                        <Link
                          href={`/artist-portal/labels?venue=${encodeURIComponent(p.venue)}&works=${encodeURIComponent(p.workTitle)}${p.workSize ? `&size=${encodeURIComponent(p.workSize)}` : ""}`}
                          className="w-8 h-8 flex items-center justify-center rounded-sm border border-border hover:border-accent hover:bg-accent/5 transition-colors"
                          title="Generate QR Label"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="2" y="2" width="8" height="8" rx="1" />
                            <rect x="14" y="2" width="8" height="8" rx="1" />
                            <rect x="2" y="14" width="8" height="8" rx="1" />
                            <rect x="14" y="14" width="4" height="4" />
                            <rect x="20" y="14" width="2" height="2" />
                            <rect x="14" y="20" width="2" height="2" />
                            <rect x="20" y="20" width="2" height="2" />
                          </svg>
                        </Link>
                      )}
                      <button
                        onClick={() => { if (confirm("Remove this placement?")) removePlacement(p.id); }}
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
                    <td colSpan={8} className="px-6 py-4 bg-background border-t border-border">
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
                          acceptedAt: p.acceptedAt,
                          scheduledFor: p.scheduledFor,
                          installedAt: p.installedAt,
                          liveFrom: p.liveFrom,
                          collectedAt: p.collectedAt,
                          proposedStage: p.proposedStage,
                          proposedByUserId: p.proposedByUserId,
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
                          proposedStage: next.proposedStage ?? x.proposedStage,
                          proposedByUserId: next.proposedByUserId ?? x.proposedByUserId,
                        } : x))}
                      />

                      {/* Actions — split by a hairline from the details
                          grid. Primary (outlined green/amber/red) on the
                          left, secondary links on the right. */}
                      <div className="mt-5 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.status === "Pending" && p.canRespond && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); respond(p.id, true); }}
                                disabled={responding === p.id}
                                className="px-3.5 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-300 hover:bg-emerald-50 rounded-sm transition-colors disabled:opacity-50"
                              >
                                {responding === p.id ? "…" : "Accept"}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setCounteringId(p.id); }}
                                className="px-3.5 py-1.5 text-xs font-medium text-amber-700 border border-amber-300 hover:bg-amber-50 rounded-sm transition-colors"
                              >
                                Counter
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); respond(p.id, false); }}
                                disabled={responding === p.id}
                                className="px-3.5 py-1.5 text-xs font-medium text-red-700 border border-red-300 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-50"
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
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                          <Link
                            href={`/artist-portal/messages?artist=${p.venueSlug}&artistName=${encodeURIComponent(p.venue)}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted border border-transparent hover:text-foreground hover:border-border rounded-sm transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Message venue
                          </Link>
                          <Link
                            href={`/placements/${encodeURIComponent(p.id)}`}
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
                    <p className="font-medium text-foreground text-sm leading-snug">{p.workTitle}</p>
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
              {/* Mini status bar + next action — visible without expanding */}
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

                {/* Mobile actions — outline-only buttons, split by a
                    hairline from the details block above. */}
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {p.status === "Pending" && p.canRespond && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); respond(p.id, true); }}
                        disabled={responding === p.id}
                        className="flex-1 px-3.5 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-300 hover:bg-emerald-50 rounded-sm transition-colors disabled:opacity-50"
                      >
                        {responding === p.id ? "…" : "Accept"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCounteringId(p.id); }}
                        className="flex-1 px-3.5 py-1.5 text-xs font-medium text-amber-700 border border-amber-300 hover:bg-amber-50 rounded-sm transition-colors"
                      >
                        Counter
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); respond(p.id, false); }}
                        disabled={responding === p.id}
                        className="flex-1 px-3.5 py-1.5 text-xs font-medium text-red-700 border border-red-300 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-50"
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

      {/* Counter-offer dialog — opens inline on Counter click, no
          navigation. On success we just reload the list so the updated
          terms and the auto-generated counter message appear. */}
      {counteringId && (() => {
        const target = placements.find((x) => x.id === counteringId);
        return (
          <CounterPlacementDialog
            placementId={counteringId}
            initial={{
              monthly_fee_gbp: target?.monthlyFeeGbp,
              revenue_share_percent: target?.revenueSharePercent,
              qr_enabled: target?.qrEnabled,
            }}
            onClose={() => setCounteringId(null)}
            onSuccess={() => { setInitialised(false); }}
          />
        );
      })()}
    </ArtistPortalLayout>
  );
}
