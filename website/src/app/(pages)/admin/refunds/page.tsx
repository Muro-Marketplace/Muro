"use client";

// G2/G28: the refund-request money path finally gets an admin surface.
// Artist-initiated refund requests can only be actioned by an admin
// (/api/refunds/process 403s the artist on their own request), so without
// this page they could only be approved by hand-crafted API calls.
//
// Follows the admin/curation page conventions: authFetch for the read,
// mutate for the write, expandable rows, and an explicit confirm on the
// one control that actually moves money.

import { useState, useEffect } from "react";
import { authFetch, mutate, ApiError } from "@/lib/api-client";

interface RefundOrder {
  id: string;
  buyer_email: string | null;
  total: number | null;
  status: string | null;
  artist_slug: string | null;
  venue_slug: string | null;
}

interface RefundRow {
  id: string;
  order_id: string;
  status: string;
  type: string;
  amount: number | null;
  reason: string | null;
  requester_type: string | null;
  requester_email: string | null;
  rejection_reason: string | null;
  processed_at: string | null;
  stripe_refund_id: string | null;
  created_at: string;
  orders?: RefundOrder | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  approved: "Approved",
  rejected: "Rejected",
};

function statusBadge(status: string): string {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "processing":
      return "bg-accent/10 text-accent";
    case "rejected":
      return "bg-red-100 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function fmtAmount(amount: number | null | undefined): string {
  return typeof amount === "number" && Number.isFinite(amount)
    ? `£${amount.toFixed(2)}`
    : "-";
}

export default function AdminRefundsPage() {
  const [requests, setRequests] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // The admin branch of GET /api/refunds returns every request with the
      // joined order. (Non-admins get their own rows, but AdminGate keeps
      // them off this page in the first place.)
      const res = await authFetch("/api/refunds");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load");
        return;
      }
      setRequests(data.refundRequests || []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // The money path. Approve triggers a real Stripe refund (and transfer
  // reversals) via /api/refunds/process, so it confirms with the amount
  // first, then reloads rather than guessing the resulting status.
  async function processRequest(r: RefundRow, action: "approve" | "reject", reason?: string) {
    if (action === "approve") {
      const what = `refund ${fmtAmount(r.amount)} to the buyer for order ${r.order_id}`;
      if (!window.confirm(`This will ${what} via Stripe. Continue?`)) return;
    }
    setSavingId(r.id);
    setError(null);
    try {
      await mutate("/api/refunds/process", {
        method: "POST",
        body: JSON.stringify({
          refundRequestId: r.id,
          action,
          ...(reason ? { reason } : {}),
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.code || "Could not process that request." : "Network error. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl text-foreground mb-1">Refund requests</h1>
          <p className="text-sm text-muted">
            {pendingCount > 0
              ? `${pendingCount} awaiting a decision. Approving refunds the buyer via Stripe.`
              : "Refund requests from buyers and artists. Approving refunds the buyer via Stripe."}
          </p>
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
          No refund requests yet.
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
                      <span className="text-sm font-medium text-foreground truncate">Order {r.order_id}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                      <span className="text-[11px] text-muted border border-border px-2 py-0.5 rounded-sm">
                        {r.type === "partial" ? "Partial" : "Full"}
                      </span>
                      {r.requester_type === "artist" && (
                        <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-sm">
                          Raised by artist
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5 truncate">
                      {r.requester_email || r.orders?.buyer_email || "Unknown requester"}
                      {r.orders?.artist_slug ? ` · ${r.orders.artist_slug}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-foreground">{fmtAmount(r.amount)}</p>
                    <p className="text-[11px] text-muted">
                      {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 sm:px-5 py-4 bg-background border-t border-border space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <Field label="Requested by" value={r.requester_type || ""} />
                      <Field label="Requester email" value={r.requester_email || ""} />
                      <Field label="Buyer email" value={r.orders?.buyer_email || ""} />
                      <Field label="Order total" value={r.orders?.total != null ? fmtAmount(r.orders.total) : ""} />
                      <Field label="Order status" value={r.orders?.status || ""} />
                      <Field label="Requested" value={new Date(r.created_at).toLocaleString("en-GB")} />
                      {r.processed_at && <Field label="Processed" value={new Date(r.processed_at).toLocaleString("en-GB")} />}
                      {r.stripe_refund_id && <Field label="Stripe refund" value={r.stripe_refund_id} />}
                    </div>
                    {r.reason && <Block label="Reason" body={r.reason} />}
                    {r.rejection_reason && <Block label="Rejection reason" body={r.rejection_reason} />}

                    {r.status === "pending" ? (
                      <div className="border-t border-border pt-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] text-muted">
                            Approve moves money. Reject closes the request without refunding.
                          </p>
                          <button
                            type="button"
                            disabled={savingId === r.id}
                            onClick={() => processRequest(r, "approve")}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60"
                          >
                            {savingId === r.id ? "Working…" : `Approve and refund ${fmtAmount(r.amount)}`}
                          </button>
                        </div>
                        <RejectControls
                          disabled={savingId === r.id}
                          onReject={(reason) => processRequest(r, "reject", reason)}
                        />
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted border-t border-border pt-3">
                        This request has already been {STATUS_LABELS[r.status]?.toLowerCase() || r.status}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-xs text-foreground break-all">{value}</p>
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

function RejectControls({ disabled, onReject }: { disabled: boolean; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex gap-2 items-start">
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={disabled}
        placeholder="Reason for rejecting (optional, sent to the requester)"
        className="flex-1 px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 disabled:opacity-60"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReject(reason.trim())}
        className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-60"
      >
        Reject request
      </button>
    </div>
  );
}
