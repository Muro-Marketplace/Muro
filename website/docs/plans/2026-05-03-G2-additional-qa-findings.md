# Plan G2 — Additional QA Findings (autonomous test session, 2026-05-03)

> **For agentic workers:** This is an addendum to Plan G — issues surfaced during a multi-role autonomous test session. Each item carries an **Assessment** line confirming it is net new vs Plans A–G. Many items are written as candidate Plan G–style tasks with file paths and proposed fixes; review them before execution. The intent is to be appended to (or merged into) Plan G or shipped as its own Plan G2 PR.

**Test method:** Hybrid — public surface driven via the dev server (logic-flow testing: "does this user journey actually make sense end-to-end?"), authenticated portals reviewed by reading the source code on this branch. Plans E/F/G are on git branches not yet merged into `main`; every finding was cross-referenced against Plans A–G to avoid duplication.

**Branches checked for dedupe:** `main` (A–D merged), `claude/qa-e-mobile-a11y` (Plan E), `claude/qa-f-polish` (Plan F), `claude/qa-g-targeted` (Plan G).

**Test environment:**
- Dev server (localhost) on `claude/wonderful-bohr-480ff6` (off `main`).
- Code under test: Plans A–D merged. Plans E/F/G drafted but unmerged in this branch.
- Local Supabase env was `placeholder.supabase.co` (no real DB connection), so authenticated flows were verified by reading source rather than clicking.

**Stated test accounts (for follow-up reproduction by humans with real env):**
- Artist — `finbin1@hotmail.co.uk` / Chelsea22!
- Venue — `test@testingvenue.com` / Chelsea22!
- Admin — `fcoles2598@gmail.com` / Chelsea22!

**Format:** Each finding has Title, Symptom, Where, Confidence, Already-in-Plan-A-G check, and Suggested approach. Numbered G2-1 onward so they can be appended into Plan G's existing 1–17 sequence without renumbering.

**Total findings:** 36 (consolidated from 58 raw findings; lower-value duplicates pruned).

---

## Phase A — Logic-flow & cross-surface consistency
*("If a real user clicked through the marketing pages, would the story add up?")*

### G2-1: Pricing page never tells venues that Wallplace is free for them

**Symptom:** Footer "Pricing" link drops every viewer into `/pricing`, which only describes the artist tiers (Core / Premium / Pro). A venue arriving from the footer naturally assumes Wallplace charges them. Nothing on the page acknowledges that browsing and enquiring is free for venues, even though `/venues` and the homepage say so.

**Where:** `src/app/(pages)/pricing/page.tsx` — entire page is artist-tier focused.

**Confidence:** high. Direct UX flow: Footer → /pricing → confused.

**Plan A–G?** No. Plan D Task 13 added the footer "Browse Venues" link but didn't reshape /pricing. Plan G Task 12 wants Curated to look professional; that's a different page.

**Suggested fix:** Open the page with a one-line acknowledgement and a venue-side anchor. Either:
- Add a top banner: "Looking to display art in your venue? Browsing is **free**. See [how it works for venues](/how-it-works)."
- Or split: turn /pricing into a tabbed page (Artists / Venues), with the venues tab summarising "free to browse, free to enquire, optional revenue share, see [Curated](/curated) for managed picks."

---

### G2-2: "First month free" vs "30-Day Free Trial" — same product, two different promises

**Symptom:** /pricing FAQ uses "first month free", the CTA buttons on the same page say "Start Your 30-Day Free Trial", and /apply mixes both. These are not equivalent (months are 28–31 days). The artist agreement page settles on "first month free". This inconsistency is legally risky if a billing dispute hinges on the boundary.

**Where:**
- "30-Day": `src/app/(pages)/pricing/page.tsx:139, 316`
- "First month": same file lines `75-79, 131`; also `src/app/(pages)/apply/page.tsx:49-53`
- Canonical: `src/app/(pages)/artist-agreement/page.tsx:47` ("first month")

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Standardise on "First month free" site-wide; remove "30-Day Free Trial" wording. Update the CTA copy on /pricing and /apply to match.

---

### G2-3: "APPLY TO JOIN" on /pricing promises a free trial, but lands on a curation review form

**Symptom:** "Start Your 30-Day Free Trial" on /pricing → `/apply` → application form with "we review every application personally; allow up to 5 business days". The CTA promise (instant trial) and the actual experience (gated curation queue) don't match. A user clicks expecting platform access and instead joins a wait list.

**Where:** `src/app/(pages)/pricing/page.tsx:139, 316` (CTA text) → `src/app/(pages)/apply/page.tsx`.

**Confidence:** high.

**Plan A–G?** No (Plan G Task 12 covers Curated visual upgrade, unrelated).

**Suggested fix:** Either (a) re-label the CTA to "Apply to join — first month free if accepted" (honest), or (b) drop the curation gate at signup and treat the first month as a probationary period that can be revoked.

---

### G2-4: /how-it-works is empty — picking a segment navigates away to a marketing page

**Symptom:** `/how-it-works` is "I am a... [Venue] [Artist]". Clicking either tab is a full-page navigation to `/venues` or `/artists`. The page itself contains no actual "how it works" content; it's a router. Customer (buyer) path missing entirely. A user expecting a single explainer comes away unclear which bit was meant for them.

**Where:** `src/app/(pages)/how-it-works/page.tsx` (and the segmentation component it uses).

**Confidence:** high. Verified via dev-server click-through.

**Plan A–G?** No.

**Suggested fix:** Either keep it as a router but add real content per segment without navigation (in-page tabs or expanded panels), or rename it to a chooser ("Get started — pick your path") and accept that the actual How-It-Works lives on /artists, /venues, and a new /buyers page. Add a Customer/Buyer path to the segment list either way (QR scan → checkout → order → delivery).

---

### G2-5: /signup, /signup/artist, /apply, /signup/customer, /register-venue — five doors for the same room, with four different conventions

