# Workstream B — Card reveal behaviour (hover web, tap mobile)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Linked spec: `docs/specs/2026-04-29-batch-fixes-design.md` § Workstream B.

**Goal:** A new `<ArtworkCard />` wrapper renders `ArtworkThumb` plus an overlay revealing artwork title, price, medium, "Placed at [Venue]" (when applicable), and an action row of Quick view / Open / Buy now. Web reveals on hover; mobile reveals on tap with auto-hide.

**Architecture:** ArtworkThumb stays the dumb image-frame primitive (its file header warns the visualizer / 3D / labels paths must keep using it raw). A new ArtworkCard wraps it and adds the overlay. A lightweight `<QuickViewModal />` provides the in-page quick-view surface. Three browse surfaces swap from inline cards to ArtworkCard.

**Tech Stack:** React 19 · Next.js 16 (App Router) · Tailwind v4 · TypeScript.

**Dependencies:**
- Workstream A (size filter labelling pulls from `SIZE_BANDS`; ArtworkCard imports nothing from FilterPanel directly but shares the SizeBands aesthetic).
- The "Placed at [Venue]" overlay row reads `placedAtVenue` from the work row, which gets populated by Workstream C. ArtworkCard renders the row defensively (only when truthy), so B can ship before C and the row simply stays hidden until C lands.

**Items covered:** 4 (mobile tap reveal), 5 (web hover reveal), 7 (size filter labelling already in A), and adds the overlay surface that workstream C's "Placed at" chip relies on.

---

## File Structure

### Created

| Path | Responsibility |
|------|----------------|
| `src/components/ArtworkCard.tsx` | Hover/tap-reveal wrapper around ArtworkThumb. |
| `src/components/QuickViewModal.tsx` | Lightweight quick-view modal (image + title + medium + price + Buy Now). |

### Modified

| Path | Change |
|------|--------|
| `src/app/(pages)/browse/page.tsx` | Use ArtworkCard on the works grid (gallery view). |
| `src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx` | Use ArtworkCard on the artist portfolio grid. |
| `src/app/(pages)/browse/collections/[collectionId]/page.tsx` | Use ArtworkCard on the collection works grid. |
| `src/components/CollectionCard.tsx` | Light hover/tap overlay treatment matching the ArtworkCard aesthetic. |

---

## Tasks

### Task B.1: QuickViewModal

**Files:**
- Create: `src/components/QuickViewModal.tsx`

- [ ] **Step 1: Component**

```tsx
// src/components/QuickViewModal.tsx
"use client";
import { useEffect } from "react";
import Image from "next/image";

interface QuickViewModalProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  title: string;
  artistName: string;
  medium: string;
  priceLabel: string;
  onBuyNow: () => void;
  onOpenFull: () => void;
}

export default function QuickViewModal(props: QuickViewModalProps) {
  const { open, onClose, src, alt, title, artistName, medium, priceLabel, onBuyNow, onOpenFull } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative bg-background w-full max-w-3xl rounded-sm overflow-hidden grid grid-cols-1 sm:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="relative aspect-square bg-[#F0EDE8]" data-protected="artwork">
          <Image
            src={src}
            alt={alt}
            fill
            className="object-contain p-6 pointer-events-none select-none"
            draggable={false}
            sizes="(max-width: 640px) 100vw, 600px"
            style={{ WebkitTouchCallout: "none", WebkitUserDrag: "none" } as React.CSSProperties}
          />
          <div className="absolute inset-0" />
        </div>
        <div className="p-6 flex flex-col gap-3">
          <h2 className="text-xl font-serif">{title}</h2>
          <p className="text-sm text-muted">{artistName}</p>
          <p className="text-sm text-muted">{medium}</p>
          <p className="text-lg font-medium text-accent">{priceLabel}</p>
          <div className="mt-auto flex gap-2">
            <button onClick={onOpenFull} className="flex-1 px-4 py-3 border border-border text-sm">Open</button>
            <button onClick={onBuyNow} className="flex-1 px-4 py-3 bg-accent text-white text-sm">Buy now</button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mx-auto">
            <path d="M3 3l8 8M11 3L3 11" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/QuickViewModal.tsx
git commit -m "feat(browse): QuickViewModal for card quick-view action"
```

