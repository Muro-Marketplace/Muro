"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";
import { uploadContract } from "@/lib/upload";
import type { PlacementRecord } from "./PlacementDetailClient";
import DatePicker from "@/components/DatePicker";

interface Props {
  placementId: string;
  record: PlacementRecord;
  viewerRole?: "artist" | "venue" | null;
  /** Auto-fill source: take the agreed terms from the parent placement so
   *  the user doesn't re-type revenue share, monthly fee, QR enabled, or
   *  record type. Each field only seeds when the record itself has no
   *  value for it — manual edits always win. */
  placementSeed?: {
    arrangementType?: string;
    revenueSharePercent?: number | null;
    monthlyFeeGbp?: number | null;
    qrEnabled?: boolean | null;
  };
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

export default function PlacementLoanForm({ placementId, record, viewerRole, placementSeed, onSaved }: Props) {
  // Map the placement's arrangement_type to the loan record's recordType.
  // Both "free_loan" (paid loan with monthly fee) and "purchase" map to
  // "loan" — the artwork is going on the wall, money flows differently.
  // "revenue_share" maps to "consignment" since the artist still owns
  // it and gets a share of QR sales.
  const seedRecordType = placementSeed?.arrangementType === "revenue_share" ? "consignment" : "loan";
  const [form, setForm] = useState({
    recordType: record.record_type || seedRecordType,
    qrEnabled: record.qr_enabled ?? placementSeed?.qrEnabled ?? true,
    startDate: strOr(record.start_date),
    reviewDate: strOr(record.review_date),
    collectionDate: strOr(record.collection_date),
    agreedValueGbp: strOr(record.agreed_value_gbp),
    insuredValueGbp: strOr(record.insured_value_gbp),
    salePriceGbp: strOr(record.sale_price_gbp),
    venueSharePercent: record.venue_share_percent != null
      ? strOr(record.venue_share_percent)
      : (placementSeed?.revenueSharePercent != null ? strOr(placementSeed.revenueSharePercent) : ""),
    artistPayoutTerms: record.artist_payout_terms || "",
    monthlyDisplayFeeGbp: record.monthly_display_fee_gbp != null
      ? strOr(record.monthly_display_fee_gbp)
      : (placementSeed?.monthlyFeeGbp != null ? strOr(placementSeed.monthlyFeeGbp) : ""),
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [contractUploading, setContractUploading] = useState(false);
  const [contractUploadError, setContractUploadError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    setSaved(false);
    setFieldErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    // Light client-side check on the contract URL — the API now accepts
    // any string so we keep the friendly "looks like a URL?" check here.
    if (form.contractAttachmentUrl && !/^https?:\/\//i.test(form.contractAttachmentUrl.trim())) {
      setFieldErrors({ contractAttachmentUrl: "Add http:// or https:// at the start of the link." });
      setError("Contract link should start with http:// or https://");
      setSaving(false);
      return;
    }
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
        if (body.fieldErrors && typeof body.fieldErrors === "object") {
          setFieldErrors(body.fieldErrors as Record<string, string>);
        }
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
        <DatePicker
          label="Start date"
          value={form.startDate}
          onChange={(v) => update("startDate", v)}
        />
        <DatePicker
          label="Review date"
          value={form.reviewDate}
          onChange={(v) => update("reviewDate", v)}
          min={form.startDate || undefined}
        />
        <DatePicker
          label="Collection / return"
          value={form.collectionDate}
          onChange={(v) => update("collectionDate", v)}
          min={form.startDate || undefined}
        />
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

      {/* Contract: upload (PDF/Word/JPG) OR paste a link. Either way we
          end up with a single contract URL stored on the record so both
          parties can open it later. */}
      <div>
        <label className={labelCls}>Signed contract</label>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
          <input
            type="text"
            value={form.contractAttachmentUrl}
            onChange={(e) => update("contractAttachmentUrl", e.target.value)}
            placeholder="https://…"
            className={`flex-1 ${inputCls} ${fieldErrors.contractAttachmentUrl ? "border-red-400" : ""}`}
          />
          <label className={`inline-flex items-center justify-center px-3 py-2 text-xs font-medium rounded-sm border cursor-pointer transition-colors ${contractUploading ? "border-border text-muted opacity-60 cursor-not-allowed" : "border-accent text-accent hover:bg-accent/5"}`}>
            {contractUploading ? "Uploading…" : "Upload PDF / image"}
            <input
              type="file"
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
              className="hidden"
              disabled={contractUploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setContractUploading(true);
                setContractUploadError(null);
                try {
                  const url = await uploadContract(file);
                  update("contractAttachmentUrl", url);
                } catch (err) {
                  setContractUploadError(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setContractUploading(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
        {form.contractAttachmentUrl && (
          <a
            href={form.contractAttachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            View attached contract
          </a>
        )}
        {(contractUploadError || fieldErrors.contractAttachmentUrl) && (
          <p className="mt-1 text-xs text-red-600">{contractUploadError || fieldErrors.contractAttachmentUrl}</p>
        )}
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
          {saving ? "Saving…" : "Save record"}
        </button>
      </div>
    </div>
  );
}
