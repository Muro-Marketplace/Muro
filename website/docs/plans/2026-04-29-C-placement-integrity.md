# Workstream C — Placement ↔ inventory ↔ revenue integrity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Linked spec: `docs/specs/2026-04-29-batch-fixes-design.md` § Workstream C.

**Goal:** When a placement becomes active, decrement finite stock and stamp `placed_at_venue` on the work. When an order is delivered, attribute its `venue_revenue` back to the placement. Surface "Placed at [Venue]" on the public artwork detail page (the card overlay already lands in workstream B). Expose placement-attributed revenue in venue analytics.

**Architecture:** A single additive migration adds two columns on `artist_works` (denormalised display + soft FK), one counter on `placements`, two indexes, and one atomic SQL function `increment_placement_revenue`. API handlers for `placements/[id]` PATCH (acceptance/end transitions) and `orders` PATCH (delivery transition) get the new write paths. Venue analytics reads back the data via a single GROUP BY join.

**Tech Stack:** Next.js 16 (App Router) · Supabase / PostgreSQL · TypeScript.

**Dependencies:**
- None for the backend tasks (C.1, C.2, C.3, C.5).
- C.4 (placed-at chip on artwork detail) is independent of B.
- The placed-at chip on the **card overlay** is part of workstream B (`<ArtworkCard placedAtVenue=…>`); B.2 added the prop, C populates the source column it reads from.

**Items covered:** 6 (revenue → placement on delivery), 13 (stock decrement + "placed at"), 17 (overall consistency).

---

## File Structure

### Created

| Path | Responsibility |
|------|----------------|
| `supabase/migrations/038_placement_inventory_attribution.sql` | Adds `placed_at_venue`, `current_placement_id` on `artist_works`; `delivery_count` on `placements`; two indexes; `increment_placement_revenue` SQL function. |

### Modified

| Path | Change |
|------|--------|
| `src/app/api/placements/[id]/route.ts` | On `active` transition: decrement work stock, stamp placed-at + current-placement. On terminal transitions: restore stock, clear placed-at. Idempotent. |
| `src/app/api/orders/route.ts` | On `delivered` transition: call `increment_placement_revenue` if `placement_id` is set. Idempotent via `status_history`. |
| `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx` | Render "Currently placed at [venue]" chip when `work.placed_at_venue` is set. |
| `src/app/api/analytics/venue/route.ts` | Surface a `placementRevenue` field in the response. |

---

## Tasks

### Task C.1: Database migration

**Files:**
- Create: `supabase/migrations/038_placement_inventory_attribution.sql`

- [ ] **Step 1: Write migration**

```sql
-- 038_placement_inventory_attribution.sql
--
-- Stock + revenue + venue attribution for placed works. Adds two
-- columns on artist_works to mirror placement state on the work for
-- cheap reads, one counter on placements, an atomic SQL function for
-- attribution, and partial indexes to keep the lookup queries fast.

ALTER TABLE artist_works
  ADD COLUMN IF NOT EXISTS placed_at_venue TEXT,
  ADD COLUMN IF NOT EXISTS current_placement_id TEXT;

CREATE INDEX IF NOT EXISTS idx_artist_works_current_placement
  ON artist_works(current_placement_id)
  WHERE current_placement_id IS NOT NULL;

ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS delivery_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_placement_delivered
  ON orders(placement_id)
  WHERE placement_id IS NOT NULL AND status = 'delivered';

CREATE OR REPLACE FUNCTION increment_placement_revenue(
  p_placement_id TEXT,
  p_amount NUMERIC
) RETURNS VOID AS $$
BEGIN
  UPDATE placements
  SET revenue = COALESCE(revenue, 0) + p_amount,
      delivery_count = delivery_count + 1
  WHERE id = p_placement_id;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Apply**

Either:
- `npx supabase db push --include-seed=false` (if Supabase CLI configured)
- Paste into the Supabase dashboard SQL editor (dev project)

- [ ] **Step 3: Verify**

In the Supabase dashboard, confirm:
- `artist_works` has new columns `placed_at_venue text` and `current_placement_id text`.
- `placements` has new column `delivery_count integer not null default 0`.
- Function `increment_placement_revenue(text, numeric)` is listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/038_placement_inventory_attribution.sql
git commit -m "feat(db): placement inventory + revenue attribution columns"
```

---

### Task C.2: Stock decrement + placed-at on placement acceptance

**Files:**
- Modify: `src/app/api/placements/[id]/route.ts`

- [ ] **Step 1: Read existing PATCH handler**

Identify:
- Where `newStatus === "active"` is set on the placement row.
- The `existingPlacement` object — confirm it has `status`, `work_id`, `venue_user_id`.
- Whether the handler already reads `venue_profiles.name` anywhere.

- [ ] **Step 2: Add decrement on accept**

Insert after the status update succeeds:

```ts
if (newStatus === "active" && existingPlacement.status !== "active" && existingPlacement.work_id) {
  const { data: venue } = await db
    .from("venue_profiles")
    .select("name")
    .eq("user_id", existingPlacement.venue_user_id)
    .maybeSingle();

  const { data: work } = await db
    .from("artist_works")
    .select("quantity_available")
    .eq("id", existingPlacement.work_id)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    placed_at_venue: venue?.name ?? null,
    current_placement_id: existingPlacement.id,
  };
  if (typeof work?.quantity_available === "number" && work.quantity_available > 0) {
    const next = work.quantity_available - 1;
    updates.quantity_available = next;
    updates.available = next > 0;
  }
  await db.from("artist_works").update(updates).eq("id", existingPlacement.work_id);
}
```

- [ ] **Step 3: Add restore on terminal transition**

