# Workstream F — Polish + isolated bugs + final QA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Linked spec: `docs/specs/2026-04-29-batch-fixes-design.md` § Workstream F.

**Goal:** QR-label preview deselection works on every label. Expanded artwork images defeat right-click and long-press save. Em dashes removed from the rest of the site. Final QA pass across all six workstreams.

**Architecture:** Three independent fixes plus one site-wide sweep plus a final verification phase. The QR-label fix decouples per-label visibility flags from the data fields. The image-save protection adds a transparent overlay + WebKit CSS to the fullscreen lightbox + a global rule for `[data-protected="artwork"]`. The em-dash sweep is mechanical for ranges and human-judgement for prose. The QA pass runs `npm run check` plus a manual walkthrough.

**Tech Stack:** React 19 · Next.js 16 (App Router) · Tailwind v4 · TypeScript · Vitest · Playwright (opportunistic).

**Dependencies:**
- F.1, F.2, F.3 are independent of each other.
- F.4 (final QA) requires A, B, C, D, E to be complete and committed.

**Items covered:** 2 (QR label deselect), 3 (image-save protection), 11 (em-dash sweep site-wide), 18 (final QA).

---

## File Structure

### Modified

| Path | Change |
|------|--------|
| `src/components/labels/LabelPreview.tsx` | Add per-label visibility state; toggle no longer mutates data field. |
| `src/components/labels/LabelSheet.tsx` | Accept and pass through `labelVisibility` prop. |
| `src/components/labels/QRLabel.tsx` | Render `workMedium`/`workDimensions`/`workPrice` conditional on visibility flag AND truthy data. |
| `src/app/(pages)/artist-portal/labels/page.tsx` | Always populate `_sourceMedium/_sourceDimensions/_sourcePrice` (and `workMedium/workDimensions/workPrice` for initial display) from work data. Pass initial visibility to LabelPreview. |
| `src/app/(pages)/venue-portal/labels/page.tsx` | Same as above. |
| `src/components/ArtworkImageViewer.tsx` | Fullscreen branch: add transparent overlay + WebKit CSS on Image. |
| `src/app/globals.css` | New rule for `[data-protected="artwork"]`. |
| `src/components/ArtworkThumb.tsx` | Add `data-protected="artwork"` attribute on image wrapper. |
| `src/components/BrowseArtistCard.tsx` | Add `data-protected="artwork"` and align WebKit CSS. |
| `AGENTS.md` | Replace em dash with en dash. |
| Many under `src/app/(pages)/`, `src/components/`, `src/data/` | Em-dash sweep in user-facing strings. |

---

## Tasks

### Task F.1: QR-label preview per-label visibility refactor

**Files:**
- Modify: `src/components/labels/LabelPreview.tsx`
- Modify: `src/components/labels/LabelSheet.tsx`
- Modify: `src/components/labels/QRLabel.tsx`
- Modify: `src/app/(pages)/artist-portal/labels/page.tsx`
- Modify: `src/app/(pages)/venue-portal/labels/page.tsx`

- [ ] **Step 1: Read QRLabel.tsx**

Find: which fields it renders conditionally and how. Will be the surface for the new visibility flags.

- [ ] **Step 2: Add visibility props to QRLabel**

```tsx
interface QRLabelProps {
  // ... existing props
  showMedium?: boolean;
  showDimensions?: boolean;
  showPrice?: boolean;
}
```

In the render, gate each field on the new flag AND on truthy data:

```tsx
{showMedium && workMedium && <p className="..">{workMedium}</p>}
{showDimensions && workDimensions && <p className="..">{workDimensions}</p>}
{showPrice && workPrice && <p className="..">{workPrice}</p>}
```

Default `showX` props to `true` so existing call sites that don't pass them keep their behaviour.

- [ ] **Step 3: Add per-label visibility state in LabelPreview**

