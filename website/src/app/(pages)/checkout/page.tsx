"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import type { ShippingInfo } from "@/lib/types";
import { COUNTRIES, regionForCountry } from "@/lib/iso-countries";
import { SIGNATURE_THRESHOLD_GBP } from "@/lib/shipping-calculator";
import { calculateOrderShipping } from "@/lib/shipping-checkout";
import { formatSizeLabelForDisplay } from "@/lib/format-size-label";
import { safeRedirect } from "@/lib/safe-redirect";
import { isValidPostcode } from "@/lib/postcode";
import { authFetch } from "@/lib/api-client";
import { readQrContext } from "@/lib/qr-context";

interface SavedAddressRow {
  id: string;
  full_name: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  country: string;
  is_default: boolean;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, subtotal, ready } = useCart();
  const { user } = useAuth();
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressRow[]>([]);
  // "" = picker not chosen yet; "__new" = "Use new address" picked.
  const [savedAddressId, setSavedAddressId] = useState<string>("");
  // Plan G #1: explicit back link, callers append ?backTo= to ensure
  // browser-back has a known-good destination even if the history
  // entry has been replaced (e.g. offer-accept flows that redirect
  // through several intermediate routes).
  const [backHref, setBackHref] = useState<string>("/browse");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("backTo");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBackHref(safeRedirect(raw, "/browse"));
  }, []);
  // Cart-level error surfaced when the API rejects the cart at submit
  // time (G2-15: a line points at a sold/deleted/re-priced work). We
  // remove the offending line from the cart and show this banner so
  // the buyer doesn't bounce off a generic toast and lose context.
  const [cartError, setCartError] = useState<string | null>(null);
  // In-flight flag on the Proceed-to-Payment button. Prevents the user
  // from rage-clicking the button while we wait on /api/checkout, and
  // gives the button a "Redirecting..." state so a slow Stripe round
  // trip doesn't look like the page is hung.
  const [submitting, setSubmitting] = useState(false);
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
  // Fulfilment method — buyer chooses ship (default) or collection from
  // the artist (drop-off). Collection skips shipping costs and the
  // address requirement.
  // T9 / N2c: a cart where EVERY line is a venue-collect line opens in
  // collect_venue mode; mixed carts stay on "ship" and the collect lines are
  // re-validated (and rejected if stale) server-side. Derived before the state
  // so the initial render is already right.
  const allVenueCollect =
    items.length > 0 && items.every((i) => i.lineFulfilment === "collect_venue");
  // B18: the tile used to print the raw slug ("the-copper-kettle"). Prefer the
  // display name the line now carries, and fall back to the slug only for
  // carts built before that field existed.
  const collectVenueName = allVenueCollect
    ? items[0]?.collectVenueName ?? items[0]?.collectVenueSlug ?? null
    : null;
  const [fulfilmentMethod, setFulfilmentMethod] = useState<"ship" | "collection" | "collect_venue">(
    allVenueCollect ? "collect_venue" : "ship",
  );
  const [collectionNotes, setCollectionNotes] = useState("");
  // Buyer's preferred pickup window. Captured separately from the free
  // notes so the artist can see a concrete day + time on the order
  // detail page rather than digging through prose. Stored as plain
  // strings (HTML date + time inputs) and serialised into the
  // collection_notes string we send to the API so we don't need a
  // migration to land this v1.
  const [collectionDate, setCollectionDate] = useState("");
  const [collectionTimeWindow, setCollectionTimeWindow] = useState<
    "morning" | "afternoon" | "evening" | ""
  >("");
  // Per-artist "Collect from artist" availability. Buyers can only pick
  // the collection option when every artist in the cart has opted in
  // (artist_profiles.offers_pickup). Map is keyed by artistSlug. Starts
  // empty; the fetch below populates it. Until it resolves we render the
  // option but disable it, so a determined click can't beat the lookup.
  const [pickupBySlug, setPickupBySlug] = useState<Record<string, boolean>>({});
  // G-C / Bug 10. Same source and the same fail-closed rule as pickup: the
  // artist's own answer decides, and if we can't read it we assume UK only.
  const [intlBySlug, setIntlBySlug] = useState<Record<string, boolean>>({});
  const [pickupLoaded, setPickupLoaded] = useState(false);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShipping((prev) => (prev.email ? prev : { ...prev, email: presetEmail }));
    }
  }, []);

  // Saved-address book (G2-21): when the buyer is signed in, fetch their
  // address book so the form can offer a one-click pre-fill. Guests get
  // the original blank form. We also auto-pick the default if there is
  // one and the address fields are still empty, so the most common case
  // (one saved address, returning buyer) needs zero clicks.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedAddresses([]);
      setSavedAddressId("");
      return;
    }
    let cancelled = false;
    authFetch("/api/customer-addresses")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list: SavedAddressRow[] = Array.isArray(data?.addresses) ? data.addresses : [];
        setSavedAddresses(list);
        const def = list.find((a) => a.is_default) || list[0];
        if (def) {
          setSavedAddressId(def.id);
          setShipping((prev) => (prev.addressLine1 ? prev : {
            ...prev,
            fullName: prev.fullName || def.full_name,
            addressLine1: def.line1,
            addressLine2: def.line2 || "",
            city: def.city,
            postcode: def.postcode,
            country: def.country,
          }));
        }
      })
      .catch(() => { /* guest path / network blip — silently fall back to blank form */ });
    return () => { cancelled = true; };
  }, [user]);

  // Resolve which artists in the current cart offer in-person pickup.
  // Uses the public /api/browse-artists feed (server-cached) so we don't
  // need a bespoke lookup endpoint. Re-runs whenever the cart changes
  // so adding a second artist mid-flow correctly hides the option if
  // the new artist hasn't opted in.
  useEffect(() => {
    const slugs = Array.from(new Set(items.map((i) => i.artistSlug).filter(Boolean)));
    if (slugs.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPickupBySlug({});
      setIntlBySlug({});
      setPickupLoaded(true);
      return;
    }
    let cancelled = false;
    setPickupLoaded(false);
    fetch("/api/browse-artists", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const artists: Array<{
          slug?: string;
          offersPickup?: boolean;
          shipsInternationally?: boolean;
        }> = Array.isArray(data?.artists) ? data.artists : [];
        const next: Record<string, boolean> = {};
        const nextIntl: Record<string, boolean> = {};
        for (const slug of slugs) {
          const match = artists.find((a) => a.slug === slug);
          next[slug] = match?.offersPickup === true;
          nextIntl[slug] = match?.shipsInternationally === true;
        }
        setPickupBySlug(next);
        setIntlBySlug(nextIntl);
      })
      .catch(() => {
        if (cancelled) return;
        // Network failure means we can't confirm consent. Default to
        // "no pickup available" so we never accidentally book a buyer
        // into a collection arrangement the artist hasn't agreed to.
        // Same for international delivery: no confirmation means UK only,
        // which is what api/checkout would enforce anyway (G-C / Bug 10).
        const next: Record<string, boolean> = {};
        for (const slug of slugs) next[slug] = false;
        setPickupBySlug(next);
        setIntlBySlug(next);
      })
      .finally(() => {
        if (!cancelled) setPickupLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  // Pickup is offered to the buyer only when every artist in the cart
  // has explicitly opted in. Mixed carts get shipping only — we don't
  // try to split fulfilment per line in v1.
  const cartArtistSlugs = useMemo(
    () => Array.from(new Set(items.map((i) => i.artistSlug).filter(Boolean))),
    [items],
  );
  const pickupAvailable =
    pickupLoaded &&
    cartArtistSlugs.length > 0 &&
    cartArtistSlugs.every((s) => pickupBySlug[s] === true);

  // G-C / Bug 10. Non-UK delivery is offered only when EVERY artist in the cart
  // ships abroad, the same all-or-nothing rule as pickup: one UK-only artist and
  // the parcel can't go, because v1 doesn't split a cart across destinations.
  // The dropdown is a courtesy, api/checkout is the gate. Until the artist data
  // has loaded we show UK only, so the buyer is never offered a country that the
  // submit would then refuse.
  const internationalAvailable =
    pickupLoaded &&
    cartArtistSlugs.length > 0 &&
    cartArtistSlugs.every((s) => intlBySlug[s] === true);

  const countryOptions = useMemo(
    () => (internationalAvailable ? COUNTRIES : COUNTRIES.filter((c) => c.code === "GB")),
    [internationalAvailable],
  );

  // If the user had collection selected and the cart changes such that
  // it's no longer available, snap them back to shipping so the order
  // can still be placed.
  useEffect(() => {
    if (pickupLoaded && !pickupAvailable && fulfilmentMethod === "collection") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFulfilmentMethod("ship");
    }
  }, [pickupLoaded, pickupAvailable, fulfilmentMethod]);

  // Same snap-back for the destination. A cart edit can remove the artist who
  // made the selected country reachable, and leaving a stale country in the form
  // would send the buyer to a 400 from api/checkout on submit.
  useEffect(() => {
    if (pickupLoaded && !internationalAvailable && shipping.country !== "GB") {
      // setShipping rather than updateField: updateField is declared further down
      // the component and reading it here trips "cannot access variable before it
      // is declared". Clearing the postcode format error matters as much as the
      // country itself, because a valid AU postcode is not a valid UK one.
      // Same snap-back shape as the fulfilment effect above, so the same
      // cascading-render exemption applies.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShipping((prev) => ({ ...prev, country: "GB" }));
      setErrors((prev) => ({ ...prev, country: false, postcodeFormat: false }));
    }
  }, [pickupLoaded, internationalAvailable, shipping.country]);

  function applySavedAddress(id: string) {
    setSavedAddressId(id);
    if (id === "__new") {
      setShipping((prev) => ({
        ...prev,
        addressLine1: "",
        addressLine2: "",
        city: "",
        postcode: "",
        country: "GB",
      }));
      setErrors((prev) => ({ ...prev, postcodeFormat: false }));
      return;
    }
    const picked = savedAddresses.find((a) => a.id === id);
    if (!picked) return;
    setShipping((prev) => ({
      ...prev,
      fullName: picked.full_name,
      addressLine1: picked.line1,
      addressLine2: picked.line2 || "",
      city: picked.city,
      postcode: picked.postcode,
      country: picked.country,
    }));
    setErrors((prev) => ({
      ...prev,
      addressLine1: false,
      city: false,
      postcode: false,
      postcodeFormat: false,
    }));
  }

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
        // E46c: forwarded so the API can resolve the uplift server-side.
        frameLabel: it.frameLabel,
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
  const shippingCost = fulfilmentMethod === "ship" ? totalShipping : 0;
  const total = subtotal + shippingCost;

  // Pick the slowest tier across all artist groups so the static
  // "ships within X" copy reflects the real wait. Calculator-provided
  // estimatedDays strings already include "working days" (e.g.
  // "2 to 3 working days"), so the surrounding template appends
  // nothing — and the fallback is the full phrase too. We take the
  // lexically largest as a proxy for slowest.
  const aggregatedEstimatedDays = useMemo(() => {
    const all = artistGroupsArr
      .map((g) => g.estimatedDays)
      .filter((d): d is string => !!d);
    if (all.length === 0) return "5 to 7 working days";
    return all.sort().slice(-1)[0];
  }, [artistGroupsArr]);

  function updateField(field: keyof ShippingInfo, value: string) {
    setShipping((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev, [field]: false };
      // Editing postcode OR country should clear the format error so the
      // user isn't stuck on a stale "wrong format" once they fix it.
      if (field === "postcode" || field === "country") {
        next.postcodeFormat = false;
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (submitting) return;
    // Collection only needs name + contact; addressLine/postcode/city
    // are skipped because the artist supplies the location.
    const required: (keyof ShippingInfo)[] = fulfilmentMethod !== "ship"
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

    setCartError(null);
    setSubmitting(true);

    // For collection orders, fold the proposed date + time window into
    // the free-text notes so the existing `collection_notes` column
    // carries everything the artist needs. Avoids a schema migration
    // for v1; we can promote these to dedicated columns later if the
    // dashboard wants to surface them in a more structured way.
    const composedCollectionNotes = (() => {
      if (fulfilmentMethod !== "collection") return collectionNotes;
      const lines: string[] = [];
      if (collectionDate) {
        const formatted = (() => {
          try {
            return new Date(collectionDate + "T00:00:00").toLocaleDateString(
              "en-GB",
              { weekday: "long", day: "numeric", month: "long", year: "numeric" },
            );
          } catch {
            return collectionDate;
          }
        })();
        lines.push(`Preferred date: ${formatted}`);
      }
      if (collectionTimeWindow) {
        const label =
          collectionTimeWindow === "morning"
            ? "Morning (9am to 12pm)"
            : collectionTimeWindow === "afternoon"
              ? "Afternoon (12pm to 5pm)"
              : "Evening (5pm to 8pm)";
        lines.push(`Time of day: ${label}`);
      }
      const trimmed = collectionNotes.trim();
      if (trimmed) lines.push(`Notes: ${trimmed}`);
      return lines.join("\n");
    })();

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
          // Read QR attribution from localStorage first (set on the
          // artist page when the visitor arrived via /api/qr). The
          // current URL is /checkout?backTo=…, the original `?venue=`
          // and `?ref=` query params from the QR redirect are no longer
          // present on this page. Falling back to URL params keeps
          // legacy/non-QR direct deep-links working.
          source: (typeof window !== "undefined" && (readQrContext()?.source || new URLSearchParams(window.location.search).get("ref"))) || "direct",
          venueSlug: (typeof window !== "undefined" && (readQrContext()?.venueSlug || new URLSearchParams(window.location.search).get("venue"))) || "",
          // D10: the server-signed attribution, preferred by the API over the bare
          // slug above. From localStorage first, URL `va` as the fallback.
          venueAttributionToken: (typeof window !== "undefined" && (readQrContext()?.attributionToken || new URLSearchParams(window.location.search).get("va"))) || undefined,
          fulfilmentMethod,
          collectionNotes: composedCollectionNotes,
        }),
      });

      // 409 = cart re-validation failed (G2-15). The API returns a
      // human-readable error and the offending workId; we drop that
      // line from the cart and surface the message rather than redirect
      // to Stripe with a stale price.
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        const offendingId = typeof data?.workId === "string" ? data.workId : null;
        if (offendingId) {
          // Match by workId rather than cart-line id (CartContext
          // generates a random "cart-..." id on add). One artwork can
          // appear as multiple lines (different sizes / framed), drop
          // them all so the buyer doesn't keep bouncing off the same
          // unavailable work.
          for (const line of items) {
            if (line.workId === offendingId) removeItem(line.id);
          }
        }
        setCartError(
          typeof data?.error === "string"
            ? data.error
            : "One of the works in your cart is no longer available.",
        );
        setSubmitting(false);
        return;
      }

      // Any non-2xx that isn't the 409 special-case path. The route
      // returns a JSON `{ error }` for these (4xx schema rejections,
      // self-purchase guard, Stripe blow-ups). Surface the message
      // so the buyer can act on it instead of clicking a silent
      // button repeatedly.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCartError(
          typeof data?.error === "string"
            ? data.error
            : "Couldn't start checkout. Please try again, or get in touch if it keeps happening.",
        );
        setSubmitting(false);
        return;
      }

      const data = await res.json();

      if (data.url) {
        // Save shipping to localStorage for confirmation fallback
        localStorage.setItem("wallplace-last-shipping", JSON.stringify(shipping));
        // B22: the confirmation page's fulfilment notice needs to know
        // whether anything is actually being shipped. The session API
        // deliberately returns no fulfilment data (E39), so hand the
        // chosen method over via localStorage for the immediate
        // post-checkout render.
        localStorage.setItem("wallplace-last-fulfilment", fulfilmentMethod);
        window.location.href = data.url;
        // Leave `submitting` true so the button stays disabled while
        // the browser navigates to Stripe. Resetting it here flickers
        // the label back to "Proceed to Payment" mid-redirect.
      } else {
        setCartError("Couldn't start checkout. Please try again, or get in touch if it keeps happening.");
        setSubmitting(false);
      }
    } catch {
      setCartError("Network error. Check your connection and try again.");
      setSubmitting(false);
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
            className="inline-flex items-center justify-center px-6 py-3 bg-accent-text text-white text-sm font-medium rounded-sm hover:bg-accent-text-hover transition-colors"
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
    const inputId = `checkout-${field}`;
    // Strip the trailing " *" from the placeholder to produce a clean label.
    const labelText = placeholder.replace(/\s*\*$/, "");
    return (
      <div>
        {/* Visually hidden label keeps the input accessible via
            getByLabelText while leaving the placeholder visible as
            the primary affordance in the UI. */}
        <label
          htmlFor={inputId}
          className="sr-only"
        >
          {labelText}
        </label>
        <input
          id={inputId}
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
          {/* Delivery method selector. The "Collect from artist" tile is
              only rendered when every artist in the cart has opted in
              (artist_profiles.offers_pickup). If they haven't, we just
              show "Ship to me" — quieter than a disabled tile that
              advertises an unavailable option. */}
          <div>
            <h2 className="text-lg font-medium mb-4">Delivery Method</h2>
            <div className={`grid gap-3 mb-6 ${
              [true, pickupAvailable, allVenueCollect].filter(Boolean).length > 1
                ? "grid-cols-2"
                : "grid-cols-1"
            }`}>
              {/* T9 / N2c: the venue-collect tile appears only for a cart built
                  from the collect-from-venue CTA, and is preselected. The
                  server re-validates every line's placement at submit, so the
                  tile is presentation, not the check. */}
              {allVenueCollect && (
                <button
                  type="button"
                  onClick={() => setFulfilmentMethod("collect_venue")}
                  className={`text-left p-4 rounded-sm border transition-colors ${
                    fulfilmentMethod === "collect_venue"
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={fulfilmentMethod === "collect_venue" ? "text-accent" : "text-muted"}>
                      <path d="M3 9l9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <p className="text-sm font-medium">Collect from the venue</p>
                  </div>
                  <p className="text-xs text-muted leading-snug">
                    {collectVenueName
                      ? `Pick it up where it hangs. Show your order number at ${collectVenueName}.`
                      : "Pick it up where it hangs. Show your order number at the venue."}
                  </p>
                </button>
              )}
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
                <p className="text-xs text-muted leading-snug">Tracked delivery from the artist. {aggregatedEstimatedDays}.</p>
              </button>
              {pickupAvailable && (
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
              )}
            </div>
          </div>

          {/* Buyer details */}
          <div>
            <h2 className="text-lg font-medium mb-4">{fulfilmentMethod === "ship" ? "Delivery Details" : "Your Details"}</h2>
            <div className="space-y-3">
              {renderInput("fullName", "Full name *")}
              <div className="grid grid-cols-2 gap-3">
                {renderInput("email", "Email address *", "email")}
                {renderInput("phone", "Phone number *", "tel")}
              </div>
              {fulfilmentMethod === "ship" && savedAddresses.length > 0 && (
                <div>
                  <label className="block text-xs text-muted mb-1">Use a saved address</label>
                  <select
                    value={savedAddressId}
                    onChange={(e) => applySavedAddress(e.target.value)}
                    className={inputClass("savedAddress")}
                  >
                    {savedAddresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name}, {a.line1}, {a.postcode}
                        {a.is_default ? " (default)" : ""}
                      </option>
                    ))}
                    <option value="__new">Use a new address</option>
                  </select>
                </div>
              )}
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
                    {/* Postcode gets a country-aware format check on blur
                        (G2-20). The generic required-error from renderInput
                        is replaced inline so we can show either "required"
                        OR "format wrong" without fighting the renderInput
                        helper's single-error contract. */}
                    <div>
                      <label htmlFor="checkout-postcode" className="sr-only">Postcode</label>
                      <input
                        id="checkout-postcode"
                        type="text"
                        placeholder="Postcode *"
                        value={shipping.postcode || ""}
                        onChange={(e) => updateField("postcode", e.target.value)}
                        onBlur={() => {
                          if (
                            shipping.postcode &&
                            !isValidPostcode(shipping.postcode, shipping.country)
                          ) {
                            setErrors((prev) => ({ ...prev, postcodeFormat: true }));
                          } else {
                            setErrors((prev) => ({ ...prev, postcodeFormat: false }));
                          }
                        }}
                        className={inputClass(
                          errors.postcodeFormat ? "postcodeFormat" : "postcode",
                        )}
                      />
                      {errors.postcode && !errors.postcodeFormat && (
                        <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          Postcode is required
                        </p>
                      )}
                      {errors.postcodeFormat && (
                        <p className="text-xs text-red-700 mt-1">
                          Postcode doesn&apos;t look right for {shipping.country}. Double-check it.
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="checkout-country" className="sr-only">Country</label>
                      <select
                        id="checkout-country"
                        value={shipping.country}
                        onChange={(e) => updateField("country", e.target.value)}
                        className={inputClass("country")}
                      >
                      {countryOptions.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                      </select>
                      {!internationalAvailable && (
                        <p className="text-xs text-muted mt-1">
                          {cartArtistSlugs.length > 1
                            ? "These artists ship within the UK only."
                            : "This artist ships within the UK only."}
                        </p>
                      )}
                    </div>
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
                <>
                  <p className="text-xs text-muted -mt-1">
                    Suggest a pickup time, the artist will confirm or
                    propose a different one by message.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-muted mb-1">
                        Preferred date
                      </label>
                      <input
                        type="date"
                        value={collectionDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setCollectionDate(e.target.value)}
                        className={inputClass("collectionDate")}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-muted mb-1">
                        Time of day
                      </label>
                      <select
                        value={collectionTimeWindow}
                        onChange={(e) =>
                          setCollectionTimeWindow(e.target.value as typeof collectionTimeWindow)
                        }
                        className={inputClass("collectionTimeWindow")}
                      >
                        <option value="">Any time</option>
                        <option value="morning">Morning (9am to 12pm)</option>
                        <option value="afternoon">Afternoon (12pm to 5pm)</option>
                        <option value="evening">Evening (5pm to 8pm)</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    placeholder="Anything else the artist should know? (optional)"
                    value={collectionNotes}
                    onChange={(e) => setCollectionNotes(e.target.value)}
                    rows={3}
                    className={inputClass("collectionNotes")}
                  />
                </>
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

          {/* Fulfilment notice. PASS2-placement-lifecycle-log: this said "Your
              order will be fulfilled directly by the artist. They'll pack and
              ship your artwork within 5 to 7 working days" under a SELECTED
              "Collect from the venue" option. Nothing was going to be packed or
              shipped: the piece was on a wall the buyer was about to walk into.
              The confirmation page already said the right thing. */}
          <div className="bg-accent/5 border border-accent/20 rounded-sm p-4 flex gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <p className="text-sm text-foreground/70">
              {fulfilmentMethod === "collect_venue" ? (
                <>
                  Nothing is posted. Once you have paid, collect it from{" "}
                  {collectVenueName ?? "the venue"} and confirm the pickup in your account so the
                  artist is paid.
                </>
              ) : fulfilmentMethod === "collection" ? (
                <>
                  Nothing is posted. The artist will be in touch to arrange a time for you to
                  collect it.
                </>
              ) : (
                <>
                  Your order will be fulfilled directly by the artist. They&apos;ll pack and ship
                  your artwork within {aggregatedEstimatedDays}.
                </>
              )}
            </p>
          </div>

          {/* Cart-error banner (G2-15: API rejected cart because a
              work was sold/deleted/re-priced). The offending line is
              already removed from the cart at this point — this is
              the user-facing breadcrumb explaining why. */}
          {cartError && (
            <div
              role="alert"
              className="bg-amber-50 border border-amber-300 rounded-sm p-4 flex gap-3"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-sm text-amber-900">{cartError}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full px-6 py-4 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors disabled:bg-accent/60 disabled:cursor-not-allowed"
          >
            {submitting ? "Processing payment, do not refresh" : `Proceed to Payment, £${total.toFixed(2)}`}
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
                    {item.size && formatSizeLabelForDisplay(item.size) && (
                      <p className="text-xs text-muted">{formatSizeLabelForDisplay(item.size)}</p>
                    )}
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
                        {group.artistName} ships within {group.estimatedDays || "5 to 7 working days"}.
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
