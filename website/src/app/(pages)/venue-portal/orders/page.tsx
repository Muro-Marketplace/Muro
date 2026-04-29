"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import OrderStatusTracker from "@/components/OrderStatusTracker";
import { authFetch } from "@/lib/api-client";

interface Order {
  id: string;
  items: { title: string; qty: number; price: number; artistSlug?: string }[];
  shipping: { fullName: string; addressLine1: string; city: string; postcode: string };
  total: number;
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
    <Suspense fallback={<VenuePortalLayout><p className="text-muted text-sm py-12 text-center">Loading orders...</p></VenuePortalLayout>}>
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
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [venueSlug, setVenueSlug] = useState<string>("");
  const [tab, setTab] = useState<OrderTab>(initialTab);

  useEffect(() => {
    authFetch("/api/orders")
      .then((r) => r.json())
      .then((data) => {
        if (data.orders) setOrders(data.orders);
        if (data.userEmail) setUserEmail(data.userEmail);
        if (data.venueSlug) setVenueSlug(data.venueSlug);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    <VenuePortalLayout>
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

          {selected.tracking_number && (
            <p className="text-sm text-muted mt-4">Tracking: <span className="text-foreground font-medium">{selected.tracking_number}</span></p>
          )}

          <div className="mt-6 space-y-2">
            <p className="text-xs text-muted uppercase tracking-wider">Items</p>
            {(selected.items || []).map((item, i) => {
              const qty = item?.qty ?? 1;
              const price = typeof item?.price === "number" ? item.price : 0;
              return (
                <div key={i} className="flex justify-between text-sm border-b border-border pb-2">
                  <span>{item?.title || "Item"} &times; {qty}</span>
                  <span className="font-medium">&pound;{(price * qty).toFixed(2)}</span>
                </div>
              );
            })}
          </div>

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
      ) : visibleOrders.length === 0 ? (
        <div className="bg-surface border border-border rounded-sm px-6 py-12 text-center">
          <p className="text-muted text-sm">
            {tab === "sales"
              ? "No placement sales yet. Sales attributed to your venue will appear here."
              : "You haven't purchased anything yet. Art you buy will appear here."}
          </p>
        </div>
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
                    {" · "}{(order.items || []).map((i) => i.title).join(", ")}
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
    </VenuePortalLayout>
  );
}
