"use client";

import { useState, useEffect } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import OrderStatusTracker from "@/components/OrderStatusTracker";
import { authFetch } from "@/lib/api-client";

interface Order {
  id: string;
  items: { title: string; qty: number; price: number }[];
  shipping: { fullName: string; email: string; phone: string; addressLine1: string; addressLine2?: string; city: string; postcode: string; country: string };
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
  created_at: string;
}

interface RefundRequest {
  id: string;
  order_id: string;
  status: "pending" | "approved" | "rejected";
  type: "full" | "partial";
  amount?: number;
  reason: string;
  requester_type?: string;
  created_at: string;
  resolved_reason?: string;
}

const statusActions: Record<string, { next: string; label: string; color: string }> = {
  confirmed: { next: "processing", label: "Mark as Processing", color: "bg-blue-600 hover:bg-blue-700" },
  processing: { next: "shipped", label: "Mark as Shipped", color: "bg-accent hover:bg-accent-hover" },
  shipped: { next: "delivered", label: "Mark as Delivered", color: "bg-green-600 hover:bg-green-700" },
};

export default function ArtistOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [updating, setUpdating] = useState(false);
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [rejectReasonInput, setRejectReasonInput] = useState("");
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);
  const [refundProcessing, setRefundProcessing] = useState(false);
  const [showIssueRefund, setShowIssueRefund] = useState(false);
  const [issueRefundType, setIssueRefundType] = useState<"full" | "partial">("full");
  const [issueRefundAmount, setIssueRefundAmount] = useState("");
  const [issueRefundReason, setIssueRefundReason] = useState("");

  useEffect(() => {
    authFetch("/api/orders")
      .then((r) => r.json())
      .then((data) => { if (data.orders) setOrders(data.orders); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(orderId: string, newStatus: string) {
    setUpdating(true);
    try {
      const body: Record<string, string> = { orderId, status: newStatus };
      if (newStatus === "shipped" && trackingInput) body.trackingNumber = trackingInput;

      const res = await authFetch("/api/orders", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setOrders((prev) => prev.map((o) =>
          o.id === orderId ? {
            ...o,
            status: newStatus,
            tracking_number: newStatus === "shipped" && trackingInput ? trackingInput : o.tracking_number,
            status_history: [...(o.status_history || []), { status: newStatus, timestamp: new Date().toISOString() }],
          } : o
        ));
        setTrackingInput("");
      }
    } catch (err) {
      console.error("Status update failed:", err);
    }
    setUpdating(false);
  }

  useEffect(() => {
    authFetch("/api/refunds")
      .then((r) => r.json())
      .then((data) => { if (data.requests) setRefundRequests(data.requests); })
      .catch(() => {});
  }, []);

  async function processRefund(refundRequestId: string, action: "approve" | "reject") {
    setRefundProcessing(true);
    try {
      const body: Record<string, string> = { refundRequestId, action };
      if (action === "reject" && rejectReasonInput) body.reason = rejectReasonInput;
      const res = await authFetch("/api/refunds/process", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRefundRequests((prev) =>
          prev.map((r) => r.id === refundRequestId ? { ...r, status: action === "approve" ? "approved" : "rejected", resolved_reason: rejectReasonInput || undefined } as RefundRequest : r)
        );
        setRejectReasonInput("");
        setShowRejectInput(null);
      }
    } catch (err) {
      console.error("Refund processing failed:", err);
    }
    setRefundProcessing(false);
  }

  async function issueProactiveRefund(orderId: string) {
    setRefundProcessing(true);
    try {
      const body: Record<string, unknown> = { orderId, reason: issueRefundReason, type: issueRefundType };
      if (issueRefundType === "partial" && issueRefundAmount) body.amount = parseFloat(issueRefundAmount);
      const reqRes = await authFetch("/api/refunds/request", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        if (reqData.request) {
          const approveRes = await authFetch("/api/refunds/process", {
            method: "POST",
            body: JSON.stringify({ refundRequestId: reqData.request.id, action: "approve" }),
          });
          if (approveRes.ok) {
            setRefundRequests((prev) => [...prev, { ...reqData.request, status: "approved" }]);
          }
        }
      }
      setShowIssueRefund(false);
      setIssueRefundReason("");
      setIssueRefundAmount("");
      setIssueRefundType("full");
    } catch (err) {
      console.error("Issue refund failed:", err);
    }
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
        <div className="bg-surface border border-accent/20 rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Order {selected.id}</h2>
            <button onClick={() => setSelectedOrder(null)} className="text-xs text-muted hover:text-foreground">Close</button>
          </div>

          <OrderStatusTracker currentStatus={selected.status} statusHistory={selected.status_history || []} />

          {/* Status action */}
          {statusActions[selected.status] && (
            <div className="mt-5 p-4 bg-[#FAF8F5] rounded-sm border border-border">
              {statusActions[selected.status].next === "shipped" && (
                <div className="mb-3">
                  <label className="block text-xs text-muted mb-1">Tracking number (optional)</label>
                  <input type="text" value={trackingInput} onChange={(e) => setTrackingInput(e.target.value)} placeholder="e.g. RM123456789GB" className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                </div>
              )}
              <button
                onClick={() => updateStatus(selected.id, statusActions[selected.status].next)}
                disabled={updating}
                className={`px-5 py-2 text-sm font-medium text-white rounded-sm transition-colors disabled:opacity-50 ${statusActions[selected.status].color}`}
              >
                {updating ? "Updating..." : statusActions[selected.status].label}
              </button>
            </div>
          )}

          {/* Items */}
          <div className="mt-6 space-y-2">
            <p className="text-xs text-muted uppercase tracking-wider">Items</p>
            {(selected.items || []).map((item: { title: string; qty: number; price: number }, i: number) => (
              <div key={i} className="flex justify-between text-sm border-b border-border pb-2">
                <span>{item.title} &times; {item.qty}</span>
                <span className="font-medium">&pound;{(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Revenue breakdown */}
          <div className="mt-5 p-4 bg-background rounded-sm border border-border space-y-2">
            <p className="text-xs text-muted uppercase tracking-wider mb-2">Revenue Breakdown</p>
            <div className="flex justify-between text-sm"><span>Sale total</span><span className="font-medium">&pound;{selected.total?.toFixed(2)}</span></div>
            {selected.venue_revenue > 0 && (
              <div className="flex justify-between text-sm text-muted"><span>Venue share ({selected.venue_revenue_share_percent}%)</span><span>-&pound;{selected.venue_revenue.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between text-sm text-muted"><span>Platform fee ({selected.platform_fee_percent}%)</span><span>-&pound;{selected.platform_fee?.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm font-medium pt-2 border-t border-border"><span>Your revenue</span><span className="text-accent">&pound;{selected.artist_revenue?.toFixed(2)}</span></div>
          </div>

          {/* Shipping */}
          <div className="mt-5">
            <p className="text-xs text-muted uppercase tracking-wider mb-2">Ship to</p>
            <p className="text-sm font-medium">{selected.shipping?.fullName}</p>
            <p className="text-sm text-muted">{selected.shipping?.addressLine1}{selected.shipping?.addressLine2 ? `, ${selected.shipping.addressLine2}` : ""}</p>
            <p className="text-sm text-muted">{selected.shipping?.city}, {selected.shipping?.postcode}</p>
          </div>

          {/* Refund management */}
          {(() => {
            const orderRefunds = refundRequests.filter((r) => r.order_id === selected.id);
            const pendingRefunds = orderRefunds.filter((r) => r.status === "pending");
            const pastRefunds = orderRefunds.filter((r) => r.status !== "pending");
            const refundEligible = ["confirmed", "processing", "shipped", "delivered"].includes(selected.status);

            return (
              <div className="mt-5 pt-4 border-t border-border space-y-4">
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
                            disabled={refundProcessing || !issueRefundReason.trim()}
                            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
                          >
                            {refundProcessing ? "Processing..." : "Issue Refund"}
                          </button>
                          <button
                            onClick={() => { setShowIssueRefund(false); setIssueRefundReason(""); setIssueRefundAmount(""); setIssueRefundType("full"); }}
                            className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowIssueRefund(true)}
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
        <div className="bg-surface border border-border rounded-sm px-6 py-12 text-center">
          <p className="text-muted text-sm">No orders yet. When someone buys your work, orders will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedOrder(selectedOrder === order.id ? null : order.id)}
              className={`w-full text-left bg-surface border rounded-sm p-4 sm:p-5 transition-all hover:border-accent/30 ${
                selectedOrder === order.id ? "border-accent/40 shadow-sm" : order.status === "confirmed" ? "border-amber-200" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{order.id}</p>
                    {order.source === "qr" && <span className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-sm font-medium">QR</span>}
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {" · "}{(order.items || []).map((i) => i.title).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">&pound;{order.artist_revenue?.toFixed(2) || order.total?.toFixed(2)}</p>
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
