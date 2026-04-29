"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { authFetch } from "@/lib/api-client";
import type { ArtistWork } from "@/data/artists";
import {
  normaliseStatus,
  statusBadgeClass,
  nextAction,
  viewerRole,
  type DisplayStatus,
  type PlacementLifecycle,
} from "@/lib/placements/status";
import { canRespond } from "@/lib/placement-permissions";
import PlacementDirectionTag, { directionFor } from "@/components/PlacementDirectionTag";
import { useSearchParams } from "next/navigation";

interface PanelProps {
  otherPartySlug: string | null;
  otherPartyName: string;
  otherPartyType: "artist" | "venue" | "admin";
  otherPartyImage: string | null;
  portalType: "artist" | "venue";
  userId: string | null | undefined;
  /** Works owned by the current user (only for the artist side) or loaded portfolio of the other artist (venue side). */
  otherPartyWorks: ArtistWork[];
  otherPartyWorksLoading: boolean;
  onRequestSent?: () => void;
  /** Optional close callback. When provided the panel renders a dismiss
      chevron in its top-right corner (used by the mobile drawer and as
      an optional collapse affordance on desktop). */
  onClose?: () => void;
}

interface RemotePlacement extends PlacementLifecycle {
  id: string;
  work_title: string;
  work_image: string | null;
  arrangement_type: string;
  revenue_share_percent: number | null;
  monthly_fee_gbp: number | null;
  qr_enabled: boolean | null;
  artist_slug: string | null;
  venue_slug: string | null;
  venue: string | null;
  artist_user_id: string | null;
  venue_user_id: string | null;
  requester_user_id: string | null;
  accepted_at: string | null;
  scheduled_for: string | null;
  installed_at: string | null;
  live_from: string | null;
  collected_at: string | null;
  revenue_earned_gbp: number | null;
  message: string | null;
  created_at: string;
}

function formatDate(ts: string | null | undefined) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function TermsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-xs">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{title}</p>
      {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
    </div>
  );
}