**Symptom:** Routes include `/signup`, `/signup/artist`, `/signup/customer`, `/apply`, and `/register-venue`. /signup is a chooser; /signup/artist says "Apply to join as an artist — create your account first"; /apply redirects logged-out users to /signup/artist?next=/apply; venue signup lives at /register-venue, not /signup/venue. Many CTAs route inconsistently. A user landing in this maze can easily double-create accounts or end up on the "wrong" form.

**Where:**
- `src/app/(pages)/signup/page.tsx` (router with three options)
- `src/app/(pages)/signup/artist/page.tsx`
- `src/app/(pages)/signup/customer/page.tsx`
- `src/app/(pages)/apply/page.tsx`
- `src/app/(pages)/register-venue/page.tsx`

**Confidence:** medium-high. Two independent ways for an artist to start (/signup choose Artist → /signup/artist, or /artists Apply → /apply → /signup/artist?next=/apply) make this hard to keep coherent over time.

**Plan A–G?** No.

**Suggested fix:** Pick one canonical artist signup route (recommend /signup/artist), redirect /apply to /signup/artist permanently, and redirect /register-venue to /signup/venue. Keep CTAs consistent: "Apply to join" (artist) and "Register your venue" — both pointing to the canonical /signup/{role} URL. Ensure /signup/venue exists (currently /register-venue takes its place).

---

### G2-6: Footer "For Venues" column claims "FAQs" but the FAQ page mixes artists, venues, and customers in one undifferentiated list

**Symptom:** Footer columns suggest dedicated artist / venue FAQs. /faqs serves both audiences from one mixed list. A venue scanning for a venue-specific question has to skim past artist-specific ones. Plus /faqs uses arrangement-type wording ("display loan, paid loan, or outright purchase") that doesn't match what Plans C/G normalised elsewhere.

**Where:** `src/app/(pages)/faqs/page.tsx:206` (mixed audience).

**Confidence:** medium.

**Plan A–G?** No (Plan F Task 16 covers em-dashes in email; nothing about FAQ structure).

**Suggested fix:** Either split into /faqs/artists, /faqs/venues, /faqs/buyers with the existing page becoming a router; or add an audience filter chip set at the top so the visitor can pick and only relevant Q&As remain.

---

### G2-7: Loan-arrangement labels use four different names across UI surfaces

**Symptom:** The `interested_in_free_loan` / `open_to_free_loan` field renders as:
- "Paid Loan" in admin/applications and admin/venues
- "Display" / "Display + Rev Share" badge on /spaces-looking-for-art
- "Paid loan (monthly fee)" inside the application form
- "display loan, paid loan, or outright purchase" inside /faqs

A venue can't reconcile that the same checkbox is named four different ways.

**Where:**
- `src/app/(pages)/admin/applications/page.tsx:250`
- `src/app/(pages)/admin/venues/page.tsx:99`
- `src/app/(pages)/spaces-looking-for-art/page.tsx:435-438`
- `src/components/ApplicationForm.tsx:742-743`
- `src/app/(pages)/faqs/page.tsx:206`

**Confidence:** high.

**Plan A–G?** Plan G Task 6 verifies loan acceptance creates a placement row; Plans C 2026-05-02 Task 14 introduced `paid_loan` as a distinct arrangement type. Neither touches the **labels** customers and venues read.

**Suggested fix:** Centralise canonical labels in `src/lib/arrangement-labels.ts`:
```ts
export const ARRANGEMENT_LABEL = {
  paid_loan: "Paid loan",
  revenue_share: "Revenue-share loan (QR-enabled)",
  purchase: "Direct purchase",
} as const;
```
Use everywhere. Bonus follow-up: rename the DB columns from `*_free_loan` to `*_paid_loan` in a follow-up migration since the field is semantically a paid loan.

---

### G2-8: /curated tier IDs and prices on the landing page disagree with the deep-dive `[tier]` page

**Symptom:**
- /curated landing lists tiers `single_wall £49`, `full_space £149`, `bespoke from £299`, `managed_monthly £79.99`, `managed_quarterly £199.99`.
- /curated/[tier] uses entirely different keys (`shortlist £149`, `multi_wall`, `bespoke`) — different prices, different shortlists ("Five hand-picked" vs "5–8 works").
- No internal links point to the deep-dive — `/curated/shortlist` is unreachable from the landing.

**Where:**
- `src/app/(pages)/curated/CuratedClient.tsx:21-94` (canonical landing)
- `src/app/(pages)/curated/[tier]/page.tsx:17-95` (orphaned, inconsistent)

**Confidence:** high.

**Plan A–G?** Plan G Task 12 says Curated needs a visual upgrade gated on a brief; this is content/data inconsistency, separate from visual polish.

**Suggested fix:** Either delete `/curated/[tier]/page.tsx` entirely, or rewrite it to match the canonical tier set. Add "Learn more" links on each TierCard that route to the deep-dive once consistent.

---

### G2-9: Page titles missing on many routes — every tab reads "Wallplace – Curated Art for Commercial Spaces"

**Symptom:** Verified via dev-server: /signup/artist, /apply, /how-it-works, and likely many more do not export `metadata` and inherit the root title. Browser tabs are indistinguishable; SEO crawlers see one title for the whole site.

**Where:** root `src/app/layout.tsx:37-49`. Pages confirmed missing per-route metadata:
- `src/app/(pages)/signup/artist/page.tsx`
- `src/app/(pages)/signup/customer/page.tsx`
- `src/app/(pages)/apply/page.tsx`
- `src/app/(pages)/how-it-works/page.tsx`
- `src/app/(pages)/browse/page.tsx`
- `src/app/(pages)/orders/track/page.tsx`
- `src/app/(pages)/register-venue/page.tsx`
- `src/app/(pages)/spaces-looking-for-art/page.tsx`
- `src/app/(pages)/forgot-password/page.tsx`, `reset-password/page.tsx`

Also no og:image PNG anywhere in `/public`; root `openGraph` has no `images` array; Twitter cards declare `summary_large_image` with no image set.

**Confidence:** high.

**Plan A–G?** Plan F covers polish but doesn't sweep this. Only `browse/[slug]/page.tsx` and `browse/[slug]/[workSlug]/page.tsx` have route-level metadata today.

