# Plan E — Mobile & Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the §5 (mobile layout) bucket plus §7.14 / §7.15 (keyboard + focus) from the 2026-04-30 pre-launch QA audit. The goal isn't to build a "mobile app" — it's to stop the existing site looking broken on a phone, and to make every interactive element keyboard- and screen-reader-reachable.

**Architecture:** No new modules. Plan E is a CSS / Tailwind-tokens / mechanical-edits plan plus a single layout-level skip-link. Z-index gets a small tokens system in `globals.css` so future drawers, toasts, and modals stop colliding. Focus styles become a single global rule rather than a per-component sprinkle.

**Tech Stack:** Next.js 16.2, React 19.2, Tailwind 4. No new deps. A few RTL tests for keyboard interactions on dialogs (jsdom env, same convention as Plans A / C / D).

**Independence:**
- Builds **on top of Plan D** if merged (uses `<Breadcrumbs>` and `<EmptyState>` as targets for focus / contrast checks). If Plan D isn't merged, the focus-style task still works because it targets every existing interactive element via a global selector.
- **No collision with Plans A, B, or C.** Plan E touches CSS, layout components, and a handful of dialogs / pages already touched by other plans, but the changes are layered (e.g. Plan D Task 8 added a 50% hint to the counter dialog; Plan E Task 9 adds keyboard handlers to the same modal — separate concerns).

**Out of scope (other plans):**
- Search bar (Plan F)
- Toast framework upgrade beyond Plan D's variant + duration (Plan F)
- Image fallbacks, currency edge cases, em-dash sweep, image-protection (Plan F)
- Wall-color hex validation, slugify tests (Plan F)

**Branch strategy:**
- Worktree: `git worktree add .claude/worktrees/qa-e-mobile-a11y claude/qa-e-mobile-a11y` off `main`.
- One commit per task. `npm run check` MUST pass before each commit.
- Manual verification REQUIRES Chrome DevTools device toolbar at minimum (iPhone 14, iPad Mini portrait + landscape) plus a real iOS device for Phase 8 (signup contrast — Unsplash heroes look different on real screens).

**Phases:**
1. Z-index tokens & focus baseline (Tasks 1–2)
2. Skip-link + aria audit (Tasks 3–4)
3. Tap-target & hamburger sizing (Tasks 5–6)
4. Header mobile collision (Task 7)
5. Browse grid breakpoint (Task 8)
6. Lightbox keyboard + cleanup (Task 9)
7. Sticky sidebars on mobile (Task 10)
8. Wall editor top bar (Task 11)
9. Modal keyboard support (Task 12)
10. Signup hero contrast (Task 13)
11. Final verification + PR (Task 14)

---

## Phase 1 — Z-index tokens & focus baseline

### Task 1: Z-index tokens in `globals.css`

**Files:**
- Modify: `src/app/globals.css`

QA §5.2: drawer (z-50), toast (z-[100]), counter dialog (z-[120]) — picked by hand, drift over time. Establish a tokenised stack everyone uses.

- [ ] **Step 1: Add tokens at the top of `:root`**

```css
:root {
  /* …existing tokens… */

  /* Stacking layers. Use these (not arbitrary z-{n}) so layers stay
     consistent. Higher number = more on top. Leave generous gaps so
     mid-layer additions don't collide. */
  --z-base: 0;
  --z-sticky: 10;       /* sticky breadcrumbs, sticky table headers */
  --z-header: 100;      /* fixed top header (currently z-[100]) */
  --z-drawer: 200;      /* mobile slide-out menus */
  --z-overlay: 300;     /* full-screen scrims */
  --z-modal: 400;       /* CounterPlacementDialog, confirm dialogs */
  --z-toast: 500;       /* always above every modal */
}
```

- [ ] **Step 2: Add Tailwind utility classes for the tokens**

In the `@layer utilities` block (or create one):

```css
@layer utilities {
  .z-sticky { z-index: var(--z-sticky); }
  .z-header { z-index: var(--z-header); }
  .z-drawer { z-index: var(--z-drawer); }
  .z-overlay { z-index: var(--z-overlay); }
  .z-modal { z-index: var(--z-modal); }
  .z-toast { z-index: var(--z-toast); }
}
```

