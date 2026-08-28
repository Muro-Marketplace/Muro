"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
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

// Mirrors GET /api/checkout/session exactly. customerEmail, metadata, cart and
// shipping were removed from that response for E39: it is unauthenticated, so
// anyone holding a session id could read the buyer's name, address and email.
interface StripeOrder {
  id: string;
  /** Stripe's payment_status: "paid" | "unpaid" | "no_payment_required". */
  status: string;
  amountTotal: number;
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
  // B20/B21: this page used to clear the cart on mount and assert
  // "payment received" without ever reading the session's payment_status,
  // so an unpaid or abandoned session (or a bogus session id) still got a
  // money-received claim and an emptied cart. The phase now follows what
  // Stripe actually reports:
  //   paid       -> confirmed receipt; the ONLY branch that clears the
  //                 cart and drops the QR attribution
  //   processing -> session found but payment not confirmed, hedged copy
  //   error      -> the lookup failed, no claims either way
  //   no_session -> no session id in the URL at all
  // no_session is derivable at first render (useSearchParams is synchronous),
  // so it seeds the state rather than being set inside the effect.
  const [phase, setPhase] = useState<
    "loading" | "no_session" | "error" | "processing" | "paid"
  >(() => (sessionId ? "loading" : "no_session"));

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    async function fetchSession() {
      try {
        const res = await fetch(`/api/checkout/session?id=${sessionId}`);
        if (!res.ok) {
          if (!cancelled) setPhase("error");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (!data.id) {
          setPhase("error");
          return;
        }
        setOrder(data);
        // `status` is Stripe's payment_status. Success only when the money
        // is confirmed as received; anything else gets the hedged state.
        if (data.status === "paid") {
          // Clear the cart only now that payment is confirmed. An unpaid
          // session may never complete, and the buyer needs the cart
          // intact to try again.
          clearCart();
          // Drop the QR attribution once the order is in. Otherwise a
          // subsequent unrelated purchase from the same browser would keep
          // crediting the original venue right up to the 24h TTL.
          clearQrContext();
          setPhase("paid");
        } else {
          setPhase("processing");
        }
      } catch (err) {
        console.error("Failed to fetch session:", err);
        if (!cancelled) setPhase("error");
      }
    }

    fetchSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId, clearCart]);

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Loading order details...</p>
      </div>
    );
  }

  if (phase === "no_session") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-serif mb-3">No order found</h1>
          <p className="text-sm text-muted mb-6">It looks like you haven&apos;t placed an order yet.</p>
          <Link
            href="/browse"
            className="inline-flex items-center justify-center px-6 py-3 bg-accent-text text-white text-sm font-medium rounded-sm hover:bg-accent-text-hover transition-colors"
          >
            Discover Art
          </Link>
        </div>
      </div>
    );
  }

  // A clock face, not a tick: these branches must not imply the money
  // arrived when we cannot or did not verify it.
  const pendingIcon = (
    <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 14" />
      </svg>
    </div>
  );

  const discoverStrip = (
    <div data-testid="discover-strip" className="mt-8 border-t border-border pt-6">
      <p className="text-xs text-muted uppercase tracking-widest mb-3">Discover more</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/browse" className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors">Browse art</Link>
        <Link href="/spaces" className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors">Explore spaces</Link>
        <Link href="/browse/collections" className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors">Featured collections</Link>
      </div>
    </div>
  );

  // Session id provided but the lookup failed. B21: this branch used to
  // claim "Your payment was received successfully", which is unverifiable
  // here and false for a bogus session id. Say what we know: nothing yet.
  if (phase === "error") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        {pendingIcon}
        <h1 className="text-3xl font-serif mb-2">Checking your order</h1>
        <p className="text-muted mb-4">We couldn&apos;t confirm your payment just now.</p>
        <p className="text-sm text-muted/70 mb-8">
          If your payment completed, you&apos;ll receive a confirmation email shortly.
          If nothing arrives within the hour, please{" "}
          <Link href="/contact" className="text-accent hover:underline">contact us</Link>{" "}
          and we&apos;ll look into it.
        </p>
        <Link
          href="/browse"
          className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-background transition-colors"
        >
          Continue browsing
        </Link>
        {discoverStrip}
      </div>
    );
  }

  // Session found but Stripe has not confirmed the payment. B20: no
  // "payment received" claim, and the cart is left intact so the buyer
  // can check out again if the payment never completes.
  if (phase === "processing") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        {pendingIcon}
        <h1 className="text-3xl font-serif mb-2">Payment processing</h1>
        <p className="text-muted mb-4">Thanks, your order is with us.</p>
        <p className="text-sm text-muted/70 mb-8">
          Your payment hasn&apos;t been confirmed yet. We&apos;ll email your confirmation
          as soon as it goes through. Your cart is untouched, so if the payment
          didn&apos;t complete you can simply check out again.
        </p>

        {order?.lineItems && (
          <div className="bg-surface border border-border rounded-sm p-5 mb-8 text-left">
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

        <Link
          href="/browse"
          className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-background transition-colors"
        >
          Continue browsing
        </Link>
        {discoverStrip}
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

      {/* The delivery address is deliberately not shown here. It used to come
          from the unauthenticated /api/checkout/session response, which meant
          anyone with the session id could read it (E39). The buyer has the
          address in their confirmation email. */}

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
          You&apos;ll receive updates by email.
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
            className="inline-flex items-center justify-center px-6 py-3 bg-accent-text text-white text-sm font-medium rounded-sm hover:bg-accent-text-hover transition-colors"
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
