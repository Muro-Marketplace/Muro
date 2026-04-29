# Workstream D — Checkout correctness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Linked spec: `docs/specs/2026-04-29-batch-fixes-design.md` § Workstream D.

**Goal:** The shipping cost shown on the checkout page must equal the shipping line on the Stripe checkout session must equal the amount actually charged to the card. Guest checkout works end-to-end after a QR scan, with no front-end auth gate blocking the buy-now path.

**Architecture:** A single shared helper `src/lib/shipping-checkout.ts` owns the per-artist consolidation logic (largest piece full + 50 % per additional). Both the display page and the API route call it with the same input shape. A defensive `expectedShippingCost` posted from the frontend lets the API log a warning on any drift. Guest checkout was already API-supported; the fix removes any remaining front-end gate on the buy-now → /checkout flow.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Stripe SDK · Vitest · TypeScript.

**Dependencies:** none.

**Items covered:** 12 (shipping mismatch), 14 (guest checkout after QR scan).

---

## File Structure

### Created

| Path | Responsibility |
|------|----------------|
| `src/lib/shipping-checkout.ts` | Single source of shipping calculation: per-artist consolidation, manual override, fallback. |
| `src/lib/shipping-checkout.test.ts` | Vitest suite proving display ↔ API parity and rounding correctness. |

### Modified

| Path | Change |
|------|--------|
| `src/app/(pages)/checkout/page.tsx` | Replace inline calc (lines 33-94) with `calculateOrderShipping`. POST `expectedShippingCost` to API. |
| `src/app/api/checkout/route.ts` | Replace flat `(item.shippingPrice ?? 9.95) * quantity` calc (lines 38-41) with `calculateOrderShipping`. Add divergence warning. |
| `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx` | Remove any auth gate on Buy Now; route directly to /checkout. |

---

## Tasks

### Task D.1: Build shared shipping-checkout helper

**Files:**
- Create: `src/lib/shipping-checkout.ts`

- [ ] **Step 1: Helper**

```ts
// src/lib/shipping-checkout.ts
import { resolveShippingCost, tierLabel, SIGNATURE_THRESHOLD_GBP } from "./shipping-calculator";

export interface CartLineForShipping {
  artistSlug: string;
  artistName: string;
  shippingPrice?: number | null;
  internationalShippingPrice?: number | null;
  dimensions?: string | null;
  framed?: boolean;
  price: number;
  quantity: number;
}

export interface ArtistShippingGroup {
  artistSlug: string;
  artistName: string;
  shipping: number;
  needsSignature: boolean;
  longestTierLabel: string | null;
  estimatedDays: string | null;
  anyEstimated: boolean;
}

export interface OrderShipping {
  artistGroups: ArtistShippingGroup[];
  totalShipping: number;
}

const FALLBACK_MEDIUM_UK = 14.5;
const FALLBACK_MEDIUM_INT = 38.0;

export function calculateOrderShipping(
  items: CartLineForShipping[],
  region: "uk" | "international",
): OrderShipping {
  const isInternational = region === "international";
  const groupsBySlug = new Map<string, { artistName: string; lines: CartLineForShipping[] }>();
  for (const it of items) {
    const slug = it.artistSlug || "_unknown";
    if (!groupsBySlug.has(slug)) groupsBySlug.set(slug, { artistName: it.artistName, lines: [] });
    groupsBySlug.get(slug)!.lines.push(it);
  }

  const artistGroups: ArtistShippingGroup[] = [];
  for (const [slug, group] of groupsBySlug) {
    let needsSignature = false;
    let longestTierLabel: string | null = null;
    let estimatedDays: string | null = null;
    let anyEstimated = false;

    const perItem: number[] = [];
    for (const it of group.lines) {
      const manualPrice = isInternational && it.internationalShippingPrice != null
        ? it.internationalShippingPrice
        : it.shippingPrice;
      const resolved = resolveShippingCost({
        manualPrice: typeof manualPrice === "number" ? manualPrice : null,
        dimensions: it.dimensions || null,
        framed: it.framed ?? false,
        priceGbp: it.price,
        region,
      });
      let rate = resolved.cost;
      if (rate == null) rate = isInternational ? FALLBACK_MEDIUM_INT : FALLBACK_MEDIUM_UK;
      if (resolved.estimate?.requiresSignature || it.price >= SIGNATURE_THRESHOLD_GBP) needsSignature = true;
      if (resolved.source === "estimate" && resolved.estimate) {
        anyEstimated = true;
        if (
          !longestTierLabel ||
          (resolved.estimate.longestEdgeCm > 60 && longestTierLabel !== "Oversized — specialist courier")
        ) {
          longestTierLabel = tierLabel(resolved.estimate.tier);
          estimatedDays = resolved.estimate.estimatedDays;
        }
      }
      for (let q = 0; q < it.quantity; q++) perItem.push(rate as number);
    }

    if (perItem.length === 0) continue;
    perItem.sort((a, b) => b - a);
    const groupShipping = Math.round((perItem[0] + perItem.slice(1).reduce((s, r) => s + r * 0.5, 0)) * 100) / 100;

    artistGroups.push({
      artistSlug: slug,
      artistName: group.artistName,
      shipping: groupShipping,
      needsSignature,
      longestTierLabel,
      estimatedDays,
      anyEstimated,
    });
  }

  const totalShipping = Math.round(artistGroups.reduce((s, g) => s + g.shipping, 0) * 100) / 100;
  return { artistGroups, totalShipping };
}
```