```tsx
interface LabelVisibility {
  medium: boolean;
  dimensions: boolean;
  price: boolean;
}

interface LabelPreviewProps {
  labels: LabelData[];
  initialVisibility?: LabelVisibility[];   // optional; defaults derived from data presence
  availableSizes: string[];
  onClose: () => void;
}

const [labelVisibility, setLabelVisibility] = useState<LabelVisibility[]>(
  () => initialVisibility ?? labels.map((l) => ({
    medium: !!l.workMedium,
    dimensions: !!l.workDimensions,
    price: !!l.workPrice,
  }))
);

function setVisibility(index: number, key: keyof LabelVisibility, next: boolean) {
  setLabelVisibility((prev) => prev.map((v, i) => (i === index ? { ...v, [key]: next } : v)));
}
```

- [ ] **Step 4: Replace toggle handler**

In LabelPreview's toggle render block (the `Medium/Dimensions/Price` checkbox row), replace the mutate-data-field handler with:

```tsx
{([
  { key: "medium" as const, label: "Medium" },
  { key: "dimensions" as const, label: "Dimensions" },
  { key: "price" as const, label: "Price" },
]).map(({ key, label: fieldLabel }) => {
  const isOn = labelVisibility[index][key];
  return (
    <label key={key} className="flex items-center gap-1.5 cursor-pointer">
      <button
        onClick={() => setVisibility(index, key, !isOn)}
        className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${
          isOn ? "bg-accent border-accent" : "bg-white border-border"
        }`}
      >
        {isOn && (
          <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2 7 5.5 10.5 12 3.5" />
          </svg>
        )}
      </button>
      <span className="text-[10px] text-muted">{fieldLabel}</span>
    </label>
  );
})}
```

The "Size on label" buttons (the size-string selector) keep their current behaviour — they still set `workDimensions` directly, which works because `showDimensions` only gates rendering.

- [ ] **Step 5: Pass visibility through LabelSheet**

```tsx
interface LabelSheetProps {
  labels: LabelData[];
  labelVisibility?: LabelVisibility[];
  pageIndex?: number;
}

// inside the page render, on each <QRLabel>:
<QRLabel
  ...
  showMedium={labelVisibility?.[item.uniqueIndex]?.medium ?? true}
  showDimensions={labelVisibility?.[item.uniqueIndex]?.dimensions ?? true}
  showPrice={labelVisibility?.[item.uniqueIndex]?.price ?? true}
/>
```

`item.uniqueIndex` is already in scope (per the existing `expandedLabels` mapping at LabelSheet.tsx:46-51).

- [ ] **Step 6: Audit upstream constructors**

In both `artist-portal/labels/page.tsx` and `venue-portal/labels/page.tsx`, find the `previewLabels` construction (where the user clicks "Open Preview" / "Print Preview"). Currently the data fields (`workMedium`, etc.) are populated conditional on the global `options.show*` flags.

Change to:
- ALWAYS populate `workMedium`, `workDimensions`, `workPrice` from the work's data (so they exist regardless of toggle state).
- ALSO populate the `_sourceMedium`, `_sourceDimensions`, `_sourcePrice` redundantly (preserved for any other consumer that still reads them; the new flow doesn't use them).
- Pass `initialVisibility` to LabelPreview based on the global `options`:

```tsx
const initialVisibility = previewLabels.map(() => ({
  medium: options.showMedium,
  dimensions: options.showDimensions,
  price: options.showPrice,
}));

// later:
<LabelPreview
  labels={previewLabels}
  initialVisibility={initialVisibility}
  availableSizes={availableSizes}
  onClose={() => setShowPreview(false)}
/>
```

- [ ] **Step 7: Manual smoke**

Open `/artist-portal/labels`. Select 2 works. Toggle global "Show medium" off. Click Open Preview. On the SECOND label's controls, toggle Medium ON — the medium should appear on the rendered preview. Toggle OFF — medium disappears. Repeat for Dimensions and Price. Repeat at `/venue-portal/labels`.

- [ ] **Step 8: Run check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/labels/ src/app/\(pages\)/artist-portal/labels/page.tsx src/app/\(pages\)/venue-portal/labels/page.tsx
git commit -m "fix(labels): per-label visibility flags decouple toggles from data"
```

---

### Task F.2: Image-save protection in expanded view + globals

**Files:**
- Modify: `src/components/ArtworkImageViewer.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/ArtworkThumb.tsx`
- Modify: `src/components/BrowseArtistCard.tsx`

