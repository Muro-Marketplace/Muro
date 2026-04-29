// Public order tracking page (#3). Lets guest buyers, who chose to
// check out without an account, look up their order using just the
// email they entered at checkout and the order ID from their receipt.
// No login required. The API enforces email-match server-side so the
// orderId alone isn't enough to view someone else's order.

"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

interface OrderItem {
  title?: string;
  qty?: number;
  price?: number;
  artistSlug?: string;
}
interface OrderHistoryEntry {
  status?: string;
  at?: string;
  by?: string;
  note?: string;
}
interface TrackedOrder {
  id: string;
  status: string;
  placedAt: string | null;
  buyerName: string | null;
  artistSlug: string | null;
  total: number | null;
  shipping: number | null;
  currency: string;
  items: OrderItem[];
  history: OrderHistoryEntry[];
  shippedAt: string | null;
  deliveredAt: string | null;
  tracking: { number: string; url: string | null } | null;
}

const STATUS_COPY: Record<string, { label: string; tone: "neutral" | "good" | "warn" }> = {
  confirmed: { label: "Order placed", tone: "neutral" },
  artist_notified: { label: "Artist notified", tone: "neutral" },
  awaiting_dispatch: { label: "Awaiting dispatch", tone: "neutral" },
  shipped: { label: "Shipped", tone: "good" },
  delivered: { label: "Delivered", tone: "good" },
  cancelled: { label: "Cancelled", tone: "warn" },
  refunded: { label: "Refunded", tone: "warn" },
  disputed: { label: "Disputed", tone: "warn" },
};

function fmtMoney(amount: number | null, currency: string): string {
  if (amount == null) return "–";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(amount);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function OrderTrackPage() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const res = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderId.trim(), email: email.trim() }),
      });
      const data: { order?: TrackedOrder; error?: string } = await res.json();
      if (!res.ok || !data.order) {
        setError(data.error || "We couldn't find an order with that ID + email. Double-check both and try again.");
        return;
      }
      setOrder(data.order);
    } catch {
      setError("Network error, please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  const statusInfo = order ? STATUS_COPY[order.status] || { label: order.status, tone: "neutral" as const } : null;
  const toneClass = (tone: "neutral" | "good" | "warn") =>
    tone === "good"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-surface text-foreground border-border";

  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[800px] mx-auto px-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent mb-3">
            Order tracking
          </p>
          <h1 className="text-3xl lg:text-4xl font-serif text-foreground mb-4 leading-tight">
            Track your order
          </h1>
          <p className="text-muted leading-relaxed mb-10">
            Enter the order ID from your receipt email plus the email address
            you used at checkout. Both have to match, we won't show order
            details with the order ID alone.
          </p>

          <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-sm p-6 space-y-4 mb-8">
            <div>
              <label htmlFor="orderId" className="block text-xs font-medium uppercase tracking-widest text-muted mb-2">
                Order ID
              </label>
              <input
                id="orderId"
                type="text"
                required
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="e.g. ord_2604a8…"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-xs font-medium uppercase tracking-widest text-muted mb-2">
                Email used at checkout
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50"
              />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-60"
            >
              {loading ? "Looking up…" : "Track order"}
            </button>
          </form>

          {order && statusInfo && (
            <div className="bg-surface border border-border rounded-sm p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
                <div>
                  <p className="text-xs text-muted uppercase tracking-widest mb-1">Order</p>
                  <p className="text-base font-medium text-foreground">{order.id}</p>
                  {order.placedAt && (
                    <p className="text-xs text-muted mt-0.5">Placed {fmtDate(order.placedAt)}</p>
                  )}
                </div>
                <span className={`inline-flex items-center px-3 py-1 text-xs font-medium border rounded-full ${toneClass(statusInfo.tone)}`}>
                  {statusInfo.label}
                </span>
              </div>

              {order.items.length > 0 && (
                <div className="border-t border-border pt-4 mb-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Items</p>
                  <ul className="space-y-2">
                    {order.items.map((item, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-foreground">
                          {item.title || "Artwork"}
                          {item.qty && item.qty > 1 ? ` × ${item.qty}` : ""}
                        </span>
                        <span className="text-muted shrink-0">
                          {fmtMoney((item.price || 0) * (item.qty || 1), order.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-border pt-4 mb-5 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted uppercase tracking-widest mb-1">Total</p>
                  <p className="text-foreground font-medium">{fmtMoney(order.total, order.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase tracking-widest mb-1">Shipping</p>
                  <p className="text-foreground font-medium">{fmtMoney(order.shipping, order.currency)}</p>
                </div>
              </div>

              {order.tracking && (
                <div className="border-t border-border pt-4 mb-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Tracking</p>
                  <p className="text-sm text-foreground">
                    Tracking number: <span className="font-medium">{order.tracking.number}</span>
                  </p>
                  {order.tracking.url && (
                    <a
                      href={order.tracking.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:text-accent-hover transition-colors"
                    >
                      Open tracking →
                    </a>
                  )}
                </div>
              )}

              {order.history.length > 0 && (
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Updates</p>
                  <ol className="space-y-2.5">
                    {order.history.map((h, i) => (
                      <li key={i} className="text-sm">
                        <p className="text-foreground">
                          {STATUS_COPY[h.status || ""]?.label || h.status}
                        </p>
                        {h.at && <p className="text-xs text-muted">{fmtDate(h.at)}</p>}
                        {h.note && <p className="text-xs text-muted/80 mt-0.5">{h.note}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="border-t border-border pt-5 mt-5 text-sm text-muted">
                Need to change something? Reply to your order receipt or contact{" "}
                <Link href="/contact" className="text-accent hover:text-accent-hover">
                  our support team
                </Link>
                .
              </div>
            </div>
          )}

          {!order && !error && (
            <p className="text-xs text-muted">
              Don't have an order ID? It's the alphanumeric ID at the top of
              your receipt email. If you can't find your receipt, contact{" "}
              <Link href="/contact" className="text-accent hover:text-accent-hover">
                our support team
              </Link>
              .
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