---

### Task B.2: ArtworkCard with hover/tap reveal

**Files:**
- Create: `src/components/ArtworkCard.tsx`

- [ ] **Step 1: Component**

```tsx
// src/components/ArtworkCard.tsx
"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ArtworkThumb from "./ArtworkThumb";
import QuickViewModal from "./QuickViewModal";
import { useCart } from "@/context/CartContext";

interface ArtworkCardCartItem {
  id: string;
  title: string;
  image: string;
  price: number;
  artistSlug: string;
  artistName: string;
  size?: string;
  dimensions?: string;
  framed?: boolean;
  shippingPrice?: number | null;
  internationalShippingPrice?: number | null;
  quantityAvailable?: number;
  quantity?: number;
}

interface ArtworkCardProps {
  src: string;
  alt: string;
  title: string;
  artistName: string;
  priceLabel: string;
  medium: string;
  href: string;
  cartItem: ArtworkCardCartItem;
  placedAtVenue?: string;
  sizes?: string;
  priority?: boolean;
}

const REVEAL_AUTOHIDE_MS = 6000;

export default function ArtworkCard(props: ArtworkCardProps) {
  const { src, alt, title, artistName, priceLabel, medium, href, cartItem, placedAtVenue, sizes, priority } = props;
  const router = useRouter();
  const { addItem } = useCart();
  const [revealed, setRevealed] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armAutoHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRevealed(false), REVEAL_AUTOHIDE_MS);
  }, []);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    if (typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches) return;
    if (!revealed) {
      e.preventDefault();
      setRevealed(true);
      armAutoHide();
    }
  }, [revealed, armAutoHide]);

  const handleBuyNow = useCallback(() => {
    addItem({ ...cartItem, quantity: cartItem.quantity ?? 1 });
    router.push("/checkout");
  }, [addItem, cartItem, router]);

  return (
    <>
      <div
        className="group relative"
        onMouseEnter={() => setRevealed(true)}
        onMouseLeave={() => setRevealed(false)}
      >
        <Link href={href} onClick={handleImageClick} className="block">
          <ArtworkThumb src={src} alt={alt} sizes={sizes} priority={priority} />
        </Link>

        <div
          className={`absolute inset-x-0 bottom-0 z-10 pointer-events-none transition-all duration-200 ${
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
          }`}
        >
          <div className="bg-gradient-to-t from-black/85 via-black/60 to-transparent text-white px-3 pt-8 pb-3 pointer-events-auto">
            <p className="text-sm font-medium leading-tight truncate">{title}</p>
            <p className="text-xs text-white/80">{priceLabel}</p>
            <p className="text-[11px] text-white/70 truncate">{medium}</p>
            {placedAtVenue && (
              <p className="text-[11px] text-white/85 mt-0.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
                Placed at {placedAtVenue}
              </p>
            )}
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                className="flex-1 px-2 py-1.5 text-[11px] bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuickOpen(true); }}
              >
                Quick view
              </button>
              <Link
                href={href}
                className="flex-1 px-2 py-1.5 text-[11px] bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-sm text-center"
              >
                Open
              </Link>
              <button
                type="button"
                className="flex-1 px-2 py-1.5 text-[11px] bg-accent hover:bg-accent-hover text-white rounded-sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBuyNow(); }}
              >
                Buy now
              </button>
            </div>
          </div>
        </div>
      </div>
      <QuickViewModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        src={src}
        alt={alt}
        title={title}
        artistName={artistName}
        medium={medium}
        priceLabel={priceLabel}
        onBuyNow={() => { setQuickOpen(false); handleBuyNow(); }}
        onOpenFull={() => router.push(href)}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify cart shape**

Read `src/context/CartContext.tsx`'s `addItem` signature and confirm `ArtworkCardCartItem` shape is compatible. Adjust if necessary.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ArtworkCard.tsx
git commit -m "feat(browse): ArtworkCard with hover/tap reveal overlay"
```

---

### Task B.3: Use ArtworkCard on /browse works grid