- [ ] **Step 2: Tests**

```ts
// src/lib/shipping-checkout.test.ts
import { describe, it, expect } from "vitest";
import { calculateOrderShipping, type CartLineForShipping } from "./shipping-checkout";

const baseItem: CartLineForShipping = {
  artistSlug: "a",
  artistName: "A",
  price: 100,
  quantity: 1,
  framed: false,
  dimensions: "50 x 70 cm",
  shippingPrice: null,
  internationalShippingPrice: null,
};

describe("calculateOrderShipping", () => {
  it("single item: returns the resolved cost", () => {
    const r = calculateOrderShipping([{ ...baseItem }], "uk");
    expect(r.artistGroups).toHaveLength(1);
    expect(r.totalShipping).toBeGreaterThan(0);
  });

  it("two items same artist: full + 50% of additional", () => {
    const a = { ...baseItem };
    const b = { ...baseItem, dimensions: "30 x 40 cm" };
    const single = calculateOrderShipping([a], "uk").totalShipping;
    const second = calculateOrderShipping([b], "uk").totalShipping;
    const expected = Math.round((Math.max(single, second) + Math.min(single, second) * 0.5) * 100) / 100;
    const r = calculateOrderShipping([a, b], "uk");
    expect(r.totalShipping).toBe(expected);
  });

  it("two artists: shipping accumulates per group", () => {
    const r = calculateOrderShipping(
      [{ ...baseItem }, { ...baseItem, artistSlug: "b", artistName: "B" }],
      "uk",
    );
    expect(r.artistGroups).toHaveLength(2);
    const sum = Math.round((r.artistGroups[0].shipping + r.artistGroups[1].shipping) * 100) / 100;
    expect(r.totalShipping).toBe(sum);
  });

  it("manualPrice override takes precedence", () => {
    const r = calculateOrderShipping([{ ...baseItem, shippingPrice: 5.0 }], "uk");
    expect(r.totalShipping).toBe(5.0);
  });

  it("international uses internationalShippingPrice when set", () => {
    const r = calculateOrderShipping(
      [{ ...baseItem, shippingPrice: 5.0, internationalShippingPrice: 22.0 }],
      "international",
    );
    expect(r.totalShipping).toBe(22.0);
  });

  it("rounds to integer pence", () => {
    const r = calculateOrderShipping([{ ...baseItem, shippingPrice: 14.499 }], "uk");
    expect((Math.round(r.totalShipping * 100)) / 100).toBe(r.totalShipping);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run shipping-checkout`
Expected: PASS, 6 cases.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shipping-checkout.ts src/lib/shipping-checkout.test.ts
git commit -m "feat(shipping): shared per-artist shipping helper with tests"
```

---

### Task D.2: Wire helper into display page

**Files:**
- Modify: `src/app/(pages)/checkout/page.tsx`

- [ ] **Step 1: Replace inline calc**

Replace lines 33-94 (the `artistGroups.reduce(...)` + flatMap + sort block):

```tsx
import { calculateOrderShipping } from "@/lib/shipping-checkout";

const region: "uk" | "international" =
  shipping.country !== "United Kingdom" && shipping.country !== "" ? "international" : "uk";