**Suggested fix:**
- Add `public/og-image.png` (1200×630).
- Wire `images: [{ url: "/og-image.png", width: 1200, height: 630 }]` into root `openGraph` + `twitter`.
- Add a per-page `metadata` export for the high-traffic pages above.

---

### G2-10: Header H1 on /artists has no space between two sentences ("sell.All in one place.")

**Symptom:** `/artists` H1 renders as `Display, discover, sell.All in one place.` — the period and capital `A` collide because of how an inline span / `<br>` handles whitespace.

**Where:** `src/app/(pages)/artists/page.tsx` (the H1 template).

**Confidence:** high. Verified via DOM inspection.

**Plan A–G?** No.

**Suggested fix:** Insert a space (`{" "}`) between the two `<span>`s, or rewrite the H1 as a single string with a `<br>`:
```tsx
<h1>Display, discover, sell.<br />All in one place.</h1>
```

---

## Phase B — Customer-portal & checkout

### G2-11: Optimistic save silently swallows API failures (no rollback, no error toast)

**Symptom:** `SavedContext.toggleSaved` updates local state and shows "added to favourites" before the request completes; the `/api/saved` POST/DELETE is fire-and-forget with `.catch(() => {})`. If it 401s, 5xxs, or network-fails, the heart appears filled and the toast lies. Refresh restores the unsaved state.

**Where:** `src/context/SavedContext.tsx:99-114`.

**Confidence:** high.

