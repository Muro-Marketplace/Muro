# Workstream A — Collections as a first-class browsing surface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Linked spec: `docs/specs/2026-04-29-batch-fixes-design.md` § Workstream A.

**Goal:** Extract a shared `<FilterPanel />` from the `/browse` monolith, wire it into the collection detail page with a coherent mobile layout, and make request-placement on collections a first-class action via the shared `<PlacementButton />`.

**Architecture:** A pure presentational `FilterPanel` component plus a `useFilterState` hook that owns state and derived predicates. The `mode` prop on both gates which filter rows render. Size bands live in a single `SizeBands.ts` constant consumed by the panel and the existing `bandForCm` callers in `/browse/page.tsx`. Existing `<PlacementButton />` from `src/components/PlacementCTA.tsx` is extended to take multi-work + arrangement props.

**Tech Stack:** React 19 · Next.js 16 (App Router) · Tailwind v4 · TypeScript · Vitest.

**Dependencies:** none (workstream A starts on a clean tree).

**Items covered:** 1 (request placement on collections), 8 (filter bar + mobile layout), 15 (UX consistency), and the size-filter labelling from item 7 (the data structure lands here so workstream B can render it).

---

## File Structure

### Created

| Path | Responsibility |
|------|----------------|
| `src/components/browse/SizeBands.ts` | Size-band ranges, labels, and dimension hints. Single source of truth. |
| `src/components/browse/SizeBands.test.ts` | Tests proving canonical ordering, en-dash hints, `bandForCm` correctness. |
| `src/components/browse/FilterPanel.tsx` | Presentational filter panel; consumes filter state and emits change events. |
| `src/components/browse/useFilterState.ts` | Hook owning filter state + derived predicates. |

### Modified

| Path | Change |
|------|--------|
| `src/app/(pages)/browse/page.tsx` | Replace inline filter UI and inline state with `<FilterPanel />` + `useFilterState`. |
| `src/app/(pages)/browse/collections/[collectionId]/page.tsx` | Add `<FilterPanel mode="collection-detail" />`; mobile layout fixes; route request-placement through `<PlacementButton />`. |
| `src/components/PlacementCTA.tsx` | Extend props with `workTitles`, `arrangement`, `prefillMessage`. |
| `src/components/CollectionCard.tsx` | Stub a `<PlacementButton />` slot for the collections grid view (visual styling lands in workstream B). |

---

## Tasks

### Task A.1: SizeBands constant + tests

**Files:**
- Create: `src/components/browse/SizeBands.ts`
- Create: `src/components/browse/SizeBands.test.ts`

- [ ] **Step 1: Define the constant**

```ts
// src/components/browse/SizeBands.ts
//
// Size-band ranges, labels, and the dimension hint shown on the right
// side of each filter row. Single source of truth — bandForCm() and
// the FilterPanel render must agree on the same numbers.

export type SizeBandKey = "small" | "medium" | "large" | "xl";

export interface SizeBand {
  key: SizeBandKey;
  label: string;
  /** Inclusive lower bound on longest edge in cm. null = unbounded below. */
  minCm: number | null;
  /** Inclusive upper bound. null = unbounded above. */
  maxCm: number | null;
  /** Display string for the right side of the filter row, en dash. */
  dimensionHint: string;
}

export const SIZE_BANDS: readonly SizeBand[] = [
  { key: "small",  label: "Small",  minCm: null, maxCm: 30,   dimensionHint: "≤ 30 cm"   },
  { key: "medium", label: "Medium", minCm: 30,   maxCm: 60,   dimensionHint: "30–60 cm"  },
  { key: "large",  label: "Large",  minCm: 60,   maxCm: 100,  dimensionHint: "60–100 cm" },
  { key: "xl",     label: "XL",     minCm: 100,  maxCm: null, dimensionHint: "> 100 cm"  },
];

export function bandForCm(longestEdgeCm: number): SizeBandKey {
  for (const band of SIZE_BANDS) {
    const lo = band.minCm ?? -Infinity;
    const hi = band.maxCm ?? Infinity;
    if (longestEdgeCm > lo && longestEdgeCm <= hi) return band.key;
  }
  return "xl";
}
```

