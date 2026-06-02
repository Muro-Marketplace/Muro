# 44-Bug Cleanup — Status

Bug source: `/tmp/wallplace-bug-hunt-2026-05-27T20-56-55Z.md`. Update this file as each bug is closed (tick the box and add the PR number).

## Run summary (2026-06-02)

**38 of 44 closed.** Application fixes are on branch `claude/qa-44-app-fixes` (all pass `npm run check`). Database fixes (RLS, storage, functions, view, indexes) were applied to the live Wallplace project `uwkuhygwvasdzwsusiym` via the Supabase MCP and verified against the security + performance advisors; the SQL is captured in `website/supabase/migrations/070_qa44_db_hardening.sql`.

The 6 not closed:
- **DEFERRED (4)** — Bug 6 (nav, design decision), Bug 15 (cart scoping, purchase-path change unsafe without runtime testing), Bug 20 (browse URL filter sync, replace-loop risk in a 2700-line client page), Bug 42 (104 unused indexes — each needs EXPLAIN verification before dropping; stats can be incomplete).
- **MANUAL (2)** — Bug 21 (Stripe public business name) and Bug 37 (leaked-password protection) are Supabase/Stripe dashboard toggles, no code.

Residual follow-up (not in the 44): `venue_profiles`, `artist_profiles`, `artist_works`, `artist_collections` keep a `USING (true)` SELECT policy, so a direct client query can read all rows. The API layer redacts PII (bugs 1/27), but a defence-in-depth DB restriction (a `venue_public` view + column limits) is worth a future pass. Also: 7 public-form tables (contact/enquiry/waitlist/newsletter/venue_registrations/artist_applications/terms_acceptances) keep anon-insert `WITH CHECK (true)` by design (rate-limit, not RLS, is the right control).

## Critical (7)

- [x] Bug 1 — /api/venues/demand paywall leak — Phase A (route redacts venue identity for non-entitled; /spaces sends auth token)
- [x] Bug 2 — /api/artwork-requests UUID leak — Phase A (browse list strips venue_user_id/invited_artist_slugs/budgets for anon)
- [x] Bug 27 — /api/venues/:slug postcode leak — Phase A (postcode redacted unless owner/subscriber; internal user_id never returned)
- [x] Bug 28 — orders SELECT USING (true) — Phase A (dropped "Users can read their orders"; narrow buyer/artist/venue + email policies remain)
- [x] Bug 29 — orders three INSERT (true) policies — Phase A (dropped; orders are created by the service role)
- [x] Bug 30 — placements INSERT (true) — Phase A (replaced two permissive policies with placements_insert_party)
- [x] Bug 31 — messages sender_id impersonation — Phase A (replaced with messages_insert_self: sender_id = auth.uid())
- [x] Bug 32 — message-attachments bucket listing — Phase B (dropped the broad SELECT listing policy)

## High (16)

- [x] Bug 3 — /pricing Annual toggle dead — Phase G (already correct: ArtistPricingCards toggle drives isAnnual -> price)
- [x] Bug 5 — Quick-view size dropdown empty labels — Phase G (uses formatSizeLabelForDisplay)
- [x] Bug 8 — Checkout error misleading for sellers without payouts — Phase C (already fixed: checkout 422 via canArtistAcceptOrders)
- [x] Bug 9 — Detail-page BUY NOW adds duplicate "undefined" cart line — Phase C (addItem normalises blank size; jsdom test)
- [x] Bug 10 — Detail-page shipping cost mismatch with checkout — Phase C (already fixed: shared calculateOrderShipping)
- [x] Bug 11 — Artist dashboard "Choose a plan" while billing shows Pro — Phase E (banner defers to AuthContext subscriptionStatus)
- [x] Bug 12 — Analytics page contradictions — Phase E (status compared title-case vs lowercase DB values; now case-insensitive)
- [x] Bug 13 — Dashboard placements 0 vs 12 — Phase E (same casing fix; analytics active/pending/completed now count correctly)
- [x] Bug 16 — Admin Gross Sales £0 — Phase E (read orders.total pounds -> pence; amount_cents was never written)
- [x] Bug 33 — Three public buckets listing (artworks/avatars/collections) — Phase B (dropped the broad SELECT listing policies)
- [x] Bug 34 — `email_recent_sends` SECURITY DEFINER view — Phase H (recreated WITH security_invoker)
- [x] Bug 35 — 19 tables with RLS but no policy — Phase A (18 tables are service-role-only by design; documented + suppressed in known-acceptable.json. Adding client policies would bypass API business logic)
- [x] Bug 38 — 63 RLS policies using auth.uid() directly — Phase H (wrapped auth.uid/role/jwt in scalar subqueries; 0 unwrapped left)
- [x] Bug 39 — 62 multiple_permissive_policies — Phase H (consolidated all 7 groups behaviour-preservingly; 0 multi-permissive groups left)
- [x] Bug 43 — Customer can't buy in-store version — Phase D (already fixed: collect-from-venue flow)

