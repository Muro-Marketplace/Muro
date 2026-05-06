# Wallplace Curated — Visual Upgrade Design Brief

- **Date:** 2026-05-06
- **Plan ref:** `/tmp/plan-g.md` lines 1147-1188 (Task 12 — "Wallplace Curated visual upgrade")
- **Status:** Approved structure. Implementation gated on this brief landing per Task 12 ordering.
- **Owner:** Curated landing surface (`src/app/(pages)/curated/`)
- **Scope:** Visual + structural pass on `/curated` and `/curated/[tier]`. No backend, no API, no Stripe changes.

## 1. Why this exists

`/curated` today reads as a different product to `/artists` and `/venues`. The hero is centered on a generic museum-gallery photo with no CTA buttons; pricing dumps five tier cards in two ungrouped grids; there is no "How it works" strip, no FAQ on the index, no final CTA, and no value-clarification block. Sibling pages (`/artists`, `/venues`) are already polished against an established system pattern.

In parallel, the index and the per-tier deep-dive pages have drifted apart: index uses tier keys `single_wall` / `full_space` at £49 / £149, but the detail page uses keys `shortlist` / `multi_wall` at £149 / £399. Result: detail-page links from the index would 404, prices on the deep-dive don't match what the index advertises, and the homepage / `/venues` pages quote "from £49" — matching the index, not the detail.

This brief brings `/curated` visually in line with `/artists` and `/venues`, fixes the price/key drift, and adds the missing trust + conversion surfaces.

## 2. Goals

1. A first-time venue visitor can answer in under 30 seconds: **what is it, what does it cost, what do I do next?**
2. Visual + structural parity with `/artists` and `/venues` so the three sibling product pages feel like one site.
3. `/curated/[tier]` deep-dive routes are reachable from the index and tell a consistent price story.
4. No fake social proof: don't fabricate testimonials, don't invent client logos. Curator-voice copy and illustrative venue-type photos are honest substitutes until real placements exist.

## 3. Non-goals

- Brand-asset hero photo (Plan G Task 13 ships the real one)
- Real testimonials / case studies / client logos (gated on having any)
- API, Stripe, or backend changes
- `/curated/success` and `/curated/enquiry-sent` restyling
- A/B-testing infrastructure, analytics events
- New design tokens / new fonts

## 4. Source-of-truth pricing (locked)

Confirmed by the user. Five tiers, canonical keys and labels:

| Tier key | Label | Price | Group |
| --- | --- | --- | --- |
| `single_wall` | Single wall | **£49** | one-off |
| `full_space` | Full space | **£149** | one-off |
| `bespoke` | Bespoke project | **From £299** | one-off |
| `managed_monthly` | Monthly rotation | **£79.99 / month** | managed |
| `managed_quarterly` | Quarterly refresh | **£199.99 / quarter** | managed |

These already match `CuratedClient.tsx`. The drift to fix lives in `[tier]/page.tsx` (see §7).

## 5. Page structure (top to bottom)

Sibling reference: every section pattern below already exists in `/artists/page.tsx` or `/venues/page.tsx`. Reuse those patterns rather than inventing variants.

### 5.1 Hero — full-bleed dark photo + dual CTA

Replaces today's centered-text-over-gallery hero. Pattern matches `/artists` and `/venues` exactly.