- [ ] **Step 2: Tests**

```ts
// src/components/browse/SizeBands.test.ts
import { describe, it, expect } from "vitest";
import { SIZE_BANDS, bandForCm } from "./SizeBands";

describe("SIZE_BANDS", () => {
  it("has four bands in canonical order", () => {
    expect(SIZE_BANDS.map((b) => b.key)).toEqual(["small", "medium", "large", "xl"]);
  });
  it("uses en dash, not em dash, in dimension hints", () => {
    for (const b of SIZE_BANDS) expect(b.dimensionHint).not.toContain("—");
  });
});

describe("bandForCm", () => {
  it.each([
    [10, "small"], [30, "small"],
    [31, "medium"], [60, "medium"],
    [61, "large"], [100, "large"],
    [101, "xl"], [200, "xl"],
  ])("%scm → %s", (cm, expected) => {
    expect(bandForCm(cm)).toBe(expected);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run SizeBands`
Expected: PASS, all assertions.

- [ ] **Step 4: Commit**

```bash
git add src/components/browse/SizeBands.ts src/components/browse/SizeBands.test.ts
git commit -m "feat(browse): single source of truth for size bands"
```

---

### Task A.2: Survey the existing inline filter UI

**Files:** read-only.

- [ ] **Step 1: Read /browse/page.tsx filter region**

Use Read with offset=92, limit=300 on `src/app/(pages)/browse/page.tsx` to capture the state hook block. Identify:
- Filter state shape (every `useState` between lines 92-374).
- The location of the inline filter render JSX block.
- The `useMemo` that filters `allGalleryWorks` / `artists` / `collections`.

- [ ] **Step 2: Decide the FilterPanel API**

```ts
type FilterPanelMode = "works-grid" | "portfolios-grid" | "collections-grid" | "collection-detail";

interface FilterPanelProps {
  mode: FilterPanelMode;
  state: FilterState;
  onChange: (next: Partial<FilterState>) => void;
  isMobileDrawerOpen?: boolean;
  onMobileDrawerClose?: () => void;
}
```

- [ ] **Step 3: No commit — exploration only**

---

### Task A.3: Build useFilterState hook

**Files:**
- Create: `src/components/browse/useFilterState.ts`

- [ ] **Step 1: Hook**

```ts
// src/components/browse/useFilterState.ts
import { useState, useCallback, useMemo } from "react";
import { bandForCm, type SizeBandKey } from "./SizeBands";

export interface FilterState {
  // Distance / location
  maxDistance: number;
  mode: "local" | "global";
  // Themes
  themes: string[];
  // Format flags
  originals: boolean;
  prints: boolean;
  framing: boolean;
  // Arrangement
  revenueShare: boolean;
  paidLoan: boolean;
  outrightPurchase: boolean;
  revenueShareMin: number;
  // Venue
  venueTypes: string[];
  // Style / medium
  styleMedium: string;
  // Price (works)
  priceMin: number;
  priceMax: number;
  // Size
  sizes: Set<SizeBandKey>;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  maxDistance: 25,
  mode: "global",
  themes: [],
  originals: false,
  prints: false,
  framing: false,
  revenueShare: false,
  paidLoan: false,
  outrightPurchase: false,
  revenueShareMin: 0,
  venueTypes: [],
  styleMedium: "",
  priceMin: 0,
  priceMax: 100000,
  sizes: new Set<SizeBandKey>(),
};

export type FilterPanelMode = "works-grid" | "portfolios-grid" | "collections-grid" | "collection-detail";

export interface UseFilterStateOptions {
  mode: FilterPanelMode;
  initial?: Partial<FilterState>;
}

export function useFilterState(opts: UseFilterStateOptions) {
  const [state, setState] = useState<FilterState>(() => ({ ...DEFAULT_FILTER_STATE, ...opts.initial }));

  const onChange = useCallback((next: Partial<FilterState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  const reset = useCallback(() => setState({ ...DEFAULT_FILTER_STATE, ...opts.initial }), [opts.initial]);

  const matchesSize = useCallback((longestEdgeCm: number | null) => {
    if (state.sizes.size === 0) return true;
    if (longestEdgeCm == null) return false;
    return state.sizes.has(bandForCm(longestEdgeCm));
  }, [state.sizes]);

  const matchesArrangement = useCallback((openTo: { revenueShare: boolean; freeLoan: boolean; purchase: boolean }) => {
    if (!state.revenueShare && !state.paidLoan && !state.outrightPurchase) return true;
    if (state.revenueShare && openTo.revenueShare) return true;
    if (state.paidLoan && openTo.freeLoan) return true;
    if (state.outrightPurchase && openTo.purchase) return true;
    return false;
  }, [state.revenueShare, state.paidLoan, state.outrightPurchase]);

  const matchesPrice = useCallback((priceGbp: number | null) => {
    if (priceGbp == null) return state.priceMin === 0;
    return priceGbp >= state.priceMin && priceGbp <= state.priceMax;
  }, [state.priceMin, state.priceMax]);

  return useMemo(
    () => ({ state, onChange, reset, matchesSize, matchesArrangement, matchesPrice, mode: opts.mode }),
    [state, onChange, reset, matchesSize, matchesArrangement, matchesPrice, opts.mode],
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/browse/useFilterState.ts
git commit -m "feat(browse): useFilterState hook with derived predicates"
```

