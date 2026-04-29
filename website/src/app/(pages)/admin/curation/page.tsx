"use client";

import { useState, useEffect } from "react";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch } from "@/lib/api-client";

interface CurationRow {
  id: string;
  venue_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  tier: string;
  venue_type: string;
  location: string;
  style_notes: string;
  audience_notes: string;
  mood_notes: string;
  budget_gbp: string;
  wall_count: number | null;
  timeframe: string;
  references_notes: string;
  status: string;
  amount_paid_gbp: number | null;
  paid_at: string | null;
  admin_notes: string;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending payment",
  awaiting_quote: "Awaiting quote",
  paid: "Paid",
  in_progress: "In progress",
  shortlist_sent: "Shortlist sent",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_ORDER: string[] = [
  "pending_payment",
  "awaiting_quote",
  "paid",
  "in_progress",
  "shortlist_sent",
  "completed",
  "cancelled",
  "refunded",
];

const TIER_LABELS: Record<string, string> = {
  single_wall: "Single wall",
  full_space: "Full space",
  bespoke: "Bespoke",
};

function statusBadge(status: string): string {
  switch (status) {
    case "paid":
    case "in_progress":
      return "bg-accent/10 text-accent";
    case "shortlist_sent":
    case "completed":
      return "bg-green-100 text-green-700";
    case "awaiting_quote":
    case "pending_payment":
      return "bg-amber-100 text-amber-700";
    case "cancelled":
    case "refunded":
      return "bg-red-100 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default function AdminCurationPage() {
  const [requests, setRequests] = useState<CurationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/curation");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load");
        return;
      }
      setRequests(data.requests || []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateRow(id: string, patch: { status?: string; adminNotes?: string }) {
    setSavingId(id);
    try {
      const res = await authFetch("/api/admin/curation", {
        method: "PATCH",
        body: JSON.stringify({ id, ...patch }),
      });
      if (res.ok) {
        setRequests((prev) => prev.map((r) => r.id === id
          ? { ...r, ...(patch.status ? { status: patch.status } : {}), ...(patch.adminNotes !== undefined ? { admin_notes: patch.adminNotes } : {}) }
          : r));
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminPortalLayout activePath="/admin/curation">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl text-foreground mb-1">Curation requests</h1>
          <p className="text-sm text-muted">Venues who have booked or requested a quote for curation.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-surface rounded-sm transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="bg-surface border border-border rounded-sm p-8 text-center text-sm text-muted">
          No curation requests yet.
        </div>
      ) : (
        <div className="bg-white border border-border rounded-sm divide-y divide-border">
          {requests.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  className="w-full px-4 sm:px-5 py-3.5 flex items-center gap-4 text-left hover:bg-background/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">{r.venue_name}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                      <span className="text-[11px] text-muted border border-border px-2 py-0.5 rounded-sm">
                        {TIER_LABELS[r.tier] || r.tier}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5 truncate">
                      {r.contact_name} · {r.contact_email}
                      {r.location ? ` · ${r.location}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-foreground">
                      {r.amount_paid_gbp != null ? `£${r.amount_paid_gbp}` : "–"}
                    </p>
                    <p className="text-[11px] text-muted">
                      {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 sm:px-5 py-4 bg-background border-t border-border space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <Field label="Venue type" value={r.venue_type} />
                      <Field label="Wall count" value={r.wall_count != null ? String(r.wall_count) : ""} />
                      <Field label="Budget" value={r.budget_gbp} />
                      <Field label="Timeframe" value={r.timeframe} />
                      <Field label="Phone" value={r.contact_phone} href={r.contact_phone ? `tel:${r.contact_phone.replace(/\s+/g, "")}` : undefined} />
                      <Field label="Paid" value={r.paid_at ? new Date(r.paid_at).toLocaleString("en-GB") : ""} />
                    </div>
                    {r.style_notes && <Block label="Style" body={r.style_notes} />}
                    {r.audience_notes && <Block label="Audience" body={r.audience_notes} />}
                    {r.mood_notes && <Block label="Mood" body={r.mood_notes} />}
                    {r.references_notes && <Block label="References" body={r.references_notes} />}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Status</label>
                        <select
                          value={r.status}
                          onChange={(e) => updateRow(r.id, { status: e.target.value })}
                          disabled={savingId === r.id}
                          className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm cursor-pointer focus:outline-none focus:border-accent/60 disabled:opacity-60"
                        >
                          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Admin notes</label>
                        <AdminNotesField
                          initial={r.admin_notes}
                          disabled={savingId === r.id}
                          onSave={(v) => updateRow(r.id, { adminNotes: v })}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminPortalLayout>
  );
}

function Field({ label, value, href }: { label: string; value: string; href?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
      {href ? (
        <a href={href} className="text-xs text-accent hover:underline">{value}</a>
      ) : (
        <p className="text-xs text-foreground">{value}</p>
      )}
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="bg-white border border-border rounded-sm p-3">
      <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xs text-foreground whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function AdminNotesField({ initial, disabled, onSave }: { initial: string; disabled: boolean; onSave: (v: string) => void }) {
  const [val, setVal] = useState(initial);
  const [dirty, setDirty] = useState(false);
  return (
    <div className="flex gap-2">
      <textarea
        rows={2}
        value={val}
        onChange={(e) => { setVal(e.target.value); setDirty(true); }}
        disabled={disabled}
        className="flex-1 px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 disabled:opacity-60"
      />
      <button
        type="button"
        disabled={disabled || !dirty}
        onClick={() => { onSave(val); setDirty(false); }}
        className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60"
      >
        Save
      </button>
    </div>
  );
}
