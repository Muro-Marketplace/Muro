"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import type { ShippingInfo } from "@/lib/types";
import { COUNTRIES, regionForCountry } from "@/lib/iso-countries";
import { SIGNATURE_THRESHOLD_GBP } from "@/lib/shipping-calculator";
import { calculateOrderShipping } from "@/lib/shipping-checkout";
import { formatSizeLabelForDisplay } from "@/lib/format-size-label";
import { safeRedirect } from "@/lib/safe-redirect";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, subtotal, ready } = useCart();
  // Plan G #1: explicit back link, callers append ?backTo= to ensure
  // browser-back has a known-good destination even if the history
  // entry has been replaced (e.g. offer-accept flows that redirect
  // through several intermediate routes).
  const [backHref, setBackHref] = useState<string>("/browse");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("backTo");
    setBackHref(safeRedirect(raw, "/browse"));
  }, []);
  const [shipping, setShipping] = useState<ShippingInfo>({
    fullName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postcode: "",
    country: "GB",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  // Fulfilment method — buyer chooses ship (default), collection from
  // the artist (drop-off), or digital (rare). Collection skips shipping
  // costs and the address requirement.
  const [fulfilmentMethod, setFulfilmentMethod] = useState<"ship" | "collection">("ship");
  const [collectionNotes, setCollectionNotes] = useState("");

  // Pre-fill the email from a QR-scan ref so the buyer doesn't have to
  // re-type it. ?ref=qr&email=foo@bar.com is the canonical form; we
  // accept ?email= alone too in case someone passes it directly.
  // Reads window.location.search rather than useSearchParams so the
  // page can be statically prerendered without a Suspense boundary;
  // matches the pattern handleSubmit below already uses for ?ref/?venue.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const presetEmail = new URLSearchParams(window.location.search).get("email");
    if (presetEmail) {
      setShipping((prev) => (prev.email ? prev : { ...prev, email: presetEmail }));
    }
  }, []);

  const region = regionForCountry(shipping.country);

  // Single source of truth for cart-level shipping, same helper the
  // /api/checkout route uses, so the displayed total can never drift
  // from what Stripe charges.
  const { artistGroups: artistGroupsArr, totalShipping } = useMemo(
    () => calculateOrderShipping(
      items.map((it) => ({
        artistSlug: it.artistSlug || "",
        artistName: it.artistName,
        shippingPrice: it.shippingPrice ?? null,
        internationalShippingPrice: it.internationalShippingPrice ?? null,
        dimensions: it.dimensions || null,
        framed: it.framed,
        price: it.price,
        quantity: it.quantity,
      })),
      region,
    ),
    [items, region],
  );

  // Re-shape into a slug-keyed object so the existing render block
  // (which iterates Object.values) keeps working without changes. We
  // also need each group's items array for the order-summary display
  // bits, that's fed back from the original cart, grouped by slug.
  const artistGroups = useMemo(() => {
    const out: Record<string, {
      artistName: string;
      items: typeof items;
      shipping: number;
      needsSignature: boolean;
      longestTierLabel: string | null;
      estimatedDays: string | null;
      anyEstimated: boolean;
    }> = {};
    for (const g of artistGroupsArr) {
      out[g.artistSlug] = {
        artistName: g.artistName,
        items: items.filter((it) => (it.artistSlug || "") === g.artistSlug),
        shipping: g.shipping,
        needsSignature: g.needsSignature,
        longestTierLabel: g.longestTierLabel,
        estimatedDays: g.estimatedDays,
        anyEstimated: g.anyEstimated,
      };
    }
    return out;
  }, [artistGroupsArr, items]);

  // Collection skips delivery cost entirely — buyer picks up from the
  // artist's space. The shared helper above gives us the ship-mode total.
  const shippingCost = fulfilmentMethod === "collection" ? 0 : totalShipping;
  const total = subtotal + shippingCost;

  function updateField(field: keyof ShippingInfo, value: string) {
    setShipping((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: false }));
  }

  async function handleSubmit() {
    // Collection only needs name + contact; addressLine/postcode/city
    // are skipped because the artist supplies the location.
    const required: (keyof ShippingInfo)[] = fulfilmentMethod === "collection"
      ? ["fullName", "email", "phone"]
      : ["fullName", "email", "phone", "addressLine1", "city", "postcode"];
    const newErrors: Record<string, boolean> = {};
    required.forEach((f) => {
      if (!shipping[f]?.trim()) newErrors[f] = true;
    });
    if (shipping.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipping.email)) newErrors.email = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Scroll to first error field
      setTimeout(() => {
        const firstError = document.querySelector('[class*="border-red"]');
        firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    // Create Stripe Checkout Session and redirect
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          shipping,
          // Defensive parity check, the API recomputes via the same
          // helper. If the two diverge by > 1p, the API logs a warning
          // (and trusts its own number).
          expectedShippingCost: shippingCost,
          expectedSubtotal: subtotal,
          source: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") || "direct" : "direct",
          venueSlug: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("venue") || "" : "",
          fulfilmentMethod,
          collectionNotes,
        }),
      });
      const data = await res.json();

      if (data.url) {
        // Save shipping to localStorage for confirmation fallback
        localStorage.setItem("wallplace-last-shipping", JSON.stringify(shipping));
        window.location.href = data.url;
      } else {
        setErrors({ submit: true } as Record<string, boolean>);
      }
    } catch {
      setErrors({ submit: true } as Record<string, boolean>);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-muted text-sm">Loading checkout...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-serif mb-3">Your bag is empty</h1>
          <p className="text-sm text-muted mb-6">Browse the marketplace to find artwork for your space.</p>
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

  const errorMessages: Record<string, string> = {
    fullName: "Full name is required",
    email: "Valid email address is required",
    phone: "Phone number is required",
    addressLine1: "Address is required",
    city: "City is required",
    postcode: "Postcode is required",
  };

  const inputClass = (field: string) =>
    `w-full px-3 py-2.5 bg-background border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 transition-colors ${
      errors[field] ? "border-red-400" : "border-border"
    }`;

  function renderInput(field: keyof ShippingInfo, placeholder: string, type = "text") {
    return (
      <div>
        <input
          type={type}
          placeholder={placeholder}
          value={shipping[field] || ""}
          onChange={(e) => updateField(field, e.target.value)}
          className={inputClass(field)}
        />
        {errors[field] && (
          <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {errorMessages[field] || "This field is required"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors mb-4"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back
      </Link>
      <h1 className="text-2xl sm:text-3xl font-serif mb-6 sm:mb-8">Checkout</h1>

      <div className="grid lg:grid-cols-5 gap-6 sm:gap-8 lg:gap-10">
        {/* Form – 3 cols */}
        <div className="lg:col-span-3 space-y-8">
          {/* Delivery method selector */}
          <div>
            <h2 className="text-lg font-medium mb-4">Delivery Method</h2>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setFulfilmentMethod("ship")}
                className={`text-left p-4 rounded-sm border transition-colors ${
                  fulfilmentMethod === "ship"
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={fulfilmentMethod === "ship" ? "text-accent" : "text-muted"}>
                    <rect x="1" y="3" width="15" height="13" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                  <p className="text-sm font-medium">Ship to me</p>
                </div>
                <p className="text-xs text-muted leading-snug">Tracked delivery from the artist. 7 working days.</p>
              </button>
              <button
                type="button"
                onClick={() => setFulfilmentMethod("collection")}
                className={`text-left p-4 rounded-sm border transition-colors ${
                  fulfilmentMethod === "collection"
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={fulfilmentMethod === "collection" ? "text-accent" : "text-muted"}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <p className="text-sm font-medium">Collect from artist</p>
                </div>
                <p className="text-xs text-muted leading-snug">No shipping costs. Arrange a pickup time after payment.</p>
              </button>
            </div>
          </div>

          {/* Buyer details */}
          <div>
            <h2 className="text-lg font-medium mb-4">{fulfilmentMethod === "collection" ? "Your Details" : "Delivery Details"}</h2>
            <div className="space-y-3">
              {renderInput("fullName", "Full name *")}
              <div className="grid grid-cols-2 gap-3">
                {renderInput("email", "Email address *", "email")}
                {renderInput("phone", "Phone number *", "tel")}
              </div>
              {fulfilmentMethod === "ship" && (
                <>
                  {renderInput("addressLine1", "Address line 1 *")}
                  <input
                    type="text"
                    placeholder="Address line 2"
                    value={shipping.addressLine2}
                    onChange={(e) => updateField("addressLine2", e.target.value)}
                    className={inputClass("addressLine2")}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {renderInput("city", "City *")}
                    {renderInput("postcode", "Postcode *")}
                    <select
                      value={shipping.country}
                      onChange={(e) => updateField("country", e.target.value)}
                      className={inputClass("country")}
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    placeholder="Delivery notes (optional)"
                    value={shipping.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    rows={2}
                    className={inputClass("notes")}
                  />
                </>
              )}
              {fulfilmentMethod === "collection" && (
                <textarea
                  placeholder="Pickup notes — when works for you, anyone we should ask for? (optional)"
                  value={collectionNotes}
                  onChange={(e) => setCollectionNotes(e.target.value)}
                  rows={3}
                  className={inputClass("collectionNotes")}
                />
              )}
            </div>
          </div>

          {/* Payment info */}
          <div className="bg-surface border border-border rounded-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <h2 className="text-base font-medium">Secure Payment</h2>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              You&apos;ll be redirected to Stripe&apos;s secure checkout to complete your payment. We never see or store your card details.
            </p>
            {/* Plan F #20: surface the supported payment methods at a
                glance so buyers know they can use Apple Pay / Google Pay
                rather than reaching for a card. Stripe Checkout itself
                still drives the actual selection. */}
            <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Supported payment methods">
              {["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay"].map((method) => (
                <span
                  key={method}
                  className="inline-flex items-center px-2 py-1 text-[10px] font-medium tracking-wide text-foreground/70 bg-white border border-border rounded-sm"
                >
                  {method}
                </span>
              ))}
            </div>
          </div>

          {/* Artist fulfilment notice */}
          <div className="bg-accent/5 border border-accent/20 rounded-sm p-4 flex gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <p className="text-sm text-foreground/70">
              Your order will be fulfilled directly by the artist. They&apos;ll pack and ship your artwork within 7 working days.
            </p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            className="w-full px-6 py-4 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors"
          >
            Proceed to Payment – £{total.toFixed(2)}
          </button>
        </div>

        {/* Order Summary – 2 cols */}
        <div className="lg:col-span-2">
          <div className="bg-surface border border-border rounded-sm p-5 lg:sticky lg:top-24">
            <h2 className="text-sm font-medium mb-4">Order Summary</h2>
            <div className="space-y-4 mb-5">
              {items.map((item) => {
                const cap = typeof item.quantityAvailable === "number" ? item.quantityAvailable : null;
                return (
                <div key={item.id} className="flex gap-3">
                  <div className="w-16 h-16 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                    <Image src={item.image} alt={item.title} fill className="object-cover" sizes="64px" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                    <p className="text-xs text-muted">{item.artistName}</p>
                    {item.size && <p className="text-xs text-muted">{formatSizeLabelForDisplay(item.size)}</p>}
                    <div className="flex items-center justify-between mt-1.5 gap-2 flex-wrap">
                      {/* Per-line quantity stepper so buyers can grab
                          N of a specific size without going back to
                          the artwork page. Capped to the size's stock
                          when we know it. */}
                      <div className="flex items-center border border-border rounded-sm">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        </button>
                        <span className="w-7 text-center text-[12px] font-medium tabular-nums">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={cap !== null && item.quantity >= cap}
                          className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          aria-label="Increase quantity"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        </button>
                      </div>
                      <p className="text-sm font-medium text-accent">
                        £{(item.price * item.quantity).toFixed(2)}
                        {item.quantity > 1 && (
                          <span className="ml-1.5 text-[11px] text-muted font-normal">
                            (£{item.price.toFixed(2)} each)
                          </span>
                        )}
                      </p>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-[10px] text-muted hover:text-red-500 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Subtotal</span>
                <span>£{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Shipping</span>
                <span>{shippingCost === 0 ? "Free" : `£${shippingCost.toFixed(2)}`}</span>
              </div>
              {shippingCost > 0 && (
                <div className="space-y-2 pl-2">
                  {Object.values(artistGroups).map((group) => (
                    <div key={group.artistName} className="text-[10px] text-muted">
                      <div className="flex justify-between">
                        <span>{Object.keys(artistGroups).length > 1 ? `Shipped by ${group.artistName}` : "Tracked shipping"}</span>
                        <span>{group.shipping === 0 ? "Free" : `£${group.shipping.toFixed(2)}`}</span>
                      </div>
                      {(group.longestTierLabel || group.estimatedDays) && (
                        <p className="text-[9px] text-muted/80 mt-0.5">
                          {group.longestTierLabel}
                          {group.longestTierLabel && group.estimatedDays ? " · " : ""}
                          {group.estimatedDays}
                          {group.needsSignature ? " · Signed-for" : ""}
                        </p>
                      )}
                      <p className="text-[11px] text-muted mt-1">
                        {group.artistName} ships within {group.estimatedDays || "5-7"} working days.
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {shippingCost > 0 && Object.values(artistGroups).some((g) => g.anyEstimated) && (
                <p className="text-[10px] text-muted">
                  Shipping is estimated from artwork size. Your artist may adjust before dispatch if the piece needs a specialist courier.
                </p>
              )}
              <div className="flex justify-between text-sm font-medium pt-2 border-t border-border">
                <span>Total</span>
                <span>£{total.toFixed(2)}</span>
              </div>
              {/* Per-artist fulfilment time replaces the misleading single
                  notice. Signature note kept here as it's order-wide. */}
              {shippingCost > 0 && (
                <p className="text-[10px] text-muted pt-2 mt-1 border-t border-border">
                  Orders of &pound;{SIGNATURE_THRESHOLD_GBP}+ are sent signed-for.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
