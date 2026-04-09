"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import type { ShippingInfo } from "@/lib/types";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, removeItem, subtotal, placeOrder } = useCart();
  const [shipping, setShipping] = useState<ShippingInfo>({
    fullName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postcode: "",
    country: "United Kingdom",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const shippingCost = subtotal >= 300 ? 0 : 9.95;
  const total = subtotal + shippingCost;

  function updateField(field: keyof ShippingInfo, value: string) {
    setShipping((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: false }));
  }

  function handleSubmit() {
    const required: (keyof ShippingInfo)[] = ["fullName", "email", "phone", "addressLine1", "city", "postcode"];
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

    placeOrder(shipping);
    router.push("/checkout/confirmation");
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

  function InputField({ field, type = "text", placeholder, value, colSpan }: { field: keyof ShippingInfo; type?: string; placeholder: string; value: string; colSpan?: string }) {
    return (
      <div className={colSpan}>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
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
      <h1 className="text-2xl sm:text-3xl font-serif mb-6 sm:mb-8">Checkout</h1>

      <div className="grid lg:grid-cols-5 gap-6 sm:gap-8 lg:gap-10">
        {/* Form – 3 cols */}
        <div className="lg:col-span-3 space-y-8">
          {/* Shipping */}
          <div>
            <h2 className="text-lg font-medium mb-4">Delivery Details</h2>
            <div className="space-y-3">
              <InputField field="fullName" placeholder="Full name *" value={shipping.fullName} />
              <div className="grid grid-cols-2 gap-3">
                <InputField field="email" type="email" placeholder="Email address *" value={shipping.email} />
                <InputField field="phone" type="tel" placeholder="Phone number *" value={shipping.phone} />
              </div>
              <InputField field="addressLine1" placeholder="Address line 1 *" value={shipping.addressLine1} />
              <input
                type="text"
                placeholder="Address line 2"
                value={shipping.addressLine2}
                onChange={(e) => updateField("addressLine2", e.target.value)}
                className={inputClass("addressLine2")}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InputField field="city" placeholder="City *" value={shipping.city} />
                <InputField field="postcode" placeholder="Postcode *" value={shipping.postcode} />
                <input
                  type="text"
                  placeholder="Country"
                  value={shipping.country}
                  onChange={(e) => updateField("country", e.target.value)}
                  className={inputClass("country")}
                />
              </div>
              <textarea
                placeholder="Delivery notes (optional)"
                value={shipping.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={2}
                className={inputClass("notes")}
              />
            </div>
          </div>

          {/* Payment (mock) */}
          <div>
            <h2 className="text-lg font-medium mb-4">Payment</h2>
            <div className="bg-surface border border-border rounded-sm p-5 space-y-3">
              <input
                type="text"
                defaultValue="4242 4242 4242 4242"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm text-foreground"
                readOnly
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  defaultValue="12/28"
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm text-foreground"
                  readOnly
                />
                <input
                  type="text"
                  defaultValue="123"
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm text-foreground"
                  readOnly
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <span className="text-xs text-muted">Secure checkout</span>
              </div>
              <p className="text-[10px] text-muted/60 italic">
                This is a prototype – no payment will be processed.
              </p>
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
              Your order will be fulfilled directly by the artist. They&apos;ll pack and ship your artwork within 5–10 working days.
            </p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            className="w-full px-6 py-4 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors"
          >
            Place Order – £{total.toFixed(2)}
          </button>
        </div>

        {/* Order Summary – 2 cols */}
        <div className="lg:col-span-2">
          <div className="bg-surface border border-border rounded-sm p-5 lg:sticky lg:top-24">
            <h2 className="text-sm font-medium mb-4">Order Summary</h2>
            <div className="space-y-4 mb-5">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="w-16 h-16 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                    <Image src={item.image} alt={item.title} fill className="object-cover" sizes="64px" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                    <p className="text-xs text-muted">{item.artistName}</p>
                    {item.size && <p className="text-xs text-muted">{item.size}</p>}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-sm font-medium text-accent">£{item.price.toFixed(2)}</p>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-[10px] text-muted hover:text-red-500 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
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
                <p className="text-[10px] text-muted">Free shipping on orders over £300</p>
              )}
              <div className="flex justify-between text-sm font-medium pt-2 border-t border-border">
                <span>Total</span>
                <span>£{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
