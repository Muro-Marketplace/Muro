# Weekly QA audit, 2026-06-08

First weekly audit. No prior baseline. All findings are NEW. Severity follows the seven-bucket structure used by the original 2026-04-30 report. Persisted on 2026-06-14 as the diff baseline for future weekly audits and as the source list for the full-remediation plan (`website/docs/plans/2026-06-14-full-remediation-plan.md`).

## Summary

| Section | NEW | FIXED | STILL OPEN |
|---|---|---|---|
| 1. Critical blockers | 8 | 0 | 0 |
| 2. Broken or incorrect functionality | 4 | 0 | 0 |
| 3. UX and navigation | 9 | 0 | 0 |
| 4. Role and permission | 3 | 0 | 0 |
| 5. Mobile layout | 8 | 0 | 0 |
| 6. Missing links and incomplete journeys | 3 | 0 | 0 |
| 7. Polish improvements | 4 | 0 | 0 |
| **Total** | **39** | **0** | **0** |

Verification note (2026-06-14): all 8 Section-1 critical blockers were re-checked against current `main` and confirmed real. Finding 1.5 is mis-framed (the refund admin check uses `admin_users` table membership, a different model rather than strictly weaker than email-only); the real teeth there are the inconsistent admin model and finding 4.1.

Product-owner priority rules re-verified this week:
- Counter-your-own-offer is blocked. Server enforces at `src/app/api/placements/route.ts:912-953` and `src/lib/placement-permissions.ts:35-58`.
- Customers do not see venue-only offer actions. POST gate at `src/app/api/offers/route.ts:217-239`.
- Artists cannot make purchase offers. Same gate (`isArtistCountering = !!parentOfferId` at offers/route.ts:228).
- Venue message/request caps: venues need none. Artist caps enforced, but only consistently from `src/lib/outreach-cap.ts` (see 1.6/1.7 for the duplicated inline logic).
- Sign-in flows preserve redirect: partially. `/login` reads `?next=`, but the funnel uses `?next=` and `?redirect=` interchangeably and some call sites drop it (see 3.1-3.5).

---

## 1. Critical blockers

### 1.1 PostgREST `.or()` injection via unsanitised email, `/api/refunds`
- File: `src/app/api/refunds/route.ts:57`
- `.or(\`requester_user_id.eq.${userId},requester_email.eq.${email}\`)`. The orders endpoint sanitises with `/^[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+$/` (`src/app/api/orders/route.ts:37`); this branch does not.
- Fix: sanitise `email` with the same regex, or build the `.or()` from a validated terms array.

### 1.2 PostgREST `.or()` injection via unsanitised email, `/api/dashboard`
- File: `src/app/api/dashboard/route.ts:117`
- `db.from("orders").select("*").or(\`venue_slug.eq.${slug},buyer_email.eq.${auth.user!.email}\`)`. Email straight from the session, no normalisation.
- Fix: mirror the orders route; only push `buyer_email.eq` when sanitised non-empty.

### 1.3 PostgREST `.or()` injection via venue name, `/api/analytics/venue`
- File: `src/app/api/analytics/venue/route.ts:60`
- `.or(\`venue_user_id.eq.${profile.user_id},venue_name.eq.${profile.name}\`)`. `venue_profiles.name` is validated only with `safeString(100)` (`src/lib/validations.ts`), which allows commas, parens, quotes. Venue-controlled input; a crafted name could expose other venues' QR events. Highest exploitability of the three.
- Fix: strip comma/quote/paren before interpolation, or two `.eq()` queries unioned in JS.

### 1.4 Admin allowlist accepted without metadata cross-check, dispute messages
- File: `src/app/api/messages/route.ts:70-83`
- Admin gate compares email against `ADMIN_EMAILS` only; the standard helper (`src/lib/admin-auth.ts`) also requires `user_metadata.user_type === "admin"`.
- Fix: reuse `getAdminUser()` / a boolean variant.

### 1.5 Admin gate weakened, refund processing
- File: `src/app/api/refunds/process/route.ts:60-69`
- Admin check loads the `admin_users` table only. Triggers Stripe refunds + transfer reversals, so financial blast radius.
- Fix: route through the canonical admin gate; audit-log the action.

### 1.6 Outreach cap bypass via placements endpoint
- File: `src/app/api/placements/route.ts:410-438`
- Counts only same-day placements with `requester_user_id = userId`. `checkArtistOutreachCap` (the unified cap) aggregates placements + first-contact messages + artwork-request responses, but is only called from `src/app/api/artwork-requests/[id]/responses/route.ts:101`.
- Fix: call `checkArtistOutreachCap(db, userId, units)`.

