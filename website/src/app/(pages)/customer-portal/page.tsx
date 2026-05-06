"use client";

import { useMemo, useState, useEffect } from "react";
import CustomerPortalLayout from "@/components/CustomerPortalLayout";
import EmptyState from "@/components/EmptyState";
import OrderStatusTracker from "@/components/OrderStatusTracker";
import { authFetch } from "@/lib/api-client";
import { detectCarrierUrl } from "@/lib/carrier-tracking";
import { formatCurrency } from "@/lib/format-currency";
import { isRefundEligible } from "@/lib/order-status-labels";
import { useUrlState } from "@/lib/use-url-state";

function safeArray(val: unknown): { title: string; qty: number; price: number; artistSlug?: string }[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
}

interface Order {
  id: string;
  order_number?: string | null;
  items: { title: string; qty: number; price: number; artistSlug?: string }[];
  subtotal?: number | null;
  shipping_cost?: number | null;
  tax_total?: number | null;
  total: number;
  currency?: string | null;
  status: string;
  status_history: { status: string; timestamp: string }[];
  tracking_number?: string;
  shipping: { fullName: string; addressLine1: string; city: string; postcode: string };
  created_at: string;
  delivered_at?: string | null;
  artist_slug?: string;
  venue_slug?: string;
}

interface RefundRequest {
  id: string;
  order_id: string;
  status: "pending" | "approved" | "rejected";
  type: "full" | "partial";
  amount?: number;
  reason: string;
  created_at: string;
}

type StatusFilter = "all" | "active" | "delivered" | "cancelled";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

const TERMINAL_NON_DELIVERED = new Set(["cancelled", "refunded", "disputed"]);