**Container:**
- `relative -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32` (today: `min-h-[70vh] lg:min-h-[80vh]` — bring up to siblings' min-screen height)
- Background photo via `next/image` at `z=-10` with dark gradient overlay (`bg-gradient-to-br from-black/65 via-black/50 to-black/35`)
- Content **left-aligned** in `max-w-[1200px]` (today: centered in `max-w-[1000px]`)

**Copy:**
- Eyebrow: `Wallplace Curated` *(kept)*
- H1: `Hand-picked art for your space.` *(replaces "Art on your walls, chosen by experts." — sharper, action-oriented)*
- Subhead: `Tell us about your space, audience, and the feel you want. Our curators hand-pick a shortlist of works from Wallplace artists that fit. From £49.`
- Primary CTA button: `PICK A PLAN` (anchor `#plans`)
- Secondary CTA button: `HOW IT WORKS` (anchor `#how`)
- Below CTAs, scroll-indicator strip → `#curated-content` (matches `/artists` `ScrollButton` pattern)
- Trust strip on the dark band at the bottom of the hero: `From £49 · Delivered in 5 business days · Cancel managed plans anytime`

**Photo:** keep the existing Unsplash ID `photo-1541961017774-22349e4a1262` for this PR. The proper swap to a brand asset (or to a warmer hospitality interior) lives in Plan G Task 13. If Task 12 ships before Task 13 and the implementer wants a less gallery-coded interim photo, pick one of these tested-in-codebase IDs (already used elsewhere in the app, known to load): `photo-1554118811-1e0d58224f24`, `photo-1525610553991-2bede1a236e2`, `photo-1559329007-40df8a9345d8`. Implementer's call.

### 5.2 How it works — 3-step strip (id="how")

New section. Demystifies the service in 10 seconds. Style closer to `/artists`' pipeline than `/venues`' 4-card grid.

- Section: `py-20 lg:py-28`, `bg-background`
- Heading: `How it works`, left-aligned serif h2 (`text-3xl md:text-4xl`)
- 3 columns on `md:`, stacked on mobile
- Each column: small accent number (`01`, `02`, `03`), serif step name, one-sentence body in `text-muted`

Steps:

1. **Brief** — Tell us about the space, audience, and the feel you want.
2. **Curate** — A Wallplace curator hand-picks 5–8 works that fit.
3. **Place** — Pick what you love. We arrange placement or purchase.

Below the steps, one muted line: `Typical turnaround: 5 business days from brief to shortlist.`

Wrap in `<AnimateIn>` (existing component).

### 5.3 Plans (id="plans")

Three structural fixes to today's pricing block: equalise card heights, surface "Most popular", make detail pages reachable.

**Section header**

- Heading: `Plans`
- Subhead: `One-off curation when you need it. Managed rotation when you don't.`

**5.3a One-off curation (3 cards)**

- Group label: `One-off curation` (small, eyebrow style on the right or under the heading — match the existing baseline-justified pattern)
- 3-column grid on `md:`, single column on mobile
- Cards equal height: `flex flex-col h-full`, push CTA to bottom with `mt-auto` (today: `items-start` keeps natural heights → ragged bottoms)
- "Most popular" pill on `full_space` (the £149 middle card): small accent badge, top-right of the card
- Each card has **two distinct affordances**:
  - The card body click: selects the tier and scrolls to brief (kept from today)
  - A `Read more →` link inside the card footer: navigates to `/curated/{key}` (new — closes the gap that detail pages are unreachable from the index)
- Card order: `single_wall`, `full_space`, `bespoke`

**5.3b Managed curation (2 cards)**

- Group label: `Managed curation`
- 2-column grid on `md:`, single column on mobile
- Same equal-height card structure
- Existing "Cancel anytime" framing kept
- Card order: `managed_monthly`, `managed_quarterly`

**5.3c What's included / What's extra / When to upgrade**

Compact 3-column grid below the two card grids. Replaces a missing value-clarification block. Avoids a competitor-comparison table (which works for `/artists` because we're competing with galleries; on `/curated` there is no obvious competitor row).

| Column | Body |
| --- | --- |
| **Included in any plan** | A curator's time and judgement. A delivered shortlist with notes. One revision round on £49 and £149 plans. Refund in full if nothing fits. |
| **Priced separately** | The artwork itself (free QR-loan, paid loan, or outright purchase — your choice). Installation. Rotation logistics on Bespoke. |
| **When to upgrade** | Move from Single wall → Full space when you have 2+ walls or want continuity across them. Move from one-off → Managed when refresh frequency matters more than spend. |

Each column: small accent eyebrow + 1 short paragraph. No icons. `bg-surface` cards on `bg-background`, matching the `/venues` "Walls that work for you" 3-card pattern.

### 5.4 Quote band (image break)

Pattern: matches `/artists`' "Your studio is not a showroom. Independent venues are." image break.

- Section: `relative h-64 lg:h-80 overflow-hidden`
- Full-bleed photo + `bg-black/50` overlay
- Centered serif italic line in `text-white/80 text-lg lg:text-xl`

**Copy:** `"Walls do something to a room. We help you choose what."`
**Attribution:** `— Wallplace curators`

This is curator/brand voice, not a fabricated customer testimonial. Real attributed testimonials get added when we have real ones to attribute, in a separate PR.

**Photo:** `photo-1460661419201-fd4cecdf8a8b` (already used as the `/artists` image break — known to load, and crucially distinct from every photo used in §5.5 below so the same image never renders twice on the same page).

### 5.5 Where curators place art — 3-photo strip

Pattern: matches `/venues`' "Where art goes up" 3-card grid.

- Section: `py-20 lg:py-28`, `bg-background`
- Heading: `Where curators place art`
- 3 cards on `md:`, single column on mobile
- Each card: `aspect-[4/3]` photo + caption underneath in `text-sm text-muted`

**Captions are illustrative venue types, not real client claims.** Suggested copy:

1. `Boutique hotel, Margate`
2. `Members' club, Soho`
3. `Independent café, Peckham`

**Photos:** the `/venues` strip already uses three London hospitality photos (`photo-1554118811-1e0d58224f24`, `photo-1525610553991-2bede1a236e2`, `photo-1559329007-40df8a9345d8`). Reuse the same three IDs here — both pages are venue-product surfaces; small overlap is fine. If the implementer wants fresh photos, pull from the same Unsplash hospitality cluster and verify the chosen IDs render before committing.

Below the strip, one muted line: `Examples of the kind of spaces Curated is designed for.` Keeps it honest — no claim these are real clients.

**No real client logos.** Adding fake or stock logos would damage credibility more than the absence does. Replace this entire block with a real placements row once we have ≥3 placements with permission to attribute.

### 5.6 FAQ — accordion on the index

Currently FAQs only live per-tier on `/curated/[tier]`. Surfacing the cross-cutting ones on the index reduces bounces and matches the `/artists` and `/venues` pattern.

- Section: `py-20 lg:py-28`
- Component: existing `Accordion` from `@/components/Accordion` (used by `/artists` and `/venues`)
- Items: 8 questions

| # | Question | Answer |
| --- | --- | --- |
| 1 | Who is this for? | Cafés, restaurants, hotels, bars, offices, co-working spaces, clinics, retail — any venue with walls and a sense of how they want them to feel. |
| 2 | How is this different from just browsing artists? | Browsing is free and works if you know what you want. Curated is for venues who want a Wallplace curator to do the picking and the artist matching. |
| 3 | How long does it take? | Most shortlists land within 5 business days of your brief. Bespoke projects start with a 30-minute scope call and timeline is set from there. |
| 4 | What's NOT included in the price? | The artwork itself. Curated covers the curation — getting the art on the wall (free QR-loan, paid loan, or outright purchase) is arranged separately. |
| 5 | What if I don't love any of the shortlist? | The £49 and £149 plans include one revision round. If nothing fits at all, we refund in full. |
| 6 | How does the art actually get on the wall? | You pick from three placement methods: free QR-loan (artist gets a share of QR sales, you pay nothing for the art), paid loan (a monthly fee to display), or outright purchase. |
| 7 | Can I cancel a managed plan? | Yes, any time, no notice period. You keep the last shortlist. |
| 8 | Do you visit in person? | Not on £49–£199.99 plans. Bespoke projects include a scope call and, where it makes sense, an on-site walkthrough. |

### 5.7 Brief form — kept, slightly polished (id="brief")

No structural change to the form fields, validation, or submit flow.

Polish:

- Move the form below the FAQ (today: directly under pricing — too eager).
- Heading: `Tell us about your space` *(kept)*. Tier-aware subhead *(kept)*.
- Add a small status banner at the top of the form panel (inside the bordered card, NOT page-sticky) reading `Selected: {label} · {price}` when a tier is selected, so the user always knows what they're submitting. When no tier is selected, this banner is replaced with the existing "Pick a tier above first" subhead.
- The existing `bg-surface border border-border rounded-sm` shell is kept.

The cancelled-from-Stripe banner and the artist-redirect block stay exactly as they are today.

### 5.8 Final CTA — dark band

New section. Pattern matches `/artists` and `/venues` final CTAs.

- Section: `py-20 lg:py-28 bg-foreground` (foreground is `#1A1A1A`)
- Centered: serif H2 + 1 short support line + single primary button
- H2: `Hand-picked art for your space.`
- Support: `From £49 · 5 business days · No long-term commitment.`
- Button: `PICK A PLAN` (white pill on dark) → anchors `#plans`

## 6. Visual / token notes

- **Section vertical rhythm:** `py-20 lg:py-28` between major sections, matching siblings.
- **Section width:** `max-w-[1200px] mx-auto px-6` for content; `max-w-[1100px]` is acceptable for the plans grids if card widths feel cramped at 1200.
- **Type scale:** unchanged. Hero H1: `font-serif text-4xl sm:text-5xl lg:text-6xl`. Section H2: `text-3xl md:text-4xl` (note: globals.css already applies `font-serif` to all `h*`).
- **Colours:** existing tokens only — `background`, `foreground`, `accent`, `accent-hover`, `muted`, `border`, `surface`. No new tokens.
- **Animation:** wrap each major section in `<AnimateIn>` (already used in `/artists` and `/venues`).
- **Image strategy:** all photos are stock (Unsplash, served via `next/image`) — confirmed acceptable by the user. IDs are listed inline above; prefer IDs already used in the codebase to minimise broken-image risk.

## 7. Bug-fix scope inside this PR

These come along with the visual upgrade because the design has to commit to a single source of truth.

1. **`src/app/(pages)/curated/[tier]/page.tsx` — `TIER_DETAILS` keys + prices**
   - Replace key `shortlist` (£149) → `single_wall` (£49). Rewrite the description, highlights, how-it-works, and FAQ copy to fit a £49 single-wall entry tier (today's £149 copy claims "five hand-picked artworks tuned to your space, delivered in 48 hours" — needs to scale down to a single-wall framing at £49).
   - Replace key `multi_wall` (£399) → `full_space` (£149). Rewrite copy to match the £149 multi-wall framing.
   - `bespoke`, `managed_monthly`, `managed_quarterly` keys are unchanged — verify their copy still matches the index's strapline/bullets.
2. **`src/app/(pages)/curated/CuratedClient.tsx` — tier card links**
   - Each tier card gains a `Read more →` link (or equivalent) routing to `/curated/{key}`. The card body click stays as "select tier + scroll to brief".
3. **Site-wide link audit**
   - `grep -rn '/curated/shortlist\|/curated/multi_wall' src` and update any matches to `single_wall` / `full_space`.

## 8. Smoke test (Step 3 of Task 12)

Open in a fresh browser window, signed-out:

1. **`/curated`** — Read it as a venue who's never used Wallplace. Within 30 seconds, can you say (a) what the product is, (b) the entry price, (c) what your next click would be?
2. **`/curated/single_wall`** — loads (no 404), price reads £49, copy matches a single-wall entry tier.
3. **`/curated/full_space`** — loads, price reads £149, copy matches a multi-wall framing.
4. **Card → detail navigation** — clicking `Read more →` on each tier card on the index lands on the correct deep-dive route.
5. **Mobile** — hero, plans grid, and brief form all read top-to-bottom without horizontal scroll. Tap targets on tier cards are comfortable.
6. **Legacy paths** — `grep` confirms there are no remaining references to `/curated/shortlist` or `/curated/multi_wall` anywhere in `src`.

## 9. Implementation note (for the executor of Step 2)

Per `website/AGENTS.md`: "This is NOT the Next.js you know. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code." Consult that docs path before writing changes — particularly around `next/image`, `next/link`, and `Suspense`, all of which appear in this work.

Section patterns to copy verbatim where possible: see `/artists` (hero, comparison, image-break quote, final CTA) and `/venues` (hero alternative, "Walls that work for you" 3-card, "Where art goes up" 3-card, FAQ accordion). Pulling from these reduces both implementation time and visual drift.

## 10. Out of scope (do NOT pick up here)

- Hero photo replacement with a brand asset → Plan G Task 13.
- Real testimonials / case studies / client logos → blocked on having any.
- Curation API or Stripe checkout changes.
- `/curated/success` and `/curated/enquiry-sent` styling.
- A/B test infra, analytics events, or any tracking change.
- New colour tokens, new fonts, new icon set.

## Appendix A — Open questions resolved during brainstorm

- **Hero treatment:** Full-bleed dark photo with dual CTA, NOT split-screen and NOT minimal. Reason: system consistency with siblings beats a unique hero.
- **Real client logos / case studies row:** No. We don't have real ones; fakes would damage credibility. Substituted with the "Where curators place art" strip plus an explicit illustrative caveat.
- **Pricing block treatment:** Kept the cards model (not a comparison table). Equalised heights, "Most popular" surfaced, plus a 3-column "Included / Extra / Upgrade when" clarifier below — gives the table-style breakdown without forcing a competitor row.
- **Real testimonial copy:** None. Replaced with a single curator-voice line in the image break. Real attributed testimonials get added when we have any.
- **Stock images:** Authorised. Use Unsplash via `next/image`. Prefer IDs already proven in the codebase.