### 1.7 Outreach cap bypass via messages endpoint
- File: `src/app/api/messages/route.ts:369-410`
- Counts only same-day NEW conversations; not placements or responses. An artist who sent 2 placement requests can still start 2 DM threads.
- Fix: use `checkArtistOutreachCap`; keep the `cidLocal` dedup.

### 1.8 Missing idempotency on refund processing
- File: `src/app/api/refunds/process/route.ts:13-69`
- Reads `status === "pending"` then mutates then calls Stripe. Concurrent/retry race double-charges the artist's payout.
- Fix: Stripe `Idempotency-Key`; conditional update `.eq("status","pending").select()` and bail if zero rows.

---

## 2. Broken or incorrect functionality

### 2.1 Customer portal never displays refund-request history
- File: `src/app/(pages)/customer-portal/page.tsx:103`
- Reads `data.requests`, but the API returns `{ refundRequests: [...] }` (`src/app/api/refunds/route.ts:67-70`). Badge at line 263 never shows.
- Fix: `if (data.refundRequests) setRefundRequests(data.refundRequests);`

### 2.2 Stripe transfer execution fired without await
- File: `src/app/api/orders/route.ts:261`
- `executeTransfer(t.id).catch(...)` not awaited. Order returns 200 "delivered + paid" even if the transfer rejects; no retry queue for mid-flight failures.
- Fix: await + surface failure, or persist `transfer_status = "pending_retry"` for the cron.

### 2.3 Framed pricing silently falls back to client-supplied price
- File: `src/app/api/checkout/route.ts:220-239`
- For a `"base + frame"` size label with a missing base tier, the code warns and reuses the client price. A tampered cart gets any discount.
- Fix: return `409 { error: "size_label_unresolvable" }`.

### 2.4 Portal sidebar height calc fights mobile chrome
- Files: `src/components/ArtistPortalLayout.tsx:188`, `src/components/VenuePortalLayout.tsx:186`
- `sticky top-14 lg:top-16 self-start h-[calc(100vh-3.5rem)]`. iOS Safari viewport shrink causes nested scroll; tapping a nav item bounces the page.
- Fix: `h-[100dvh]` with `top-0 lg:top-16`, inner `nav` `overflow-y-auto`.

---

## 3. UX and navigation issues

### 3.1 `?redirect=` is dead on /login
- File: `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx:665`
- Pushes `/login?redirect=...`, but `LoginPage` (`login/page.tsx:48`) reads `?next=` only. User lands on the default portal, not the artwork.
- Fix: rename to `?next=`; add a back-compat shim in LoginPage reading `?redirect=`.

### 3.2 `/signup` discards `?next=` on role selection
- File: `src/app/(pages)/signup/page.tsx:24, 41, 56`
- Role cards have static hrefs; call sites pass `?next=` but the role page never forwards it.
- Fix: append `?next=${enc}` to each `opt.href` when present.

### 3.3 `/signup/customer` hardcodes `next=/browse`
- File: `src/app/(pages)/signup/customer/page.tsx:64, 180, 205`
- Fix: `safeRedirect(searchParams.get("next"), "/browse")` into both POST bodies and `emailRedirectTo`.

### 3.4 `/signup/artist` hardcodes `next=/apply`
- File: `src/app/(pages)/signup/artist/page.tsx:92, 221, 250, 300`
- Fix: `safeRedirect(searchParams.get("next"), "/apply")`.

### 3.5 `/signup/venue` hardcodes `next=/venue-portal`
- File: `src/app/(pages)/signup/venue/page.tsx:171`
- Fix: `safeRedirect(searchParams.get("next"), "/venue-portal")`.

### 3.6 Two footer links collide on a single URL
- File: `src/components/Footer.tsx:10, 12`
- "Venue Demand" and "Browse Venues" both go to `/spaces`.
- Fix: repoint "Browse Venues" → `/venues` or drop it.

### 3.7 PayoutExplainerModal has no X close button
- File: `src/components/PayoutExplainerModal.tsx:74-150`
- Fix: add an absolutely-positioned close button + Escape handler.

### 3.8 MakeOfferModal success state has no close affordance
- File: `src/components/offers/MakeOfferModal.tsx:144-163`
- Fix: render the close affordance outside the success conditional, or a "Done" button.

### 3.9 Checkout fields use placeholders as labels (WCAG 1.3.1)
- File: `src/app/(pages)/checkout/page.tsx:514-532` (renderInput) + call sites 605, 631, 639, 647
- Fix: add a `label` param; render `<label htmlFor>` + `id`.