```ts
const TERMINAL_STATES = new Set(["ended", "collected", "declined"]);
const wasActive = existingPlacement.status === "active";
if (wasActive && TERMINAL_STATES.has(newStatus) && existingPlacement.work_id) {
  const { data: work } = await db
    .from("artist_works")
    .select("quantity_available, current_placement_id")
    .eq("id", existingPlacement.work_id)
    .maybeSingle();

  if (work?.current_placement_id === existingPlacement.id) {
    const updates: Record<string, unknown> = {
      placed_at_venue: null,
      current_placement_id: null,
    };
    if (typeof work.quantity_available === "number") {
      updates.quantity_available = work.quantity_available + 1;
      updates.available = true;
    }
    await db.from("artist_works").update(updates).eq("id", existingPlacement.work_id);
  }
}
```

- [ ] **Step 4: Manual smoke**

PATCH a placement from `requested` → `active` (Supabase dashboard or curl). Verify `artist_works.quantity_available` decremented (if finite) and `placed_at_venue` set. PATCH back to `ended`; verify the inverse.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/placements/\[id\]/route.ts
git commit -m "feat(placements): decrement stock + stamp placed_at on accept"
```

---

### Task C.3: Revenue attribution on order delivered

**Files:**
- Modify: `src/app/api/orders/route.ts`

- [ ] **Step 1: Widen pre-update SELECT**

In the PATCH handler around line 99-124, change `.select(...)` to include `placement_id, venue_revenue`:

```ts
const { data: order } = await db
  .from("orders")
  .select("artist_user_id, artist_slug, buyer_email, buyer_user_id, shipping, status_history, placement_id, venue_revenue")
  .eq("id", orderId)
  .single();
```

- [ ] **Step 2: Attribute after status update**

Insert after the existing `.update({ status, ... })` succeeds:

```ts
if (status === "delivered" && order.placement_id && order.venue_revenue) {
  const alreadyDelivered = (order.status_history || []).some(
    (h: { status?: string }) => h.status === "delivered"
  );
  if (!alreadyDelivered) {
    const { error: rpcErr } = await db.rpc("increment_placement_revenue", {
      p_placement_id: order.placement_id,
      p_amount: order.venue_revenue,
    });
    if (rpcErr) console.error("Failed to attribute placement revenue:", rpcErr);
  }
}
```

- [ ] **Step 3: Manual smoke**

Find a delivered-eligible order in dev with a `placement_id` set. PATCH back to `shipped` then through API to `delivered`. Confirm:
- `placements.revenue` increased by `venue_revenue`.
- `placements.delivery_count` incremented.
- A second PATCH to `delivered` does NOT double-attribute (idempotent).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/orders/route.ts
git commit -m "feat(orders): attribute venue_revenue to placement on delivered"
```

---

### Task C.4: "Currently placed at [venue]" chip on artwork detail

**Files:**
- Modify: `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx`

- [ ] **Step 1: Verify `work.placed_at_venue` is propagated**

Trace the `work` prop from the page server component (`browse/[slug]/[workSlug]/page.tsx`) through to `ArtworkPageClient`. If the SELECT doesn't include the new column, add it. Same for any API endpoint serving the work.

- [ ] **Step 2: Render chip**

Below the title in `ArtworkPageClient.tsx`:

```tsx
{work.placed_at_venue && (
  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted bg-foreground/5 rounded-full px-2.5 py-1">
    <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
    Currently placed at {work.placed_at_venue}
  </p>
)}
```

- [ ] **Step 3: Manual smoke**

Mark a work as placed via Task C.2 flow (PATCH a placement to active). Open `/browse/<artist>/<work>` and verify the chip renders.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(pages\)/browse/\[slug\]/\[workSlug\]/ArtworkPageClient.tsx
git commit -m "feat(artwork): show placed-at-venue chip on detail page"
```

---

### Task C.5: Surface placement-attributed revenue in venue analytics

**Files:**
- Modify: `src/app/api/analytics/venue/route.ts`

- [ ] **Step 1: Read existing handler**

Identify the response shape and the venue identifier (likely `venue_slug`).

- [ ] **Step 2: Add query and field**

```ts
const { data: placementRows } = await db
  .from("placements")
  .select("id, artist_slug, work_id, delivery_count, revenue")
  .eq("venue_slug", venueSlug);

return NextResponse.json({
  // ... existing fields ...
  placementRevenue: (placementRows ?? []).map((p) => ({
    placementId: p.id,
    artistSlug: p.artist_slug,
    workId: p.work_id,
    deliveryCount: p.delivery_count ?? 0,
    revenue: Number(p.revenue ?? 0),
  })),
});
```

- [ ] **Step 3: Update consumers**

`grep -rn "/api/analytics/venue" src/` to find consumers (likely venue-portal/analytics page). If they have type checks on the response, add the new optional field.

- [ ] **Step 4: Manual smoke**

Hit `/api/analytics/venue` for a venue that has at least one delivered order against an active placement; verify `placementRevenue` array contains the row with non-zero `revenue`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analytics/venue/route.ts
git commit -m "feat(analytics): expose placement-attributed revenue to venues"
```

---

## Workstream C checkpoint

Run: `npm run check`. End-to-end smoke: create a placement, accept it, observe stock decrement + chip on artwork. Create an order against that placement, deliver it, observe `placements.revenue` increment and venue analytics update.

---

## Self-review

**Spec coverage:** C1 → C.1. C2 → C.2. C3 → C.3. C4 → C.4 (detail page) + B.2 (card overlay reads `placedAtVenue`). C5 → C.5.

**Placeholder scan:** clean.

**Type consistency:** the `placement_id`, `venue_revenue`, `placed_at_venue`, `current_placement_id`, `delivery_count` column names are referenced consistently across migration, handlers, and analytics. The `increment_placement_revenue(text, numeric)` SQL function signature is consistent across migration and call site.
