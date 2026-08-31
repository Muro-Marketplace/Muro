"use client";

import { useState, useEffect, Suspense } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import EmptyState from "@/components/EmptyState";
import OrderStatusTracker from "@/components/OrderStatusTracker";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { readOrderItems, type RawOrderItem } from "@/lib/order-items";
import { useUrlState } from "@/lib/use-url-state";
import { detectCarrierUrl } from "@/lib/carrier-tracking";
import type { RefundRequestRow, RefundsListResponse, RefundRequestCreateResponse } from "@/app/api/refunds/types";
import { artistPayoutPounds, formatPounds } from "@/lib/finance/order-money";

interface Order {
  id: string;
  items: RawOrderItem[];
  shipping: { fullName: string; email: string; phone: string; addressLine1: string; addressLine2?: string; city: string; postcode: string; country: string };
  // Subtotal and shipping_cost expose the split that makes up `total`,
  // so the revenue breakdown can show how the items-line and "Sale
  // total" tie together. Optional because older order rows may not
  // have these columns populated.
  subtotal?: number;
  shipping_cost?: number;
  total: number;
  artist_revenue: number;
  venue_revenue: number;
  platform_fee: number;
  venue_revenue_share_percent: number;
  platform_fee_percent: number;
  status: string;
  status_history: { status: string; timestamp: string }[];
  tracking_number?: string;
  venue_slug?: string;
  source?: string;
  // "ship" (default) or "collection" — set by the checkout flow. When
  // collection, the buyer's proposed pickup window is folded into
  // collection_notes and we render it prominently with a CTA to email
  // the buyer back so they can agree on a final time.
  fulfilment_method?: "ship" | "collection";
  collection_notes?: string | null;
  created_at: string;
}

type RefundRequest = RefundRequestRow & {
  requester_type?: string;
  resolved_reason?: string;
};

// E21. The `shipped → delivered` action is gone, not disabled. Confirming
// delivery releases the 14-day escrow hold, so the seller cannot attest it: the
// API refuses it with a 403 and leaving the button would only produce an error
// the artist cannot act on. The buyer confirms from the customer portal, and
// support can force it via /api/admin/orders. An unconfirmed order still pays
// out on the 14-day cron, which is the intended default.
const statusActions: Record<string, { next: string; label: string; color: string }> = {
  confirmed: { next: "processing", label: "Mark as Processing", color: "bg-blue-600 hover:bg-blue-700" },
  processing: { next: "shipped", label: "Mark as Shipped", color: "bg-accent hover:bg-accent-hover" },
};

export default function ArtistOrdersPage() {
  // useUrlState transitively calls useSearchParams, which in Next 16
  // triggers "Missing Suspense boundary" prerender errors. Wrap the
  // dynamic subtree in Suspense (mirrors customer-portal).
  return (
    <Suspense
      fallback={
        <ArtistPortalLayout activePath="/artist-portal/orders">
          <p className="text-muted text-sm py-12 text-center">Loading orders...</p>
        </ArtistPortalLayout>
      }
    >
      <ArtistOrdersContent />
    </Suspense>
  );
}