export default function CustomerPortalPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useUrlState<string>("order", "");
  const [statusFilter, setStatusFilter] = useUrlState<StatusFilter>("status", "all");
  const [fromDate, setFromDate] = useUrlState<string>("from", "");
  const [toDate, setToDate] = useUrlState<string>("to", "");
  const [query, setQuery] = useUrlState<string>("q", "");
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundSuccess, setRefundSuccess] = useState(false);
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);

  useEffect(() => {
    authFetch("/api/orders")
      .then((r) => r.json())
      .then((data) => { if (data.orders) setOrders(data.orders); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    authFetch("/api/refunds")
      .then((r) => r.json())
      .then((data) => { if (data.requests) setRefundRequests(data.requests); })
      .catch(() => {});
  }, []);

  async function submitRefundRequest(orderId: string) {
    setRefundSubmitting(true);
    try {
      const body: Record<string, unknown> = { orderId, reason: refundReason, type: refundType };
      if (refundType === "partial" && refundAmount) body.amount = parseFloat(refundAmount);
      const res = await authFetch("/api/refunds/request", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.request) setRefundRequests((prev) => [...prev, data.request]);
        setRefundSuccess(true);
        setShowRefundForm(false);
        setRefundReason("");
        setRefundAmount("");
        setRefundType("full");
      }
    } catch (err) {
      console.error("Refund request failed:", err);
    }
    setRefundSubmitting(false);
  }

  const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromMs = fromDate ? new Date(fromDate).getTime() : null;
    // Inclusive end-of-day so a "to" of 6 May matches an order placed 6 May 23:59.
    const toMs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return orders.filter((o) => {
      if (statusFilter === "active" && (TERMINAL_NON_DELIVERED.has(o.status) || o.status === "delivered")) return false;
      if (statusFilter === "delivered" && o.status !== "delivered") return false;
      if (statusFilter === "cancelled" && !TERMINAL_NON_DELIVERED.has(o.status)) return false;
      if (fromMs != null && new Date(o.created_at).getTime() < fromMs) return false;
      if (toMs != null && new Date(o.created_at).getTime() > toMs) return false;
      if (q) {
        const haystack = [
          o.order_number || "",
          o.id,
          ...safeArray(o.items).map((it) => it.title),
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, fromDate, toDate, query]);

  const rawSelected = orders.find((o) => o.id === selectedOrderId);
  // Ensure items is always an array and status_history is parsed
  const selected = rawSelected ? {
    ...rawSelected,
    items: Array.isArray(rawSelected.items) ? rawSelected.items : (typeof rawSelected.items === "string" ? (() => { try { return JSON.parse(rawSelected.items); } catch { return []; } })() : []),
    status_history: Array.isArray(rawSelected.status_history) ? rawSelected.status_history : (typeof rawSelected.status_history === "string" ? (() => { try { return JSON.parse(rawSelected.status_history); } catch { return []; } })() : []),
    total: rawSelected.total || 0,
  } : null;

  return (
    <CustomerPortalLayout>
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl">My Orders</h1>
        <p className="text-sm text-muted mt-1">Track your purchases and delivery status</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">Total Orders</p>
          <p className="text-2xl font-serif">{orders.length}</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">Total Spent</p>
          <p className="text-2xl font-serif">&pound;{totalSpent.toFixed(2)}</p>
        </div>
      </div>

      {/* Order detail overlay */}
      {selected && (
        <div className="bg-surface border border-accent/20 rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Order {selected.order_number || selected.id}</h2>
            <button onClick={() => setSelectedOrderId("")} className="text-xs text-muted hover:text-foreground">Close</button>
          </div>

          <OrderStatusTracker
            currentStatus={selected.status}
            statusHistory={selected.status_history || []}
          />

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

          <div className="mt-6 space-y-3">
            <p className="text-xs text-muted uppercase tracking-wider">Items</p>
            {safeArray(selected.items).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2">
                <span className="text-foreground">{item.title} &times; {item.qty}</span>
                <span className="text-foreground font-medium">{formatCurrency(item.price * item.qty, selected.currency)}</span>
              </div>
            ))}
            <ul className="space-y-1 pt-2">
              {selected.subtotal != null && (
                <li className="flex justify-between text-sm">
                  <span className="text-muted">Subtotal</span>
                  <span className="text-foreground">{formatCurrency(selected.subtotal, selected.currency)}</span>
                </li>
              )}
              {selected.shipping_cost != null && (
                <li className="flex justify-between text-sm">
                  <span className="text-muted">Shipping</span>
                  <span className="text-foreground">
                    {selected.shipping_cost > 0 ? formatCurrency(selected.shipping_cost, selected.currency) : "Included"}
                  </span>
                </li>
              )}
              {selected.tax_total != null && selected.tax_total > 0 && (
                <li className="flex justify-between text-sm">
                  <span className="text-muted">VAT</span>
                  <span className="text-foreground">{formatCurrency(selected.tax_total, selected.currency)}</span>
                </li>
              )}
              <li className="flex items-center justify-between text-base font-medium border-t border-border pt-2 mt-2">
                <span>Total</span>
                <span>{formatCurrency(selected.total, selected.currency)}</span>
              </li>
            </ul>
          </div>

          <div className="mt-6">
            <p className="text-xs text-muted uppercase tracking-wider mb-2">Shipping to</p>
            <p className="text-sm text-foreground">{selected.shipping?.fullName}</p>
            <p className="text-sm text-muted">{selected.shipping?.addressLine1}, {selected.shipping?.city} {selected.shipping?.postcode}</p>
          </div>

          {/* Refund section */}
          <div className="mt-6 pt-4 border-t border-border">
            {(() => {
              const orderRefund = refundRequests.find((r) => r.order_id === selected.id);
              const refundEligible = isRefundEligible(selected);

              if (refundSuccess && orderRefund?.order_id === selected.id) {
                return (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-sm px-3 py-2">
                    Refund request submitted. The artist will review your request.
                  </p>
                );
              }

              if (orderRefund && orderRefund.status === "pending") {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-medium rounded-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Refund requested: pending review
                  </span>
                );
              }

              if (orderRefund && orderRefund.status === "approved") {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-sm font-medium rounded-sm">
                    Refund approved
                  </span>
                );
              }

              if (orderRefund && orderRefund.status === "rejected") {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-sm font-medium rounded-sm">
                    Refund request declined
                  </span>
                );
              }

              if (!refundEligible) return null;

              if (showRefundForm) {
                return (
                  <div className="space-y-4">
                    <p className="text-xs text-muted uppercase tracking-wider">Request a Refund</p>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="refundType"
                          checked={refundType === "full"}
                          onChange={() => setRefundType("full")}
                          className="accent-accent"
                        />
                        Full refund
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="refundType"
                          checked={refundType === "partial"}
                          onChange={() => setRefundType("partial")}
                          className="accent-accent"
                        />
                        Partial refund
                      </label>
                    </div>
                    {refundType === "partial" && (
                      <div>
                        <label className="block text-xs text-muted mb-1">Refund amount (&pound;)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={selected.total}
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-muted mb-1">Reason</label>
                      <textarea
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        placeholder="Please describe why you'd like a refund"
                        rows={3}
                        className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50 resize-none"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => submitRefundRequest(selected.id)}
                        disabled={refundSubmitting || !refundReason.trim()}
                        className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
                      >
                        {refundSubmitting ? "Submitting..." : "Submit Refund Request"}
                      </button>
                      <button
                        onClick={() => { setShowRefundForm(false); setRefundReason(""); setRefundAmount(""); setRefundType("full"); }}
                        className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  onClick={() => { setShowRefundForm(true); setRefundSuccess(false); }}
                  className="text-sm text-accent hover:text-accent-hover transition-colors"
                >
                  Request Refund
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Order list */}
      {loading ? (
        <p className="text-muted text-sm py-12 text-center">Loading orders...</p>
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          hint="Browse the marketplace to place your first order."
          cta={{ label: "Discover art", href: "/browse" }}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="space-y-3 mb-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter orders by status">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={statusFilter === f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    statusFilter === f.key
                      ? "bg-accent text-white border-accent"
                      : "bg-surface text-foreground border-border hover:border-accent/50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-1.5 text-xs text-muted">
                From
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-surface border border-border rounded-sm px-2 py-1 text-sm text-foreground"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                To
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-surface border border-border rounded-sm px-2 py-1 text-sm text-foreground"
                />
              </label>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by order number or work title"
                className="flex-1 min-w-[12rem] bg-surface border border-border rounded-sm px-3 py-1.5 text-sm text-foreground placeholder:text-muted"
                aria-label="Search orders"
              />
              {(statusFilter !== "all" || fromDate || toDate || query) && (
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    setFromDate("");
                    setToDate("");
                    setQuery("");
                  }}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <p className="text-muted text-sm py-12 text-center">No orders match these filters.</p>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrderId(selectedOrderId === order.id ? "" : order.id)}
                  className={`w-full text-left bg-surface border rounded-sm p-4 sm:p-5 transition-all hover:border-accent/30 ${selectedOrderId === order.id ? "border-accent/40 shadow-sm" : "border-border"}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{order.order_number || order.id}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}{safeArray(order.items).length} item{safeArray(order.items).length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(order.total, order.currency)}</p>
                      <OrderStatusTracker currentStatus={order.status} compact />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </CustomerPortalLayout>
  );
}
