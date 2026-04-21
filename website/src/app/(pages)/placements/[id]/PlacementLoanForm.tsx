"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";
import type { PlacementRecord } from "./PlacementDetailClient";

interface Props {
  placementId: string;
  record: PlacementRecord;
  viewerRole?: "artist" | "venue" | null;
  onSaved: (r: PlacementRecord) => void;
}

function strOr(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function PlacementLoanForm({ placementId, record, viewerRole, onSaved }: Props) {
  const [form, setForm] = useState({
    recordType: record.record_type || "loan",
    qrEnabled: record.qr_enabled ?? true,
    startDate: strOr(record.start_date),
    reviewDate: strOr(record.review_date),
    collectionDate: strOr(record.collection_date),
    agreedValueGbp: strOr(record.agreed_value_gbp),
    insuredValueGbp: strOr(record.insured_value_gbp),
    salePriceGbp: strOr(record.sale_price_gbp),
    venueSharePercent: strOr(record.venue_share_percent),
    artistPayoutTerms: record.artist_payout_terms || "",
    monthlyDisplayFeeGbp: strOr(record.monthly_display_fee_gbp),
    conditionIn: record.condition_in || "",
    conditionOut: record.condition_out || "",
    damageNotes: record.damage_notes || "",
    locationInVenue: record.location_in_venue || "",
    pieceCount: strOr(record.piece_count ?? 1),
    deliveredBy: record.delivered_by || "",
    collectionResponsible: record.collection_responsible || "",
    exclusiveToVenue: record.exclusive_to_venue ?? false,
    availableForSale: record.available_for_sale ?? true,
    logisticsNotes: record.logistics_notes || "",
    contractAttachmentUrl: record.contract_attachment_url || "",
    internalNotes: record.internal_notes || "",
    venueApproved: record.venue_approved ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        recordType: form.recordType,
        qrEnabled: form.qrEnabled,
        startDate: form.startDate || null,
        reviewDate: form.reviewDate || null,
        collectionDate: form.collectionDate || null,
        agreedValueGbp: numOrNull(form.agreedValueGbp),
        insuredValueGbp: numOrNull(form.insuredValueGbp),
        salePriceGbp: numOrNull(form.salePriceGbp),
        venueSharePercent: numOrNull(form.venueSharePercent),
        artistPayoutTerms: form.artistPayoutTerms,
        monthlyDisplayFeeGbp: numOrNull(form.monthlyDisplayFeeGbp),
        conditionIn: form.conditionIn,
        conditionOut: form.conditionOut,
        damageNotes: form.damageNotes,
        locationInVenue: form.locationInVenue,
        pieceCount: Math.max(1, Number(form.pieceCount) || 1),
        deliveredBy: form.deliveredBy,
        collectionResponsible: form.collectionResponsible,
        exclusiveToVenue: form.exclusiveToVenue,
        availableForSale: form.availableForSale,
        logisticsNotes: form.logisticsNotes,
        contractAttachmentUrl: form.contractAttachmentUrl,
        internalNotes: form.internalNotes,
        // Only the venue role is allowed to submit this field; omit otherwise.
        ...(viewerRole === "venue" ? { venueApproved: form.venueApproved } : {}),
      };
      const res = await authFetch(`/api/placements/${encodeURIComponent(placementId)}/record`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Could not save");
        setSaving(false);
        return;
      }
      // Reflect saved payload back to parent
      onSaved({
        ...record,
        record_type: form.recordType,
        qr_enabled: form.qrEnabled,
        start_date: payload.startDate,
        review_date: payload.reviewDate,
        collection_date: payload.collectionDate,
        agreed_value_gbp: payload.agreedValueGbp,
        insured_value_gbp: payload.insuredValueGbp,
        sale_price_gbp: payload.salePriceGbp,
        venue_share_percent: payload.venueSharePercent,
        artist_payout_terms: payload.artistPayoutTerms,
        monthly_display_fee_gbp: payload.monthlyDisplayFeeGbp,
        condition_in: payload.conditionIn,
        condition_out: payload.conditionOut,
        damage_notes: payload.damageNotes,
        location_in_venue: payload.locationInVenue,
        piece_count: payload.pieceCount,
        delivered_by: payload.deliveredBy,
        collection_responsible: payload.collectionResponsible,
        exclusive_to_venue: payload.exclusiveToVenue,
        available_for_sale: payload.availableForSale,
        logistics_notes: payload.logisticsNotes,
        contract_attachment_url: payload.contractAttachmentUrl,
        internal_notes: payload.internalNotes,
        ...(viewerRole === "venue"
          ? { venue_approved: form.venueApproved, venue_approved_at: form.venueApproved ? new Date().toISOString() : null }
          : {}),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60";
  const labelCls = "block text-xs font-medium text-muted uppercase tracking-wider mb-1";

  return (
    <div className="bg-surface border border-border rounded-sm p-4 sm:p-6 space-y-6">
      {/* Type + toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Record type</label>
          <select
            value={form.recordType}
            onChange={(e) => update("recordType", e.target.value as "loan" | "consignment")}
            className={inputCls + " cursor-pointer"}
          >
            <option value="loan">Loan</option>
            <option value="consignment">Consignment</option>
          </select>
        </div>
        <div className="flex items-center gap-6 pt-5 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.qrEnabled} onChange={(e) => update("qrEnabled", e.target.checked)} className="accent-accent" />
            <span className="text-sm text-foreground">QR enabled</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.exclusiveToVenue} onChange={(e) => update("exclusiveToVenue", e.target.checked)} className="accent-accent" />
            <span className="text-sm text-foreground">Exclusive to venue</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.availableForSale} onChange={(e) => update("availableForSale", e.target.checked)} className="accent-accent" />
            <span className="text-sm text-foreground">Available for sale</span>
          </label>
        </div>
      </div>

      {/* Venue approval — only shown/editable for the venue party */}
      <div className="bg-background border border-border rounded-sm p-4">
        {viewerRole === "venue" ? (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.venueApproved}
              onChange={(e) => update("venueApproved", e.target.checked)}
              className="accent-accent w-4 h-4"
            />
            <span className="text-sm text-foreground font-medium">
              I approve this loan / consignment record
            </span>
            {record.venue_approved_at && (
              <span className="text-xs text-muted">
                Approved {new Date(record.venue_approved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </label>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-sm ${record.venue_approved ? "bg-green-500 text-white" : "border border-border"}`}>
              {record.venue_approved && (
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
              )}
            </span>
            <span className="text-sm text-foreground">
              {record.venue_approved ? "Venue has approved this record" : "Awaiting venue approval"}
            </span>
          </div>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Start date</label>
          <input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Review date</label>
          <input type="date" value={form.reviewDate} onChange={(e) => update("reviewDate", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Collection / return</label>
          <input type="date" value={form.collectionDate} onChange={(e) => update("collectionDate", e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Values */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Agreed value (£)</label>
          <input type="number" min={0} value={form.agreedValueGbp} onChange={(e) => update("agreedValueGbp", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Insured value (£)</label>
          <input type="number" min={0} value={form.insuredValueGbp} onChange={(e) => update("insuredValueGbp", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Sale price (£)</label>
          <input type="number" min={0} value={form.salePriceGbp} onChange={(e) => update("salePriceGbp", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Venue share %</label>
          <input type="number" min={0} max={100} value={form.venueSharePercent} onChange={(e) => update("venueSharePercent", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Monthly display fee (£)</label>
          <input type="number" min={0} value={form.monthlyDisplayFeeGbp} onChange={(e) => update("monthlyDisplayFeeGbp", e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Artist payout terms</label>
        <textarea rows={2} value={form.artistPayoutTerms} onChange={(e) => update("artistPayoutTerms", e.target.value)} className={inputCls} />
      </div>

      {/* Condition */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Condition at check-in</label>
          <textarea rows={3} value={form.conditionIn} onChange={(e) => update("conditionIn", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Condition at check-out</label>
          <textarea rows={3} value={form.conditionOut} onChange={(e) => update("conditionOut", e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Damage / issue notes</label>
        <textarea rows={2} value={form.damageNotes} onChange={(e) => update("damageNotes", e.target.value)} className={inputCls} />
      </div>

      {/* Location + piece count */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>Location in venue</label>
          <input type="text" value={form.locationInVenue} onChange={(e) => update("locationInVenue", e.target.value)} placeholder="e.g. Main wall, left of the bar" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Number of pieces</label>
          <input type="number" min={1} value={form.pieceCount} onChange={(e) => update("pieceCount", e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Logistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Delivered / installed by</label>
          <input type="text" value={form.deliveredBy} onChange={(e) => update("deliveredBy", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Collection responsible</label>
          <input type="text" value={form.collectionResponsible} onChange={(e) => update("collectionResponsible", e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Logistics / transport notes</label>
        <textarea rows={2} value={form.logisticsNotes} onChange={(e) => update("logisticsNotes", e.target.value)} className={inputCls} />
      </div>

      {/* Contract + internal */}
      <div>
        <label className={labelCls}>Signed contract URL</label>
        <input type="url" value={form.contractAttachmentUrl} onChange={(e) => update("contractAttachmentUrl", e.target.value)} placeholder="https://\u2026" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Internal notes</label>
        <textarea rows={2} value={form.internalNotes} onChange={(e) => update("internalNotes", e.target.value)} className={inputCls} />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        {error && <p className="text-xs text-red-600 mr-auto">{error}</p>}
        {saved && <p className="text-xs text-green-600 mr-auto">Saved</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {saving ? "Saving\u2026" : "Save record"}
        </button>
      </div>
    </div>
  );
}