- [ ] **Step 1: Add overlay div + WebKit CSS in fullscreen branch**

In `ArtworkImageViewer.tsx` line ~127-174 (the fullscreen JSX), inside the relative wrapper:

```tsx
<Image
  src={activeSrc}
  alt={alt}
  fill
  className="object-contain select-none"
  sizes="100vw"
  quality={85}
  draggable={false}
  onContextMenu={(e) => e.preventDefault()}
  data-protected="artwork"
  style={{ WebkitTouchCallout: "none", WebkitUserDrag: "none" } as React.CSSProperties}
/>
{/* Transparent overlay defeats long-press save on iOS Safari without
    eating the click-to-close handler (pointer-events:none). */}
<div
  className="absolute inset-0 z-[1] pointer-events-none"
  onContextMenu={(e) => e.preventDefault()}
/>
```

- [ ] **Step 2: Inline-view consistency**

The inline (non-fullscreen) Image at lines 54-65 already has good protection. Add `data-protected="artwork"` to the wrapper for the global rule.

- [ ] **Step 3: Add globals rule**

Append to `src/app/globals.css`:

```css
/* Image-save protection. Belt-and-braces: contextmenu and dragstart
   are handled inline on the React Image components; this stops the
   iOS long-press save callout, blocks text/image selection, and
   disables WebKit's drag preview. Cannot stop a screenshot. */
[data-protected="artwork"],
[data-protected="artwork"] img {
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  user-select: none;
}
```

- [ ] **Step 4: Add data-protected to existing card components**

`ArtworkThumb.tsx`: add `data-protected="artwork"` to the outer `<div>` at line 39 (the `aspect-square relative` wrapper).

`BrowseArtistCard.tsx`: add `data-protected="artwork"` to the carousel `<div>` at line 44 (the `aspect-square relative ... select-none` wrapper).

- [ ] **Step 5: Manual smoke (desktop + mobile)**

Desktop Chrome:
- Open an artwork detail page; expand image. Right-click on image: no context menu. Drag image: no drag preview.

Mobile (Chrome DevTools responsive view at 375px or real iOS Safari):
- Long-press image: no save sheet appears.

- [ ] **Step 6: Commit**

```bash
git add src/components/ArtworkImageViewer.tsx src/app/globals.css src/components/ArtworkThumb.tsx src/components/BrowseArtistCard.tsx
git commit -m "feat(artwork): harden image-save protection across cards + lightbox"
```

---

### Task F.3: Em-dash sweep site-wide

**Files:** many under `src/app/(pages)/`, `src/components/`, `src/data/`. Plus `AGENTS.md`.

- [ ] **Step 1: Enumerate**

```bash
cd /Users/finlaycoles/Downloads/Wallplace/Wallplace/website
grep -rln "—" src/ AGENTS.md | grep -v "src/emails/" > /tmp/emdash-site.txt
wc -l /tmp/emdash-site.txt
```

`src/emails/` is excluded; that was handled in workstream E.

- [ ] **Step 2: Bulk-friendly range conversion**

```bash
# Numeric-range em-dash → en-dash. Safe and mechanical.
grep -rl "—" src/ AGENTS.md | grep -v "src/emails/" | xargs sed -i '' -E 's/([0-9])—([0-9])/\1–\2/g'
```

- [ ] **Step 3: User-facing prose pass**

Walk the remaining hits file by file. For each:
- JSX text or string literals visible to the user → replace per the spec rules:
  - "X — Y" prose pause → "X. Y", "X: Y", or "X, Y" (whichever flows).
  - "X — Y — Z" parenthetical → "X (Y) Z" or "X. Y. Z".
  - "X--Y" literal double-hyphen → strip / replace with proper punctuation.
- Code comments / JSDoc → leave.

The Wallplace brand voice uses em dashes liberally (footer, help text, CTAs). Most need contextual replacement; do them manually with judgement.

- [ ] **Step 4: AGENTS.md**

```bash
sed -i '' 's/breaking changes — APIs/breaking changes. APIs/' AGENTS.md
```

(Or open and edit directly; the line is short.)

- [ ] **Step 5: Re-verify**

