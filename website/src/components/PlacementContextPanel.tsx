"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { authFetch } from "@/lib/api-client";
import type { ArtistWork } from "@/data/artists";
import PlacementStepper from "@/components/PlacementStepper";
import {
  normaliseStatus,
  statusBadgeClass,
  currentStage,
  nextAction,
  viewerRole,
  STAGE_LABEL,
  type DisplayStatus,
  type PlacementLifecycle,
} from "@/lib/placements/status";

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
}: PanelProps) {
  const [placements, setPlacements] = useState<RemotePlacement[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Counter form state
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterRevShare, setCounterRevShare] = useState<number>(0);
  const [counterQr, setCounterQr] = useState<boolean>(true);
  const [counterFee, setCounterFee] = useState<number | "">("");
  const [counterNote, setCounterNote] = useState("");

  // Request-a-placement form state
  const [reqSelected, setReqSelected] = useState<Set<string>>(new Set());
  const [reqQr, setReqQr] = useState(true);
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

  // The "current" placement for this conversation = the most recent one that is
  // still active/pending. If none, fall back to the most recent (so a completed
  // placement is still visible in the summary).
  const current: PlacementLifecycle & Partial<RemotePlacement> | null = (() => {
    if (placements.length === 0) return null;
    const live = placements.find((p) => {
      const s = normaliseStatus(p.status);
      return s === "Pending" || s === "Active";
    });
    return live || placements[0];
  })();

  const displayStatus: DisplayStatus | null = current ? normaliseStatus(current.status as string) : null;
  const role = current ? viewerRole(
    { ...current, requesterUserId: (current as RemotePlacement).requester_user_id },
    userId || null
  ) : "observer";
  const nextAct = current ? nextAction(
    { ...current, requesterUserId: (current as RemotePlacement).requester_user_id },
    role
  ) : null;

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

  async function handleCounterSubmit() {
    if (!current) return;
    setBusyAction("counter");
    setError(null);
    try {
      const arrangementType = counterQr ? (counterRevShare > 0 ? "revenue_share" : "free_loan") : "free_loan";
      const body = {
        id: (current as RemotePlacement).id,
        counter: {
          arrangementType,
          revenueSharePercent: counterQr && counterRevShare > 0 ? counterRevShare : undefined,
          qrEnabled: counterQr,
          monthlyFeeGbp: !counterQr && typeof counterFee === "number" ? counterFee : undefined,
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
      const arrangementType = reqQr ? (reqRevShare > 0 ? "revenue_share" : "free_loan") : "free_loan";
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
          revenueSharePercent: reqQr && reqRevShare > 0 ? reqRevShare : undefined,
          qrEnabled: reqQr,
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
          <p className="text-xs text-muted mt-3">Loading\u2026</p>
        </div>
      </aside>
    );
  }

  // No placement \u2014 show the Request a Placement form.
  if (!current) {
    return (
      <aside className="w-full h-full bg-[#FAF8F5] border-l border-border flex flex-col overflow-y-auto">
        <div className="px-5 py-6 border-b border-border">
          <Header title="Request a Placement" subtitle={`Start a placement with ${otherPartyName}.`} />
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted mb-2">
              Select works {reqSelected.size > 0 && <span className="text-accent normal-case">({reqSelected.size})</span>}
            </p>
            {otherPartyWorksLoading ? (
              <p className="text-xs text-muted">Loading portfolio\u2026</p>
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
                      className={`relative aspect-square rounded-sm overflow-hidden border-2 transition-all ${selected ? "border-accent shadow-sm" : "border-transparent hover:border-border"}`}
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
              <button type="button" onClick={() => setReqQr(true)} className={`flex-1 px-3 py-2 text-xs rounded-sm border transition-colors ${reqQr ? "bg-accent/10 border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}>QR Display</button>
              <button type="button" onClick={() => setReqQr(false)} className={`flex-1 px-3 py-2 text-xs rounded-sm border transition-colors ${!reqQr ? "bg-accent/10 border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}>Paid Loan</button>
            </div>
          </div>

          {reqQr ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted flex-1">Revenue share</span>
              <input type="number" min={0} max={50} value={reqRevShare} onChange={(e) => setReqRevShare(Number(e.target.value) || 0)} className="w-16 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs text-center focus:outline-none focus:border-accent/50" />
              <span className="text-xs text-muted">%</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted flex-1">Monthly fee</span>
              <span className="text-xs text-muted">\u00a3</span>
              <input type="number" min={0} value={reqFee} onChange={(e) => { const v = e.target.value; if (v === "") { setReqFee(""); return; } const n = Number(v); if (!Number.isNaN(n)) setReqFee(n); }} placeholder="e.g. 50" className="w-20 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs focus:outline-none focus:border-accent/50" />
            </div>
          )}

          <textarea value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="Add a note (optional)" rows={3} className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50 resize-none" />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button onClick={handleRequest} disabled={busyAction === "request" || reqSelected.size === 0} className="w-full px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-40">
            {busyAction === "request" ? "Sending\u2026" : `Send placement request${reqSelected.size > 1 ? ` (${reqSelected.size})` : ""}`}
          </button>
        </div>
      </aside>
    );
  }

  // Has placement \u2014 show progress panel.
  const p = current as RemotePlacement;
  const arrangementLabel = p.arrangement_type === "revenue_share"
    ? `Revenue share ${p.revenue_share_percent || 0}%`
    : p.arrangement_type === "free_loan"
      ? (p.monthly_fee_gbp ? `Paid loan \u00b7 \u00a3${p.monthly_fee_gbp}/mo` : "Paid loan")
      : "Purchase";
  const stage = currentStage({ ...p });
  const portalBase = portalType === "artist" ? "/artist-portal" : "/venue-portal";

  return (
    <aside className="w-full h-full bg-[#FAF8F5] border-l border-border flex flex-col overflow-y-auto">
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <Header title="Placement" />
          {displayStatus && (
            <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-sm ${statusBadgeClass(displayStatus)}`}>
              {displayStatus}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-foreground mt-3 truncate">{p.work_title}</p>
        <p className="text-xs text-muted">{arrangementLabel}</p>
      </div>

      {/* Next action card */}
      {nextAct && (
        <div className="px-5 py-4 border-b border-border bg-surface">
          <Header title="Next action" />
          <p className="text-sm font-medium text-foreground mt-2">{nextAct.title}</p>
          {nextAct.detail && <p className="text-xs text-muted mt-1 leading-relaxed">{nextAct.detail}</p>}

          {displayStatus === "Pending" && role === "responder" && !counterOpen && (
            <div className="mt-3 flex gap-2">
              <button onClick={handleAccept} disabled={busyAction === "accept"} className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60">
                {busyAction === "accept" ? "Accepting\u2026" : "Accept"}
              </button>
              <button onClick={() => {
                setCounterOpen(true);
                setCounterRevShare(p.revenue_share_percent || 0);
                setCounterQr(p.qr_enabled ?? true);
                setCounterFee(p.monthly_fee_gbp ?? "");
              }} className="px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 hover:bg-accent/5 rounded-sm transition-colors">
                Counter
              </button>
              <button onClick={handleDecline} disabled={busyAction === "decline"} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-60">
                {busyAction === "decline" ? "Declining\u2026" : "Decline"}
              </button>
            </div>
          )}

          {displayStatus === "Active" && nextAct.cta?.kind === "advance" && nextAct.cta.stage && (
            <div className="mt-3">
              <PlacementStepper
                placement={{
                  id: p.id,
                  status: p.status,
                  acceptedAt: p.accepted_at,
                  scheduledFor: p.scheduled_for,
                  installedAt: p.installed_at,
                  liveFrom: p.live_from,
                  collectedAt: p.collected_at,
                }}
                canAdvance
                onChange={() => loadPlacements()}
              />
            </div>
          )}

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {/* Counter form */}
      {counterOpen && (
        <div className="px-5 py-4 border-b border-border bg-surface">
          <Header title="Counter offer" subtitle="Adjust the terms before sending back." />
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setCounterQr(true)} className={`flex-1 px-3 py-2 text-xs rounded-sm border transition-colors ${counterQr ? "bg-accent/10 border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}>QR Display</button>
              <button type="button" onClick={() => setCounterQr(false)} className={`flex-1 px-3 py-2 text-xs rounded-sm border transition-colors ${!counterQr ? "bg-accent/10 border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}>Paid Loan</button>
            </div>
            {counterQr ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted flex-1">Revenue share</span>
                <input type="number" min={0} max={50} value={counterRevShare} onChange={(e) => setCounterRevShare(Number(e.target.value) || 0)} className="w-16 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs text-center focus:outline-none focus:border-accent/50" />
                <span className="text-xs text-muted">%</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted flex-1">Monthly fee</span>
                <span className="text-xs text-muted">\u00a3</span>
                <input type="number" min={0} value={counterFee} onChange={(e) => { const v = e.target.value; if (v === "") { setCounterFee(""); return; } const n = Number(v); if (!Number.isNaN(n)) setCounterFee(n); }} className="w-20 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs focus:outline-none focus:border-accent/50" />
              </div>
            )}
            <textarea value={counterNote} onChange={(e) => setCounterNote(e.target.value)} placeholder="Add a note (optional)" rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50 resize-none" />
            <div className="flex gap-2">
              <button onClick={handleCounterSubmit} disabled={busyAction === "counter"} className="flex-1 px-3 py-2 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60">
                {busyAction === "counter" ? "Sending\u2026" : "Send counter"}
              </button>
              <button onClick={() => setCounterOpen(false)} className="px-3 py-2 text-xs text-muted hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Terms summary */}
      <div className="px-5 py-4 border-b border-border">
        <Header title="Terms" />
        <div className="mt-2 space-y-1.5">
          <TermsRow label="Type" value={arrangementLabel} />
          {p.revenue_share_percent != null && p.arrangement_type === "revenue_share" && (
            <TermsRow label="Revenue share" value={`${p.revenue_share_percent}%`} />
          )}
          {p.monthly_fee_gbp != null && (
            <TermsRow label="Monthly fee" value={`\u00a3${p.monthly_fee_gbp}`} />
          )}
          {p.qr_enabled != null && (
            <TermsRow label="QR code" value={p.qr_enabled ? "Enabled" : "Disabled"} />
          )}
          <TermsRow label="Requested" value={formatDate(p.created_at)} />
          {p.accepted_at && <TermsRow label="Accepted" value={formatDate(p.accepted_at)} />}
        </div>
      </div>

      {/* Revenue summary \u2014 no monthly figure per product ask */}
      {displayStatus === "Active" || displayStatus === "Completed" || displayStatus === "Sold" ? (
        <div className="px-5 py-4 border-b border-border">
          <Header title="Revenue" />
          <div className="mt-2 space-y-1.5">
            {p.revenue_share_percent != null && <TermsRow label="Share" value={`${p.revenue_share_percent}%`} />}
            <TermsRow label="Earned to date" value={`\u00a3${p.revenue_earned_gbp ?? 0}`} />
          </div>
        </div>
      ) : null}

      {/* Stage timeline for reference */}
      {stage && (
        <div className="px-5 py-4 border-b border-border">
          <Header title="Timeline" />
          <div className="mt-3">
            <PlacementStepper
              placement={{
                id: p.id,
                status: p.status,
                acceptedAt: p.accepted_at,
                scheduledFor: p.scheduled_for,
                installedAt: p.installed_at,
                liveFrom: p.live_from,
                collectedAt: p.collected_at,
              }}
              canAdvance={false}
            />
            {stage && <p className="text-[10px] text-muted mt-2">Current: {STAGE_LABEL[stage]}</p>}
          </div>
        </div>
      )}

      <div className="px-5 py-4 mt-auto">
        <Link href={`${portalBase}/placements`} className="text-xs text-accent hover:text-accent-hover transition-colors">
          Open full placement \u2192
        </Link>
      </div>
    </aside>
  );
}
