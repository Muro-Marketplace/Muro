"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import LoadErrorState from "@/components/LoadErrorState";
import OrderStatusTracker from "@/components/OrderStatusTracker";
import { authFetch } from "@/lib/api-client";
import { detectCarrierUrl } from "@/lib/carrier-tracking";
import { orderItemsSubtotal, readOrderItems, type RawOrderItem } from "@/lib/order-items";

interface Order {
  id: string;
  /** Either shape: the cart's {qty, price} in pounds, or the enriched
   *  {quantity, lineTotal} in pence that the Stripe webhook overwrites the
   *  column with. Read it through lib/order-items, never field by field. */
  items: RawOrderItem[];
  shipping: { fullName: string; addressLine1: string; city: string; postcode: string };
  total: number;
  /** Server-provided shipping cost when available. Older orders may
   *  not carry this; the UI derives it from `total - subtotal` as a
   *  fallback so the breakdown still adds up. */
  shipping_amount?: number;
  shipping_cost?: number;
  venue_revenue: number;
  venue_revenue_share_percent: number;
  artist_slug?: string;
  venue_slug?: string;
  buyer_email?: string;
  status: string;
  status_history: { status: string; timestamp: string }[];
  tracking_number?: string;
  source?: string;
  created_at: string;
}

type OrderTab = "sales" | "purchases";

export default function VenueOrdersPage() {
  return (
    <Suspense fallback={<><p className="text-muted text-sm py-12 text-center">Loading orders...</p></>}>
      <VenueOrdersContent />
    </Suspense>
  );
}

