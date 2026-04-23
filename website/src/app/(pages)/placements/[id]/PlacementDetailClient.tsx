"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import { uploadImage } from "@/lib/upload";
import PlacementStepper, { type PlacementStepperData } from "@/components/PlacementStepper";
import PlacementLoanForm from "./PlacementLoanForm";

interface PlacementRow {
  id: string;
  artist_user_id: string;
  venue_user_id: string;
  artist_slug?: string;
  venue_slug?: string;
  work_title: string;
  work_image?: string;
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
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [artist, setArtist] = useState<{ name: string; slug: string; image?: string } | null>(null);
  const [venue, setVenue] = useState<{ name: string; slug: string; image?: string; location?: string; city?: string } | null>(null);
  const [viewerRole, setViewerRole] = useState<"artist" | "venue" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creatingRecord, setCreatingRecord] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/placements/${encodeURIComponent(placementId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Could not load placement");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPlacement(data.placement);
      setRecord(data.record);
      setPhotos(data.photos || []);
      setArtist(data.artist);
      setVenue(data.venue);
      setViewerRole(data.viewerRole);
    } catch (e) {
      console.error(e);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [placementId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
    if (user) load();
  }, [user, authLoading, load, router]);

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
    return <div className="px-6 py-16 text-center text-muted text-sm">Loading placement\u2026</div>;
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
  const stepperData: PlacementStepperData = {
    id: placement.id,
    status: placement.status,
    acceptedAt: placement.accepted_at,
    scheduledFor: placement.scheduled_for,
    installedAt: placement.installed_at,
    liveFrom: placement.live_from,
    collectedAt: placement.collected_at,
  };

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
        await load();
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
          <div className="mt-3">
            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
              placement.status === "active" ? "bg-green-100 text-green-700" :
              placement.status === "pending" ? "bg-amber-100 text-amber-700" :
              placement.status === "declined" ? "bg-red-100 text-red-600" :
              "bg-gray-100 text-gray-600"
            }`}>
              {placement.status.charAt(0).toUpperCase() + placement.status.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-surface border border-border rounded-sm p-4 sm:p-5 mb-6">
        <h2 className="text-sm font-medium mb-3">Lifecycle</h2>
        <PlacementStepper
          placement={stepperData}
          canAdvance={placement.status === "active"}
          onChange={(next) => setPlacement((p) => p ? ({
            ...p,
            status: next.status === "completed" ? "completed" : p.status,
            accepted_at: next.acceptedAt ?? p.accepted_at,
            scheduled_for: next.scheduledFor ?? p.scheduled_for,
            installed_at: next.installedAt ?? p.installed_at,
            live_from: next.liveFrom ?? p.live_from,
            collected_at: next.collectedAt ?? p.collected_at,
          }) : p)}
        />
      </div>

      {/* Summary grid — the first box is the headline commercial term so it
          reads clearly at a glance: revenue share %, monthly paid-loan fee,
          or purchase price. The other two boxes add supporting context. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {placement.arrangement_type === "revenue_share" ? (
          <>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Revenue share</p>
              <p className="text-xl font-medium text-foreground">
                {placement.revenue_share_percent != null ? `${placement.revenue_share_percent}%` : "Not set"}
              </p>
              <p className="text-[11px] text-muted mt-1">Artist&rsquo;s share of QR-code sales</p>
            </div>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Earned so far</p>
              <p className="text-xl font-medium text-foreground">
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
                    <p className="text-xl font-medium text-foreground">
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
              <p className="text-sm font-medium text-foreground">
                {placement.qr_enabled ? "Enabled" : "Disabled"}
              </p>
              {placement.qr_enabled && placement.revenue_share_percent != null && (
                <p className="text-[11px] text-muted mt-1">{placement.revenue_share_percent}% share on QR sales</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Direct purchase</p>
              <p className="text-xl font-medium text-foreground">Venue owns the work</p>
              <p className="text-[11px] text-muted mt-1">Outright sale &mdash; no ongoing split</p>
            </div>
            <div className="bg-surface border border-border rounded-sm p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">QR display</p>
              <p className="text-sm font-medium text-foreground">
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

      {/* Loan / consignment record */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-xl text-foreground">Loan / consignment record</h2>
          {!record && (
            <button
              type="button"
              onClick={createRecordIfMissing}
              disabled={creatingRecord}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60"
            >
              {creatingRecord ? "Creating\u2026" : "+ Add record"}
            </button>
          )}
        </div>
        {record ? (
          <PlacementLoanForm
            placementId={placementId}
            record={record}
            viewerRole={viewerRole}
            onSaved={(updated) => setRecord(updated)}
          />
        ) : (
          <div className="bg-surface border border-border rounded-sm p-6 text-center text-sm text-muted">
            No loan/consignment record yet.
          </div>
        )}
      </div>

      {/* Photos */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-xl text-foreground">Photos in venue</h2>
          <label className={`px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors cursor-pointer ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            {uploading ? "Uploading\u2026" : "+ Upload"}
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
