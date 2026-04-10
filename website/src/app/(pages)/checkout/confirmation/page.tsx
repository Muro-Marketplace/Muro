"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";

interface StripeOrder {
  id: string;
  status: string;
  amountTotal: number;
  customerEmail: string;
  metadata: Record<string, string>;
  lineItems: { name: string; quantity: number; amount: number }[];
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted text-sm">Loading...</p></div>}>
      <ConfirmationContent />
    </Suspense>
  );
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { clearCart } = useCart();
  const [order, setOrder] = useState<StripeOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Clear cart on successful checkout
    clearCart();

    async function fetchSession() {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/checkout/session?id=${sessionId}`);
        const data = await res.json();
        if (data.id) setOrder(data);
      } catch (err) {
        console.error("Failed to fetch session:", err);
      }
      setLoading(false);
    }

    fetchSession();
  }, [sessionId, clearCart]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Loading order details...</p>
      </div>
    );
  }

  if (!order && !sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-serif mb-3">No order found</h1>
          <p className="text-sm text-muted mb-6">It looks like you haven&apos;t placed an order yet.</p>
          <Link
            href="/browse"
            className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
          >
            Discover Art
          </Link>
        </div>
      </div>
    );
  }

  // Session ID provided but order fetch failed
  if (!order && sessionId) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-3xl font-serif mb-2">Thank You!</h1>
        <p className="text-muted mb-4">Your payment was received successfully.</p>
        <p className="text-sm text-muted/70 mb-8">
          We couldn&apos;t load the full order details right now, but your order is confirmed. You&apos;ll receive a confirmation email shortly.
        </p>
        <Link
          href="/browse"
          className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-background transition-colors"
        >
          Continue Browsing
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-center">
      {/* Success icon */}
      <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h1 className="text-3xl font-serif mb-2">Order Confirmed</h1>
      <p className="text-muted mb-1">Thank you for your order.</p>
      {order && (
        <p className="text-sm text-muted/70 mb-8">Payment of &pound;{order.amountTotal.toFixed(2)} received</p>
      )}

      {/* Items */}
      {order?.lineItems && (
        <div className="bg-surface border border-border rounded-sm p-5 mb-6 text-left">
          <h2 className="text-sm font-medium mb-4">Items</h2>
          <div className="space-y-3">
            {order.lineItems.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.name} {item.quantity > 1 ? `x${item.quantity}` : ""}</span>
                <span className="font-medium">&pound;{item.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-4 pt-3">
            <div className="flex justify-between text-sm font-medium">
              <span>Total</span>
              <span>&pound;{order.amountTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Delivery details */}
      {order?.metadata && (
        <div className="bg-surface border border-border rounded-sm p-5 mb-6 text-left">
          <h2 className="text-sm font-medium mb-3">Delivery Address</h2>
          <p className="text-sm text-muted">
            {order.metadata.shipping_name}<br />
            {order.metadata.shipping_address1}<br />
            {order.metadata.shipping_address2 && <>{order.metadata.shipping_address2}<br /></>}
            {order.metadata.shipping_city}, {order.metadata.shipping_postcode}<br />
            {order.metadata.shipping_country}
          </p>
        </div>
      )}

      {/* Artist fulfilment */}
      <div className="bg-accent/5 border border-accent/20 rounded-sm p-4 mb-8 text-left flex gap-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
          <rect x="1" y="3" width="15" height="13" rx="2" />
          <path d="M16 8h4l3 3v5a2 2 0 01-2 2h-1" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
        <p className="text-sm text-foreground/70">
          Your order will be packed and shipped directly by the artist. Expect delivery within 5–10 working days.
          {order?.customerEmail && <> You&apos;ll receive updates at <strong>{order.customerEmail}</strong>.</>}
        </p>
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/browse"
          className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-background transition-colors"
        >
          Continue Browsing
        </Link>
      </div>
    </div>
  );
}