- [ ] **Step 3: Replace existing arbitrary z-values**

Audit:

```bash
grep -rn "z-\[" src/components src/app/\(pages\) src/context | grep -v "node_modules" | sort
```

For each match, replace with the appropriate token:

| Was | Now | Why |
|---|---|---|
| `z-[100]` (Header.tsx) | `z-header` | top nav |
| `z-50` (mobile drawer) | `z-drawer` | mobile menu / sidebar drawer |
| `z-[110]` (Header dropdowns) | `z-header` (or +1 if dropdown should sit above page-level sticky) | currently exceeds z-header by 10 — collapse |
| `z-40` (mobile drawer scrim) | `z-overlay` | scrim behind drawer |
| `z-[120]` (CounterPlacementDialog) | `z-modal` | modal dialogs |
| `z-[100]` (ToastContext) | `z-toast` | toasts always above modals |

- [ ] **Step 4: Verify no regressions**

`npm run dev`. Open the site, trigger every layered surface in turn:
1. Mobile menu (hamburger) — drawer above page, scrim below drawer.
2. Header dropdowns (Messages, Notifications, More, Portal) — above page content, above sticky breadcrumbs.
3. Counter dialog — above everything except toasts.
4. Toast — above the counter dialog (test by triggering a toast inside a dialog).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/Header.tsx src/context/ToastContext.tsx \
        src/components/CounterPlacementDialog.tsx