**Files:**
- Modify: `src/app/(pages)/browse/page.tsx`

- [ ] **Step 1: Replace works-grid render**

Find the works-grid render (the gallery view). Each work currently rendered with an inline `<ArtworkThumb />` plus title/price text below. Replace with:

```tsx
<ArtworkCard
  src={work.image}
  alt={work.title}
  title={work.title}
  artistName={work.artistName}
  priceLabel={priceLabelFor(work)}
  medium={work.medium}
  href={`/browse/${work.artistSlug}/${work.slug}`}
  placedAtVenue={work.placed_at_venue ?? undefined}
  cartItem={{
    id: `${work.id}-default`,
    title: work.title,
    image: work.image,
    price: work.price ?? 0,
    artistSlug: work.artistSlug,
    artistName: work.artistName,
    size: work.defaultSize,
    dimensions: work.dimensions,
    framed: work.framed,
    shippingPrice: work.shippingPrice ?? null,
    internationalShippingPrice: work.internationalShippingPrice ?? null,
    quantityAvailable: work.quantityAvailable,
  }}
  sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
/>
```

`priceLabelFor` is a tiny helper (already exists somewhere; if not, inline: `priceGbp == null ? "POA" : \`£${priceGbp.toLocaleString()}\``).

- [ ] **Step 2: Manual smoke**

`npm run dev` → `/browse` (gallery view). Hover a card on desktop: overlay fades in. Click image: navigates. Click Quick view: modal. Click Buy now: routes to /checkout. On a 375px-wide viewport, first tap reveals, second tap navigates, hides after 6 s.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(pages\)/browse/page.tsx
git commit -m "feat(browse): use ArtworkCard on works grid"
```

---

### Task B.4: Use ArtworkCard on artist portfolio + collection detail

**Files:**
- Modify: `src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx`
- Modify: `src/app/(pages)/browse/collections/[collectionId]/page.tsx`

- [ ] **Step 1: ArtistProfileClient swap**

Replace the inline portfolio works render with `<ArtworkCard />` per the same pattern as B.3. The `placedAtVenue` prop is read from `work.placed_at_venue`.

- [ ] **Step 2: Collection detail swap**

Same swap on `browse/collections/[collectionId]/page.tsx`'s works grid (the inline cards at lines 154-194 today).

- [ ] **Step 3: Manual smoke**

Visit `/browse/<artist-slug>` and `/browse/collections/<id>`. Verify hover/tap reveal, Buy Now, Quick view, Open. Verify "Placed at [Venue]" only appears when populated.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(pages\)/browse/\[slug\]/ArtistProfileClient.tsx src/app/\(pages\)/browse/collections/\[collectionId\]/page.tsx
git commit -m "feat(portfolio,collections): use ArtworkCard for hover/tap reveal"
```

---

### Task B.5: Light overlay treatment on CollectionCard

**Files:**
- Modify: `src/components/CollectionCard.tsx`

- [ ] **Step 1: Add hover/tap overlay**

Same hover/tap-reveal pattern as ArtworkCard, but lighter: collection name (already shown), work count, price band, and the secondary `<PlacementButton />` (already stubbed in workstream A.7).

- [ ] **Step 2: Manual smoke**

Visit `/browse?view=collections`. Hover a card on desktop, tap on mobile, verify the placement button is reachable.

- [ ] **Step 3: Commit**

```bash
git add src/components/CollectionCard.tsx
git commit -m "feat(collections): hover/tap overlay on CollectionCard"
```

---

## Workstream B checkpoint

Run: `npm run check`. Manual smoke on `/browse` (works), `/browse/<artist>` (portfolio), `/browse/collections/<id>` (collection detail), `/browse?view=collections` (collection grid). Both desktop hover and mobile tap behaviour.

---

## Self-review

**Spec coverage:** B1 (ArtworkCard) → B.1, B.2. B2 (replace consumers) → B.3, B.4. Collection grid card → B.5.

**Placeholder scan:** clean.

**Type consistency:** `ArtworkCardCartItem` aligns with the cart shape used in Workstream D (verified in B.2 step 2).