function ArtistOrdersContent() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // R6.F9: the refund bells deep-link `/artist-portal/orders?id={orderId}`
  // ("approve / reject directly"), but the selection used to be plain
  // useState so the param was ignored and the artist landed on the
  // unfiltered list. URL state consumes `?id=` the way customer-portal
  // consumes `?order=`, and keeps the selection shareable.
  const [selectedOrder, setSelectedOrder] = useUrlState<string>("id", "");
  const [trackingInput, setTrackingInput] = useState("");
  const [updating, setUpdating] = useState(false);
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [rejectReasonInput, setRejectReasonInput] = useState("");
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);
  const [refundProcessing, setRefundProcessing] = useState(false);
  const [refundActionError, setRefundActionError] = useState<string | null>(null);
  const [showIssueRefund, setShowIssueRefund] = useState(false);
  const [issueRefundError, setIssueRefundError] = useState<string | null>(null);
  const [issueRefundNotice, setIssueRefundNotice] = useState<string | null>(null);
  const [issueRefundType, setIssueRefundType] = useState<"full" | "partial">("full");
  const [issueRefundAmount, setIssueRefundAmount] = useState("");
  const [issueRefundReason, setIssueRefundReason] = useState("");

  // D4 (QA 2026-08-28), on top of R6.F9's useUrlState above: `?id=` now
  // selects the order via URL state. Two finishing touches here: honour the
  // legacy `?order=` alias (the param name the customer portal uses, so
  // hand-copied links keep working) by folding it into the id state, and
  // scroll the opened detail panel into view once the deep-linked order has
  // loaded so the selection is visible, not just technically applied.
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);

  useEffect(() => {
    const deepLinkedId = new URLSearchParams(window.location.search).get("id")
      || new URLSearchParams(window.location.search).get("order");
    authFetch("/api/orders")
      .then((r) => r.json())
      .then((data) => {
        if (!data.orders) return;
        setOrders(data.orders);
        if (deepLinkedId && (data.orders as Order[]).some((o) => o.id === deepLinkedId)) {
          setSelectedOrder(deepLinkedId);
          setDeepLinkApplied(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!deepLinkApplied) return;
    document
      .getElementById("order-detail-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [deepLinkApplied]);

  const [statusError, setStatusError] = useState<string | null>(null);

  async function updateStatus(orderId: string, newStatus: string) {
    setUpdating(true);
    setStatusError(null);
    try {
      const body: Record<string, string> = { orderId, status: newStatus };
      if (newStatus === "shipped" && trackingInput) body.trackingNumber = trackingInput;

      // Order STATUS update only (shipped/tracking). Not a refund/money path —
      // mutate throws on a non-2xx, so a rejected update surfaces the real reason
      // (the common cause is a legacy order missing artist_user_id, which the 403
      // check can't authorise) instead of the old authFetch resolving.
      await mutate("/api/orders", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setOrders((prev) => prev.map((o) =>
        o.id === orderId ? {
          ...o,
          status: newStatus,
          tracking_number: newStatus === "shipped" && trackingInput ? trackingInput : o.tracking_number,
          status_history: [...(o.status_history || []), { status: newStatus, timestamp: new Date().toISOString() }],
        } : o
      ));
      setTrackingInput("");
    } catch (err) {
      console.error("Status update failed:", err);
      setStatusError(
        err instanceof ApiError
          ? err.message || "Could not update order. Contact support if this keeps happening."
          : "Network error. Please try again.",
      );
    }
    setUpdating(false);
  }

  useEffect(() => {
    authFetch("/api/refunds")
      .then((r) => r.json())
      .then((data: RefundsListResponse) => { if (data.refundRequests) setRefundRequests(data.refundRequests); })
      .catch(() => {});
  }, []);

  async function processRefund(refundRequestId: string, action: "approve" | "reject") {
    setRefundProcessing(true);
    setRefundActionError(null);
    // D18 (QA 2026-08-28): was authFetch with success-only handling, so a
    // rejected approve/reject gave the artist zero feedback and the card kept
    // its stale state. mutate() throws on a non-2xx / network failure, and the
    // failure now surfaces via refundActionError. The server-side money
    // boundary in /api/refunds/process is untouched.
    try {
      const body: Record<string, string> = { refundRequestId, action };
      if (action === "reject" && rejectReasonInput) body.reason = rejectReasonInput;
      await mutate("/api/refunds/process", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setRefundRequests((prev) =>
        prev.map((r) => r.id === refundRequestId ? { ...r, status: action === "approve" ? "approved" : "rejected", resolved_reason: rejectReasonInput || undefined } as RefundRequest : r)
      );
      setRejectReasonInput("");
      setShowRejectInput(null);
    } catch (err) {
      console.error("Refund processing failed:", err);
      setRefundActionError(
        err instanceof ApiError
          ? err.message || "Could not process the refund request. Please try again."
          : "Network error. Please check your connection and try again.",
      );
    }
    setRefundProcessing(false);
  }

  async function issueProactiveRefund(orderId: string) {
    setRefundProcessing(true);
    setIssueRefundError(null);
    setIssueRefundNotice(null);

    // D19 (QA 2026-08-28). Two-step flow: step 1 creates the refund request
    // row, step 2 asks /api/refunds/process to approve it. For an
    // artist-initiated request step 2 ALWAYS answers 403 by design (no
    // self-approval; an admin must action it — that server-side money boundary
    // is deliberate and must not be "fixed" here). The old code swallowed every
    // non-2xx and closed the form as if the refund had happened. Now the 403
    // shows an honest "sent to Wallplace for approval" confirmation with the
    // request left visible as pending, and every other failure is surfaced.
    let created: RefundRequestRow | null = null;
    try {
      const body: Record<string, unknown> = { orderId, reason: issueRefundReason, type: issueRefundType };
      if (issueRefundType === "partial") body.amount = parseFloat(issueRefundAmount);
      const reqData = await mutate<RefundRequestCreateResponse>("/api/refunds/request", {
        method: "POST",
        body: JSON.stringify(body),
      });
      created = reqData.refundRequest ?? null;
    } catch (err) {
      console.error("Issue refund failed:", err);
      setIssueRefundError(
        err instanceof ApiError
          ? err.message || "Could not create the refund request. Please try again."
          : "Network error. Please check your connection and try again.",
      );
      setRefundProcessing(false);
      return; // Form stays open so the artist can correct and retry.
    }

    if (!created) {
      // Demo-guard style 200 with no row: nothing was created, nothing to process.
      setShowIssueRefund(false);
      setIssueRefundReason("");
      setIssueRefundAmount("");
      setIssueRefundType("full");
      setRefundProcessing(false);
      return;
    }

    try {
      await mutate("/api/refunds/process", {
        method: "POST",
        body: JSON.stringify({ refundRequestId: created.id, action: "approve" }),
      });
      setRefundRequests((prev) => [...prev, { ...created!, status: "approved" }]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // The designed path: the request now sits with Wallplace for approval.
        setRefundRequests((prev) => [...prev, created!]);
        setIssueRefundNotice(
          "Your refund request has been sent to Wallplace for approval. The buyer will receive the refund once it is approved.",
        );
      } else {
        console.error("Issue refund failed:", err);
        // The request row was created, so reflect it honestly as pending.
        setRefundRequests((prev) => [...prev, created!]);
        setIssueRefundError(
          err instanceof ApiError
            ? err.message || "The refund request was created but could not be processed. Wallplace will review it."
            : "Network error. The refund request was created and will be reviewed by Wallplace.",
        );
      }
    }
    setShowIssueRefund(false);
    setIssueRefundReason("");
    setIssueRefundAmount("");
    setIssueRefundType("full");
    setRefundProcessing(false);
  }

  const rawSelected = orders.find((o) => o.id === selectedOrder);
  const selected = rawSelected ? {
    ...rawSelected,
    items: Array.isArray(rawSelected.items) ? rawSelected.items : (typeof rawSelected.items === "string" ? (() => { try { return JSON.parse(rawSelected.items); } catch { return []; } })() : []),
    status_history: Array.isArray(rawSelected.status_history) ? rawSelected.status_history : (typeof rawSelected.status_history === "string" ? (() => { try { return JSON.parse(rawSelected.status_history); } catch { return []; } })() : []),
    total: rawSelected.total || 0,
    artist_revenue: rawSelected.artist_revenue || 0,
    venue_revenue: rawSelected.venue_revenue || 0,
    platform_fee: rawSelected.platform_fee || 0,
    venue_revenue_share_percent: rawSelected.venue_revenue_share_percent || 0,
    platform_fee_percent: rawSelected.platform_fee_percent || 0,
  } : null;
  const pendingCount = orders.filter((o) => o.status === "confirmed" || o.status === "processing").length;

  return (
    <ArtistPortalLayout activePath="/artist-portal/orders">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl">Orders</h1>
          <p className="text-sm text-muted mt-1">Fulfil orders and track deliveries</p>
        </div>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-medium rounded-full">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {pendingCount} need attention
          </span>
        )}
      </div>

      {/* Order detail */}
      {selected && (
        <div id="order-detail-panel" className="bg-surface border border-accent/20 rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Order {selected.id}</h2>
            <button onClick={() => setSelectedOrder("")} className="text-xs text-muted hover:text-foreground">Close</button>
          </div>

          <OrderStatusTracker currentStatus={selected.status} statusHistory={selected.status_history || []} />

          {selected.tracking_number && (() => {
            const url = detectCarrierUrl(selected.tracking_number);
            return (
              <p className="text-sm text-muted mt-4">
                Tracking:{" "}
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent font-medium hover:underline"
                  >
                    {selected.tracking_number} ↗
                  </a>
                ) : (
                  <span className="text-foreground font-medium">{selected.tracking_number}</span>
                )}
              </p>
            );
          })()}

          {/* Status action */}
          {statusActions[selected.status] && (
            <div className="mt-5 p-4 bg-[#FAF8F5] rounded-sm border border-border">
              {statusActions[selected.status].next === "shipped" && (
                <div className="mb-3">
                  <label className="block text-xs text-muted mb-1">Tracking number</label>
                  <input type="text" value={trackingInput} onChange={(e) => setTrackingInput(e.target.value)} placeholder="e.g. RM123456789GB" className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                  <p className="text-[11px] text-muted mt-1">Required for &pound;100+ orders (signed-for delivery).</p>
                </div>
              )}
              <button
                onClick={() => updateStatus(selected.id, statusActions[selected.status].next)}
                disabled={updating}
                className={`px-5 py-2 text-sm font-medium text-white rounded-sm transition-colors disabled:opacity-50 ${statusActions[selected.status].color}`}
              >
                {updating ? "Updating..." : statusActions[selected.status].label}
              </button>
              {statusError && (
                <p className="text-xs text-red-600 mt-2">{statusError}</p>
              )}
            </div>
          )}

          {/* Items. This dual-shape read used to live here and only here,
              which is how the customer portal and the tracking page came to
              show £0.00 on the same orders. It now lives in
              lib/order-items.ts so all three surfaces share one reader. */}
          <div className="mt-6 space-y-2">
            <p className="text-xs text-muted uppercase tracking-wider">Items</p>
            {readOrderItems(selected.items).map((item, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-border pb-2">
                <span>
                  {item.title} &times; {item.quantity}
                </span>
                <span className="font-medium">&pound;{item.lineTotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Revenue breakdown */}
          <div className="mt-5 p-4 bg-background rounded-sm border border-border space-y-2">
            <p className="text-xs text-muted uppercase tracking-wider mb-2">Revenue Breakdown</p>
            {/* Items subtotal is the sum of the line items so the
                breakdown reconciles cleanly with the Items rows above.
                QA flagged that the breakdown jumped straight from the
                items row (£69.99) to "Sale total £79.94" without
                explaining the £9.95 shipping line, which is what makes
                up the gap. */}
            {typeof selected.subtotal === "number" && (
              <div className="flex justify-between text-sm">
                <span>Items subtotal</span>
                <span className="font-medium">&pound;{selected.subtotal.toFixed(2)}</span>
              </div>
            )}
            {typeof selected.shipping_cost === "number" && selected.shipping_cost > 0 && (
              <div className="flex justify-between text-sm text-muted">
                <span>Shipping</span>
                <span>+&pound;{selected.shipping_cost.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm"><span>Sale total</span><span className="font-medium">&pound;{selected.total?.toFixed(2)}</span></div>
            {selected.venue_revenue > 0 && (
              <div className="flex justify-between text-sm text-muted"><span>Venue share ({selected.venue_revenue_share_percent}%)</span><span>-&pound;{selected.venue_revenue.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between text-sm text-muted"><span>Platform fee ({selected.platform_fee_percent}%)</span><span>-&pound;{selected.platform_fee?.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm font-medium pt-2 border-t border-border"><span>Your revenue</span><span className="text-accent">&pound;{selected.artist_revenue?.toFixed(2)}</span></div>
            {/* Footnote: the fee % is whatever the artist's plan was
                when the sale settled, NOT their current plan. QA
                flagged a Pro artist seeing "Platform fee (15%)" on an
                older order even though their billing page reads "5%
                platform fee on sales", the two are both correct but
                read as a contradiction without this note. */}
            <p className="text-[10px] text-muted pt-2 border-t border-border">
              Platform fee reflects your subscription plan at the time of sale. New sales use your current plan rate.
            </p>
          </div>

          {/* Collection details. For "Collect from artist" orders the
              buyer proposes a date + time window at checkout. Render
              both prominently with the buyer's contact details and a
              one-click mailto so the artist can confirm or counter-
              propose without leaving the page. The email subject and
              body are prefilled with the order context so the reply
              thread reads sensibly in both inboxes. */}
          {selected.fulfilment_method === "collection" ? (
            <div className="mt-5 p-4 bg-[#FAF8F5] border border-border rounded-sm">
              <p className="text-xs text-muted uppercase tracking-wider mb-2">
                Pickup proposed by buyer
              </p>
              {selected.collection_notes ? (
                <p className="text-sm text-foreground whitespace-pre-wrap mb-3">
                  {selected.collection_notes}
                </p>
              ) : (
                <p className="text-sm text-muted mb-3">
                  No specific time given. Reach out to the buyer to agree on a pickup window.
                </p>
              )}
              <div className="border-t border-border pt-3 space-y-1">
                <p className="text-xs text-muted uppercase tracking-wider mb-1">Buyer contact</p>
                <p className="text-sm font-medium">{selected.shipping?.fullName}</p>
                {selected.shipping?.email && (
                  <p className="text-sm text-muted">{selected.shipping.email}</p>
                )}
                {selected.shipping?.phone && (
                  <p className="text-sm text-muted">{selected.shipping.phone}</p>
                )}
              </div>
              {selected.shipping?.email && (
                <a
                  href={(() => {
                    const subject = `Pickup for order ${selected.id}`;
                    const body =
                      `Hi ${(selected.shipping?.fullName || "").split(" ")[0] || "there"},\n\n` +
                      `Thanks for ordering ${selected.items?.[0]?.title || "your artwork"} (${selected.id}).\n\n` +
                      (selected.collection_notes
                        ? `You suggested:\n${selected.collection_notes}\n\n`
                        : "") +
                      `Let me know if this still works, or propose a different time and I'll confirm.\n\n` +
                      `Best,\n`;
                    return `mailto:${encodeURIComponent(selected.shipping.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                  })()}
                  className="inline-block mt-3 px-3 py-2 text-sm font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
                >
                  Email buyer to confirm pickup
                </a>
              )}
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-xs text-muted uppercase tracking-wider mb-2">Ship to</p>
              <p className="text-sm font-medium">{selected.shipping?.fullName}</p>
              <p className="text-sm text-muted">{selected.shipping?.addressLine1}{selected.shipping?.addressLine2 ? `, ${selected.shipping.addressLine2}` : ""}</p>
              <p className="text-sm text-muted">{selected.shipping?.city}, {selected.shipping?.postcode}</p>
            </div>
          )}

          {/* Refund management */}
          {(() => {
            const orderRefunds = refundRequests.filter((r) => r.order_id === selected.id);
            const pendingRefunds = orderRefunds.filter((r) => r.status === "pending" || r.status === "processing");
            const pastRefunds = orderRefunds.filter((r) => r.status !== "pending" && r.status !== "processing");
            const refundEligible = ["confirmed", "processing", "shipped", "delivered"].includes(selected.status);

            return (
              <div className="mt-5 pt-4 border-t border-border space-y-4">
                {/* D19: outcome of the last "Issue Refund" attempt. The 403
                    from /api/refunds/process is the designed artist path, so
                    it renders as a confirmation, not an error. */}
                {issueRefundNotice && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-sm px-3 py-2">
                    {issueRefundNotice}
                  </p>
                )}
                {issueRefundError && !showIssueRefund && (
                  <p className="text-xs text-red-600">{issueRefundError}</p>
                )}

                {/* Pending refund requests */}
                {pendingRefunds.map((req) => (
                  <div key={req.id} className="p-4 bg-amber-50 border border-amber-200 rounded-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted uppercase tracking-wider">Refund Request</p>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Pending
                      </span>
                    </div>
                    {req.requester_type && (
                      <p className="text-sm text-muted">From: <span className="text-foreground capitalize">{req.requester_type}</span></p>
                    )}
                    <p className="text-sm text-foreground">{req.reason}</p>
                    <div className="flex items-center gap-3 text-sm text-muted">
                      <span className="capitalize">{req.type} refund</span>
                      {req.type === "partial" && req.amount && <span>&pound;{req.amount.toFixed(2)}</span>}
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => processRefund(req.id, "approve")}
                        disabled={refundProcessing}
                        className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
                      >
                        {refundProcessing ? "Processing..." : "Approve Refund"}
                      </button>
                      {showRejectInput === req.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={rejectReasonInput}
                            onChange={(e) => setRejectReasonInput(e.target.value)}
                            placeholder="Reason for rejection"
                            className="flex-1 px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                          />
                          <button
                            onClick={() => processRefund(req.id, "reject")}
                            disabled={refundProcessing}
                            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-sm hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => { setShowRejectInput(null); setRejectReasonInput(""); }}
                            className="text-sm text-muted hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowRejectInput(req.id)}
                          className="px-4 py-2 border border-border text-sm font-medium rounded-sm hover:bg-background transition-colors"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                    {refundActionError && (
                      <p className="text-xs text-red-600">{refundActionError}</p>
                    )}
                  </div>
                ))}

                {/* Past refund requests */}
                {pastRefunds.map((req) => (
                  <div key={req.id} className="p-4 bg-background border border-border rounded-sm space-y-2 opacity-70">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted uppercase tracking-wider">Refund Request</p>
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${req.status === "approved" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                        {req.status === "approved" ? "Approved" : "Rejected"}
                      </span>
                    </div>
                    <p className="text-sm text-muted">{req.reason}</p>
                    <p className="text-xs text-muted capitalize">{req.type} refund{req.type === "partial" && req.amount ? `: \u00A3${req.amount.toFixed(2)}` : ""}</p>
                    {req.resolved_reason && <p className="text-xs text-muted">Response: {req.resolved_reason}</p>}
                  </div>
                ))}

                {/* Issue refund proactively */}
                {refundEligible && pendingRefunds.length === 0 && (
                  <>
                    {showIssueRefund ? (
                      <div className="p-4 bg-[#FAF8F5] border border-border rounded-sm space-y-4">
                        <p className="text-xs text-muted uppercase tracking-wider">Issue a Refund</p>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="radio" name="issueRefundType" checked={issueRefundType === "full"} onChange={() => setIssueRefundType("full")} className="accent-accent" />
                            Full refund
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="radio" name="issueRefundType" checked={issueRefundType === "partial"} onChange={() => setIssueRefundType("partial")} className="accent-accent" />
                            Partial refund
                          </label>
                        </div>
                        {issueRefundType === "partial" && (
                          <div>
                            <label className="block text-xs text-muted mb-1">Amount (&pound;)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={selected.total}
                              value={issueRefundAmount}
                              onChange={(e) => setIssueRefundAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-muted mb-1">Reason</label>
                          <textarea
                            value={issueRefundReason}
                            onChange={(e) => setIssueRefundReason(e.target.value)}
                            placeholder="Reason for issuing this refund"
                            rows={2}
                            className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50 resize-none"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => issueProactiveRefund(selected.id)}
                            // D19 (cf. C5): a partial refund with a blank, non-positive
                            // or over-total amount would only die as a server 400, so
                            // gate the submit until the amount is valid.
                            disabled={
                              refundProcessing ||
                              !issueRefundReason.trim() ||
                              (issueRefundType === "partial" &&
                                (!Number.isFinite(parseFloat(issueRefundAmount)) ||
                                  parseFloat(issueRefundAmount) <= 0 ||
                                  parseFloat(issueRefundAmount) > selected.total))
                            }
                            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
                          >
                            {refundProcessing ? "Processing..." : "Issue Refund"}
                          </button>
                          <button
                            onClick={() => { setShowIssueRefund(false); setIssueRefundError(null); setIssueRefundReason(""); setIssueRefundAmount(""); setIssueRefundType("full"); }}
                            className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                        {issueRefundError && (
                          <p className="text-xs text-red-600">{issueRefundError}</p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setShowIssueRefund(true); setIssueRefundError(null); setIssueRefundNotice(null); }}
                        className="text-sm text-accent hover:text-accent-hover transition-colors"
                      >
                        Issue Refund
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Order list */}
      {loading ? (
        <p className="text-muted text-sm py-12 text-center">Loading orders...</p>
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          hint="When someone buys your work, orders will appear here."
          cta={{ label: "Discover art", href: "/browse" }}
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => {
                setSelectedOrder(selectedOrder === order.id ? "" : order.id);
                // Refund feedback is per-order; don't carry it to another order's panel.
                setRefundActionError(null);
                setIssueRefundError(null);
                setIssueRefundNotice(null);
              }}
              className={`w-full text-left bg-surface border rounded-sm p-4 sm:p-5 transition-all hover:border-accent/30 ${
                selectedOrder === order.id ? "border-accent/40 shadow-sm" : order.status === "confirmed" ? "border-amber-200" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{order.id}</p>
                    {order.source === "qr" && <span className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-sm font-medium">QR</span>}
                    {/* QA 2026-08-30 bug 29: a pending refund was only visible
                        once the row was expanded, so an order with a full
                        refund awaiting a decision looked like an ordinary
                        completed sale, and its value still counted toward the
                        artist's headline earnings. One production request had
                        been pending for over four months, including one the
                        artist raised themselves. */}
                    {refundRequests.some(
                      (r) => r.order_id === order.id && r.status === "pending",
                    ) && (
                      <span
                        className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-sm font-medium"
                        title="A refund has been requested for this order and is awaiting a decision. If it is approved, this sale's earnings will be reversed."
                      >
                        REFUND PENDING
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {" · "}{(order.items || []).map((i) => i.title).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  {/* K6: was `order.artist_revenue?.toFixed(2) || order.total?.toFixed(2)`,
                      the one copy of the payout rule with no finite guard, so a
                      NaN rendered "£NaN" instead of falling back. (The doc claims
                      the `||` also made a legitimate £0 show the gross; it does
                      not — `(0).toFixed(2)` is the truthy string "0.00".) */}
                  <p className="text-sm font-medium">&pound;{formatPounds(artistPayoutPounds(order))}</p>
                  <OrderStatusTracker currentStatus={order.status} compact />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </ArtistPortalLayout>
  );
}