export default function PlacementContextPanel({
  otherPartySlug,
  otherPartyName,
  otherPartyType,
  portalType,
  userId,
  otherPartyWorks,
  otherPartyWorksLoading,
  onRequestSent,
  onClose,
}: PanelProps) {
  const [placements, setPlacements] = useState<RemotePlacement[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Schedule install, open a date picker before stamping `scheduled`
  // so the artist or venue can pick a real install date instead of
  // "now". Mirrors the PlacementStepper / detail-page flow.
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<string>("");

  // Counter form state
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterRevShare, setCounterRevShare] = useState<number>(0);
  const [counterQr, setCounterQr] = useState<boolean>(true);
  // Paid-loan and QR are now independent toggles on the counter form so
  // paid-loan + QR + rev share can be expressed in one counter.
  const [counterPaidLoan, setCounterPaidLoan] = useState<boolean>(false);
  const [counterFee, setCounterFee] = useState<number | "">("");
  const [counterNote, setCounterNote] = useState("");

  // If the user arrived via a Counter link on the placements list page, the
  // URL carries ?counter=<placementId>. Auto-open the counter form for that
  // placement as soon as we've loaded it.
  const searchParams = useSearchParams();
  const counterParam = searchParams?.get("counter") || null;

  // Request-a-placement form state
  const [reqSelected, setReqSelected] = useState<Set<string>>(new Set());
  // reqQr: true \u2192 Revenue share arrangement (QR always on).
  //        false \u2192 Paid loan arrangement (QR optional via reqPaidLoanQr).
  const [reqQr, setReqQr] = useState(true);
  // Paid-loan sub-toggle: does the venue also want a QR card so the artist
  // earns a share on QR sales? Independent of the monthly fee.
  const [reqPaidLoanQr, setReqPaidLoanQr] = useState(true);
  const [reqRevShare, setReqRevShare] = useState<number>(0);
  const [reqFee, setReqFee] = useState<number | "">("");
  const [reqNote, setReqNote] = useState("");

  const isSupported = !!otherPartySlug && otherPartyType !== "admin";

  const loadPlacements = useCallback(async () => {
    if (!isSupported) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/placements");
      const data = await res.json();
      const rows: RemotePlacement[] = (data.placements || []).filter((p: RemotePlacement) => {
        return p.artist_slug === otherPartySlug || p.venue_slug === otherPartySlug;
      });
      // Sort most recent first \u2014 API already orders, but be defensive.
      rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setPlacements(rows);
    } catch (err) {
      console.error("Failed to load placements for panel:", err);
    } finally {
      setLoading(false);
    }
  }, [otherPartySlug, isSupported]);

  useEffect(() => {
    loadPlacements();
  }, [loadPlacements]);

  // Re-load whenever any placement-changing action fires anywhere on the
  // page (Messages accept / decline, counter, stage advance). Gives the
  // panel near-instant consistency with actions taken elsewhere in the
  // same session without waiting for a poll.
  useEffect(() => {
    const handler = () => { loadPlacements(); };
    window.addEventListener("wallplace:placement-changed", handler);
    return () => window.removeEventListener("wallplace:placement-changed", handler);
  }, [loadPlacements]);

  // When a conversation has multiple placements, default the panel to the
  // most recent live (Pending / Active) one, then let the user arrow
  // through the rest via prev/next in the header.
  const defaultIndex = useMemo(() => {
    if (placements.length === 0) return 0;
    const liveIdx = placements.findIndex((p) => {
      const s = normaliseStatus(p.status);
      return s === "Pending" || s === "Active";
    });
    return liveIdx >= 0 ? liveIdx : 0;
  }, [placements]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Re-anchor to the default live row whenever the underlying list changes.
  useEffect(() => { setCurrentIndex(defaultIndex); }, [defaultIndex]);

  // If the URL carries ?counter=<placementId>, jump the panel to that
  // placement and auto-open the counter form. This is what the "Counter"
  // button on the placements list pages links to.
  useEffect(() => {
    if (!counterParam || placements.length === 0) return;
    const idx = placements.findIndex((x) => x.id === counterParam);
    if (idx >= 0) {
      setCurrentIndex(idx);
      const p = placements[idx];
      setCounterRevShare(p.revenue_share_percent || 0);
      setCounterQr(p.qr_enabled ?? true);
      const fee = typeof p.monthly_fee_gbp === "number" ? p.monthly_fee_gbp : 0;
      setCounterPaidLoan(fee > 0);
      setCounterFee(fee > 0 ? fee : "");
      setCounterOpen(true);
    }
  }, [counterParam, placements]);
  const current: PlacementLifecycle & Partial<RemotePlacement> | null =
    placements.length === 0 ? null : (placements[Math.min(currentIndex, placements.length - 1)] ?? placements[0]);

  const displayStatus: DisplayStatus | null = current ? normaliseStatus(current.status as string) : null;
  // Map snake_case DB columns onto the camelCase PlacementLifecycle shape
  // that status helpers expect. Without this, currentStage / nextStage
  // can't read the timestamps and every active placement looks like it
  // has no next step.
  const lifecycleCurrent = current ? {
    status: current.status,
    acceptedAt: (current as RemotePlacement).accepted_at,
    scheduledFor: (current as RemotePlacement).scheduled_for,
    installedAt: (current as RemotePlacement).installed_at,
    liveFrom: (current as RemotePlacement).live_from,
    collectedAt: (current as RemotePlacement).collected_at,
    requesterUserId: (current as RemotePlacement).requester_user_id,
  } : null;
  const role = lifecycleCurrent ? viewerRole(lifecycleCurrent, userId || null) : "observer";
  const nextAct = lifecycleCurrent ? nextAction(lifecycleCurrent, role) : null;

  // Authoritative "can I respond?" check that matches the logic used on
  // /venue-portal/placements and /artist-portal/placements. Handles both
  // modern rows (with requester_user_id) and legacy rows (with the
  // historical venue-requested-artist-accepts assumption), so the
  // Messages panel never shows Accept / Decline for a placement the
  // current user sent themselves.
  const canViewerRespond = current
    ? canRespond(
        {
          status: current.status,
          requester_user_id: (current as RemotePlacement).requester_user_id,
          artist_user_id: (current as RemotePlacement).artist_user_id,
          venue_user_id: (current as RemotePlacement).venue_user_id,
        },
        userId || null,
        portalType,
      )
    : false;

  async function handleAccept() {
    if (!current) return;
    setBusyAction("accept");
    setError(null);
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id: (current as RemotePlacement).id, status: "active" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Could not accept");
      else await loadPlacements();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDecline() {
    if (!current) return;
    if (!confirm("Decline this placement request?")) return;
    setBusyAction("decline");
    setError(null);
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id: (current as RemotePlacement).id, status: "declined" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Could not decline");
      else await loadPlacements();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUndoStage(stage: "scheduled" | "installed" | "live" | "collected") {
    if (!current) return;
    if (!confirm(`Undo "${stage}"? You can restamp it later.`)) return;
    setBusyAction(`undo-${stage}`);
    setError(null);
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id: (current as RemotePlacement).id, unsetStage: stage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Could not undo stage");
      else {
        await loadPlacements();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("wallplace:placement-changed", { detail: { placementId: (current as RemotePlacement).id, action: "undo", stage } }));
        }
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAdvance(stage: string, explicitDate?: string) {
    if (!current || stage === "accepted") return;
    setBusyAction(`advance-${stage}`);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        id: (current as RemotePlacement).id,
        stage,
      };
      if (explicitDate) body.stageDate = explicitDate;
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Could not update stage");
      else {
        await loadPlacements();
        setSchedulePickerOpen(false);
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmSchedule() {
    if (!scheduleDraft) return;
    const iso = new Date(`${scheduleDraft}T12:00:00`).toISOString();
    await handleAdvance("scheduled", iso);
  }

  function openSchedulePicker() {
    const existing = (current as RemotePlacement | null)?.scheduled_for;
    if (existing) {
      const d = new Date(existing);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        setScheduleDraft(`${y}-${m}-${day}`);
        setSchedulePickerOpen(true);
        return;
      }
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    setScheduleDraft(`${y}-${m}-${day}`);
    setSchedulePickerOpen(true);
  }

  async function handleCounterSubmit() {
    if (!current) return;
    setBusyAction("counter");
    setError(null);
    try {
      // Derive arrangement_type from the two toggles. free_loan is the DB
      // value for "has a monthly fee" (the column name is legacy); pure
      // revenue share has no fee.
      const arrangementType = counterPaidLoan
        ? "free_loan"
        : counterQr
          ? "revenue_share"
          : "free_loan";
      const body = {
        id: (current as RemotePlacement).id,
        counter: {
          arrangementType,
          revenueSharePercent: counterQr && counterRevShare > 0 ? counterRevShare : undefined,
          qrEnabled: counterQr,
          monthlyFeeGbp: counterPaidLoan && typeof counterFee === "number" ? counterFee : undefined,
          message: counterNote.trim() || undefined,
        },
      };
      const res = await authFetch("/api/placements", { method: "PATCH", body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Could not send counter");
      else {
        setCounterOpen(false);
        setCounterNote("");
        await loadPlacements();
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRequest() {
    if (reqSelected.size === 0 || !otherPartySlug) return;
    setBusyAction("request");
    setError(null);
    try {
      const selectedWorks = otherPartyWorks.filter((w) => reqSelected.has(w.title));
      const arrangementType = reqQr ? "revenue_share" : "free_loan";
      // QR is always enabled on revenue share (that's the whole point);
      // on paid loan it follows the venue's choice via reqPaidLoanQr.
      const qrEnabled = reqQr ? true : reqPaidLoanQr;
      const fromVenue = portalType === "venue";
      const body = {
        fromVenue,
        artistSlug: fromVenue ? otherPartySlug : undefined,
        placements: selectedWorks.map((w) => ({
          id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          workTitle: w.title,
          workImage: w.image,
          venueSlug: fromVenue ? "" : otherPartySlug,
          venue: fromVenue ? "" : otherPartyName,
          type: arrangementType,
          revenueSharePercent: (reqQr || (qrEnabled && reqRevShare > 0)) && reqRevShare > 0 ? reqRevShare : undefined,
          qrEnabled,
          monthlyFeeGbp: !reqQr && typeof reqFee === "number" ? reqFee : undefined,
          message: reqNote.trim() || undefined,
        })),
      };
      const res = await authFetch("/api/placements", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Could not send request");
      else {
        setReqSelected(new Set());
        setReqNote("");
        await loadPlacements();
        onRequestSent?.();
      }
    } finally {
      setBusyAction(null);
    }
  }

  // Unsupported conversation (e.g. Wallplace Support) \u2014 keep it quiet.
  if (!isSupported) {
    return (
      <aside className="w-full h-full bg-[#FAF8F5] border-l border-border flex flex-col">
        <div className="px-5 py-6">
          <Header title="Placement" />
          <p className="text-xs text-muted mt-3">
            Placements don't apply to this conversation.
          </p>
        </div>
      </aside>
    );
  }

  // Loading placeholder
  if (loading && placements.length === 0) {
    return (
      <aside className="w-full h-full bg-[#FAF8F5] border-l border-border flex flex-col">
        <div className="px-5 py-6">
          <Header title="Placement" />
          <p className="text-xs text-muted mt-3">Loading…</p>
        </div>
      </aside>
    );
  }

  // No placement \u2014 show the Request a Placement form.
  if (!current) {
    return (
      <aside id="placement-request-form" className="w-full h-full bg-[#FAF8F5] border-l border-border flex flex-col overflow-y-auto">
        <div className="px-5 py-6 border-b border-border">
          <Header title="Request a Placement" subtitle={`Start a placement with ${otherPartyName}.`} />
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted mb-2">
              Select works {reqSelected.size > 0 && <span className="text-accent normal-case">({reqSelected.size})</span>}
            </p>
            {otherPartyWorksLoading ? (
              <p className="text-xs text-muted">Loading portfolio…</p>
            ) : otherPartyWorks.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {otherPartyWorks.slice(0, 12).map((w) => {
                  const selected = reqSelected.has(w.title);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => {
                        setReqSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(w.title)) next.delete(w.title); else next.add(w.title);
                          return next;
                        });
                      }}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${selected ? "border-accent shadow-sm" : "border-transparent hover:border-border"}`}
                      title={w.title}
                    >
                      <Image src={w.image} alt={w.title} fill className="object-cover" sizes="100px" />
                      {selected && (
                        <div className="absolute inset-0 bg-accent/25 flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                            <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted">No works available yet.</p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted mb-2">Type</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setReqQr(true)} className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${reqQr ? "bg-accent/10 border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}>Revenue share</button>
              <button type="button" onClick={() => setReqQr(false)} className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${!reqQr ? "bg-accent/10 border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}>Paid loan</button>
            </div>
          </div>

          {reqQr ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted flex-1">Revenue share</span>
              <input type="number" min={0} max={50} value={reqRevShare} onChange={(e) => setReqRevShare(Number(e.target.value) || 0)} className="w-16 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-center focus:outline-none focus:border-accent/50" />
              <span className="text-xs text-muted">%</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted flex-1">Monthly fee</span>
                <span className="text-xs text-muted">£</span>
                <input type="number" min={0} value={reqFee} onChange={(e) => { const v = e.target.value; if (v === "") { setReqFee(""); return; } const n = Number(v); if (!Number.isNaN(n)) setReqFee(n); }} placeholder="e.g. 50" className="w-20 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs focus:outline-none focus:border-accent/50" />
              </div>
              {/* Optional QR for paid loans \u2014 venue still earns a share
                  on any QR sales even while paying the artist a monthly fee. */}
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">Add a QR code</p>
                  <p className="text-[10px] text-muted leading-snug">Let visitors buy the piece. You&rsquo;ll split QR sales.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReqPaidLoanQr(!reqPaidLoanQr)}
                  className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${reqPaidLoanQr ? "bg-accent" : "bg-border"}`}
                  aria-pressed={reqPaidLoanQr}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${reqPaidLoanQr ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </button>
              </label>
              {reqPaidLoanQr && (
                <div className="flex items-center gap-2 pl-0">
                  <span className="text-xs text-muted flex-1">Share on QR sales</span>
                  <input type="number" min={0} max={50} value={reqRevShare} onChange={(e) => setReqRevShare(Number(e.target.value) || 0)} className="w-16 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-center focus:outline-none focus:border-accent/50" />
                  <span className="text-xs text-muted">%</span>
                </div>
              )}
            </div>
          )}

          <textarea value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="Add a note (optional)" rows={3} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent/50 resize-none" />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button onClick={handleRequest} disabled={busyAction === "request" || reqSelected.size === 0} className="w-full px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-full hover:bg-accent-hover transition-colors disabled:opacity-40">
            {busyAction === "request" ? "Sending…" : `Send placement request${reqSelected.size > 1 ? ` (${reqSelected.size})` : ""}`}
          </button>
        </div>
      </aside>
    );
  }

  // Has placement \u2014 show progress panel.
  const p = current as RemotePlacement;
  // Derive the headline arrangement label from actual data rather than
  // trusting the raw arrangement_type. For legacy rows where the fee was
  // dropped by an earlier insert retry, fall back to parsing £X/month out
  // of the request message so a paid loan isn't mislabelled.
  const msg = p.message || "";
  const msgFeeMatch = msg.match(/(?:\u00a3|gbp)\s?(\d{2,5})\s?(?:\/?\s?m|per\s*m|\/\s*mo|a\s*m)/i);
  const msgFee = msgFeeMatch ? parseFloat(msgFeeMatch[1]) : 0;
  const hasFee = (typeof p.monthly_fee_gbp === "number" && p.monthly_fee_gbp > 0) || msgFee > 0;
  const arrangementLabel = hasFee
    ? (p.qr_enabled ? "Paid loan + QR" : "Paid loan")
    : p.arrangement_type === "purchase"
      ? "Direct purchase"
      : p.qr_enabled || p.arrangement_type === "revenue_share"
        ? "Revenue share"
        : "Free display";

  return (
    <aside className="w-full h-full bg-[#FAF8F5] border-l border-border flex flex-col overflow-y-auto">
      {/* Placement header, work title + status chip on one row,
          arrangement as a small subtitle. Tight padding on mobile, the
          original comfortable padding restored on desktop via lg: */}
      <div className="px-4 py-3 lg:px-5 lg:py-5 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">Placement</p>
            {placements.length > 1 && (
              <div className="flex items-center gap-1 text-[10px] text-muted">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((i) => (i - 1 + placements.length) % placements.length)}
                  className="p-0.5 text-muted hover:text-foreground disabled:opacity-30"
                  aria-label="Previous placement"
                  title="Previous placement"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span className="tabular-nums">{currentIndex + 1}/{placements.length}</span>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((i) => (i + 1) % placements.length)}
                  className="p-0.5 text-muted hover:text-foreground disabled:opacity-30"
                  aria-label="Next placement"
                  title="Next placement"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {(() => {
              const dir = directionFor({
                requester_user_id: p.requester_user_id,
                artist_user_id: p.artist_user_id,
                venue_user_id: p.venue_user_id,
              }, userId || null);
              return dir ? <PlacementDirectionTag direction={dir} size="compact" /> : null;
            })()}
            {displayStatus && (
              <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${statusBadgeClass(displayStatus)}`}>
                {displayStatus}
              </span>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 -mr-1 text-muted hover:text-foreground transition-colors"
                aria-label="Close placement panel"
                title="Collapse panel"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            )}
          </div>
        </div>
        <p className="text-sm font-medium text-foreground mt-1.5 lg:mt-3 truncate">{p.work_title}</p>
        <p className="text-[11px] lg:text-xs text-muted">{arrangementLabel}</p>
      </div>

      {/* Progress, mobile keeps the tighter rhythm; desktop restores the
          original relaxed spacing. */}
      <div className="px-4 py-3 lg:px-5 lg:py-4 border-b border-border bg-surface">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">Progress</p>
        <ol className="mt-2 lg:mt-3 space-y-0">
          {(() => {
            const lifecycle = [
              { key: "requested", label: "Requested", ts: p.created_at, reached: !!p.created_at },
              { key: "accepted",  label: "Accepted",  ts: p.accepted_at, reached: !!p.accepted_at },
              { key: "scheduled", label: "Scheduled", ts: p.scheduled_for, reached: !!p.scheduled_for },
              { key: "installed", label: "Installed", ts: p.installed_at, reached: !!p.installed_at },
              { key: "live",      label: "Live on wall", ts: p.live_from, reached: !!p.live_from },
              { key: "collected", label: "Collected", ts: p.collected_at, reached: !!p.collected_at },
            ];
            const isDeclined = displayStatus === "Declined";
            const currentIdx = lifecycle.reduce((acc, s, i) => (s.reached ? i : acc), -1);
            if (isDeclined) {
              return (
                <>
                  <li className="relative pl-5 pb-2">
                    <span className="absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                    </span>
                    <span className="absolute left-[6px] top-3.5 bottom-0 w-px bg-red-200" />
                    <p className="text-xs font-medium text-foreground leading-tight">Requested</p>
                    <p className="text-[10px] text-muted leading-tight">{formatDate(p.created_at)}</p>
                  </li>
                  <li className="relative pl-5">
                    <span className="absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center">
                      <svg width="7" height="7" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                    </span>
                    <p className="text-xs font-medium text-red-700 leading-tight">Declined</p>
                  </li>
                </>
              );
            }
            return lifecycle.map((s, i) => {
              const isCurrent = i === currentIdx;
              const isNext = !s.reached && i === currentIdx + 1;
              const isLast = i === lifecycle.length - 1;
              const dotCls = s.reached
                ? (isCurrent ? "bg-accent" : "bg-green-500")
                : isNext ? "bg-accent/20 border border-accent" : "bg-border/60";
              const connectorCls = s.reached && i < currentIdx ? "bg-green-500" : "bg-border/60";
              return (
                <li key={s.key} className={`relative pl-5 lg:pl-6 ${isLast ? "" : "pb-2 lg:pb-4"}`}>
                  <span className={`absolute left-0 top-0.5 w-3.5 h-3.5 lg:w-4 lg:h-4 rounded-full flex items-center justify-center ${dotCls}`}>
                    {s.reached ? (
                      <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                    ) : (
                      <span className={`text-[8px] font-medium ${isNext ? "text-accent" : "text-muted"}`}>{i + 1}</span>
                    )}
                  </span>
                  {!isLast && <span className={`absolute left-[6px] lg:left-[7px] top-3.5 lg:top-4 bottom-0 w-px ${connectorCls}`} />}
                  <p className={`text-xs font-medium leading-tight lg:leading-normal ${s.reached ? "text-foreground" : isNext ? "text-accent" : "text-muted"}`}>
                    {s.label}
                    {isCurrent && <span className="ml-1.5 text-[9px] font-normal uppercase tracking-wider text-accent">Current</span>}
                    {isNext && <span className="ml-1.5 text-[9px] font-normal uppercase tracking-wider text-accent">Next</span>}
                  </p>
                  {s.ts && s.reached && <p className="text-[10px] text-muted leading-tight">{formatDate(s.ts)}</p>}
                </li>
              );
            });
          })()}
        </ol>

        {/* Inline action row, Accept / Counter / Decline when Pending,
            Mark next stage when Active. */}
        {displayStatus === "Pending" && canViewerRespond && !counterOpen && (
          <div className="mt-3 flex gap-2">
            <button onClick={handleAccept} disabled={busyAction === "accept"} className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-full transition-colors disabled:opacity-60">
              {busyAction === "accept" ? "Accepting…" : "Accept"}
            </button>
            <button onClick={() => {
              setCounterOpen(true);
              setCounterRevShare(p.revenue_share_percent || 0);
              setCounterQr(p.qr_enabled ?? true);
              // Seed the paid-loan toggle from the existing fee so counters
              // preserve whatever the current arrangement expresses.
              const currentFee = typeof p.monthly_fee_gbp === "number" ? p.monthly_fee_gbp : 0;
              setCounterPaidLoan(currentFee > 0);
              setCounterFee(currentFee > 0 ? currentFee : "");
            }} className="px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 hover:bg-accent/5 rounded-full transition-colors">
              Counter
            </button>
            <button onClick={handleDecline} disabled={busyAction === "decline"} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-full transition-colors disabled:opacity-60">
              {busyAction === "decline" ? "Declining…" : "Decline"}
            </button>
          </div>
        )}

        {/* Declined state: a decline doesn't end the deal, whoever
            made the last offer (the requester) can revise it with new
            terms. The decliner sees a passive "waiting on them" note. */}
        {displayStatus === "Declined" && !counterOpen && (() => {
          const iAmRequester = !!p.requester_user_id && p.requester_user_id === userId;
          if (iAmRequester) {
            return (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-red-600">Your offer was declined. Send a revised offer to keep negotiating.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCounterOpen(true);
                    setCounterRevShare(p.revenue_share_percent || 0);
                    setCounterQr(p.qr_enabled ?? true);
                    const currentFee = typeof p.monthly_fee_gbp === "number" ? p.monthly_fee_gbp : 0;
                    setCounterPaidLoan(currentFee > 0);
                    setCounterFee(currentFee > 0 ? currentFee : "");
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-full transition-colors"
                >
                  Counter with new terms
                </button>
              </div>
            );
          }
          return (
            <p className="mt-3 text-[11px] text-muted">You declined, the other party can come back with revised terms.</p>
          );
        })()}

        {displayStatus === "Pending" && !canViewerRespond && (() => {
          const iAmRequester = !!p.requester_user_id && p.requester_user_id === userId;
          // Two states where the viewer can't respond:
          //   • They sent the request → waiting on the other party
          //   • Row has no requester_user_id (legacy/ambiguous) → just
          //     show "Awaiting response" neutrally without guessing.
          const label = iAmRequester
            ? "Awaiting their response"
            : "Awaiting response";
          return (
            <div className={`mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] ${
              iAmRequester
                ? "bg-amber-50 text-amber-800 border border-amber-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              {label}
            </div>
          );
        })()}

        {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
      </div>

      {/* Counter form, mirrors the new-request shape so the full range of
          arrangements is expressible: Paid loan (+ optional QR + rev share),
          Revenue share only, or a pure free display. */}
      {counterOpen && (
        <div className="px-5 py-4 border-b border-border bg-surface">
          <Header title="Counter offer" subtitle="Adjust the terms before sending back." />
          <div className="mt-3 space-y-3">
            {/* Paid loan toggle, checkbox because you can combine with QR. */}
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground">Paid loan</p>
                <p className="text-[10px] text-muted leading-snug">Venue pays the artist monthly to display the work.</p>
              </div>
              <button
                type="button"
                onClick={() => setCounterPaidLoan(!counterPaidLoan)}
                className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${counterPaidLoan ? "bg-accent" : "bg-border"}`}
                aria-pressed={counterPaidLoan}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${counterPaidLoan ? "translate-x-[18px]" : "translate-x-0.5"}`} />
              </button>
            </label>
            {counterPaidLoan && (
              <div className="flex items-center gap-2 pl-0">
                <span className="text-xs text-muted flex-1">Monthly fee</span>
                <span className="text-xs text-muted">£</span>
                <input type="number" min={0} value={counterFee} onChange={(e) => { const v = e.target.value; if (v === "") { setCounterFee(""); return; } const n = Number(v); if (!Number.isNaN(n)) setCounterFee(n); }} placeholder="e.g. 80" className="w-20 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs focus:outline-none focus:border-accent/50" />
              </div>
            )}

            {/* QR toggle, independent so you can have Paid loan + QR, or
                QR-only revenue share. */}
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground">QR display</p>
                <p className="text-[10px] text-muted leading-snug">Let visitors buy via a QR code. Venue earns a share of sales.</p>
              </div>
              <button
                type="button"
                onClick={() => setCounterQr(!counterQr)}
                className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${counterQr ? "bg-accent" : "bg-border"}`}
                aria-pressed={counterQr}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${counterQr ? "translate-x-[18px]" : "translate-x-0.5"}`} />
              </button>
            </label>
            {counterQr && (
              <div className="flex items-center gap-2 pl-0">
                <span className="text-xs text-muted flex-1">{counterPaidLoan ? "Share on QR sales" : "Revenue share"}</span>
                <input type="number" min={0} max={50} value={counterRevShare} onChange={(e) => setCounterRevShare(Number(e.target.value) || 0)} className="w-16 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-center focus:outline-none focus:border-accent/50" />
                <span className="text-xs text-muted">%</span>
              </div>
            )}
            {!counterPaidLoan && !counterQr && (
              <p className="text-[10px] text-muted italic">Neither option selected, sending as a free display.</p>
            )}

            <textarea value={counterNote} onChange={(e) => setCounterNote(e.target.value)} placeholder="Add a note (optional)" rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent/50 resize-none" />
            <div className="flex gap-2">
              <button onClick={handleCounterSubmit} disabled={busyAction === "counter"} className="flex-1 px-3 py-2 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-full transition-colors disabled:opacity-60">
                {busyAction === "counter" ? "Sending…" : "Send counter"}
              </button>
              <button onClick={() => setCounterOpen(false)} className="px-3 py-2 text-xs text-muted hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Terms, two-column key/value rows, denser than the previous
          stack-of-full-width rows. QR-code row dropped for revenue share
          arrangements because rev share is always QR-enabled by design,
          so the row was redundant. */}
      {/* Terms, rows driven by actual data, not the raw arrangement_type
          string. Monthly fee shows when there's a fee, revenue share shows
          when QR is enabled with a non-zero share. */}
      <div className="px-4 py-3 lg:px-5 lg:py-4 border-b border-border">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted mb-2.5 lg:mb-2">Terms</p>
        {/* Rows breathe a bit more on mobile (1.5/6px) vs desktop
            (1.5/6px), previously mobile was at 0.5/2px, which crammed
            the labels uncomfortably together. */}
        <div className="space-y-1.5 lg:space-y-1.5 text-xs">
          <div className="flex gap-3 py-0.5">
            <span className="text-muted w-24 shrink-0">Type</span>
            <span className="text-foreground font-medium">{arrangementLabel}</span>
          </div>
          {hasFee && (
            <div className="flex gap-3 py-0.5">
              <span className="text-muted w-24 shrink-0">Monthly fee</span>
              <span className="text-foreground font-medium">£{p.monthly_fee_gbp}</span>
            </div>
          )}
          {p.qr_enabled && p.revenue_share_percent != null && p.revenue_share_percent > 0 && (
            <div className="flex gap-3 py-0.5">
              <span className="text-muted w-24 shrink-0">Revenue share</span>
              <span className="text-foreground font-medium">{p.revenue_share_percent}% on QR sales</span>
            </div>
          )}
          {/* QR indicator only matters on paid-loan rows, on revenue share
              it's always on by definition, on paid loan the venue might be
              paying without QR, which is useful to surface. */}
          {hasFee && p.qr_enabled != null && (
            <div className="flex gap-3 py-0.5">
              <span className="text-muted w-24 shrink-0">QR code</span>
              <span className="text-foreground font-medium">{p.qr_enabled ? "Enabled" : "Disabled"}</span>
            </div>
          )}
          <div className="flex gap-3">
            <span className="text-muted w-24 shrink-0">Requested</span>
            <span className="text-foreground font-medium">{formatDate(p.created_at)}</span>
          </div>
          {p.accepted_at && (
            <div className="flex gap-3 py-0.5">
              <span className="text-muted w-24 shrink-0">Accepted</span>
              <span className="text-foreground font-medium">{formatDate(p.accepted_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Revenue, inline single row on mobile (tight). Desktop gets the
          original block layout with a proper header. */}
      {(displayStatus === "Active" || displayStatus === "Completed" || displayStatus === "Sold") ? (
        <div className="px-4 py-2.5 lg:px-5 lg:py-4 border-b border-border">
          {/* Mobile: single inline row */}
          <div className="flex items-baseline justify-between gap-3 lg:hidden">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">Earned to date</p>
            <p className="text-sm font-medium text-foreground">&pound;{(p.revenue_earned_gbp ?? 0).toLocaleString()}</p>
          </div>
          {/* Desktop: full block */}
          <div className="hidden lg:block">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">Revenue</p>
            <div className="mt-2 space-y-1.5 text-xs">
              {p.revenue_share_percent != null && p.qr_enabled && (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted">Share</span>
                  <span className="text-foreground font-medium">{p.revenue_share_percent}%</span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted">Earned to date</span>
                <span className="text-foreground font-medium">&pound;{(p.revenue_earned_gbp ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bottom CTAs, on mobile sit directly after the last section
          (no mt-auto, so no big empty gap before the buttons). On desktop
          mt-auto pushes them to the bottom of the side-rail. */}
      <div className="px-4 py-3 lg:px-5 lg:py-4 lg:mt-auto space-y-1.5 lg:space-y-2">
        {(() => {
          const nextStageKey = nextAct?.cta?.kind === "advance" ? nextAct.cta.stage : null;
          const nextLabel = nextStageKey ? `Mark ${nextStageKey === "live" ? "live on wall" : nextStageKey}` : null;
          // Find the most recent reached advanceable stage, that's what
          // Undo should target. Only surface Undo when there's actually
          // a stage to roll back; skips Requested / Accepted which aren't
          // user-advanceable.
          type StageKey = "scheduled" | "installed" | "live" | "collected";
          const reachedMap: Record<StageKey, boolean> = {
            scheduled: !!(current as RemotePlacement).scheduled_for,
            installed: !!(current as RemotePlacement).installed_at,
            live: !!(current as RemotePlacement).live_from,
            collected: !!(current as RemotePlacement).collected_at,
          };
          const reverseOrder: StageKey[] = ["collected", "live", "installed", "scheduled"];
          const lastReached = reverseOrder.find((k) => reachedMap[k]);
          const showAdvance = displayStatus === "Active" && nextStageKey && nextLabel;
          const showUndo = !!lastReached && (displayStatus === "Active" || displayStatus === "Completed");
          if (!showAdvance && !showUndo) return null;
          // Scheduled stage opens a date picker first, mirroring the
          // detail page + PlacementStepper. Other stages stamp `now`.
          const advanceIsSchedule = nextStageKey === "scheduled";
          const canEditSchedule =
            displayStatus === "Active" && reachedMap.scheduled && !reachedMap.installed;
          return (
            <>
              {showAdvance && nextStageKey && advanceIsSchedule && !schedulePickerOpen && (
                <button
                  onClick={openSchedulePicker}
                  disabled={busyAction === `advance-${nextStageKey}`}
                  className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 lg:py-2.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-full transition-colors disabled:opacity-60"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  Schedule install
                </button>
              )}
              {showAdvance && nextStageKey && !advanceIsSchedule && (
                <button
                  onClick={() => handleAdvance(nextStageKey)}
                  disabled={busyAction === `advance-${nextStageKey}`}
                  className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 lg:py-2.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-full transition-colors disabled:opacity-60"
                >
                  {busyAction === `advance-${nextStageKey}` ? "Updating…" : nextLabel}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </button>
              )}
              {/* Picker, same shape as the detail page so the two
                  surfaces feel like the same flow. */}
              {schedulePickerOpen && (
                <div className="flex items-center gap-2 flex-wrap bg-surface border border-border rounded-sm px-3 py-2 w-full">
                  <label className="text-xs text-muted">Install date</label>
                  <input
                    type="date"
                    value={scheduleDraft}
                    onChange={(e) => setScheduleDraft(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="px-2 py-1 bg-background border border-border rounded-sm text-xs focus:outline-none focus:border-accent/60"
                  />
                  <button
                    type="button"
                    onClick={confirmSchedule}
                    disabled={!scheduleDraft || busyAction === "advance-scheduled"}
                    className="px-3 py-1 text-xs font-medium text-accent bg-accent/5 border border-accent/30 hover:bg-accent/10 rounded-sm transition-colors disabled:opacity-60 ml-auto"
                  >
                    {busyAction === "advance-scheduled"
                      ? "Saving…"
                      : reachedMap.scheduled
                        ? "Update date"
                        : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedulePickerOpen(false)}
                    disabled={busyAction === "advance-scheduled"}
                    className="px-2 py-1 text-xs text-muted hover:text-foreground transition-colors disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {canEditSchedule && !schedulePickerOpen && (
                <button
                  type="button"
                  onClick={openSchedulePicker}
                  className="text-[11px] text-muted hover:text-accent transition-colors text-center w-full"
                >
                  Change install date
                </button>
              )}
              {showUndo && lastReached && (
                <button
                  type="button"
                  onClick={() => handleUndoStage(lastReached)}
                  disabled={busyAction === `undo-${lastReached}`}
                  className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 lg:py-2.5 text-xs font-medium text-muted bg-background border border-border hover:text-foreground hover:border-foreground/30 rounded-full transition-colors disabled:opacity-60"
                >
                  {busyAction === `undo-${lastReached}` ? "Undoing…" : `Undo ${lastReached}`}
                </button>
              )}
            </>
          );
        })()}
        <Link
          href={`/placements/${encodeURIComponent(p.id)}`}
          className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 lg:py-2.5 text-xs font-medium text-accent bg-surface border border-accent/40 hover:bg-accent hover:text-white hover:border-accent rounded-full transition-colors"
        >
          Open full placement
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </Link>
      </div>
    </aside>
  );
}