## Medium (15)

- [x] Bug 4 — Garbage "teest" blog live — Phase G (publish guard title>=5/body>=200; MANUAL: delete the live "teest" row)
- [ ] Bug 6 — Nav inconsistency Marketplace vs Galleries/Portfolios — Phase G — DEFERRED: 4 intentional role/context nav sets; unifying is a design decision
- [x] Bug 7 — Request Placement CTA breaks for guests — Phase G (non-venue viewers get a "Register your venue" CTA)
- [x] Bug 14 — Artwork-request budget min > max accepted — Phase F (already fixed: POST superRefine + client form validation)
- [ ] Bug 15 — Cart leaks across sessions/roles — Phase C — DEFERRED: needs per-user cart key + auth-change handling; purchase-path change unsafe without runtime testing
- [x] Bug 17 — Admin Financials MRR math mismatch — Phase E (MRR price defaults corrected to £9.99/24.99/49.99; were 3x too high)
- [x] Bug 19 — Featured works missing from blog API — Phase F (already fixed: blog detail renders a featured-works strip)
- [ ] Bug 20 — /browse filters not bidirectional with URL — Phase F — DEFERRED: the filters object is useState-only; URL sync needs router.replace effects in a 2700-line client page (replace-loop risk)
- [ ] Bug 21 — Stripe Checkout says "Wallspace sandbox" — Phase C — MANUAL: Stripe dashboard (Public business name + statement descriptor)
- [x] Bug 24 — Admin "Registered Artists 14" vs public 46 — Phase E (relabelled "Registered Artists (DB)" + added a "Listed (marketplace)" tile = getAllArtists count)
- [x] Bug 26 — Mobile work-card titles truncated to 6 chars — Phase D (truncate -> line-clamp-2)
- [x] Bug 36 — 7 functions with mutable search_path — Phase H (search_path locked on all 7)
- [ ] Bug 37 — Leaked-password protection off — Phase H — MANUAL: Supabase dashboard (Auth > enable leaked-password protection)
- [x] Bug 40 — 22 unindexed foreign keys — Phase H (added 22 covering indexes)
- [x] Bug 44 — /how-it-works banner image suppressed — Phase G (banner opacity 20 -> 50, gradient softened)

## Low (6)

- [x] Bug 18 — Admin pages have wrong `<title>` — Phase G (admin group + 9 subroute server layouts)
- [x] Bug 22 — /curated "not forit" typo — Phase G (not present in src/; already fixed)
- [x] Bug 23 — "BUNDLE PRICE: £0 AND £2000+" typo — Phase G ("£0 to £2000+")
- [x] Bug 25 — My Offers "to Finlay Coles" ambiguous — Phase G (shows the @handle)
- [x] Bug 41 — 3 duplicate indexes on analytics_events — Phase H (dropped 11 redundant duplicate indexes total)
- [ ] Bug 42 — 63 unused indexes — Phase H — DEFERRED: 104 unused indexes; each needs EXPLAIN verification before dropping (stats can be incomplete on prod)
