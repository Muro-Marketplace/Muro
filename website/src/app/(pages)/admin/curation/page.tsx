"use client";

import { useState, useEffect } from "react";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch, mutate, ApiError } from "@/lib/api-client";

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
  stripe_payment_intent_id: string | null;
  stripe_subscription_id: string | null;
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
  // D21: set by the managed-curation subscription reconcilers, not by an admin.
  past_due: "Past due",
  paused: "Paused",
};

// The statuses an admin may SET. past_due and paused are deliberately absent:
// the daily managed-curation reconciler owns them, and offering them here would
// invite an admin to hand-set a value the next reconciler run overwrites.
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

// G10: a row sitting on a reconciler-owned status matched no <option>, so the
// controlled select rendered blank and looked like an unset field. Worse, the
// first change an admin made to any other field's row still submitted whatever
// the browser had fallen back to. The row's own status is now always present,
// as a disabled option, so it displays correctly and cannot be re-picked.
function statusOptions(current: string): { value: string; label: string; disabled: boolean }[] {
  const options = STATUS_ORDER.map((s) => ({
    value: s,
    label: STATUS_LABELS[s] || s,
    disabled: false,
  }));
  if (!STATUS_ORDER.includes(current)) {
    options.unshift({
      value: current,
      label: `${STATUS_LABELS[current] || current} (set by billing)`,
      disabled: true,
    });
  }
  return options;
}

// What POST /api/admin/curation/refund reports back.
interface RefundOutcome {
  refunded?: boolean;
  refundedPence?: number;
  subscriptionCancelled?: boolean;
  status?: string;
}

function describeRefund(venueName: string, res: RefundOutcome): string {
  if (res.refunded) {
    const amount = ((res.refundedPence ?? 0) / 100).toFixed(2);
    return res.subscriptionCancelled
      ? `Subscription cancelled. Refunded £${amount} to ${venueName}.`
      : `Refunded £${amount} to ${venueName}.`;
  }
  if (res.subscriptionCancelled) {
    return `Subscription cancelled, there was nothing to refund. ${venueName} has no paid invoice on this request.`;
  }
  return `No money moved. ${venueName} is now marked ${res.status || "cancelled"}.`;
}

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
    case "past_due":
      return "bg-amber-100 text-amber-700";
    case "cancelled":
    case "refunded":
    case "paused":
      return "bg-red-100 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default function AdminCurationPage() {
  const [requests, setRequests] = useState<CurationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
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
    setError(null);
    try {
      await mutate("/api/admin/curation", {
        method: "PATCH",
        body: JSON.stringify({ id, ...patch }),
      });
      setRequests((prev) => prev.map((r) => r.id === id
        ? { ...r, ...(patch.status ? { status: patch.status } : {}), ...(patch.adminNotes !== undefined ? { admin_notes: patch.adminNotes } : {}) }
        : r));
    } catch (err) {
      // Previously the failure branch was empty: a rejected PATCH left the row
      // unchanged with no message, so the admin could not tell a save from a no-op.
      setError(err instanceof ApiError ? err.code || "Could not save that change." : "Network error. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  // D18: the money path. The status dropdown is bookkeeping; this is the only
  // control that actually returns money, so it confirms with the amount and
  // reloads the list afterwards rather than guessing the resulting status
  // (refunded, or cancelled when a managed row had no paid invoice).
  //
  // G12: the response used to be discarded. The API distinguishes "£120 went
  // back to the venue" from "billing stopped, there was no paid invoice to
  // refund", and both land the row on a different status, so an admin who only
  // saw "Cancelled" could not tell whether money had moved. Report what the
  // API actually said.
  async function refundRow(r: CurationRow) {
    const what = r.stripe_subscription_id
      ? `cancel the subscription and refund the last paid invoice for ${r.venue_name}`
      : `refund £${r.amount_paid_gbp ?? "?"} to ${r.venue_name}`;
    if (!window.confirm(`This will ${what}. Continue?`)) return;
    setSavingId(r.id);
    setError(null);
    setOutcome(null);
    try {
      const res = await mutate<RefundOutcome>("/api/admin/curation/refund", {
        method: "POST",
        body: JSON.stringify({ id: r.id }),
      });
      setOutcome(describeRefund(r.venue_name, res));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.code || "Refund failed." : "Network error. Please try again.");
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
      {outcome && (
        <p className="text-sm text-foreground bg-accent/5 border border-accent/20 px-3 py-2 rounded-sm mb-4">
          {outcome}
        </p>
      )}
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
                      {r.amount_paid_gbp != null ? `£${r.amount_paid_gbp}` : "-"}
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
                        <label
                          htmlFor={`curation-status-${r.id}`}
                          className="block text-[11px] text-muted uppercase tracking-wider mb-1"
                        >
                          Status
                        </label>
                        <select
                          id={`curation-status-${r.id}`}
                          value={r.status}
                          onChange={(e) => updateRow(r.id, { status: e.target.value })}
                          disabled={savingId === r.id}
                          className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm cursor-pointer focus:outline-none focus:border-accent/60 disabled:opacity-60"
                        >
                          {statusOptions(r.status).map((o) => (
                            <option key={o.value} value={o.value} disabled={o.disabled}>
                              {o.label}
                            </option>
                          ))}
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

                    {(r.stripe_payment_intent_id || r.stripe_subscription_id) && r.status !== "refunded" && (
                      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                        <p className="text-[11px] text-muted">
                          Setting the status above moves no money. This does.
                        </p>
                        <button
                          type="button"
                          disabled={savingId === r.id}
                          onClick={() => refundRow(r)}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-60"
                        >
                          {r.stripe_subscription_id ? "Cancel and refund via Stripe" : "Refund via Stripe"}
                        </button>
                      </div>
                    )}
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
