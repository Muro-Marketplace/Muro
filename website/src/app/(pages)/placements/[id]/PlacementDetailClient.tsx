"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import { uploadImage } from "@/lib/upload";
import PlacementLoanForm from "./PlacementLoanForm";
import CounterPlacementDialog from "@/components/CounterPlacementDialog";
import PlacementNegotiationLog from "@/components/PlacementNegotiationLog";

interface PlacementRow {
  id: string;
  artist_user_id: string;
  venue_user_id: string;
  artist_slug?: string;
  venue_slug?: string;
  work_title: string;
  work_image?: string;
  /** Size the venue / artist picked for the primary work at request time. */
  work_size?: string | null;
  /** Additional works covered by the same placement (#16). */
  extra_works?: Array<{ title: string; image?: string | null; size?: string | null }> | null;
  venue: string;
  arrangement_type: string;
  revenue_share_percent?: number | null;
  status: string;
  revenue?: number | null;
  revenue_earned_gbp?: number;
  notes?: string | null;
  message?: string | null;
  qr_enabled?: boolean | null;
  monthly_fee_gbp?: number | null;
  created_at?: string;
  responded_at?: string | null;
  requester_user_id?: string | null;
  accepted_at?: string | null;
  scheduled_for?: string | null;
  installed_at?: string | null;
  live_from?: string | null;
  collected_at?: string | null;
}

export interface PlacementRecord {
  id?: string;
  record_type?: "loan" | "consignment";
  qr_enabled?: boolean;
  start_date?: string | null;
  review_date?: string | null;
  collection_date?: string | null;
  agreed_value_gbp?: number | null;
  insured_value_gbp?: number | null;
  sale_price_gbp?: number | null;
  venue_share_percent?: number | null;
  platform_commission_percent?: number | null;
  artist_payout_terms?: string;
  monthly_display_fee_gbp?: number | null;
  condition_in?: string;
  condition_out?: string;
  damage_notes?: string;
  location_in_venue?: string;
  piece_count?: number;
  delivered_by?: string;
  collection_responsible?: string;
  exclusive_to_venue?: boolean;
  available_for_sale?: boolean;
  logistics_notes?: string;
  contract_attachment_url?: string;
  internal_notes?: string;
  venue_approved?: boolean;
  venue_approved_at?: string | null;
  artist_approved?: boolean;
  artist_approved_at?: string | null;
}

export interface RecordVersion {
  id: string;
  changed_by_user_id: string;
  changed_by_role: "artist" | "venue" | null;
  changed_fields: string[];
  snapshot?: Record<string, unknown>;
  created_at: string;
}

interface PhotoRow {
  id: string;
  url: string;
  caption: string;
  created_at: string;
  uploader_user_id: string;
}

interface Props {
  placementId: string;
}