---

### Task A.4: Build FilterPanel component

**Files:**
- Create: `src/components/browse/FilterPanel.tsx`

- [ ] **Step 1: Skeleton + size filter row (the new feature)**

```tsx
// src/components/browse/FilterPanel.tsx
"use client";
import { SIZE_BANDS } from "./SizeBands";
import type { FilterState, FilterPanelMode } from "./useFilterState";

interface FilterPanelProps {
  mode: FilterPanelMode;
  state: FilterState;
  onChange: (next: Partial<FilterState>) => void;
  isMobileDrawerOpen?: boolean;
  onMobileDrawerClose?: () => void;
}

export default function FilterPanel(props: FilterPanelProps) {
  const { mode, state, onChange, isMobileDrawerOpen, onMobileDrawerClose } = props;

  const showDistance = mode === "portfolios-grid";
  const showVenueTypes = mode === "portfolios-grid";
  const showThemes = mode === "works-grid" || mode === "portfolios-grid";
  const showSize = mode !== "portfolios-grid";
  const showPrice = mode !== "portfolios-grid";

  return (
    <aside
      className={`${
        isMobileDrawerOpen
          ? "fixed inset-0 z-50 bg-background overflow-y-auto p-6"
          : "hidden lg:block sticky top-24 w-64 shrink-0 space-y-6"
      }`}
    >
      {isMobileDrawerOpen && (
        <button
          onClick={onMobileDrawerClose}
          className="lg:hidden absolute top-4 right-4 w-8 h-8 rounded-full bg-foreground/5 text-foreground"
          aria-label="Close filters"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mx-auto">
            <path d="M3 3l8 8M11 3L3 11" />
          </svg>
        </button>
      )}

      {showSize && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Size</h3>
          <div className="space-y-1">
            {SIZE_BANDS.map((b) => {
              const checked = state.sizes.has(b.key);
              return (
                <label key={b.key} className="flex items-center justify-between gap-3 cursor-pointer text-sm py-1">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(state.sizes);
                        if (checked) next.delete(b.key); else next.add(b.key);
                        onChange({ sizes: next });
                      }}
                    />
                    <span className="text-foreground">{b.label}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums">{b.dimensionHint}</span>
                </label>
              );
            })}
          </div>
        </section>
      )}
      {/* Remaining sections ported from /browse/page.tsx in Task A.5. Stubbed here for now. */}
    </aside>
  );
}
```

- [ ] **Step 2: Port the remaining filter rows**