function VenueOrdersContent() {
  const searchParams = useSearchParams();
  // After a venue completes checkout the confirmation page sends them
  // here with ?tab=purchases, since the relevant order is the one
  // they just placed (lives in "My orders"). Any other entry
  // defaults to the sales tab.
  const initialTab: OrderTab = searchParams?.get("tab") === "purchases" ? "purchases" : "sales";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // LA-C036: a failed request is not an empty order book.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [venueSlug, setVenueSlug] = useState<string>("");
  const [tab, setTab] = useState<OrderTab>(initialTab);

  const loadOrders = useCallback(() => {
    authFetch("/api/orders")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `orders load failed (${r.status})`);
        return data;
      })
      .then((data) => {
        if (data.orders) setOrders(data.orders);
        if (data.userEmail) setUserEmail(data.userEmail);
        if (data.venueSlug) setVenueSlug(data.venueSlug);
        setLoadError(null);
      })
      .catch(() => setLoadError("Could not load your orders. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  function retryLoad() {
    setLoading(true);
    setLoadError(null);
    loadOrders();
  }

  // Classify each order: placement-driven sale (venue-attributed revenue)
  // vs a purchase the venue itself made. Legacy orders without venue_slug
  // fall back to venue_revenue > 0 as the signal.
  const salesOrders = orders.filter((o) =>
    (venueSlug && o.venue_slug === venueSlug) || (o.venue_revenue || 0) > 0
  );
  const purchaseOrders = orders.filter((o) =>
    userEmail && o.buyer_email && o.buyer_email === userEmail
  );
  const visibleOrders = tab === "sales" ? salesOrders : purchaseOrders;

  const totalRevenue = salesOrders.reduce((sum, o) => sum + (o.venue_revenue || 0), 0);
  const totalPurchases = purchaseOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const selected = orders.find((o) => o.id === selectedOrder);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl">Orders</h1>
        <p className="text-sm text-muted mt-1">Sales from your venue and your purchases</p>
      </div>

      {/* Stats, split into venue sales (revenue share from placements)
          vs the venue's own purchases so venues can see both sides of
          their ledger at a glance. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">Placement sales</p>
          <p className="text-2xl font-serif">{salesOrders.length}</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">Revenue earned</p>
          <p className="text-2xl font-serif text-accent">&pound;{totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">Your purchases</p>
          <p className="text-2xl font-serif">{purchaseOrders.length}</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">Spent on art</p>
          <p className="text-2xl font-serif">&pound;{totalPurchases.toFixed(2)}</p>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 mb-5 border-b border-border">
        <button
          onClick={() => { setTab("sales"); setSelectedOrder(null); }}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "sales"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Placement sales ({salesOrders.length})
        </button>
        <button
          onClick={() => { setTab("purchases"); setSelectedOrder(null); }}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "purchases"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          My orders ({purchaseOrders.length})
        </button>
      </div>

      {/* Order detail */}
      {selected && (
        <div className="bg-surface border border-accent/20 rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Order {selected.id}</h2>
            <button onClick={() => setSelectedOrder(null)} className="text-xs text-muted hover:text-foreground">Close</button>
          </div>

          <OrderStatusTracker currentStatus={selected.status || "confirmed"} statusHistory={selected.status_history || []} />

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

          {(() => {
            // Compute the order breakdown so items + shipping = total
            // is visible. QA flagged that the items list summed to a
            // different number than `total` (e.g. items £150 vs total
            // £169.90) with no shipping line in between — so the user
            // couldn't reconcile the maths. We always derive shipping
            // from the residual when the server hasn't supplied an
            // explicit value, that keeps the columns honest even on
            // legacy orders.
            //
            // Both the lines and the subtotal go through lib/order-items.
            // Reading `price * qty` here zeroed every enriched row, which is
            // most of production, so this block told a venue its sale was
            // £0.00 of art and the whole total was postage.
            const items = readOrderItems(selected.items);
            const subtotal = orderItemsSubtotal(selected.items);
            const total = typeof selected.total === "number" ? selected.total : 0;
            const serverShipping =
              typeof selected.shipping_amount === "number"
                ? selected.shipping_amount
                : typeof selected.shipping_cost === "number"
                  ? selected.shipping_cost
                  : null;
            const derivedShipping = total - subtotal;
            const shipping = serverShipping ?? (Math.abs(derivedShipping) > 0.005 ? derivedShipping : 0);
            const showShippingRow = Math.abs(shipping) > 0.005;
            return (
              <div className="mt-6 space-y-2">
                <p className="text-xs text-muted uppercase tracking-wider">Items</p>
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-border pb-2">
                    <span>{item.title} &times; {item.quantity}</span>
                    <span className="font-medium">&pound;{item.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
                {items.length > 0 && showShippingRow && (
                  <>
                    <div className="flex justify-between text-sm pt-1">
                      <span className="text-muted">Subtotal</span>
                      <span className="text-muted tabular-nums">&pound;{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">
                        Shipping
                        {serverShipping == null && (
                          <span className="ml-1 text-[10px] text-muted/70">(derived)</span>
                        )}
                      </span>
                      <span className="text-muted tabular-nums">&pound;{shipping.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-border">
                  <span className="font-medium">Total</span>
                  <span className="font-medium tabular-nums">&pound;{total.toFixed(2)}</span>
                </div>
              </div>
            );
          })()}

          {(() => {
            const venueRev = typeof selected.venue_revenue === "number" ? selected.venue_revenue : 0;
            const total = typeof selected.total === "number" ? selected.total : 0;
            const sharePct = typeof selected.venue_revenue_share_percent === "number"
              ? selected.venue_revenue_share_percent
              : 0;
            // This block is meaningful on the placement-sales side
            // only. For orders the venue made themselves it stays
            // hidden since venueRev is 0.
            if (venueRev <= 0) return null;
            return (
              <div className="mt-5 p-4 bg-accent/5 rounded-sm border border-accent/20 space-y-2">
                <p className="text-xs text-accent uppercase tracking-wider mb-2">Your Revenue</p>
                <div className="flex justify-between text-sm"><span>Sale total</span><span>&pound;{total.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span>Your share ({sharePct}%)</span><span className="font-medium text-accent">&pound;{venueRev.toFixed(2)}</span></div>
              </div>
            );
          })()}

          {tab === "purchases" && (
            <div className="mt-5 p-4 bg-surface rounded-sm border border-border space-y-2">
              <p className="text-xs text-muted uppercase tracking-wider mb-2">You paid</p>
              <div className="flex justify-between text-sm"><span>Total</span><span className="font-medium">&pound;{(typeof selected.total === "number" ? selected.total : 0).toFixed(2)}</span></div>
              {selected.shipping?.fullName && (
                <p className="text-[11px] text-muted mt-2">
                  Ship to {selected.shipping.fullName}
                  {selected.shipping.city ? `, ${selected.shipping.city}` : ""}
                  {selected.shipping.postcode ? `, ${selected.shipping.postcode}` : ""}
                </p>
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-border">
            <Link href={`/contact?subject=Order ${selected.id}`} className="text-sm text-accent hover:text-accent-hover transition-colors">
              Something wrong? Contact us
            </Link>
          </div>
        </div>
      )}

      {/* Order list */}
      {loading ? (
        <p className="text-muted text-sm py-12 text-center">Loading orders...</p>
      ) : loadError ? (
        <LoadErrorState message={loadError} onRetry={retryLoad} />
      ) : visibleOrders.length === 0 ? (
        <EmptyState
          title={tab === "sales" ? "No placement sales yet" : "Nothing purchased yet"}
          hint={
            tab === "sales"
              ? "Sales attributed to your venue will appear here."
              : "Art you buy will appear here."
          }
          cta={{ label: "Discover art", href: "/browse" }}
        />
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedOrder(selectedOrder === order.id ? null : order.id)}
              className={`w-full text-left bg-surface border rounded-sm p-4 sm:p-5 transition-all hover:border-accent/30 ${selectedOrder === order.id ? "border-accent/40 shadow-sm" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{order.id}</p>
                    {order.source === "qr" && <span className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-sm font-medium">QR Sale</span>}
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {new Date(order.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {" · "}{readOrderItems(order.items).map((i) => i.title).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  {typeof order.venue_revenue === "number" && order.venue_revenue > 0 && (
                    <p className="text-sm font-medium text-accent">&pound;{order.venue_revenue.toFixed(2)}</p>
                  )}
                  {tab === "purchases" && typeof order.total === "number" && (
                    <p className="text-sm font-medium text-foreground">&pound;{order.total.toFixed(2)}</p>
                  )}
                  <OrderStatusTracker currentStatus={order.status} compact />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
