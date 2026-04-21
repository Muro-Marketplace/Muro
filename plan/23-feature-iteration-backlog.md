# 23. Feature Iteration Backlog

## Post-MVP Website Fixes & Feature Requests

This section captures the next batch of feature requests layered on top of the shipped site. Items are grouped by whether they are bug-level fixes, UX improvements, or net-new features, and then ordered into delivery phases.

The **multi-upload per artwork** item is being worked on separately and is excluded from this plan.

One additional item was partially visible on source screenshots ("Add frame option on artwork…") — **excluded pending confirmation**.

---

## A. Request inventory with current-state mapping

| # | Request | Current state | Scope |
|---|---------|--------------|-------|
| 1 | Fullscreen view for artwork images (mobile + web) | **Partial** — a lightbox exists in `src/app/(pages)/browse/[slug]/ArtistProfileClient.tsx` but images still render too small. Needs an explicit fullscreen button on gallery images and on the artwork detail pages, on both mobile and desktop | Small-Medium |
| 2 | Recent activity notifications link to target item | **Partial** — `src/components/Header.tsx` has a notifications dropdown aggregating from placements/messages queries, but entries are not clickable to the source item. No `notifications` table exists | Small |
| 3 | Venue portal completion indicator | **Built but broken** — 5-step checklist renders in `src/app/(pages)/venue-portal/page.tsx`, but "Complete your venue profile" stays unticked even after the profile is completed. Detection logic bug | Small |
| 4 | Replace "Browse Site" with "Settings" in venue portal nav | **Confirmed location** — "Browse Site" sits below the divider in the venue portal sidebar (above "Logout"). Remove it and move "Settings" into that bottom slot | Small |
| 5 | Show per-line unit count in basket | **Partial** — `quantity` is tracked in `src/context/CartContext.tsx` but the basket UI doesn't surface "× 2" (etc.) on the line when the same artwork is added multiple times | Small |
| 18 | "Request a placement" button in lightbox: cream colour | **Not built** — button exists (ArtistProfileClient / ArtworkPageClient) but currently not cream | XS |
| 19 | Request placement form: QR-display vs Paid-loan-no-QR toggle, with conditional monthly fee | **Not built** — form currently captures revenue share only. Need a tickbox "QR code display" (default on) vs "Paid loan no QR"; when the no-QR option is chosen, reveal an optional "Monthly fee for artist (£)" input. Likely lives in the artist-portal placements create form and/or PlacementCTA flow | Small |
| 20 | Rename "Micro" label to "QR Only" in QR label sheet | **Not built** — `src/components/labels/QRLabel.tsx:4` currently defines `{ key: "micro", label: "Micro", ... }`. Rename the display label (and optionally the key) | XS |
| 21 | Notification bell count loads proactively on mount + polls | **Partial** — `src/components/Header.tsx` already polls unread *messages* via `fetchUnread()` every 60s, but the notification dropdown count is derived from state that is only populated when the dropdown opens. Need an unread-notifications count fetched on mount + polled (mirror the messages pattern) | Small |
| 22 | Venue portal Recent Activity section (mirror artist portal) | **Not built** — `src/app/(pages)/artist-portal/page.tsx` has a full "Recent Activity" panel (types: placement, enquiry, message, sale, view) driven off dashboard data. The venue portal dashboard (`src/app/(pages)/venue-portal/page.tsx`) shows stats + onboarding but no activity feed. Mirror the same component/logic adapted to venue-side events | Small-Medium |
| 23 | Accept/reject placement from artist portal (+ error feedback) | **Broken** — artist cannot respond to venue-initiated placement requests. `src/app/(pages)/artist-portal/placements/page.tsx:536-554` renders "Awaiting response" for Pending rows with no Accept/Decline buttons. API (`src/app/api/placements/route.ts` PATCH) also hard-codes only venue can accept, which blocks the artist path even if the UI were added. No user-facing feedback when PATCH fails — button silently does nothing | Small-Medium |
| 24 | Auto-message from placement request continues existing chat | **Broken** — `deterministicConversationId()` in `src/app/api/placements/route.ts` creates a `placement-{a}__{b}` conversation, separate from any existing chat with the same artist. Should look up an existing conversation between the two parties first, fall back to the deterministic id only if none exists | Small |
| 25 | Accept/reject controls inside the messages UI | **Not built** — placement-request messages should carry the placement id + render Accept/Decline buttons inline in the messages view (same behaviour as the placement section). Needs a `message_type` tag on the auto-message row and UI rendering in `MessageInbox.tsx` | Small-Medium |
| 26 | Venue placement card: show £ earned, not "% of sales" | **Wrong label** — `src/app/(pages)/venue-portal/placements/page.tsx:515-516` shows "Your Revenue Share: 20% of sales". Should show the actual £ received for this placement (sum of `orders.venue_revenue` where `orders.placement_id = placement.id`). Keep the % elsewhere on the card — this field should be the realised earnings | Small |
| 27 | Frame options on artworks | **Not built** — artists can't offer framed variants. Add `frame_options JSONB` to `artist_works` (array of `{label, priceUplift}`). Edit form to add/remove options. Artwork detail + lightbox surface a frame selector; the selected uplift adds to the purchase total and flows through to the cart/checkout | Small-Medium |
| 6 | Artwork with multiple available units + artist-settable quantity | **Partial** — `artist_works.available` is a boolean only; no `quantity` column. No UI | Small-Medium |
| 7 | Sort by distance | **Partial** — `lat`/`lng` stored on `artist_profiles` (`supabase-coordinates-migration.sql`); no sort UI, no distance calc | Medium |
| 8 | Dropdown nav on marketplace + portfolio gallery collections | **Partial** — `collections.ts` data exists, generic dropdown patterns exist in Header; no sub-dropdowns on marketplace nav | Small-Medium |
| 9 | Block self-acceptance of placement | **Not built** — `PATCH /api/placements` has no self-accept guard (`src/app/api/placements/route.ts:175–256`) | Small |
| 10 | Allow clearing the default 0 in revenue share field on create placement | **Not built** — `revenuePercent` state defaults to 10 in `artist-portal/placements/page.tsx:79`; likely the UX issue is `<input type="number" value={0}>` which cannot be cleared cleanly | Small |
| 11 | Auto in-app message on placement request | **Partial** — email notification fires via `notifyPlacementRequest()`; no `messages` row inserted | Small |
| 12 | Auto in-app notification on placement request | **Partial** — email only; no notifications table persistence | Small (depends on #2) |
| 13 | Clearer, more seamless placement-to-art-on-wall flow | **Partial** — status values exist but no progression UI | Medium |
| 14 | Tick boxes / progress states for end-to-end placement lifecycle | **Not built** — no timeline component, no intermediate statuses | Medium |
| 15 | Quick Look modal | **Already built** — per user note (lightbox) | No work |
| 16 | Dedicated full-page view for placements | **Not built** — no `/placements/[id]` route | Large |
| 17 | Loan / consignment record linked to placement | **Not built** — no table, no fields | Large |

**Items needing no work: #15** (Quick Look — per user). All others need at least a fix or a build.

---

## B. Technical dependencies

Several items chain together. Resolving the chain matters for sequencing:

1. **Notifications table (new)** → unblocks #2, #12, partially #14. Today notifications are derived on-the-fly; persistent storage is needed for clickable routing and for richer notification kinds.
2. **Placement status model (expanded)** → unblocks #13, #14, #16. Current `status` is a single enum (`pending`, `active`, `declined`, `completed`). Needs sub-states (e.g. `accepted`, `scheduled`, `installed`, `live`, `collected`) or a separate `placement_events` log.
3. **Placement detail page (new route)** → unblocks #16 and is the logical home for #17. Loan/consignment should not live on the card.
4. **Loan/consignment table (new)** → depends on #16 existing as the place to manage the record.

Everything else is independent.

---

## C. Work items (P0 = launch-critical parity, P1 = high-value next, P2 = later)

| # | Title | Priority | Effort | Depends on | Deliverable |
|---|-------|----------|--------|-----------|-------------|
| F1 | Self-accept guard on placements PATCH | P0 | S | — | Reject PATCH when `placement.requester_user_id === session.user.id`. Unit test. |
| F2 | Fix revenue share input (allow empty) | P0 | S | — | `<input type="number">` accepts empty, blurs to 0 or required-validation on submit |
| F3 | Venue portal nav: remove "Browse Site", move "Settings" down | P0 | S | — | Sidebar in `src/app/(pages)/venue-portal/layout.tsx` (or equivalent) — drop Browse Site link; move Settings to the bottom slot above Logout |
| F4 | Debug venue profile completion detection | P0 | S | — | Find the predicate in `venue-portal/page.tsx` checklist that flags profile-complete; align with the fields actually saved by the profile form so it ticks after save |
| F5 | Per-line quantity display in basket | P0 | S | — | Basket/cart render shows "× N" next to each line when `quantity > 1`; also update line total |
| F6 | Fullscreen artwork viewer | P0 | S-M | — | Add a visible fullscreen toggle (corner icon) on artwork images in gallery grids and on artwork detail pages; uses Fullscreen API or a max-viewport overlay; works on mobile + web |
| F17 | Lightbox "Request a placement" button → cream | P0 | XS | — | Swap button colour class to cream token in ArtistProfileClient + ArtworkPageClient lightbox instances |
| F18 | Placement form: QR vs Paid-loan-no-QR toggle + monthly fee | P0 | S | Migration 007 | Form toggle built, API carries fields. DB migration `007_notifications_and_placement_flags.sql` adds `qr_enabled BOOLEAN DEFAULT TRUE` and `monthly_fee_gbp NUMERIC` on `placements`. Run the migration to persist; until then the insert silently omits via retry fallback |
| F19 | Rename "Micro" label to "QR Only" | P0 | XS | — | `components/labels/QRLabel.tsx` label string change; search-and-replace any display of "Micro" in LabelPreview/LabelSheet |
| F27 | Frame options on artworks | P1 | M | Migration 010 | New `frame_options JSONB` column, typed `[{label, priceUplift}]`. Artist portfolio form section with add/remove rows. Detail page + lightbox: selector shown only when options exist; selected frame appended to the cart item size label and its uplift added to price |
| F20 | Notification bell loads count on mount + polls | P0 | S | F8 persistent notifications | New `GET /api/notifications/unread-count` (or extend existing endpoint to return count cheaply). Header mounts a poller identical to messages' `fetchUnread`. Show badge count from the polled value, not from dropdown state |
| F21 | Venue portal Recent Activity panel | P0 | S-M | F8 persistent notifications (optional data source) | Add an activity section to `venue-portal/page.tsx` matching `artist-portal/page.tsx:327+` layout. Venue-side event types: placement request sent, placement accepted/declined, message, order placed, QR scan. Source from `/api/dashboard` + `/api/notifications` |
| F22 | Accept/reject placement from either portal + error feedback | P0 | M | Migration 008 | Add `requester_user_id UUID` column to `placements`. POST sets it to `auth.user.id`. PATCH allows the non-requester party to transition pending → active/declined (falls back to "venue accepts" if requester_user_id is NULL for legacy rows). Add Accept/Decline buttons to artist-portal placements table. Show a visible error (toast or inline) when the PATCH returns non-OK |
| F7 | Auto in-app message on placement request | P1 | S | Existing `messages` table | Insert message row in `POST /api/placements` after email fires |
| F8 | Notifications table + routing | P1 | M | — | New `notifications` table (id, user_id, kind, title, body, link, read_at, created_at); migration; API routes; Header dropdown rewired to persistent source |
| F9 | Auto notification on placement request | P1 | S | F8 | Insert notification row on placement request |
| F10 | Artwork quantity column + UI | P1 | M | — | Add `quantity_available` INTEGER to `artist_works`; edit form; badge on artwork card & in Quick Look; decrement on order webhook |
| F11 | Marketplace nav dropdowns | P1 | S-M | — | Hover/click-open dropdowns for Marketplace and Collections in Header |
| F12 | Distance sort on browse | P1 | M | Venue or user origin coord source | Haversine calc in query; sort dropdown UI on `/browse` |
| F13 | Placement progress model (schema) | P1 | M | — | Add sub-status columns (`accepted_at`, `scheduled_for`, `installed_at`, `live_from`, `collected_at`) OR `placement_events` log |
| F14 | Placement progress UI (timeline / ticks) | P1 | M | F13 | Stepper component on placement card + portal list |
| F15 | Placement detail page | P2 | L | F13 | New route `/placements/[id]`; server-rendered with RLS; links to venue + artwork + (later) loan record; photo uploads; notes + dates |
| F16 | Loan/consignment table + form on detail page | P2 | L | F15 | New `placement_records` table with ~25 fields listed in section D; CRUD on detail page; attachment upload |

---

## D. Loan/consignment record schema (F13)

Proposed `placement_records` table, referenced 1:1 from `placements.id`:

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| placement_id | UUID FK → placements.id UNIQUE | one record per placement |
| artwork_id | UUID FK → artist_works.id | |
| artist_user_id | UUID FK → auth.users | |
| venue_user_id | UUID FK → auth.users | |
| record_type | ENUM('loan','consignment') | |
| qr_enabled | BOOL | |
| start_date | DATE | |
| review_date | DATE | |
| collection_date | DATE | |
| agreed_value_gbp | NUMERIC | |
| insured_value_gbp | NUMERIC | |
| sale_price_gbp | NUMERIC | nullable |
| venue_share_percent | NUMERIC | |
| platform_commission_percent | NUMERIC | |
| artist_payout_terms | TEXT | |
| monthly_display_fee_gbp | NUMERIC | nullable |
| condition_in | TEXT | |
| condition_out | TEXT | |
| damage_notes | TEXT | |
| location_in_venue | TEXT | |
| piece_count | INT | default 1 |
| delivered_by | TEXT | |
| collection_responsible | TEXT | |
| exclusive_to_venue | BOOL | |
| available_for_sale | BOOL | |
| logistics_notes | TEXT | |
| contract_attachment_url | TEXT | Supabase Storage |
| internal_notes | TEXT | artist-only / venue-only visibility split TBD |
| created_at, updated_at | TIMESTAMPTZ | |

RLS: artist and venue parties to the placement can read; each can write their own columns; service role unrestricted.

---

## E. Phased delivery plan

### Phase 1 — quick wins & bug fixes (1–2 working days)
Small, independent items that harden the current experience.
- **F1** Self-accept guard on placements
- **F2** Revenue share input fix
- **F3** Venue portal nav: drop Browse Site, move Settings down
- **F4** Venue profile completion detection bug
- **F5** Per-line quantity display in basket
- **F6** Fullscreen artwork viewer (gallery + detail page, mobile + web)
- **F17** Lightbox "Request a placement" button → cream
- **F18** Placement form: QR vs Paid-loan-no-QR toggle + optional monthly fee
- **F19** Rename "Micro" label to "QR Only"

### Phase 2 — notifications + placement comms (2–3 days)
Ties notifications into persistence and makes placement requests fire in-app cleanly.
- **F8** Notifications table + API + Header rewire ✅ shipped
- **F7** Auto message on placement request ✅ shipped
- **F9** Auto notification on placement request ✅ shipped

### Phase 2.1 — notifications polish + placement response fix (follow-up, 1–1½ days)
Issues surfaced during Phase 2 testing.
- **F20** Bell badge count should load on mount + poll (currently only populates on dropdown open)
- **F21** Mirror the artist portal "Recent Activity" panel on the venue portal dashboard
- **F22** Accept/reject placement flow: add `requester_user_id` column, allow the non-requester to respond, add Accept/Decline UI to the artist portal placements table, show errors when the PATCH fails

### Phase 3 — marketplace polish (3–4 days)
User-facing browse + product improvements.
- **F10** Artwork quantity ✅ shipped (migration 009)
- **F11** Marketplace nav dropdowns ✅ shipped
- **F12** Distance sort ✅ shipped

### Phase 4 — placement lifecycle (4–5 days)
Makes the placement flow feel coherent end-to-end.
- **F13** Progress model schema ✅ shipped (migration 010: accepted_at, scheduled_for, installed_at, live_from, collected_at)
- **F14** Progress UI (stepper) ✅ shipped (`components/PlacementStepper.tsx` in both portals)
- **F27** Frame options on artworks ✅ shipped (migration 010: frame_options JSONB; selector on detail page + lightbox; uplift flows through cart)

### Phase 5 — dedicated placement experience (1–2 weeks)
The structural change. Treat as one unit because the loan record has no good home without the detail page.
- **F15** Placement detail page ✅ shipped (`/placements/[id]` with full placement view, stepper, messages/notes, photo gallery, record form)
- **F16** Loan/consignment table + CRUD ✅ shipped (migration 011 `placement_records` + `placement_photos`; `PUT /api/placements/[id]/record`; `POST/DELETE /api/placements/[id]/photos`)

### Revenue stream 1 — Curated matching for venues (F38)
Paid concierge offer: venue submits a brief, pays up front, Wallplace hand-curates a shortlist manually and returns it by email. Lets us validate pricing and demand before automating.

- New public page `/curated` with marketing copy + paid enquiry form
- Three tiers: Single wall (£49), Full space (£149), Bespoke (£299 — adjustable per project)
- Stripe Checkout for the curation fee (one-off payment, no subscription)
- Webhook records paid requests into a new `curation_requests` table
- Admin list view at `/admin/curation` to triage, update status, mark shortlist sent
- Email the admin on new paid request + confirmation to the venue
- Entry point from the Marketplace nav dropdown / footer

Kept deliberately manual on the delivery side: no in-platform shortlist builder yet — the admin sends the shortlist by email from their own mailbox. That stays true to the "concierge-first" principle from the original plan.

### Phase 6 — production readiness (blockers before taking real money)
Straight out of the earlier audit. Not user-facing features, but everything below must land before launch.
- **F28** Fix RLS on `refund_requests` (any user can currently approve/modify refunds)
- **F29** Fix RLS on `messages` (SELECT must be scoped to participants)
- **F30** Stripe webhook idempotency: unique index on `orders.stripe_payment_intent_id` + `ON CONFLICT DO NOTHING`
- **F31** Stripe webhook returns 500 (not 200) when DB insert fails so Stripe retries
- **F32** Refund reversal: abort and return 502 if transfer reversal throws instead of still processing buyer refund
- **F33** FK constraints on `orders.artist_user_id` and `refund_requests.order_id`
- **F34** Missing indexes on `orders(artist_user_id)` and `orders(venue_slug)`
- **F35** Remove hardcoded admin email fallback in `src/lib/admin-auth.ts`
- **F36** SEO basics: favicon, robots.ts, sitemap.ts, OG tags in root layout
- **F37** GDPR: authenticated data export (`GET /api/account/export`) and soft-delete (`DELETE /api/account`)

---

## F. Open questions to resolve before build

1. **Frame option on artwork** — partial screenshot text. Confirm scope before inclusion.
2. **F13** — preference for adding sub-status columns to `placements` vs. a normalised `placement_events` log? Events log is richer (keeps history) but heavier to implement.
3. **F16** — for the contract attachment, use Supabase Storage with signed URLs? Existing buckets or new?
4. **F12** — distance from where? Venue's own coords? Browser geolocation with fallback?
5. **F16** — visibility split on `internal_notes` — one column with role-gated reads, or separate `artist_notes` / `venue_notes`?
6. **F6** — fullscreen mechanism: native Fullscreen API (browser-level) or custom max-viewport overlay? Native gives the best mobile experience but behaviour differs across iOS Safari.

---