From the inline filter JSX in `/browse/page.tsx` (identified in Task A.2), port each row in turn:
1. Price range slider/inputs (gated by `showPrice`)
2. Arrangement chips: Revenue Share / Paid Loan / Direct Purchase + `revenueShareMin` slider
3. Originals / Prints / Framing checkboxes
4. Themes pill list (gated by `showThemes`)
5. Style / Medium select
6. Distance + mode (local/global) — gated by `showDistance`
7. Venue Types — gated by `showVenueTypes`
8. "Clear all" button at the bottom calling `onChange({...DEFAULT_FILTER_STATE})`

For each, replace `setSomething(...)` with `onChange({ something: ... })` and read from `state.something`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/browse/FilterPanel.tsx
git commit -m "feat(browse): FilterPanel component with mode-gated filter rows"
```

---

### Task A.5: Replace inline filter UI in /browse/page.tsx

**Files:**
- Modify: `src/app/(pages)/browse/page.tsx`

- [ ] **Step 1: Add hook + replace state**

At the top of the component:

```tsx
import FilterPanel from "@/components/browse/FilterPanel";
import { useFilterState } from "@/components/browse/useFilterState";

const filterMode = view === "artists" ? "portfolios-grid"
  : view === "collections" ? "collections-grid"
  : "works-grid";
const filters = useFilterState({ mode: filterMode });
```

Then delete the ~20 individual `useState` hooks for filter values and replace each `setX(...)` with `filters.onChange({ x: ... })`. References to filter values become `filters.state.x`.

- [ ] **Step 2: Replace inline filter JSX**

Find the inline filter render block. Replace with:

```tsx
<FilterPanel
  mode={filterMode}
  state={filters.state}
  onChange={filters.onChange}
  isMobileDrawerOpen={mobileFiltersOpen}
  onMobileDrawerClose={() => setMobileFiltersOpen(false)}
/>
```

- [ ] **Step 3: Update the filtered-array `useMemo`**

Inline arrangement / size / price checks become:

```tsx
if (!filters.matchesArrangement({ revenueShare: artist.openToRevenueShare, freeLoan: artist.openToFreeLoan, purchase: artist.openToOutrightPurchase })) return false;
if (!filters.matchesPrice(work.price)) return false;
const longest = parseLongestEdgeCm(work.dimensions);
if (!filters.matchesSize(longest)) return false;
```

`parseLongestEdgeCm` is a small helper using `parseDimensions` from `src/lib/shipping-calculator.ts` and taking the max of width/height.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Open `/browse`. Toggle works/portfolios/collections views. Toggle each filter. Verify behaviour identical.

- [ ] **Step 5: Run check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(pages\)/browse/page.tsx
git commit -m "refactor(browse): replace inline filter UI with FilterPanel"
```

---

### Task A.6: Wire FilterPanel into collection detail + mobile layout

**Files:**
- Modify: `src/app/(pages)/browse/collections/[collectionId]/page.tsx`

- [ ] **Step 1: Add FilterPanel + state**

Above the works grid:

```tsx
import FilterPanel from "@/components/browse/FilterPanel";
import { useFilterState } from "@/components/browse/useFilterState";
import { parseDimensions } from "@/lib/shipping-calculator";

const filters = useFilterState({ mode: "collection-detail" });
const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

const filteredWorks = useMemo(() => collection.works.filter((w) => {
  const dims = parseDimensions(w.dimensions);
  const longest = dims ? Math.max(dims.widthCm, dims.heightCm) : null;
  if (!filters.matchesSize(longest)) return false;
  if (!filters.matchesPrice(w.price ?? null)) return false;
  return true;
}), [collection.works, filters.matchesSize, filters.matchesPrice]);
```

- [ ] **Step 2: Layout grid + mobile drawer trigger**

```tsx
<div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6">
  <FilterPanel
    mode="collection-detail"
    state={filters.state}
    onChange={filters.onChange}
    isMobileDrawerOpen={mobileFiltersOpen}
    onMobileDrawerClose={() => setMobileFiltersOpen(false)}
  />
  <section>
    <button
      className="lg:hidden mb-4 inline-flex items-center gap-1.5 px-3 py-2 bg-foreground text-white text-sm rounded-sm"
      onClick={() => setMobileFiltersOpen(true)}
    >
      Filters {filters.state.sizes.size > 0 ? `(${filters.state.sizes.size})` : ""}
    </button>
    {/* existing works grid, swapped to render `filteredWorks` */}
  </section>
</div>
```