**Plan A–G?** No (Plan F Task 7 only adds toast wording; it doesn't add error handling).

**Suggested fix:** `await` the request; on non-OK, revert the optimistic mutation and show an error toast.

---

### G2-12: Customer-portal saved tab not URL-driven — refresh/share resets to "Works"

**Symptom:** Tab state is `useState<ItemType>("work")`. Refreshing or sharing `/customer-portal/saved` always lands on Works, even if the user was viewing Artists or Collections.

**Where:** `src/app/(pages)/customer-portal/saved/page.tsx:52`.

**Confidence:** high.

**Plan A–G?** No (Plan C 2026-05-02 Task 8 only does location filter on /browse).

**Suggested fix:** Drive `activeTab` from `?tab=` searchParam; mirror the pattern Plan C uses for the browse location filter.

---

### G2-13: CustomerPortalLayout has no role-mismatch guard or email-verification gate

**Symptom:** Layout only redirects on `!user`. If an artist/venue user lands on `/customer-portal/*`, they see customer pages — no PortalGuard equivalent. Customers can also enter their portal pre-email-verification (PortalGuard's `email_confirmed_at` block isn't applied here). PortalGuard's role type literally excludes `"customer"`.

**Where:** `src/components/CustomerPortalLayout.tsx:18-26`; `src/components/PortalGuard.tsx:12`.

**Confidence:** high.

**Plan A–G?** No (Plan D Task 6 toasts on PortalGuard, but customer portal never uses PortalGuard; Plan A's signup-verification doesn't gate customer portal entry).

**Suggested fix:** Wrap CustomerPortalLayout with PortalGuard after widening its `allowedType` union to include `"customer"`. Reuse the existing email-verification block.

---

### G2-14: Checkout fulfilment "collection" path 400s on submit because schema requires shipping address

**Symptom:** Buyer picks "Collect from artist" and the frontend hides address fields; server-side `checkoutSchema` still requires `addressLine1`, `city`, `postcode` unconditionally. POST returns 400 "Cart items and shipping required" with no specific reason; the page shows a generic submit error.

**Where:** `src/lib/validations.ts:193-203` vs `src/app/(pages)/checkout/page.tsx:112-114`.

**Confidence:** high.

**Plan A–G?** No (Plan B covers payment integrity, not this validation branch).

**Suggested fix:** Make address fields optional when `body.fulfilmentMethod === "collection"`, or use a discriminated union schema.

---

### G2-15: Cart never re-validates against server (stale price / sold / deleted works pass through to Stripe)

**Symptom:** Cart items persist in localStorage forever. If the artist drops a price, marks the size sold, or deletes the work entirely, the buyer can still proceed — `/api/checkout` blindly maps `items.price` into Stripe `unit_amount` with no DB cross-check on `works.id` / `active` / current price. Plan D Task 11 only fixed the *display* of stale references inside collections; checkout itself is unguarded.

**Where:** `src/app/api/checkout/route.ts:60-72`; `src/context/CartContext.tsx`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** In `/api/checkout`, fetch each `works` row by id, refuse if missing/inactive, and recompute `unit_amount` from the DB price (only warn on drift).

---

### G2-16: OrderStatusTracker doesn't recognise half the order statuses the API emits

**Symptom:** `STEPS` is hardcoded `["confirmed","processing","shipped","delivered"]`. The API and `/orders/track` use additional statuses: `placed`, `artist_notified`, `awaiting_dispatch`, `disputed`. For an order in any of these, `currentIdx === -1`, so all four pips render gray and the label falls back to the raw machine string. Customer literally sees `"awaiting_dispatch"` on the order row.

**Where:** `src/components/OrderStatusTracker.tsx:8-13, 27, 57` vs `src/app/(pages)/orders/track/page.tsx:40-49`.

**Confidence:** high.

**Plan A–G?** No (Plan D Task 9 covers carrier link only).

**Suggested fix:** Replace `STEPS` with the canonical machine states from `lib/order-state-machine.ts` and supply human labels for each; treat `disputed` as a separate badge alongside `cancelled`.

---

### G2-17: Order detail page omits shipping line, tax/VAT, discount, and currency label

**Symptom:** Customer order detail shows only `Total`. There's no "Shipping £x", no "Tax/VAT" line (UK consumer law expects VAT broken out), no discount line. Currency symbol is hardcoded `£` everywhere; `orders.currency` is selected by `/api/orders/track` but never consulted on `/customer-portal/page.tsx`. International buyers see GBP without a label.

**Where:** `src/app/(pages)/customer-portal/page.tsx:155-173`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Render `Subtotal` / `Shipping` / `Tax` / `Total` blocks; use `Intl.NumberFormat` keyed off `order.currency`.

---

### G2-18: Refund eligibility uses outdated status names + has no upper time-bound

**Symptom:** `refundEligible = ["confirmed","processing","shipped","delivered"].includes(selected.status)`. The state machine emits `awaiting_dispatch`, `artist_notified`, `placed` — the *most* refundable orders look ineligible (no Refund button). Conversely, no upper bound: a 2-year-old delivered order still shows the Refund button.

**Where:** `src/app/(pages)/customer-portal/page.tsx:179`.

**Confidence:** high.

**Plan A–G?** No (Plan B Task 12 covers duplicate-prevention only).

**Suggested fix:** Sync the status whitelist to the state machine; add a "delivered + N days" cap (e.g. 14 days) matching consumer-rights window.

---

### G2-19: No order list filters or pagination on /customer-portal

**Symptom:** Every order is rendered into one ungroupable scroll. No status filter, no date range, no search-by-id box. Order detail is local state only — no `?order=<id>` deep link, so receipt emails can't link straight to an order.

**Where:** `src/app/(pages)/customer-portal/page.tsx:44, 308-331`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Add a status pill row, a date range picker, and SearchBar (Plan F provides it) bound to `?status=&from=&to=&q=&order=`. Drive selected order from URL.

---

### G2-20: Postcode validation accepts "ab" or "9999999999999999999" — checkout blindly passes garbage through to Stripe / shipping label

**Symptom:** Both Zod schema and frontend "required" check pass on any non-empty 1-20 char string. Buyers entering "ab" or pasting a phone number into postcode → Stripe rejects, or the artist gets garbage on the shipping label.

**Where:** `src/lib/validations.ts:200`; `src/app/(pages)/checkout/page.tsx:117`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Country-aware regex (UK postcode, US ZIP, etc.) before submit; surface inline error.

---

### G2-21: No address-book / saved addresses for repeat customers

**Symptom:** Every checkout requires retyping the full address. There's no `/customer-portal/addresses` page, no `customer_addresses` table, no "use saved address" picker on `/checkout`. Repeat customers re-key 7 fields each time.

**Where:** Absent under `src/app/(pages)/customer-portal/`; absent in API.

**Confidence:** high. Major repeat-purchase UX gap.

**Plan A–G?** No.

**Suggested fix:** Add `customer_addresses` table + CRUD endpoints; on `/checkout` if `user`, render saved-address picker plus "Use new address".

---

## Phase C — Artist-portal

### G2-22: Artist-portal makes 16 user-facing error states use native `alert()`

**Symptom:** 16 error paths pop up an OS-level browser alert (modal, blocks the page, looks unprofessional, no styling). Plan F widens ToastContext but doesn't migrate the call sites.

**Where:**
- `src/app/(pages)/artist-portal/billing/page.tsx:181, 185, 201, 205, 218, 222, 235, 239`
- `src/app/(pages)/artist-portal/profile/page.tsx:678, 683`
- `src/app/(pages)/artist-portal/placements/page.tsx:598, 627, 635, 652, 662`
- `src/app/(pages)/artist-portal/showroom/[id]/page.tsx:167`
- (also venue-portal: `src/app/(pages)/venue-portal/placements/page.tsx:719, 736, 765, 775, 794, 804, 1386, 1394`)

**Confidence:** high.

**Plan A–G?** No (Plan F Task 21 widens ToastContext but doesn't migrate callers; Plan E focuses on a11y).

**Suggested fix:** Use the existing `useToast()` (`{ variant: "error" }`) at every call site. Land in two PRs (artist + venue) to keep the diff readable.

---

### G2-23: "Yes, delete my account" button has no onClick — dead button on artist AND venue settings

**Symptom:** Confirm button in the Danger Zone is wired to nothing. User clicks → no API call, no feedback. Effectively a dead button. Worse than a mailto fallback.

**Where:**
- Artist: `src/app/(pages)/artist-portal/settings/page.tsx:257-259`
- Venue: `src/app/(pages)/venue-portal/settings/page.tsx:387-391`

**Confidence:** high.

**Plan A–G?** Plan C 2026-05-02 Task 11 covers the artist API; Plan E Task 12 references `AccountDangerZone.tsx` "if Plan C merged" — but Plan C didn't ship for venues. This is the live state and is worse than what either plan assumes.

**Suggested fix:** Until Plan C lands fully (artists + venues), point both buttons at `mailto:support@wallplace.co.uk?subject=Delete%20my%20account` so the destructive intent at least reaches a human. Remove the no-op state.

---

### G2-24: Order ID rendered as raw UUID to artists

**Symptom:** Order rows and the order detail header show the full UUID (`Order 3f2c8a91-...`) instead of a short, human-readable order number. Hard to reference in support; ugly; leaks DB internals.

**Where:** `src/app/(pages)/artist-portal/orders/page.tsx:200, 441`.

**Confidence:** high.

**Plan A–G?** No (Plan G Task 3 covers venue-name vs uuid on artwork-request rows; Task 4 covers artist-name on offer rows; order id display is a separate surface).

**Suggested fix:** Surface a short `order_number` (first 8 chars or a generated `WP-XXXXXX` short id from a migration) and render that; keep the UUID only as the React `key`.

---

### G2-25: Artwork-request detail page shows venue slug instead of name

**Symptom:** "From `the-copper-kettle`" instead of "From The Copper Kettle"; same issue on the title row of the response form.

**Where:**
- `src/app/(pages)/artist-portal/artwork-requests/[id]/page.tsx:143`
- `src/app/(pages)/artist-portal/artwork-requests/page.tsx:67`

**Confidence:** high.

**Plan A–G?** Plan G Task 3 covers venue-name resolution but explicitly targets `artist-portal/placements/page.tsx`, a different file. The artwork-requests detail page is a parallel surface and is not enumerated.

**Suggested fix:** Have `/api/artwork-requests/[id]` join `venue_profiles.name` and render that with `req.venue_slug` as the fallback. Mirror Plan G Task 3's pattern.

---

### G2-26: Profile "Save Changes" button has no loading or disabled state

**Symptom:** Click Save Changes → nothing visible for 1–2 seconds while the API runs. User clicks repeatedly, fires multiple PUTs.

**Where:** `src/app/(pages)/artist-portal/profile/page.tsx:709-714`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Add `saving` state, `disabled={saving}`, label flips to "Saving…", success toast fires only after the response.

---

### G2-27: Optimistic collection delete has no confirmation dialog

**Symptom:** Click "Delete" on a collection → it disappears immediately; only reverts if the server returns non-OK. There's no confirmation before the destructive action.

**Where:** `src/app/(pages)/artist-portal/collections/page.tsx:150-167` (`handleDelete`).

**Confidence:** high.

**Plan A–G?** No (Plan D Task 11 covers stale-price guards on collections; commit `80ce687` already added confirm to *workspace* delete; collection delete still missing).

**Suggested fix:** Wrap in `if (!confirm("Delete this collection? This cannot be undone.")) return;` (or, ideally, a styled confirm dialog matching the showroom delete pattern).

---

### G2-28: Notification-preference toggles silently no-op for 6 of 7 categories

**Symptom:** Artist/venue toggles "Sales", "Payout notifications", "Wallplace newsletter" etc., clicks Save Preferences, sees "Saved!" — but only `messageNotifsEnabled` actually persists to the DB. The other six write to localStorage and are lost on every other device / private window. The success message is a lie.

**Where:**
- Artist: `src/app/(pages)/artist-portal/settings/page.tsx:108-117`
- Venue: `src/app/(pages)/venue-portal/settings/page.tsx:171-180`

**Confidence:** high.

**Plan A–G?** Plan C 2026-05-02 Tasks 12–13 cover persistence in general for the message channel only. Until the rest ships, the page actively misleads users about what was saved.

**Suggested fix:** Either disable the six unimplemented toggles with a "Coming soon" pill, OR remove the success message from non-message toggles, until the persistence layer covers them all.

---

### G2-29: Subscription `past_due` / `canceled` indistinguishable from "never subscribed"

**Symptom:** When an artist's card expires (`past_due`) or they cancel, PortalGuard renders the same "Choose Your Plan" gate they saw on day one. The user can't tell whether they need to update payment, resubscribe, or it's their first time.

**Where:** `src/components/PortalGuard.tsx:80-83, 116-144` — no copy variant for `past_due` / `canceled`.

**Confidence:** medium-high.

**Plan A–G?** No.

**Suggested fix:** Branch the rendered copy on `subscriptionStatus`: "Update payment method" CTA for `past_due`, "Resubscribe to access your portal" for `canceled`, "Choose Your Plan" for `none`.

---

## Phase D — Venue-portal

### G2-30: Account Details fields in venue Settings are read-only mirages

**Symptom:** Venue Name / Email / Phone inputs use `defaultValue` with no `onChange` and no save handler — typing edits the DOM but nothing persists. Both "Save Preferences" and "Save Changes" buttons call the same `handleSave()` which only saves notif prefs.

**Where:** `src/app/(pages)/venue-portal/settings/page.tsx:171-180, 197-203`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Convert `Field` to controlled, wire to `useState`, persist via `PUT /api/venue-profile`. Or remove the inputs and link out to `/venue-portal/profile` (where the real editor lives) to avoid duplication.

---

### G2-31: Wall editor has no undo/redo, no Delete-key shortcut, no arrow-key nudge

**Symptom:** Once you drop or move artwork on a wall, there is no Cmd/Ctrl+Z. Pressing Backspace/Delete on a selected item does nothing — users must reach for the toolbar's bin icon. Arrow-key nudge is also absent.

**Where:**
- `src/components/visualizer/WallVisualizer.tsx` (no history stack on `items`)
- `src/components/visualizer/WallCanvas.tsx` (no `keydown` listener)

**Confidence:** high.

**Plan A–G?** No (Plan G Task 14 covers visualizer mobile *touch*; this is editor desktop a11y).

**Suggested fix:** Wrap `items` in an undo stack (push past states on each mutation, max ~30); add a `keydown` listener that maps `Backspace`/`Delete` → `handleDelete()`, `ArrowKeys` → 1 cm nudge, `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` → undo/redo.

---

### G2-32: Wall editor rejects HEIC photos — typical iPhone uploads silently dropped

**Symptom:** iOS users almost always have HEIC photos by default. The file picker `accept="image/jpeg,image/png,image/webp"` rejects them silently; even if forced, `resizeImage` can't decode HEIC and the comment says it falls back to the original which then trips Vercel's 4.5 MB body limit.

**Where:** `src/app/(pages)/venue-portal/walls/new/page.tsx:444` (accept attribute) and `:101-105` (HEIC fallback comment).

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Add `image/heic, image/heif` to `accept`; either client-side decode via `heic2any` or surface "iPhone HEIC photos: switch your camera to 'Most Compatible' or convert first" before the upload tries.

---

### G2-33: Stripe Connect return URLs land users on settings without acknowledgement

**Symptom:** `src/app/api/stripe-connect/onboard/route.ts` redirects back to `/venue-portal/settings?stripe_connect=complete` (or `?stripe_connect=refresh` on cancel). The Settings page never reads either query param — users return from a 5-minute Stripe form to the same page they left, with no toast, no banner, no "Welcome back, you're set up." The status chip eventually flips on its own polling, but there's a real perception gap.

**Where:** `src/app/api/stripe-connect/onboard/route.ts:73-78`; `src/app/(pages)/venue-portal/settings/page.tsx` has no searchParams reader for `stripe_connect`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** On settings mount, read `searchParams.get("stripe_connect")` and show "Payouts setup complete" or "Setup paused — pick up where you left off" toast, then `router.replace("/venue-portal/settings")` to clear the param.

---

### G2-34: QR Labels page hides Sold/Completed placements, killing the use case for re-prints

**Symptom:** `const active = all.filter((p) => p.status === "active");` strips Sold and Completed placements. A venue who sold a piece this morning and wants to print a "this work is sold, scan for similar" sticker can't — the placement disappeared the moment they marked it Sold.

**Where:** `src/app/(pages)/venue-portal/labels/page.tsx:80`.

**Confidence:** medium.

**Plan A–G?** No (Plan G Tasks 7-8 cover style picker + tick toggle + size visibility, not the status filter).

**Suggested fix:** Default to active but expose an "Include sold/completed" toggle, or include all non-archived placements with a status badge per row.

---

### G2-35: Outgoing placement requests can't be revoked while Pending

**Symptom:** When a venue sends a placement request and is awaiting the artist's response, the only action is "Cancel" — but `cancelPlacement()` is a status flip to `cancelled`, which is shown to both parties as "Cancelled" rather than "Withdrawn". There's no "I made a mistake, retract this before they see it" path.

**Where:** `src/app/(pages)/venue-portal/placements/page.tsx:1384-1392, 783-806`.

**Confidence:** medium.

**Plan A–G?** No (Plan G Task 5 adds Counter button to artwork-request rows but doesn't touch withdrawal).

**Suggested fix:** For pending placements where the current user is the requester, label the button "Withdraw" and have it DELETE the row server-side; only show "Cancel" once the placement is Active.

---

### G2-36: Wall editor "Show on public profile" toggle has no save indicator

**Symptom:** The toggle is fully optimistic. On success: nothing visible. On failure: silent revert (no toast, no error). A venue who just published a wall to their public profile gets zero confirmation.

**Where:** `src/app/(pages)/venue-portal/walls/[id]/page.tsx:269-334`.

**Confidence:** high.

**Plan A–G?** No (Plan F Task 7 adds toasts for `<SaveButton>` only).

**Suggested fix:** On success show "Wall is now public" / "Wall is now private" toast. On failure show "Couldn't update — try again." with the revert.

---

### G2-37: Venue Profile per-section "Cancel" doesn't revert in-progress edits

**Symptom:** Each section card has an Edit/Cancel toggle. Clicking Cancel after typing in `detailName` doesn't revert state — it just hides the inputs. The new value is still in `detailName` and gets saved on the next "Save Changes". Easy to lose old values without realising.

**Where:** `src/app/(pages)/venue-portal/profile/page.tsx:411-419`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Cancel should snapshot section state on Edit-enter and restore it on Edit-cancel. Or remove per-section Edit and make the form always-editable.

---

### G2-38: "Set Up Payouts" surfaced for venues who'll never need it

**Symptom:** The Settings → Payouts block always appears for every venue regardless of whether they have any deal that requires payouts (paid loan or revenue share with QR enabled). For venues running free-loan-only, the prompt is noise. The dashboard onboarding checklist reinforces "Set up payouts" as a required step — pressure for an action they may never need.

**Where:** `src/app/(pages)/venue-portal/settings/page.tsx:280-332`; `src/app/(pages)/venue-portal/page.tsx:137`.

**Confidence:** medium.

**Plan A–G?** No.

**Suggested fix:** Hide the Payouts block until the venue has at least one paid_loan or revenue-share placement. Lower-priority "Set up payouts when you're ready" hint with a Learn more link instead.

---

### G2-39: Drag-to-add work onto wall has no keyboard alternative

**Symptom:** WorksPanel emits `dragstart` with `application/x-wallplace-work`. Keyboard-only users have no way to add a work — clicking a thumb in the panel calls `onSelect → handleSelectFromPanel → addItemAt(centre)` but there's no on-screen affordance telling users they can click instead of drag. There's also no aria-live region announcing "X added at centre".

**Where:** `src/components/visualizer/WorksPanel.tsx`; `src/components/visualizer/WallCanvas.tsx:139-164`.

**Confidence:** medium.

**Plan A–G?** No (Plan G Task 14 adds touch UX, not keyboard a11y for the editor).

**Suggested fix:** Add a tooltip/instruction "Click to add to wall, or drag" on each thumb; add `aria-live="polite"` element that announces add/move/delete.

---

## Phase E — Admin panel

### G2-40: Admin actions use native `confirm()` / `alert()` and never capture the rejection reason

**Symptom:** Application accept/reject uses `confirm("Accept this artist?...")` and `alert(data.error)`. No undo, no reason-capture textarea on reject (even though the API supports `body.feedback`), no admin-action audit log row.

**Where:** `src/app/(pages)/admin/applications/page.tsx:73-94`; `src/app/api/admin/applications/[id]/route.ts:68` (feedback param accepted but never collected).

**Confidence:** high.

**Plan A–G?** No (Plan A Phase 6 hardens admin auth; doesn't touch the action UX).

**Suggested fix:** Replace with a `<Dialog>` + reason textarea on reject (wired into the existing `feedback` body param); insert an `admin_actions` row (admin_id, action, target_id, reason, created_at) on every accept/reject.

---

### G2-41: Application accept/reject doesn't populate `reviewed_at` / `reviewed_by`

**Symptom:** `Application.reviewed_at` is read in the UI but the PUT handler never UPDATEs `reviewed_at` or any `reviewed_by` column. The "Reviewed [date]" line will always be blank.

**Where:** `src/app/api/admin/applications/[id]/route.ts:48-51`; rendered at `src/app/(pages)/admin/applications/page.tsx:337`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** UPDATE `artist_applications` set status=…, reviewed_at=now(), reviewed_by=admin.user.id`. Add the column if missing.

---

### G2-42: No user-management surface in admin (no search, role-change, suspend, force-logout)

**Symptom:** AdminPortalLayout sidebar has only Dashboard / Applications / Artists / Venues / Curation. There's no `/admin/users`; no way to change a user's role, suspend, reset 2FA, force-logout, or impersonate. Customers (buyers) aren't in admin nav at all.

**Where:** `src/components/AdminPortalLayout.tsx:8-15`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Add `/admin/users` with email/name search, role badge, and (initially) read-only view + "Send password reset" + "Force sign-out" actions. Defer impersonation — it needs careful audit logging.

---

### G2-43: No disputes / payouts / moderation surfaces in admin

**Symptom:** `/complaints` is a static policy doc — no inbound channel from the page itself. No admin surface for viewing complaints, reviewing flagged content, or seeing pending Stripe Connect payouts. Dashboard "Gross Sales" card aggregates revenue but there's no per-payout breakdown, hold reasons, or Connect onboarding state.

**Where:** `src/app/(pages)/complaints/page.tsx` (no form); `src/components/AdminPortalLayout.tsx:8-15`; `src/app/(pages)/admin/page.tsx:160-178`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Add `/admin/complaints` (table from a `complaints` table, populated by a new form on `/complaints`), `/admin/payouts` (Stripe Connect transfer list with status), and a `/admin/moderation` queue for any item flagged via a future report-this-item flow.

---

### G2-44: Admin/artists table has no search; admin/venues does — inconsistent

**Symptom:** `/admin/venues` has a name/email/postcode search. `/admin/artists` has none. Both load every row at once with no pagination/limit; a 1,000-artist roster will be a long page.

**Where:** `src/app/(pages)/admin/artists/page.tsx:38-82` (no search); `src/app/(pages)/admin/venues/page.tsx:62-85` (has search).

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Mirror the venues search pattern in admin/artists. Add server-side `?limit=50&offset=0` with a "Load more" button on both routes.

---

## Phase F — Public marketing & forms

### G2-45: Newsletter form has no GDPR consent, no double opt-in, no unsubscribe link

**Symptom:** Footer newsletter posts an email straight to `/api/newsletter` with only "No spam." copy. No checkbox confirming consent under UK GDPR, no double opt-in, no link to a privacy notice or unsubscribe instructions adjacent to the form.

**Where:** `src/components/NewsletterForm.tsx:45-67`; `src/components/Footer.tsx:58-63`.

**Confidence:** high.

**Plan A–G?** Plan F Task 16 sweeps em-dashes / unsubscribe links in *email templates*, not the subscribe form.

**Suggested fix:** Add "By subscribing you agree to our [Privacy Policy](/privacy). Unsubscribe any time." below the input. Switch backend to issue a confirm-link email and only mark subscribers `confirmed=true` after click.

---

### G2-46: ContactForm has no spam protection (no honeypot, no captcha)

**Symptom:** `/contact` form posts to `/api/contact` with name/email/message. The route imports `checkRateLimit` (good) but the form has no honeypot field, no hCaptcha, no time-on-form heuristic. Contact spam is a common front door for marketplace abuse.

**Where:** `src/components/ContactForm.tsx:96-141`.

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Add hidden `<input name="website" tabIndex={-1} autoComplete="off">` honeypot — reject server-side if filled. For belt-and-braces add hCaptcha (free and accessible).

---

### G2-47: /apply has no real file upload — only "publicly accessible image URL" inputs

**Symptom:** Application form collects 3 `sampleWorkUrls` strings stuffed into a comma-separated `portfolio_link` field. Most artists don't have publicly-accessible URLs to paste; the typical artist has phone photos. /apply hero says "We review every application personally" but admins have no actual images to review.

**Where:** `src/components/ApplicationForm.tsx:132-139`.

**Confidence:** medium-high.

**Plan A–G?** No.

**Suggested fix:** Add a 3-image file upload (`<input type=file accept="image/*" multiple />`) with Supabase Storage backing; render the thumbnails in the admin application detail next to "Sample work".

---

### G2-48: Signup duplicate-email handling is generic Supabase error, not a "Sign in instead" affordance

**Symptom:** Both `/signup/artist` and `/signup/customer` show whatever Supabase returns ("User already registered"). There's no detection-and-redirect to /login, no "did you mean to sign in?" affordance, and no terms checkbox — terms acceptance is fired off via fetch with no UI confirmation, which is legally fragile (no auditable user gesture).

**Where:** `src/app/(pages)/signup/artist/page.tsx:76-80, 82-91`.

**Confidence:** high.

**Plan A–G?** No (Plan A Phase 1 hardens role tampering; doesn't touch duplicate-email UX or the gesture).

**Suggested fix:** Detect "User already registered" → render an inline "This email is in use. [Sign in](/login?next=/apply)". Add an explicit `<input type="checkbox" required>` "I agree to the Terms and Privacy Policy" tied to form submit so the gesture is auditable.

---

### G2-49: Browse page filter state not in URL — share link loses everything

**Symptom:** `/browse` reads only `?view=` and writes only `?view=` via `router.replace`. The 12+ active filters (themes, sizes, mediums, arrangements, price band, location, distance, sort) live only in client state. Sharing a deeply-filtered link is impossible; pressing Back resets everything; bookmarks don't capture filter state.

**Where:** `src/app/(pages)/browse/page.tsx:213-258` (only view= is read/written).

**Confidence:** high.

**Plan A–G?** No (Plan G Task 10 covers sidebar scroll-chain only; Plan F Task 4 syncs the `?q=` SearchBar; this covers the rest).

**Suggested fix:** Serialise the `Filters` state to query params on every change (debounced) using `router.replace`, and hydrate `useState<Filters>` from `searchParams` on mount.

---

### G2-50: /blog hero (and one /signup hero) still hard-code Unsplash URLs that Plan G Task 13's grep won't catch

**Symptom:** /blog hero is `images.unsplash.com/photo-1471107340929-...` inline-styled `background-image` (no `<Image>`, no priority hint, no responsive size). /signup uses `<Image priority>` but the src is also a hard-coded Unsplash URL. If Unsplash rate-limits or rotates the URL, both pages render with no hero. Page background-image style means LCP can't optimise it. Plan G Task 13's grep `images.unsplash.com` will catch the /signup case but the inline style on /blog needs a manual sweep.

**Where:** `src/app/(pages)/blog/page.tsx:15-17`; `src/app/(pages)/signup/page.tsx:60-66`.

**Confidence:** medium-high.

**Plan A–G?** Plan G Task 13 plans an asset swap; this finding is the missed-coverage callout for /blog.

**Suggested fix:** Add /blog to Plan G Task 13's grep sweep target list; convert the inline `style={{backgroundImage}}` to a real `<Image fill />` so LCP works.

---

### G2-51: /spaces-looking-for-art has no filters (medium / location / size / arrangement)

**Symptom:** Direct comparison: /browse has a 12-item filter sidebar; /spaces-looking-for-art has none. A venue / artist scanning the demand list can't narrow by location, wall size, or arrangement type. The "0 venues" empty state also has no clear next-step CTA.

**Where:** `src/app/(pages)/spaces-looking-for-art/page.tsx`.

**Confidence:** high. Verified via dev server.

**Plan A–G?** No.

**Suggested fix:** Reuse the BrowseFilters component (or the `<SearchBar>` + a small filter set) on this page; show an EmptyState when the filtered list is zero, mirroring Plan D Task 5.

---

### G2-52: Browse price slider says "£1000+" but is hard-capped at £1000

**Symptom:** Browse filter renders "PRICE: £0 – £1000+" but the max-side `<input type="range">` has `max="1000"`. There is no way to set the range above £1000; the "+" suffix is misleading. Original works in the £1k–£10k range exist on the platform.

**Where:** `src/app/(pages)/browse/page.tsx` (price slider markup).

**Confidence:** high. Verified via DOM inspection.

**Plan A–G?** No.

**Suggested fix:** Either drop the "+", or extend `max` to a credible upper bound (£5000 / £10000) with logarithmic stepping; treat any value at max as "and above" in the filter logic.

---

### G2-53: /browse range sliders have no `aria-label` or visible label association

**Symptom:** Both Min and Max range sliders return `null` from `getAttribute('aria-label')`. The visible "Min" / "Max" `<LabelText>` siblings exist but aren't connected via `htmlFor`/`id`, so screen readers read them as just "slider, 0".

**Where:** `src/app/(pages)/browse/page.tsx` (price slider block).

**Confidence:** high.

**Plan A–G?** No (Plan E Task 8 adds aria-labels to icon-only buttons; sliders weren't in scope).

**Suggested fix:** Add `aria-label="Minimum price"` and `aria-label="Maximum price"` (or wire the existing `<label htmlFor>` correctly).

---

### G2-54: /pricing Monthly/Annual toggle is a button without `role="tab"`/`aria-pressed`

**Symptom:** "Monthly" and "Annual" pricing toggle controls are bare `<button>`s — no `role="tab"`, no `aria-pressed`, no `aria-selected`. Screen readers read them as plain buttons; switching costs the user the announcement that the price column re-rendered.

**Where:** `src/app/(pages)/pricing/page.tsx` (Monthly/Annual block).

**Confidence:** high.

**Plan A–G?** No.

**Suggested fix:** Wrap in a `<div role="tablist">` with two `<button role="tab" aria-selected={...}>`, OR keep buttons but add `aria-pressed={isAnnual}` to each.

---

## Self-review

**Coverage check vs the user's original list of 11 items:** all 11 are already in Plan G (Tasks 1–17). Plan G2 contains zero items from that list and is purely additional findings.

**Coverage check vs Plans A–F merged + Plans E/F/G unmerged:** every finding above carries a "Plan A–G?" line. None duplicate an existing task. Several explicitly call out partial-coverage cases (e.g. G2-22 calls out the alert() callers Plan F Task 21's ToastContext widening doesn't migrate; G2-50 augments Plan G Task 13's grep target list with /blog).

**Severity grouping (rough):**
- **Severity 1 (likely-broken-in-prod):** G2-14 (checkout 400), G2-15 (stale price → Stripe), G2-16 (statuses outside the tracker's whitelist), G2-23 (delete-account dead button), G2-28 (settings save lies), G2-30 (settings save lies on venue side), G2-41 (admin reviewed_at never written).
- **Severity 2 (cross-page logic gaps):** G2-1, G2-2, G2-3, G2-4, G2-5, G2-7, G2-8, G2-9, G2-29, G2-49.
- **Severity 3 (UX polish / a11y):** G2-10, G2-11, G2-12, G2-13, G2-17, G2-18, G2-19, G2-20, G2-21, G2-22, G2-24, G2-25, G2-26, G2-27, G2-31, G2-32, G2-33, G2-34, G2-35, G2-36, G2-37, G2-38, G2-39, G2-40, G2-42, G2-43, G2-44, G2-45, G2-46, G2-47, G2-48, G2-50, G2-51, G2-52, G2-53, G2-54.

**Risk notes:**
- G2-15 (cart re-validation) is the highest-blast-radius finding — without it a Stripe charge can be made for the wrong amount.
- G2-7 (label inconsistency) is a *vocabulary* fix that touches five files; trivial code, but the canonical labels need a product call (paid_loan vs revenue_share vs purchase) before doing the rename.
- G2-15, G2-20, G2-43, G2-44 each introduce small new endpoints / surfaces; estimate one task each.
- The 16 alert() call-sites (G2-22) are mechanical but should be batched by portal so the diff stays reviewable.

**What's NOT in Plan G2 even though it might look like it should be:**
- Mobile layout fixes — those are Plan E.
- Image fallback / skeleton / SearchBar component — those are Plan F.
- Mobile wall *visualizer* touch — that's Plan G Task 14.
- Carrier link on order tracker — Plan D Task 9.
- Per-artist fulfilment time — Plan D Task 10.
- Empty-state CTAs across portal lists — Plan D Task 5 + Task 18 (showroom).
- /venues marketing landing — Plan D Task 17.
- Curated visual upgrade — Plan G Task 12 (gated on a brief).
- Wall-delete confirm dialog keyboard — Plan E Task 12.

**Execution suggestion:**
- Ship the Severity-1 items (G2-14, G2-15, G2-16, G2-23, G2-28, G2-30, G2-41) as a tight focused PR labelled "Plan G2 — pre-launch correctness".
- Severity-2 IA / consistency items (G2-1 through G2-10) want a product copy review before code; bundle as a docs-and-copy PR.
- Severity-3 polish can be sliced however suits the team.

---

## Execution

Two paths:

1. **Subagent-driven** — Use `superpowers:subagent-driven-development`. Same loop Plans A / D / E / F / G use.
2. **Inline** — Use `superpowers:executing-plans`.

No new env vars. Two small data migrations possible (G2-7 column rename to `paid_loan`, G2-24 `order_number` short id, G2-41 `reviewed_at`/`reviewed_by`). Asset additions if G2-9 og-image is shipped.