export default function PlacementDetailClient({ placementId }: Props) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [placement, setPlacement] = useState<PlacementRow | null>(null);
  const [record, setRecord] = useState<PlacementRecord | null>(null);
  const [recordVersions, setRecordVersions] = useState<RecordVersion[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [artist, setArtist] = useState<{ name: string; slug: string; image?: string } | null>(null);
  const [venue, setVenue] = useState<{ name: string; slug: string; image?: string; location?: string; city?: string } | null>(null);
  const [viewerRole, setViewerRole] = useState<"artist" | "venue" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creatingRecord, setCreatingRecord] = useState(false);
  const [responding, setResponding] = useState<"accept" | "decline" | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  // Loan record is collapsed by default but auto-expands once a record
  // exists so users land on the data instead of having to click open.
  const [loanRecordOpen, setLoanRecordOpen] = useState(false);
  const loanRecordRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const recordParam = searchParams?.get("record") || "";
  // Flag ensures we only auto-open / auto-scroll once on first arrival,
  // not every time the record state changes.
  const deepLinkedRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/placements/${encodeURIComponent(placementId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Could not load placement");
        if (!silent) setLoading(false);
        return;
      }
      const data = await res.json();
      setPlacement(data.placement);
      setRecord(data.record);
      setRecordVersions(Array.isArray(data.recordVersions) ? data.recordVersions : []);
      setPhotos(data.photos || []);
      setArtist(data.artist);
      setVenue(data.venue);
      setViewerRole(data.viewerRole);
    } catch (e) {
      console.error(e);
      setError("Network error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [placementId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
    if (user) load();
  }, [user, authLoading, load, router]);

  // Keep the detail page in sync if the user accepts / counters / advances
  // elsewhere (Messages, the placements list, etc.) — but do the refresh
  // SILENTLY so switching to another tab and back doesn't blank the page
  // out with a loading state (which used to read as a full reload). Scroll
  // position and expanded sections stay put.
  useEffect(() => {
    if (!user) return;
    const onFocus = () => { load({ silent: true }); };
    const onVis = () => { if (document.visibilityState === "visible") load({ silent: true }); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, load]);

  // Auto-open the loan record drawer the first time a record turns up,
  // so users don't have to expand it manually. Won't reopen if the user
  // has since collapsed it.
  const [loanRecordAutoOpened, setLoanRecordAutoOpened] = useState(false);
  useEffect(() => {
    if (record && !loanRecordAutoOpened) {
      setLoanRecordOpen(true);
      setLoanRecordAutoOpened(true);
    }
  }, [record, loanRecordAutoOpened]);

  // Deep link handling: "?record=open" from the placements-list dropdown
  // lands the user straight on the record section (expanded + scrolled
  // to), so they don't have to scroll past the whole placement first.
  useEffect(() => {
    if (deepLinkedRef.current) return;
    if (!placement) return;
    if (recordParam !== "open") return;
    deepLinkedRef.current = true;
    setLoanRecordOpen(true);
    // rAF-deferred so the section has actually rendered post-expand
    // before we try to scroll it into view.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        loanRecordRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, [placement, recordParam]);

  async function handleAdvance(stage: "scheduled" | "installed" | "live" | "collected") {
    if (!placement) return;
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id: placement.id, stage }),
      });
      if (!res.ok) return;
      await load({ silent: true });
    } catch { /* ignore; next load will reconcile */ }
  }

  async function handleUndoStage(stage: "scheduled" | "installed" | "live" | "collected") {
    if (!placement) return;
    if (!confirm(`Undo "${stage}"? You can restamp it later.`)) return;
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id: placement.id, unsetStage: stage }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not undo stage.");
        return;
      }
      await load({ silent: true });
    } catch {
      alert("Network error. Please try again.");
    }
  }

  async function handleRespond(accept: boolean) {
    if (!placement) return;
    setResponding(accept ? "accept" : "decline");
    setRespondError(null);
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id: placement.id, status: accept ? "active" : "declined" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRespondError(data.error || "Could not update placement");
        return;
      }
      await load({ silent: true });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("wallplace:placement-changed", { detail: { placementId: placement.id, action: accept ? "accept" : "decline" } }));
      }
    } catch {
      setRespondError("Network error. Please try again.");
    } finally {
      setResponding(null);
    }
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadImage(file, "artworks");
        const res = await authFetch(`/api/placements/${encodeURIComponent(placementId)}/photos`, {
          method: "POST",
          body: JSON.stringify({ url }),
        });
        if (res.ok) {
          const data = await res.json();
          setPhotos((prev) => [data.photo, ...prev]);
        }
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    const res = await authFetch(`/api/placements/${encodeURIComponent(placementId)}/photos?photoId=${encodeURIComponent(photoId)}`, {
      method: "DELETE",
    });
    if (res.ok) setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }

  if (loading || authLoading) {
    return <div className="px-6 py-16 text-center text-muted text-sm">Loading placement…</div>;
  }

  if (error) {
    return <div className="max-w-2xl mx-auto px-6 py-16 text-center">
      <p className="text-sm text-red-600 mb-4">{error}</p>
      <Link href={viewerRole === "venue" ? "/venue-portal/placements" : "/artist-portal/placements"} className="text-sm text-accent hover:underline">
        Back to placements
      </Link>
    </div>;
  }

  if (!placement) return null;

  const portalBase = viewerRole === "venue" ? "/venue-portal" : "/artist-portal";

  const createRecordIfMissing = async () => {
    if (record) return;
    setCreatingRecord(true);
    try {
      // F41 — auto-populate with details already agreed on the placement.
      const body: Record<string, unknown> = {
        recordType: "loan",
        qrEnabled: placement.qr_enabled ?? true,
      };
      if (typeof placement.revenue_share_percent === "number") {
        body.venueSharePercent = placement.revenue_share_percent;
      }
      if (typeof placement.monthly_fee_gbp === "number" && placement.monthly_fee_gbp > 0) {
        body.monthlyDisplayFeeGbp = placement.monthly_fee_gbp;
      }
      const res = await authFetch(`/api/placements/${encodeURIComponent(placementId)}/record`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await load({ silent: true });
        // Keep the user in place on the record section instead of
        // letting the re-render move scroll. A silent load + smooth
        // scroll to the record anchor makes this feel like the record
        // just "appeared" under the Add button.
        setLoanRecordOpen(true);
        requestAnimationFrame(() => {
          loanRecordRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } finally {
      setCreatingRecord(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 lg:py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted mb-6">
        <Link href={`${portalBase}/placements`} className="hover:text-foreground transition-colors">
          Placements
        </Link>
        <span>/</span>
        <span className="text-foreground truncate max-w-[200px]">{placement.work_title}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 mb-6">
        {placement.work_image && (
          <div className="w-full sm:w-40 h-40 relative rounded-sm overflow-hidden bg-[#f5f5f3] shrink-0">
            <Image src={placement.work_image} alt={placement.work_title} fill className="object-cover" sizes="160px" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">
            {placement.arrangement_type === "revenue_share"
              ? `Revenue Share${placement.revenue_share_percent ? ` (${placement.revenue_share_percent}%)` : ""}`
              : placement.arrangement_type === "free_loan" ? "Paid Loan" : "Purchase"}
          </p>
          <h1 className="font-serif text-2xl lg:text-3xl text-foreground mb-2">{placement.work_title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {artist && (
              <Link href={`/browse/${artist.slug}`} className="text-accent hover:underline">
                {artist.name}
              </Link>
            )}
            <span className="text-muted">&middot;</span>
            <span className="text-foreground">{venue?.name || placement.venue}</span>
            {venue?.location && <><span className="text-muted">&middot;</span><span className="text-muted">{venue.location}</span></>}
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
              placement.status === "active" ? "bg-green-100 text-green-700" :
              placement.status === "pending" ? "bg-amber-100 text-amber-700" :
              placement.status === "declined" ? "bg-red-100 text-red-600" :
              "bg-gray-100 text-gray-600"
            }`}>
              {placement.status.charAt(0).toUpperCase() + placement.status.slice(1)}
            </span>
            {/* QR label — deep-link into the Labels page with this
                placement's work (and venue, on the artist side) already
                preselected. Visible for both portals so artists and
                venues land on the full designer / printer, not just a
                thumbnail of the QR. */}
            {(() => {
              const labelHref = portalBase === "/venue-portal"
                ? `/venue-portal/labels?placement=${encodeURIComponent(placement.id)}`
                : `/artist-portal/labels?works=${encodeURIComponent(placement.work_title || "")}&venue=${encodeURIComponent(venue?.name || placement.venue || "")}`;
              return (
                <Link
                  href={labelHref}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/5 border border-accent/30 hover:bg-accent/10 rounded-sm px-2.5 py-1 transition-colors"
                  title="Open QR label designer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <path d="M14 14h3v3h-3zM20 14h1v1h-1zM14 20h1v1h-1zM20 20h1v1h-1z" />
                  </svg>
                  QR label
                </Link>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Progress — single combined block. Shows the 6-step lifecycle and
          exposes the "Mark <next stage>" action directly below the bar
          when the viewer is allowed to advance it. Previously this page
          had a duplicate "Lifecycle actions" box; merging them means
          there's one place to look for progress + actions. */}
      <div className="bg-surface border border-border rounded-sm p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Progress</h2>
          {placement.status === "pending" && (
            <span className="text-[11px] text-muted">Awaiting response</span>
          )}
          {placement.status === "declined" && (
            <span className="text-[11px] text-red-600">Declined — counter with new terms to keep negotiating</span>
          )}
        </div>
        {(() => {
          const lifecycle = [
            { key: "requested", label: "Requested", ts: placement.created_at, reached: !!placement.created_at },
            { key: "accepted",  label: "Accepted",  ts: placement.accepted_at, reached: !!placement.accepted_at },
            { key: "scheduled", label: "Scheduled", ts: placement.scheduled_for, reached: !!placement.scheduled_for },
            { key: "installed", label: "Installed", ts: placement.installed_at, reached: !!placement.installed_at },
            { key: "live",      label: "Live on wall", ts: placement.live_from, reached: !!placement.live_from },
            { key: "collected", label: "Collected", ts: placement.collected_at, reached: !!placement.collected_at },
          ] as const;
          const reachedIdx = lifecycle.reduce((acc, s, i) => (s.reached ? i : acc), -1);
          const isDeclined = placement.status === "declined";
          // Next advanceable stage — "requested" and "accepted" aren't
          // manually advanced (request is implicit; accepted fires off
          // the Accept button). Everything else can be marked here
          // once the placement is active.
          const advanceable: Array<"scheduled" | "installed" | "live" | "collected"> = ["scheduled", "installed", "live", "collected"];
          const nextKey = (advanceable as readonly string[]).find((k) => {
            const entry = lifecycle.find((l) => l.key === k);
            return entry && !entry.reached;
          }) as ("scheduled" | "installed" | "live" | "collected" | undefined);
          const nextLabel = nextKey ? lifecycle.find((l) => l.key === nextKey)?.label : null;
          return (
            <>
              <ol className="flex items-start gap-1 overflow-x-auto pb-1">
                {lifecycle.map((s, i) => {
                  const reached = s.reached;
                  const isCurrent = i === reachedIdx;
                  return (
                    <li key={s.key} className="flex-1 min-w-[80px]">
                      <div className="flex items-center gap-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          isDeclined ? "bg-red-200 text-red-700" :
                          reached ? (isCurrent ? "bg-accent text-white" : "bg-green-500 text-white") :
                          "bg-border"
                        }`}>
                          {reached ? (
                            <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                          ) : (
                            <span className="text-[9px] text-muted">{i + 1}</span>
                          )}
                        </div>
                        {i < lifecycle.length - 1 && (
                          <div className={`flex-1 h-px ${i < reachedIdx ? "bg-green-500" : "bg-border"}`} />
                        )}
                      </div>
                      <div className="mt-1.5 pr-1">
                        <p className={`text-[10px] font-medium ${reached ? "text-foreground" : "text-muted"}`}>{s.label}</p>
                        {s.ts && (
                          <p className="text-[9px] text-muted">
                            {new Date(s.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {/* Advance + Undo actions — kept side-by-side so the user
                  has both the "what's next" and "I overshot" controls
                  in one place. Undo targets the most recent reached
                  advanceable stage; if there isn't one, the button
                  doesn't render. */}
              {(placement.status === "active" || placement.status === "completed") && (() => {
                const advanceableKeys = new Set(advanceable);
                const lastReached = [...lifecycle].reverse().find((s) => s.reached && advanceableKeys.has(s.key as typeof advanceable[number]));
                const lastReachedKey = lastReached?.key as ("scheduled" | "installed" | "live" | "collected" | undefined);
                const showAdvanceBtn = placement.status === "active" && nextKey && nextLabel;
                const showUndoBtn = !!lastReachedKey;
                if (!showAdvanceBtn && !showUndoBtn) return null;
                return (
                  <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                    {showAdvanceBtn && nextKey && nextLabel && (
                      <button
                        type="button"
                        onClick={() => handleAdvance(nextKey)}
                        className="px-3.5 py-1.5 text-xs font-medium text-accent bg-accent/5 border border-accent/30 hover:bg-accent/10 rounded-sm transition-colors"
                      >
                        Mark {nextLabel.toLowerCase()}
                      </button>
                    )}
                    {showUndoBtn && lastReachedKey && (
                      <button
                        type="button"
                        onClick={() => handleUndoStage(lastReachedKey)}
                        className="px-3 py-1.5 text-xs font-medium text-muted bg-background border border-border hover:text-foreground hover:border-foreground/30 rounded-sm transition-colors"
                      >
                        Undo {lastReachedKey}
                      </button>
                    )}
                  </div>
                );
              })()}
            </>
          );
        })()}
      </div>

      {/* Accept / Counter / Decline — shown on the detail page for any
          pending placement the viewer can respond to. Mirrors the
          controls on the list rows so the venue/artist can act from the
          full page without going back.
          Safety rule: only show when we KNOW the requester and it is
          someone other than the viewer. If requester_user_id is unknown
          we keep the controls hidden — better to ask the user to refresh
          than risk letting the original sender accept their own request. */}
      {placement.status === "pending" && viewerRole && !!placement.requester_user_id && placement.requester_user_id !== user?.id && (
        <div className="bg-surface border border-border rounded-sm p-4 sm:p-5 mb-6">
          <h2 className="text-sm font-medium mb-3">Respond to this request</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleRespond(true)}
              disabled={responding !== null}
              className="px-3.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-sm transition-colors disabled:opacity-50"
            >
              {responding === "accept" ? "Accepting…" : "Accept"}
            </button>
            <button
              type="button"
              onClick={() => setCounterOpen(true)}
              className="px-3.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-sm transition-colors"
            >
              Counter
            </button>
            <button
              onClick={() => handleRespond(false)}
              disabled={responding !== null}
              className="px-3.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-sm transition-colors disabled:opacity-50"
            >
              {responding === "decline" ? "Declining…" : "Decline"}
            </button>
          </div>
          {respondError && <p className="mt-2 text-xs text-red-600">{respondError}</p>}
        </div>
      )}
      {placement.status === "pending" && (placement.requester_user_id === user?.id || !placement.requester_user_id) && (
        <div className="bg-surface border border-border rounded-sm p-4 sm:p-5 mb-6 flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm">
            Awaiting their response
          </span>
          <p className="text-xs text-muted">
            {placement.requester_user_id === user?.id
              ? "You sent this request — the other party will accept, counter, or decline."
              : "Waiting on the other party. You can't act on this until they respond."}
          </p>
        </div>
      )}

      {/* Decline state — instead of dead-ending the deal, give the
          original offerer a way back in. The decliner is the
          non-requester at decline time, so requester_user_id still
          points at whoever made the offer that was knocked back; that's
          the person we want to surface a Counter button to here. */}
      {placement.status === "declined" && viewerRole && (
        <div className="bg-red-50 border border-red-200 rounded-sm p-4 sm:p-5 mb-6">
          {placement.requester_user_id === user?.id ? (
            <>
              <p className="text-sm font-medium text-red-700 mb-1">Your offer was declined</p>
              <p className="text-xs text-muted mb-3">Send a revised offer to keep negotiating, or leave it here.</p>
              <button
                type="button"
                onClick={() => setCounterOpen(true)}
                className="px-3.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-sm transition-colors"
              >
                Counter with new terms
              </button>
            </>
          ) : (
            <p className="text-sm text-red-700">You declined this offer. The other party can come back with new terms if they want to keep negotiating.</p>
          )}
        </div>
      )}

      {/* Lifecycle actions block removed — Progress block above now
          owns both the 6-step bar AND the Mark-next-stage button. */}

      {/* Counter dialog on the detail page — used by the Respond panel
          above. Bound to this placement directly. */}
      {counterOpen && (
        <CounterPlacementDialog
          placementId={placement.id}
          currentUserId={user?.id}
          initial={{
            monthly_fee_gbp: placement.monthly_fee_gbp,
            revenue_share_percent: placement.revenue_share_percent,
            qr_enabled: placement.qr_enabled,
          }}
          onClose={() => setCounterOpen(false)}
          onSuccess={(result) => {
            // Optimistic update so the terms + role flip show instantly,
            // even before the follow-up load() resolves. Counter on a
            // declined row reopens it back to pending — surface that too.
            setPlacement((prev) => prev ? {
              ...prev,
              monthly_fee_gbp: result.monthlyFeeGbp,
              qr_enabled: result.qrEnabled,
              revenue_share_percent: result.revenueSharePercent,
              arrangement_type: result.arrangementType,
              requester_user_id: result.senderUserId ?? prev.requester_user_id,
              status: prev.status === "declined" ? "pending" : prev.status,
            } : prev);
            setCounterOpen(false);
            load();
          }}
        />
      )}

      {/* Summary grid — the first box is the headline commercial term so it
          reads clearly at a glance: revenue share %, monthly paid-loan fee,
          or purchase price. The other two boxes add supporting context. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {placement.arrangement_type === "revenue_share" ? (
          <>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Revenue share</p>
              <p className="text-lg font-medium text-foreground">
                {placement.revenue_share_percent != null ? `${placement.revenue_share_percent}%` : "Not set"}
              </p>
              <p className="text-[11px] text-muted mt-1">Artist&rsquo;s share of QR-code sales</p>
            </div>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Earned so far</p>
              <p className="text-lg font-medium text-foreground">
                &pound;{(placement.revenue_earned_gbp ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </>
        ) : placement.arrangement_type === "free_loan" ? (
          <>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Monthly fee</p>
              {(() => {
                // Prefer the stored number. For legacy rows where the fee
                // column wasn't populated but the message text mentions an
                // amount, parse it out so the card doesn't lie with
                // "Free display" when the request clearly said £X/month.
                const stored = placement.monthly_fee_gbp;
                const msg = placement.message || "";
                const mentionsFee = /(?:\u00a3|gbp)\s?(\d{2,5})\s?(?:\/?\s?m|per|a\s)/i.test(msg);
                const parsed = mentionsFee ? parseFloat(RegExp.$1) : 0;
                const hasStored = typeof stored === "number" && stored > 0;
                const fee = hasStored ? stored : parsed;
                const isPaidLoan = fee > 0;
                return (
                  <>
                    <p className="text-lg font-medium text-foreground">
                      {isPaidLoan ? `\u00a3${fee.toLocaleString()}/month` : "Free display"}
                    </p>
                    <p className="text-[11px] text-muted mt-1">
                      {isPaidLoan
                        ? (hasStored
                            ? "Venue pays artist to display the work"
                            : "Parsed from request message — re-confirm with the other party before payout")
                        : "No rental fee agreed"}
                    </p>
                  </>
                );
              })()}
            </div>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">QR display</p>
              <p className="text-lg font-medium text-foreground">
                {placement.qr_enabled ? "Enabled" : "Disabled"}
                {placement.qr_enabled && placement.revenue_share_percent != null && placement.revenue_share_percent > 0 && (
                  <> &mdash; {placement.revenue_share_percent}% share on QR sales</>
                )}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Direct purchase</p>
              <p className="text-lg font-medium text-foreground">Venue owns the work</p>
              <p className="text-[11px] text-muted mt-1">Outright sale &mdash; no ongoing split</p>
            </div>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">QR display</p>
              <p className="text-lg font-medium text-foreground">
                {placement.qr_enabled ? "Enabled" : "Disabled"}
              </p>
            </div>
          </>
        )}
        <div className="bg-surface border border-border rounded-sm p-4">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">Created</p>
          <p className="text-sm font-medium text-foreground">
            {placement.created_at ? new Date(placement.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "\u2014"}
          </p>
        </div>
      </div>

      {/* Works covered by this placement. The primary work is the
          header; additional works (#16) appear as a labelled gallery
          underneath so both parties see the full set of pieces the
          deal covers. */}
      {placement.extra_works && placement.extra_works.length > 0 && (
        <div className="mb-6">
          <h2 className="font-serif text-xl text-foreground mb-3">Works in this placement</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Primary first so its position is clear. */}
            <div className="bg-surface border border-accent/30 rounded-sm overflow-hidden">
              <div className="aspect-square relative bg-[#f5f5f3]">
                {placement.work_image && (
                  <Image src={placement.work_image} alt={placement.work_title} fill className="object-cover" sizes="160px" />
                )}
                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-sm bg-accent text-white text-[10px] font-medium">Primary</span>
              </div>
              <div className="p-2.5">
                <p className="text-xs font-medium text-foreground truncate">{placement.work_title}</p>
                {placement.work_size && <p className="text-[10px] text-muted truncate">{placement.work_size}</p>}
              </div>
            </div>
            {placement.extra_works.map((w, i) => (
              <div key={`${w.title}-${i}`} className="bg-surface border border-border rounded-sm overflow-hidden">
                <div className="aspect-square relative bg-[#f5f5f3]">
                  {w.image && (
                    <Image src={w.image} alt={w.title} fill className="object-cover" sizes="160px" />
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-foreground truncate">{w.title}</p>
                  {w.size && <p className="text-[10px] text-muted truncate">{w.size}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Negotiation log — every offer / counter / response that led
          to the current terms. Only rendered when there's something to
          show. */}
      <PlacementNegotiationLog placementId={placementId} />

      {/* Messages + notes */}
      {(placement.message || placement.notes) && (
        <div className="space-y-3 mb-6">
          {placement.message && (
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Request message</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{placement.message}</p>
            </div>
          )}
          {placement.notes && (
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{placement.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Loan / consignment record — collapsible so it doesn't dominate
          the page. Defaults open if a record exists, closed if not.
          Pre-fills new records with the agreed terms from the placement
          itself (revenue share %, monthly fee, QR enabled, type) so the
          user isn't re-typing data they already negotiated. */}
      <div ref={loanRecordRef} className="mb-6 scroll-mt-20">
        <div className="flex items-center justify-between mb-3 gap-3">
          <button
            type="button"
            onClick={() => setLoanRecordOpen((v) => !v)}
            className="flex items-center gap-2 text-left flex-1 min-w-0"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 transition-transform ${loanRecordOpen ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <h2 className="font-serif text-xl text-foreground">Loan / consignment record</h2>
            {!record && <span className="text-xs text-muted">(not yet created)</span>}
          </button>
          {!record && (
            <button
              type="button"
              onClick={createRecordIfMissing}
              disabled={creatingRecord}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60 shrink-0"
            >
              {creatingRecord ? "Creating…" : "+ Add record"}
            </button>
          )}
        </div>
        {loanRecordOpen && (
          record ? (
            <PlacementLoanForm
              placementId={placementId}
              record={record}
              viewerRole={viewerRole}
              versions={recordVersions}
              placementSeed={{
                arrangementType: placement.arrangement_type,
                revenueSharePercent: placement.revenue_share_percent ?? null,
                monthlyFeeGbp: placement.monthly_fee_gbp ?? null,
                qrEnabled: placement.qr_enabled ?? null,
              }}
              onSaved={(updated, opts) => {
                setRecord(updated);
                // A reload pulls fresh version history after a save
                // that reset approvals, so the log / banner stay in
                // sync without relying on the form to synthesise them.
                if (opts?.approvalsReset) load({ silent: true });
              }}
            />
          ) : (
            <div className="bg-surface border border-border rounded-sm p-6 text-center text-sm text-muted">
              No loan/consignment record yet. Click <strong>+ Add record</strong> above to start one prefilled with the agreed terms.
            </div>
          )
        )}
      </div>

      {/* Photos */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-xl text-foreground">Photos in venue</h2>
          <label className={`px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors cursor-pointer ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            {uploading ? "Uploading…" : "+ Upload"}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handlePhotoUpload(e.target.files)}
              className="hidden"
            />
          </label>
        </div>
        {photos.length === 0 ? (
          <div className="bg-surface border border-border rounded-sm p-6 text-center text-sm text-muted">
            No photos yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative group aspect-square bg-[#f5f5f3] rounded-sm overflow-hidden">
                <Image src={p.url} alt={p.caption || "Placement photo"} fill className="object-cover" sizes="300px" />
                {p.uploader_user_id === user?.id && (
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(p.id)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete photo"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