```bash
grep -rn "—" src/ AGENTS.md \
  | grep -v "src/emails/" \
  | grep -vE "\\.test\\." \
  | grep -vE '^[^:]+:[0-9]+:\\s*[/*]' \
  > /tmp/emdash-site-remaining.txt
wc -l /tmp/emdash-site-remaining.txt
```

Inspect. Comments are OK; user-facing should be near-zero.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "chore: site-wide em-dash sweep in user-facing copy"
```

---

### Task F.4: Final QA pass

**Files:** none.

- [ ] **Step 1: Lint, typecheck, vitest**

Run: `npm run check`
Expected: PASS. Fix any breakage inline before continuing.

- [ ] **Step 2: Playwright (opportunistic)**

Run: `npm run test:e2e`
If it requires running services beyond the local repo, skip and note in handover.

- [ ] **Step 3: Manual smoke walkthrough**

Run: `npm run dev` and walk through:

1. **`/browse`** — toggle works/portfolios/collections; for each view exercise size, price, arrangement, and (where applicable) distance/themes/venue-types/medium filters. Mobile: open the filter drawer, apply a filter, close, see counts update.
2. **`/browse/collections/<id>`** — filter panel renders; size labelling has dimension hint on the right; request placement opens venue portal flow with arrangement + works prefilled.
3. **`/browse/<artist-slug>`** — hover/tap reveal on artwork cards (web + mobile-emulation). Verify name, price, medium, action row.
4. **Single artwork page** — image expand modal opens. Right-click and long-press blocked. "Currently placed at [venue]" chip appears for placed works.
5. **Buy now → checkout** — Add 2 items by the same artist + 1 by another. Note the displayed shipping. Click Proceed to Payment. Stripe checkout renders the same shipping. Pay with test card. Confirmation page renders.
6. **QR scan flow** — Visit `/api/qr/<artist-slug>?w=<workId>` in incognito. Click Buy Now. Reach `/checkout` without a login wall. Complete the order as guest.
7. **QR label preview** — `/artist-portal/labels`. Select 2 works. Open Preview. On the SECOND label, toggle Medium / Dimensions / Price off then back on. Visual confirms each direction works. Repeat at `/venue-portal/labels`.
8. **Email preview** — `/email-preview/CustomerOrderReceipt`, `…ShippingConfirmation`, `…DeliveryConfirmation`. Confirm artwork image renders, artist name is human, no em dashes in user-facing text.

- [ ] **Step 4: Final commit if any small fixes surface**

```bash
git add -u
git commit -m "fix: resolve issues found during QA walkthrough"
```

---

## Workstream F checkpoint

Final clean-tree state on `feat/2026-04-29-batch-fixes`. The branch is ready for the user to evaluate. Stash re-application is the next phase, not part of this plan.

---

## Stash reconciliation (post-batch)

After the user has evaluated and accepted the batch:

- [ ] **Step 1**: `git stash pop`.
- [ ] **Step 2**: Resolve conflicts file by file. Expected conflicts:
  - `src/app/api/orders/route.ts` (mine: revenue attribution + select widening; stashed: shipping email handling).
  - `src/app/api/webhooks/stripe/route.ts` (mine: artist-name resolution + image persistence; stashed: 172-line expansion).
  - The other ~25 API routes had small uniform additions in the stash (likely a header / auth / runtime sweep) — accept those wholesale unless they conflict with anything I changed.
- [ ] **Step 3**: `npm run check` post-merge. Fix any breakage.
- [ ] **Step 4**: `git commit -m "chore: reconcile pre-batch WIP from stash"`.

---

## Self-review

**Spec coverage:** F1 (QR label) → F.1. F2 (image-save protection) → F.2. F3 (em-dash sweep) → F.3. F4 (final QA) → F.4.

**Placeholder scan:** the em-dash sweep step F.3 step 3 is unavoidably "walk the file list"; the procedure is fully specified.

**Type consistency:** `LabelVisibility` keys (`medium`, `dimensions`, `price`) align across QRLabel, LabelPreview, LabelSheet, and the upstream label pages. `data-protected="artwork"` is consistent across the four files that adopt it.