const { artistGroups, totalShipping } = useMemo(
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

const shippingCost = totalShipping;
const total = subtotal + shippingCost;
```

The render block that walks `artistGroups` already maps to the helper's output shape (verify field names — `artistName`, `shipping`, `longestTierLabel`, `estimatedDays`, `needsSignature`, `anyEstimated` are present and identically named).

- [ ] **Step 2: POST expectedShippingCost**

In `handleSubmit`, extend the request body:

```ts
body: JSON.stringify({
  items,
  shipping,
  expectedShippingCost: shippingCost,
  expectedSubtotal: subtotal,
  source: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") || "direct" : "direct",
  venueSlug: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("venue") || "" : "",
}),
```

- [ ] **Step 3: Manual smoke**

Add 2 items by the same artist to cart. Note total shown. Don't proceed yet (Stripe step happens in D.3).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(pages\)/checkout/page.tsx
git commit -m "refactor(checkout): consolidate shipping calc via shared helper"
```

---

### Task D.3: Wire helper into the API route

**Files:**
- Modify: `src/app/api/checkout/route.ts`

- [ ] **Step 1: Replace flat calc**

Replace lines 33-56 (the `DEFAULT_SHIPPING` block + the loop that adds shipping as a Stripe line item):

```ts
import { calculateOrderShipping } from "@/lib/shipping-checkout";

// after parsed.data destructure:
const region: "uk" | "international" =
  shipping.country && shipping.country !== "United Kingdom" ? "international" : "uk";

const { totalShipping } = calculateOrderShipping(
  items.map((it) => ({
    artistSlug: it.artistSlug || "",
    artistName: it.artistName || "Artist",
    shippingPrice: it.shippingPrice ?? null,
    internationalShippingPrice: it.internationalShippingPrice ?? null,
    dimensions: it.dimensions || null,
    framed: it.framed ?? false,
    price: it.price,
    quantity: it.quantity,
  })),
  region,
);

if (typeof body.expectedShippingCost === "number" &&
    Math.abs(body.expectedShippingCost - totalShipping) > 0.01) {
  console.warn("Shipping divergence", {
    expected: body.expectedShippingCost,
    computed: totalShipping,
  });
}

if (totalShipping > 0) {
  lineItems.push({
    price_data: {
      currency: "gbp",
      product_data: { name: "Shipping", description: "Delivery costs set by artist" },
      unit_amount: Math.round(totalShipping * 100),
    },
    quantity: 1,
  });
}
```

- [ ] **Step 2: Manual smoke**

Add 2 items by the same artist to cart. Note total shown. Click Proceed to Payment. On Stripe checkout, verify the shipping line item amount matches the displayed shipping. Total === card charge.

- [ ] **Step 3: Run check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/checkout/route.ts
git commit -m "fix(checkout): API uses shared shipping calc to match display"
```

---

### Task D.4: Unblock guest checkout after QR scan

**Files:**
- Read/Modify: `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx`
- Read/Modify: `src/context/CartContext.tsx`
- Read/Modify: `src/app/(pages)/checkout/page.tsx`

- [ ] **Step 1: Find any auth gates**

Run:
```bash
grep -rn "isAuthenticated\\|user\\?\\.id\\|userType\\|/login\\|/signup" \
  src/app/\\(pages\\)/checkout \
  src/app/\\(pages\\)/browse/\\[slug\\]/\\[workSlug\\] \
  src/context/CartContext.tsx
```

- [ ] **Step 2: Buy-now path inspection**

Open `ArtworkPageClient.tsx` Buy Now button. Confirm it calls `addItem(...)` then routes to `/checkout` regardless of auth. If there's an `if (!user)` redirect to /login or /signup, replace with the direct flow.

- [ ] **Step 3: CartContext inspection**

Confirm `addItem` is auth-free.

- [ ] **Step 4: Checkout email pre-fill on QR ref**

In `(pages)/checkout/page.tsx`, when the page mounts:

```tsx
useEffect(() => {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  const ref = sp.get("ref");
  const presetEmail = sp.get("email");
  if (ref === "qr" && presetEmail) {
    setShipping((prev) => prev.email ? prev : { ...prev, email: presetEmail });
  }
}, []);
```

- [ ] **Step 5: Manual smoke**

In an incognito browser session (no auth):
1. Visit `/api/qr/<artist-slug>?w=<workId>` — should redirect to the artwork page.
2. Click Buy Now. Should land on `/checkout` with the artwork in cart, no login wall.
3. Fill the form, submit. Stripe checkout opens. Pay (test card `4242 4242 4242 4242`).
4. Verify confirmation page renders. Inspect the `orders` row in DB; `buyer_user_id` is NULL, `buyer_email` is set.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(pages\)/browse/\[slug\]/\[workSlug\]/ArtworkPageClient.tsx src/app/\(pages\)/checkout/page.tsx
git commit -m "fix(checkout): unblock guest path from QR scan"
```

---

## Workstream D checkpoint

Run: `npm run check`. End-to-end: add to cart → checkout → Stripe → pay → confirmation, as guest. Total displayed, total on Stripe page, and total charged must all match exactly.

---

## Self-review

**Spec coverage:** D1 → D.1, D.2, D.3. D2 (defensive expected check) → D.3. D3 → D.4.

**Placeholder scan:** clean.

**Type consistency:** `CartLineForShipping`, `OrderShipping`, `calculateOrderShipping` are referenced consistently; `expectedShippingCost` posted by D.2 is read by D.3.
