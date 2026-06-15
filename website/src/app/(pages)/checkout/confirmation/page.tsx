"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { labelForCountry } from "@/lib/iso-countries";
import { clearQrContext } from "@/lib/qr-context";

// Soft abstract painting underlay for the celebration moment. Sits at
// low opacity so the order details still read cleanly, with a top
// gradient that fades into the page background so cards float on the
// brushwork without fighting it.
function ConfirmationBackdrop() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <Image
        src="https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=1920&h=1080&fit=crop&crop=center"
        alt=""
        fill
        priority
        className="object-cover opacity-30"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/75 to-background" />
    </div>
  );
}

interface SavedShipping {
  fullName?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  notes?: string;
}

interface StripeOrder {
  id: string;
  status: string;
  amountTotal: number;
  customerEmail: string;
  metadata: Record<string, string>;
  cart: unknown[];
  shipping: SavedShipping | null;
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
  const { user, userType } = useAuth();
  // Where the "View My Orders" CTA lands depends on who's buying:
  // venues go to their own venue-portal orders (where placement
  // sales and purchases sit as separate tabs), artists to the artist
  // orders page, everyone else to the customer portal.
  const ordersHref = userType === "venue"
    ? "/venue-portal/orders?tab=purchases"
    : userType === "artist"
      ? "/artist-portal/orders"
      : "/customer-portal";
  const [order, setOrder] = useState<StripeOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Clear cart on successful checkout
    clearCart();
    // Drop the QR attribution once the order is in. Otherwise a
    // subsequent unrelated purchase from the same browser would keep
    // crediting the original venue right up to the 24h TTL.
    clearQrContext();

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
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
          Continue browsing
        </Link>
        {/* Discover more strip */}
        <div data-testid="discover-strip" className="mt-8 border-t border-border pt-6">
          <p className="text-xs text-muted uppercase tracking-widest mb-3">Discover more</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/browse" className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors">Browse art</Link>
            <Link href="/spaces" className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors">Explore spaces</Link>
            <Link href="/browse/collections" className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors">Featured collections</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <ConfirmationBackdrop />
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
      {/* Success icon */}
      <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

      {/* Delivery details — pulled from cart_sessions (Plan B Task 6) */}
      {order?.shipping && (
        <div className="bg-surface border border-border rounded-sm p-5 mb-6 text-left">
          <h2 className="text-sm font-medium mb-3">Delivery Address</h2>
          <p className="text-sm text-muted">
            {order.shipping.fullName}<br />
            {order.shipping.addressLine1}<br />
            {order.shipping.addressLine2 && <>{order.shipping.addressLine2}<br /></>}
            {order.shipping.city}, {order.shipping.postcode}<br />
            {labelForCountry(order.shipping.country || "")}
          </p>
        </div>
      )}

      {/* Artist fulfilment */}
      <div className="bg-accent/5 border border-accent/20 rounded-sm p-4 mb-8 text-left flex gap-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden="true">
          <rect x="1" y="3" width="15" height="13" rx="2" />
          <path d="M16 8h4l3 3v5a2 2 0 01-2 2h-1" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
        <p className="text-sm text-foreground/70">
          Your order will be packed and shipped directly by the artist. Dispatch within 5 to 7 working days.
          {order?.customerEmail && <> You&apos;ll receive updates at <strong>{order.customerEmail}</strong>.</>}
        </p>
      </div>

      {/* Sign up prompt for guests */}
      {!user && (
        <div className="bg-surface border border-border rounded-sm p-5 mb-8 text-left">
          <h2 className="text-sm font-medium mb-2">Create an account to track your order</h2>
          <p className="text-xs text-muted mb-4">Sign up to view order status, get delivery updates, and manage future purchases.</p>
          <Link
            href="/signup/customer"
            className="inline-flex items-center justify-center px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
          >
            Create Account
          </Link>
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/browse"
          className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-background transition-colors"
        >
          Continue browsing
        </Link>
        {user && (
          <Link
            href={ordersHref}
            className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
          >
            View My Orders
          </Link>
        )}
      </div>

      {/* Discover more strip */}
      <div data-testid="discover-strip" className="mt-12 border-t border-border pt-8">
        <p className="text-xs text-muted uppercase tracking-widest mb-4">Discover more</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/browse"
            className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors"
          >
            Browse art
          </Link>
          <Link
            href="/spaces"
            className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors"
          >
            Explore spaces
          </Link>
          <Link
            href="/browse/collections"
            className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors"
          >
            Featured collections
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
}