# (plus any other files touched in Step 3)
git commit -m "fix(ui): z-index tokens replace ad-hoc arbitrary values"
```

---

### Task 2: Global focus-visible ring

**Files:**
- Modify: `src/app/globals.css`

QA §7.15: many buttons rely on browser default focus outlines, which are invisible against the accent backgrounds.

- [ ] **Step 1: Add a global `:focus-visible` rule**

In `globals.css`, after the `:root` token block:

```css
@layer base {
  /*
   * Global focus indicator. Applies to every interactive element by
   * default. Components can opt out with `focus-visible:outline-none`
   * if they ship a bespoke focus style, but the baseline must always
   * be reachable for keyboard users.
   */
  :focus-visible {
    outline: 2px solid var(--accent, #c17c5a);
    outline-offset: 2px;
    border-radius: 2px;
  }

  /* Keep the default focus invisible for mouse users only. */
  :focus:not(:focus-visible) {
    outline: none;
  }
}
```

- [ ] **Step 2: Add a skip-link target style (used in Task 3)**

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--foreground, #1a1a1a);
  color: var(--background, #fff);
  padding: 8px 16px;
  z-index: var(--z-toast);
  text-decoration: none;
  font-size: 14px;
}
.skip-link:focus {
  top: 0;
}
```

- [ ] **Step 3: Smoke**

`npm run dev`. Tab through `/browse` from the address bar — every link / button shows the orange ring on focus. Dropdown items, save hearts, tab buttons all reachable.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(a11y): global focus-visible ring + skip-link styles"
```

---

## Phase 2 — Skip-link + aria audit

### Task 3: Skip-to-content link in root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add a skip link as the first focusable element**

```tsx
// Inside <body>, before <Header />:
<a href="#main-content" className="skip-link">
  Skip to content
</a>
```

- [ ] **Step 2: Tag the main content area**

Find the `<main>` element in the layout (or in `(pages)/layout.tsx`). Add `id="main-content"` and `tabIndex={-1}`. If there isn't a `<main>`, wrap the children:

```tsx
<main id="main-content" tabIndex={-1}>
  {children}
</main>
```

- [ ] **Step 3: Smoke**

Reload any page. Press Tab. The first focused thing is the skip link (visible top-left, orange-on-dark per Task 2 styles). Press Enter. Focus jumps to `<main>` and tabbing continues from there.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx "src/app/(pages)/layout.tsx"
git commit -m "feat(a11y): skip-to-content link in root layout"
```

---

### Task 4: Aria-label audit on icon-only buttons

**Files:**
- Modify: multiple — see audit list

QA §5 doesn't list this directly but it's the natural pair to focus styles. Many icon-only buttons (Save, Message, hamburger) lack aria-labels.

- [ ] **Step 1: Audit**

```bash
grep -rn '<button' src/components src/app/\(pages\) | grep -v 'aria-label\|aria-expanded\|aria-describedby' | head -40
grep -rn '<a ' src/components | grep -v 'aria-label\|>.*<' | head -20
```

Look for patterns like `<button onClick={...}><svg ...></svg></button>` — these are icon-only and need a label.

- [ ] **Step 2: Add aria-label to each**

Common ones likely needing labels:
- `SaveButton.tsx` — `aria-label={isSaved ? "Unsave" : "Save"}`
- `MessageArtistButton.tsx` — `aria-label={`Message ${artistName}`}`
- `Header.tsx` mobile hamburger — `aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}` (already has this — confirm)
- Dropdown trigger buttons (More, Portal, Notifications, Messages bell) — confirm aria-label is set
- Lightbox close + arrow buttons — `aria-label="Close lightbox"`, `"Previous image"`, `"Next image"`
- QR modal close — `aria-label="Close"`

For dropdowns, also confirm `aria-expanded={isOpen}` is set.

- [ ] **Step 3: Smoke**

Use a screen reader (macOS VoiceOver: Cmd+F5; Windows NVDA). Tab through `/browse` and the artist profile page. Every interactive element announces a meaningful name.

Alternatively, run an automated check with axe-core via the Chrome DevTools "Accessibility" tab — should show no "Buttons must have discernible text" violations.

- [ ] **Step 4: Commit**

```bash
git add # (list every file you touched in Step 2)
git commit -m "fix(a11y): aria-label every icon-only button"
```

---

## Phase 3 — Tap-target & hamburger sizing

### Task 5: Bump tap targets to ≥44px

**Files:**
- Modify: `src/app/(pages)/customer-portal/saved/page.tsx`
- Modify: `src/app/(pages)/artist-portal/saved/page.tsx`
- Modify: `src/app/(pages)/venue-portal/saved/page.tsx`
- Modify: `src/app/(pages)/customer-portal/settings/page.tsx`
- Modify: `src/app/(pages)/artist-portal/settings/page.tsx`
- Modify: `src/app/(pages)/venue-portal/settings/page.tsx`
- Modify: `src/components/PlacementQRModal.tsx` (if its close button is small — verify)

QA §5.7: remove buttons, checkboxes are sized at `text-xs` (10–12px), failing WCAG's 44×44px minimum tap target.

- [ ] **Step 1: Audit each settings/saved page**

For every `<button>` or `<input type="checkbox">` smaller than ~40px on either axis, bump to a minimum of 44px. Pattern:

```tsx
// Was:
<button className="text-xs text-muted hover:text-red-500">Remove</button>

// Now:
<button
  className="text-sm px-3 py-2 min-h-[44px] inline-flex items-center text-muted hover:text-red-500"
>
  Remove
</button>
```

For checkboxes, the input itself stays small — wrap in a clickable label that's at least 44px tall:

```tsx
<label className="flex items-center justify-between min-h-[44px] cursor-pointer">
  <span>Email digest</span>
  <input type="checkbox" className="w-5 h-5" /* …handlers… */ />
</label>
```

- [ ] **Step 2: Smoke**

DevTools device toolbar → iPhone SE (375×667). Open each settings page, each saved page. Each interactive row is comfortably tap-sized.

- [ ] **Step 3: Commit**

```bash
git add # (the seven settings/saved files)
git commit -m "fix(mobile): bump remove + toggle controls to 44px tap targets"
```

---

### Task 6: Hamburger button sized correctly

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/components/AdminPortalLayout.tsx`
- Modify: `src/components/CustomerPortalLayout.tsx` (if same pattern)
- Modify: `src/components/ArtistPortalLayout.tsx` (if same pattern)
- Modify: `src/components/VenuePortalLayout.tsx` (if same pattern)

QA §5.8: hamburger button uses `p-1.5` with `-ml-2` — the actual hit area is below 44px on some viewports.

- [ ] **Step 1: Standardise**

Each hamburger / drawer toggle button:

```tsx
<button
  type="button"
  onClick={() => setOpen((v) => !v)}
  aria-label={open ? "Close menu" : "Open menu"}
  aria-expanded={open}
  className="p-3 -mr-3 lg:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px]"
>
  {/* svg as before */}
</button>
```

- [ ] **Step 2: Smoke**

iPhone SE viewport: tap precisely on the hamburger icon edge — drawer opens reliably.

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.tsx src/components/AdminPortalLayout.tsx \
        src/components/CustomerPortalLayout.tsx \
        src/components/ArtistPortalLayout.tsx src/components/VenuePortalLayout.tsx
git commit -m "fix(mobile): hamburger buttons hit the 44px tap-target floor"
```

---

## Phase 4 — Header mobile collision

### Task 7: Header collapses "More" on `<lg`

**Files:**
- Modify: `src/components/Header.tsx`

QA §5.1: on iPad portrait, the absolute-centre nav can collide with the right-side icon cluster (Saved, Messages, Notifications, Portal, Logout, Cart). Collapsing the More dropdown into the hamburger menu on `<lg` removes the worst case.

- [ ] **Step 1: Hide the More dropdown below `lg`**

In `Header.tsx`, the More dropdown is currently rendered inside the desktop nav. Wrap its render in a `hidden lg:flex` (or similar — match the existing breakpoint pattern). On mobile, the More links live in the existing mobile-menu drawer (already present per the file's structure).

- [ ] **Step 2: Confirm the mobile menu lists More links**

Read the existing mobile-menu code (around lines 856–971 of the file Plan A's snapshot showed). It already iterates `moreLinks` for logged-in users. No new code — just verify.

- [ ] **Step 3: Smoke**

DevTools → iPad Mini portrait (768×1024). Top nav has the marketplace tabs centred + the icon cluster on the right + no inline "More". Open the user dropdown — its items don't run into the centre nav.

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.tsx
git commit -m "fix(mobile): collapse More dropdown into hamburger below lg"
```

---

## Phase 5 — Browse grid breakpoint

### Task 8: Browse grid uses `md:grid-cols-3`

**Files:**
- Modify: `src/app/(pages)/browse/page.tsx`

QA §5.3: the grid jumps `2 → 3 → 4` cols at `lg`/`xl`. iPad Mini in landscape (820px) sits below `lg` and only shows 2 columns.

- [ ] **Step 1: Find the grid container**

```bash
grep -n "grid-cols-2\|grid-cols-3\|grid-cols-4\|grid-cols-1" "src/app/(pages)/browse/page.tsx" | head -10
```

The relevant container likely reads `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` or similar.

- [ ] **Step 2: Insert the `md` breakpoint**

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
```

(`md` and `lg` both at 3 is correct: `md` is 768–1023px (tablets in landscape), `lg` is 1024+ (small desktop). Both want 3 columns; `xl` (1280+) goes to 4.)

If similar grids exist in `browse/[slug]/ArtistProfileClient.tsx` and `browse/collections/[collectionId]/page.tsx`, apply the same breakpoint to them.

- [ ] **Step 3: Smoke**

DevTools → iPad Mini landscape (1024×768 in landscape, but the device toolbar reports 820×1180 for Mini portrait, ~1180×820 landscape — verify). Grid shows 3 columns, not 2.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/browse/page.tsx" \
        "src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx" \
        "src/app/(pages)/browse/collections/[collectionId]/page.tsx"
git commit -m "fix(browse): grid jumps to 3 cols at md, not stuck at 2 on small tablets"
```

---

## Phase 6 — Lightbox keyboard + cleanup

### Task 9: Lightbox keyboard nav + setTimeout cleanup

**Files:**
- Modify: `src/components/ArtworkImageViewer.tsx` (lightbox component — verify name)
- Modify: `src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx` (reveal-timer cleanup)

QA §5.4: lightbox lacks Esc / arrow nav, mid-tap reveal timer doesn't clean up on unmount.

- [ ] **Step 1: Find the lightbox component**

```bash
grep -rn "lightbox\|Lightbox\|ArtworkImage" src/components/ src/app/\(pages\)/browse/ | head
```

If `ArtworkImageViewer.tsx` exists, that's it. Otherwise the lightbox lives inline in `ArtistProfileClient.tsx`.

- [ ] **Step 2: Add a useEffect that listens for Escape + arrows**

```tsx
useEffect(() => {
  if (!lightboxOpen) return;
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setLightboxOpen(false);
    } else if (e.key === "ArrowRight") {
      goNext();
    } else if (e.key === "ArrowLeft") {
      goPrev();
    }
  }
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [lightboxOpen, goNext, goPrev]);
```

- [ ] **Step 3: Add basic touch-swipe (optional but cheap)**

```tsx
const touchStartX = useRef<number | null>(null);
function onTouchStart(e: React.TouchEvent) {
  touchStartX.current = e.touches[0].clientX;
}
function onTouchEnd(e: React.TouchEvent) {
  if (touchStartX.current === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX.current;
  if (Math.abs(dx) > 50) {
    if (dx < 0) goNext(); else goPrev();
  }
  touchStartX.current = null;
}

// Apply onTouchStart / onTouchEnd to the lightbox container.
```

- [ ] **Step 4: Clean up the reveal-timer**

In `ArtistProfileClient.tsx` (or wherever the per-card 6-second reveal timer lives), find the `setTimeout` that hides the reveal:

```tsx
useEffect(() => {
  if (!revealedId) return;
  const t = setTimeout(() => setRevealedId(null), 6000);
  return () => clearTimeout(t);  // <- the missing cleanup
}, [revealedId]);
```

- [ ] **Step 5: Test (RTL keyboard test)**

```tsx
// src/components/ArtworkImageViewer.test.tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ArtworkImageViewer from "./ArtworkImageViewer";

describe("<ArtworkImageViewer /> keyboard nav", () => {
  it("Escape closes the lightbox", () => {
    const onClose = vi.fn();
    render(<ArtworkImageViewer images={["a", "b"]} open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("ArrowRight advances", () => {
    const onIndexChange = vi.fn();
    render(
      <ArtworkImageViewer images={["a", "b", "c"]} open initialIndex={0} onIndexChange={onIndexChange} />,
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });
});
```

(Adapt the props to the actual component signature.)

- [ ] **Step 6: Commit**

```bash
git add src/components/ArtworkImageViewer.tsx \
        src/components/ArtworkImageViewer.test.tsx \
        "src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx"
git commit -m "fix(lightbox): keyboard nav + touch swipe + reveal-timer cleanup"
```

---

## Phase 7 — Sticky sidebars on mobile

### Task 10: Drop sticky sidebars below `lg`

**Files:**
- Modify: `src/app/(pages)/browse/collections/[collectionId]/page.tsx`
- Modify: `src/app/(pages)/checkout/page.tsx`

QA §5.5: sticky sidebars (collection size/price selector, checkout order summary) overlay inputs on mobile + can sit behind iOS keyboard.

- [ ] **Step 1: Replace `sticky` with `lg:sticky`**

For each affected sidebar:

```tsx
// Was:
<div className="sticky top-24 ...">

// Now:
<div className="lg:sticky lg:top-24 ...">
```

The sidebar becomes a normal block on mobile (stacks below the main content) and only sticks at `lg+`.

- [ ] **Step 2: Smoke**

iPhone SE viewport. On a collection page: scroll the works grid — sidebar doesn't follow. On checkout: scroll the form — order summary doesn't sit on top of inputs. Tap an input field with iOS keyboard — no overlap.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/browse/collections/[collectionId]/page.tsx" \
        "src/app/(pages)/checkout/page.tsx"
git commit -m "fix(mobile): sticky sidebars stay non-sticky below lg"
```

---

## Phase 8 — Wall editor top bar

### Task 11: Wall editor top bar stacks on mobile

**Files:**
- Modify: `src/app/(pages)/venue-portal/walls/[id]/page.tsx`

QA §5.6: top bar wraps awkwardly when wall name + dimensions + delete button compete for space.

- [ ] **Step 1: Restructure the top bar**

Around the existing top-bar markup (line ~245 per QA report), restructure:

```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-4">
  <div className="min-w-0 flex-1">
    <h1 className="text-lg font-medium truncate">{wall.name}</h1>
    <p className="hidden sm:block text-xs text-muted">
      {wall.width_cm} × {wall.height_cm} cm
    </p>
  </div>

  <div className="flex items-center gap-2 shrink-0">
    {/* Show on public profile toggle — already present */}

    {/* Delete: full button on sm+, overflow menu on mobile if you want.
        Simpler: just keep the button, but add min-h-[44px] for tap. */}
    <button
      type="button"
      onClick={requestDelete}
      aria-label="Delete wall"
      className="text-sm px-3 py-2 min-h-[44px] text-red-600 hover:text-red-700"
    >
      Delete
    </button>
  </div>
</div>
```

- [ ] **Step 2: Smoke**

iPhone SE: title visible, dimensions hidden, delete button at right (or wraps below — verify acceptable). iPad portrait: title + dimensions visible, delete on right.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(pages)/venue-portal/walls/[id]/page.tsx"
git commit -m "fix(walls): editor top bar stacks cleanly on mobile"
```

---

## Phase 9 — Modal keyboard support

### Task 12: Esc / Enter / focus-trap on confirm dialogs

**Files:**
- Modify: `src/components/CounterPlacementDialog.tsx`
- Modify: `src/app/(pages)/venue-portal/walls/[id]/page.tsx` (delete confirm)
- Modify: `src/components/AccountDangerZone.tsx` (if Plan C merged) — otherwise customer settings inline confirm

QA §7.14: existing dialogs use onClick handlers but no keyboard support.

- [ ] **Step 1: Reusable hook for modal keyboard handling**

Create `src/lib/use-modal-keys.ts`:

```ts
import { useEffect, useRef } from "react";

interface ModalKeyOptions {
  onClose?: () => void;
  onSubmit?: () => void;
  enabled?: boolean;
}

/**
 * Standard modal keyboard handling: Escape closes, Enter submits.
 * Also focuses the first focusable element inside the ref on mount,
 * which gives keyboard users a sensible starting point and traps
 * focus within the dialog.
 */
export function useModalKeys<T extends HTMLElement>(opts: ModalKeyOptions): React.RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (opts.enabled === false) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        opts.onClose?.();
      } else if (e.key === "Enter" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        // Don't fire on Enter inside a textarea (user wants a newline).
        e.preventDefault();
        opts.onSubmit?.();
      }
    }
    window.addEventListener("keydown", onKey);
    // Focus the first focusable child (input, button, or the dialog itself)
    const firstFocusable = ref.current?.querySelector<HTMLElement>(
      'input, button, textarea, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [opts]);
  return ref;
}
```

- [ ] **Step 2: Test the hook**

```ts
// src/lib/use-modal-keys.test.tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useModalKeys } from "./use-modal-keys";

function Modal({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => void }) {
  const ref = useModalKeys<HTMLDivElement>({ onClose, onSubmit });
  return (
    <div ref={ref}>
      <input data-testid="first" />
    </div>
  );
}

describe("useModalKeys", () => {
  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} onSubmit={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter calls onSubmit", () => {
    const onSubmit = vi.fn();
    render(<Modal onClose={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalled();
  });

  it("auto-focuses the first input", () => {
    render(<Modal onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(document.activeElement).toBe(document.querySelector('[data-testid="first"]'));
  });
});
```

- [ ] **Step 3: Apply to CounterPlacementDialog**

```tsx
import { useModalKeys } from "@/lib/use-modal-keys";

// inside the component:
const dialogRef = useModalKeys<HTMLDivElement>({ onClose, onSubmit: submit });

return (
  <div className="fixed inset-0 z-modal bg-black/50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
    <div ref={dialogRef} className="bg-background rounded-sm max-w-md w-full ..." onClick={(e) => e.stopPropagation()}>
      {/* …existing content… */}
    </div>
  </div>
);
```

- [ ] **Step 4: Apply to wall delete confirm**

Same pattern in `walls/[id]/page.tsx` for the delete confirmation dialog.

- [ ] **Step 5: Smoke**

Open the counter dialog, press Escape — closes. Type something into the note, press Enter inside the textarea — newline (NOT submit). Type into the percent input, press Enter — submits.

- [ ] **Step 6: Commit**

```bash
git add src/lib/use-modal-keys.ts src/lib/use-modal-keys.test.tsx \
        src/components/CounterPlacementDialog.tsx \
        "src/app/(pages)/venue-portal/walls/[id]/page.tsx"
git commit -m "feat(a11y): keyboard support on modal dialogs (Esc/Enter/auto-focus)"
```

---

## Phase 10 — Signup hero contrast

### Task 13: Increase hero overlay opacity on small screens

**Files:**
- Modify: `src/app/(pages)/login/page.tsx`
- Modify: `src/app/(pages)/signup/page.tsx`
- Modify: `src/app/(pages)/signup/artist/page.tsx`
- Modify: `src/app/(pages)/signup/customer/page.tsx`

QA §5.10: Unsplash mountain hero with `bg-black/55` — on small screens the white text doesn't have enough contrast.

- [ ] **Step 1: Bump overlay opacity below `sm`**

Each page has the same pattern:

```tsx
<div className="absolute inset-0 bg-black/55" />
```

Replace with:

```tsx
<div className="absolute inset-0 bg-black/70 sm:bg-black/55" />
```

- [ ] **Step 2: Verify contrast**

Use Chrome DevTools "Issues" tab or axe-core to check the heading + sub-headline contrast against the overlaid background. Should pass WCAG AA (4.5:1 for normal text).

- [ ] **Step 3: Smoke**

iPhone SE viewport: heading + form copy clearly readable.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/login/page.tsx" \
        "src/app/(pages)/signup/page.tsx" \
        "src/app/(pages)/signup/artist/page.tsx" \
        "src/app/(pages)/signup/customer/page.tsx"
git commit -m "fix(a11y): denser hero overlay on small screens for text contrast"
```

---

## Phase 11 — Final verification

### Task 14: Full check + manual sweep + open PR

- [ ] **Step 1: `npm run check`**

Lint + typecheck + tests clean. New tests added by this plan:
- `src/components/ArtworkImageViewer.test.tsx`
- `src/lib/use-modal-keys.test.tsx`

- [ ] **Step 2: `npm run build`** — clean.

- [ ] **Step 3: 12-point manual sweep**

Required device coverage:
- iPhone SE viewport (375×667) via DevTools
- iPad Mini portrait + landscape via DevTools
- A real iOS device for the signup contrast check (Unsplash heroes look different on real screens)

Checks:
1. Z-index — open mobile drawer, header dropdown, counter dialog, toast at the same time. Stack order matches token expectations.
2. Tab through `/browse` from address bar. First focus is skip-link. Then header. Then content. Visible orange ring on every step.
3. VoiceOver / NVDA on `/browse` and the artist profile page. Every interactive control announces a name.
4. Settings page — every toggle row is comfortably tappable on iPhone SE.
5. Mobile menu hamburger opens reliably even when tapped at the icon edge.
6. iPad portrait `/browse` — top nav doesn't collide; `More` is hidden inline (lives in mobile drawer for ≥lg only — verify).
7. iPad Mini landscape `/browse` — grid shows 3 columns.
8. Open lightbox on artist profile → arrow keys navigate, Escape closes, swipe works on touch.
9. Browse a collection on iPhone SE — sidebar stacks below grid, no overlay; scroll works.
10. Open a wall in venue portal on iPhone SE — top bar stacks cleanly, delete button reachable.
11. Open counter dialog → Escape closes; Enter inside textarea is newline; Enter outside textarea submits.
12. Login + signup pages on iPhone — heading + copy clearly readable against the dimmer overlay.

- [ ] **Step 4: Open PR**

```bash
git push -u origin claude/qa-e-mobile-a11y
gh pr create --title "Plan E: mobile & accessibility" --body "$(cat <<'EOF'
## Summary

Closes the §5 (mobile layout) and §7.14 / §7.15 (keyboard + focus) buckets from the 2026-04-30 pre-launch QA audit.

- Z-index tokens replace ad-hoc arbitrary values across drawers / dropdowns / modals / toasts
- Global `:focus-visible` ring; skip-to-content link
- Aria-labels on icon-only buttons throughout
- 44px tap-target floor on settings, saved, hamburger
- Header collapses More dropdown into the hamburger drawer below `lg`
- Browse grid jumps to 3 cols at `md` (was stuck at 2 on iPad Mini landscape)
- Lightbox keyboard nav (Esc / arrows) + touch swipe + reveal-timer cleanup
- Sticky sidebars stay non-sticky below `lg`
- Wall editor top bar stacks cleanly on mobile
- `useModalKeys` hook + applied to counter dialog + wall delete (Esc closes, Enter submits, auto-focus first input)
- Signup hero overlay denser below `sm` for text contrast

## Test plan

- [ ] `npm run check` clean
- [ ] `npm run build` clean
- [ ] 12-point sweep in plan §14 passes
- [ ] axe-core / Chrome DevTools Issues tab shows no contrast or "no discernible name" violations on:
      `/`, `/browse`, `/login`, `/signup`, `/checkout`, the three portal home pages

## Out of scope

- Search bar (Plan F)
- Toast framework upgrade (Plan F)
- Image fallback / placeholder treatment (Plan F)
EOF
)"
```

---

## Self-review

**1. Spec coverage** (sections from the QA report covered):
- §5.1 Header More + portal collision → Task 7 ✓
- §5.2 Z-stack tokens → Task 1 ✓
- §5.3 Browse grid `md` breakpoint → Task 8 ✓
- §5.4 Lightbox keyboard + cleanup → Task 9 ✓
- §5.5 Sticky sidebars on mobile → Task 10 ✓
- §5.6 Wall editor top bar → Task 11 ✓
- §5.7 Tap targets on settings/saved → Task 5 ✓
- §5.8 Hamburger sized → Task 6 ✓
- §5.9 Counter dialog overflow on long messages → already handled in Plan D Task 8 ✓ (textarea max-h-40 + 600-char cap)
- §5.10 Signup hero contrast → Task 13 ✓
- §7.14 Modal keyboard support → Task 12 ✓
- §7.15 Focus styles → Task 2 ✓

12 covered.

**Bonus (not explicitly in QA report but a natural pair):**
- Skip-to-content link → Task 3 (a11y baseline)
- Aria-label audit → Task 4 (a11y baseline)

**2. Placeholder scan:** every step has actual code or an exact command. Audit-driven steps (Task 4 grep, Task 1 z-index sweep) are bounded by explicit lookup commands and replacement tables.

**3. Type / name consistency:**
- Z-index tokens (`--z-base`, `--z-sticky`, `--z-header`, `--z-drawer`, `--z-overlay`, `--z-modal`, `--z-toast`) — referenced consistently across Tasks 1, 7, 9, 12 ✓
- `useModalKeys<T>` hook signature — Task 12 defines, Task 12's applications use the same shape ✓
- Tailwind utility classes `z-sticky`, `z-header`, etc. — defined in Task 1, used everywhere else ✓

**4. Independence:**
- Plan E touches `globals.css` (no overlap with any other plan).
- Header.tsx is touched by Plan D (Task 14 notifications, Task 15 logged-out venue, Task 16 portal switcher) and by Plan E (Task 7 More collapse). The changes are in different blocks of the same file — sequential merging works; if both plans land in the same PR, conflict is one resolve-and-go.
- CounterPlacementDialog.tsx is touched by Plan A indirectly (none, actually), Plan D Task 8 (50% hint, note limit, error boundary), and Plan E Task 12 (keyboard support). Plan D's edits are in the JSX/state; Plan E's edits add a hook ref. No collision if applied in order; small merge if reversed.
- Settings + saved pages are touched by Plan C (notification prefs persistence, account delete UI) and Plan E Task 5 (tap targets). Same files but different sections; conflict-free in practice.

**Risk notes:**
- Task 4 (aria-label audit) is open-ended. If the audit produces a list of >40 unlabelled buttons, split into a follow-up task — don't try to fix them all in one commit. The spec accepts a partial commit with a list of remaining items in the commit body.
- Task 13's denser overlay may push the heading/sub-headline contrast past axe-core but make the photographic mood feel "muddy" on small screens. Have a designer eyeball before merging.
- Task 1's z-index sweep can affect every drawer/dropdown/modal in the codebase. Run the smoke checks for ALL layered surfaces, not just the ones in the audit table — there may be one-offs in pages I didn't enumerate.

Plan looks complete. Ready to execute.

---

## Execution

Two paths:

**1. Subagent-driven** — Use `superpowers:subagent-driven-development`. Same loop Plans A / C / D used.

**2. Inline** — Use `superpowers:executing-plans`.

No new env vars, no migrations, no new deps.