---

## 4. Role and permission issues

### 4.1 Refund process does not distinguish requester identity
- File: `src/app/api/refunds/process/route.ts:58-69`
- An artist can approve their own refund-request rows; gate only checks `isArtist || isAdmin`.
- Fix: artist approval only for buyer-initiated requests; artist-initiated → admin only (`if (isArtist && refundReq.requester_type === "artist") return 403`).

### 4.2 Dispute admin view lacks audit log entry consistency
- File: `src/app/api/messages/route.ts:97-103`
- Audit log written AFTER the message fetch; a crash between fetch and write loses the record.
- Fix: write the audit log before returning; 500 if the audit write throws.

### 4.3 Artist-counter detection relies on `parentOfferId` only
- File: `src/app/api/offers/route.ts:226-239`
- `isArtistCountering = !!parentOfferId` lets a caller attach any parent id. Ownership check catches it but with a confusing error; a customer on a stale thread can keep countering.
- Fix: explicit "is caller venue or artist?" gate first; only then apply venue-only / counter-only branches.

---

## 5. Mobile layout issues

### 5.1 Pricing table forces horizontal scroll — `src/app/(pages)/pricing/page.tsx:170` — `min-w-[560px]`. Fix: `sm:min-w-[560px]` or stacked cards.
### 5.2 Cookies table forces horizontal scroll — `src/app/(pages)/cookies/page.tsx:119` — `min-w-[640px]`. Fix: stacked cards < sm.
### 5.3 Artist portfolio price inputs overflow — `src/app/(pages)/artist-portal/portfolio/page.tsx:2470, 2501, 2547, 2564` — `w-[90px]` x4. Fix: `w-16 sm:w-[90px]`.
### 5.4 Analytics charts mandate 400px — `src/app/(pages)/artist-portal/analytics/page.tsx:540, 680` — `min-w-[400px]`. Fix: `min-w-[300px] sm:min-w-[400px]`.
### 5.5 Placement action buttons wrap — `src/app/(pages)/artist-portal/placements/page.tsx:1841, 1848, 1856` — `min-w-[140px]` x3. Fix: `min-w-[100px] sm:min-w-[140px]` or stack.
### 5.6 Curated CTA buttons too wide — `src/app/(pages)/curated/CuratedClient.tsx:311, 317` — `min-w-[220px]` x2. Fix: `w-full sm:w-auto sm:min-w-[220px]`.
### 5.7 Message inbox buttons below 44px — `src/components/MessageInbox.tsx:1362, 1372` — `px-3 py-1.5 text-xs`. Fix: `px-4 py-2.5 text-sm`.
### 5.8 Date-picker day buttons below tap target — `src/components/DatePicker.tsx:128` — `w-8 h-8`. Fix: `w-11 h-11`.

---

## 6. Missing links and incomplete journeys

### 6.1 Customer portal lacks refund history surface — `src/app/(pages)/customer-portal/page.tsx:103, 263`. See 2.1.
### 6.2 Galleries route is a silent redirect — `src/app/(pages)/galleries/page.tsx:1-5` — `redirect("/browse?view=gallery")`. Fix: render a 200 page or remove from sitemap.
### 6.3 Checkout confirmation lacks a "what next" loop — `src/app/(pages)/checkout/confirmation/page.tsx:236-251`. Fix: add a related-artists / recently-viewed strip.

---

## 7. Polish improvements

### 7.1 Submit button copy ambiguous during Stripe redirect — `src/app/(pages)/checkout/page.tsx:809-811` — "Redirecting to Stripe...". Fix: "Processing payment, do not refresh" or split states.
### 7.2 Confirmation hero image uses `alt=""` without `aria-hidden` — `src/app/(pages)/checkout/confirmation/page.tsx:21`. Fix: `alt="" aria-hidden="true"`.
### 7.3 Order status email fired without await — `src/app/api/orders/route.ts:245` — `notifyBuyerStatusUpdate(...).catch(...)`. Fix: await, or enqueue via Inngest.
### 7.4 "Discover Art" vs "Continue Browsing" mixed terminology — `src/app/(pages)/checkout/page.tsx:493`, `confirmation/page.tsx:236-251`. Fix: pick one ("Continue browsing").

---

## Diff vs. baseline

No prior audit on file. Diff empty by construction. From the next audit onwards, compute NEW / FIXED / STILL OPEN against this report (see the optional `scripts/audit/weekly-diff.ts` in Phase 6 of the remediation plan).