- [ ] **Step 3: Mobile layout fixes**

- 1-col grid `<sm`, 2-col `≥sm`, 3-col `≥lg`.
- Banner image: cap at `max-h-[60vh]` on `<sm`.
- Sticky sidebar (price + arrangement chips + Buy Collection CTA): collapse below the grid on `<lg`.

- [ ] **Step 4: Manual smoke**

`npm run dev` → `/browse/collections/<id>`. Test on desktop and at 375px width. Verify drawer open/close, filtering works, banner not dominating mobile fold.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(pages\)/browse/collections/\[collectionId\]/page.tsx
git commit -m "feat(collections): filter panel + mobile layout on collection detail"
```

---

### Task A.7: Extend `<PlacementButton />` and route collections through it

**Files:**
- Modify: `src/components/PlacementCTA.tsx`
- Modify: `src/app/(pages)/browse/collections/[collectionId]/page.tsx`
- Modify: `src/components/CollectionCard.tsx`

- [ ] **Step 1: Extend PlacementButton props**

```ts
// src/components/PlacementCTA.tsx
export interface PlacementButtonProps {
  artistSlug: string;
  artistName: string;
  workTitles?: string[];
  arrangement?: "revenue_share" | "free_loan" | "purchase";
  prefillMessage?: string;
  className?: string;
  variant?: "primary" | "secondary";
  children?: React.ReactNode;
}
```

URL construction:

```ts
const params = new URLSearchParams();
params.set("artist", artistSlug);
params.set("artistName", artistName);
if (workTitles && workTitles.length) params.set("works", workTitles.join(","));
if (arrangement) params.set("arrangement", arrangement);
if (prefillMessage) params.set("prefillMessage", prefillMessage);
const href = `/venue-portal/placements?${params.toString()}`;
```

Hide button if `userType === "artist"`. Route non-authed users via `/signup?next=${encodeURIComponent(href)}`.

- [ ] **Step 2: Replace inline routing on collection detail**

In `browse/collections/[collectionId]/page.tsx` (the existing inline link block at lines ~285-321):

```tsx
import PlacementButton from "@/components/PlacementCTA";

<PlacementButton
  artistSlug={collection.artistSlug}
  artistName={collection.artistName}
  workTitles={collection.works.map((w) => w.title)}
  arrangement={chosenArrangement}
  prefillMessage={`I'd like to place "${collection.name}" by ${collection.artistName}`}
  variant="primary"
>
  Request placement
</PlacementButton>
```

`chosenArrangement` is derived from the collection's offered arrangements. If multiple, render a small `<select>` above the button so the venue can pick.

- [ ] **Step 3: Stub on CollectionCard for the grid view**

In `src/components/CollectionCard.tsx`, surface a `<PlacementButton variant="secondary" />` that's hidden by default and shown on hover (web) / inside the future tap-revealed overlay (mobile, lands in workstream B). For now, just wire the button so it works visually subdued; B styles it properly.

- [ ] **Step 4: Run check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PlacementCTA.tsx src/app/\(pages\)/browse/collections/\[collectionId\]/page.tsx src/components/CollectionCard.tsx
git commit -m "feat(collections): unify request-placement via shared PlacementButton"
```

---

## Workstream A checkpoint

Run: `npm run check`. Manual smoke on `/browse` (all three views, all filters) and `/browse/collections/<id>` (filter panel, request placement, mobile layout).

If green, A is done and B can start.

---

## Self-review

**Spec coverage:** A1–A5 of the spec all have tasks. A1 (FilterPanel extraction) → A.3, A.4. A2 (collection-detail wiring) → A.6. A3 (request-placement) → A.7. A4 (mobile layout) → A.6. A5 (collections grid view) → A.7 stub, B.4 follow-up.

**Placeholder scan:** clean.

**Type consistency:** `FilterState`, `FilterPanelMode`, `PlacementButtonProps` are referenced consistently across tasks.
