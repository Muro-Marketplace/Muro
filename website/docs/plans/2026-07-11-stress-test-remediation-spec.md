# Wallplace Remediation Design Spec

**Date:** 2026-07-11 (updated PM with launch-prep sync)
**Source:** stress test of 2026-07-10/11 — 61 findings (`Bug 1–15` UI, `E1–E15` backend, `E16–E46` full-codebase review).
**Codebase:** `website/` (Next.js, Supabase, Stripe). ~756 files / 136k LOC.

> **Note on the companion findings doc.** The detailed findings file was written to `/tmp` and has since been cleared by the OS. `Bug 1–15` and `E1–E15` are reproduced in `2026-07-11-stress-test-findings.md` alongside this spec; the full bodies of `E16–E46` (file:line + exploit detail) were lost with `/tmp` — their titles are preserved there and the fixes are fully specified below, but if you need the original repro detail for one of those, re-run that audit pass. **Lesson: write these to the repo, not `/tmp`.**

This spec is organised as a small number of **root-cause interventions** (§4) that each kill a whole class of finding, plus per-workstream catalogues (§6) for the residue. §10–§12 fold in the launch-prep queue, owner-owned gates, and GATING_V1 rollout fallout.

---

## 0. Status — 2026-07-11 PM (launch-prep sync)

**Landed on `main` today:** PR **#63** (paid-loan canonical labels), **#64** (paid-loan "Set up payment" reachability), **#65** (`no-raw-arrangement-type` lint raised to error). **GATING_V1** built READY and aliased to `wallplace.co.uk` — subscription gating is live in production.

Deltas to this spec:

| Change | Effect on this spec |
|---|---|
| GATING_V1 live | **E16 resolved** — but it produced rollout fallout, see §12.1 |
| PR #63 | **E13 partially addressed** (paid-loan labels canonical); collapsing the parallel label sources is still open (CC7) |
| PR #65 | CC7's lint gate now exists and is an error — **extend it to statuses** |
| PR #64 | Touches the same surface as **E7**; the orphaned-subscription defect (no webhook branch stamps `stripe_subscription_id`) is unaffected — still open |
| `BLOGS_V1` off | Probable cause of **Bug 12**, with a caveat — see §12.2 |

**Two conflicts between this spec and the launch-prep list are flagged in §11.2 and §12.2. Read those before executing either list.**

---

## 0.5 The mandate (owner, 2026-07-11)

> *"Every transaction route works as it should — each buy now, placement, monthly loan, paid loan, offer must work PERFECTLY. Photo listing perfect. Essential security SECURE. No bugs in transactional workflows. The code is knotted — changes break features that weren't meant to be affected. Unknot it, and remove features/pages we don't need."*

This supersedes the phase ordering in §2 where they conflict. The plan is now organised around **four gates**, in order. Nothing ships to a paying public until Gate 1–3 pass.

| Gate | Definition | Sections |
|---|---|---|
| **G1 — Transaction integrity** | Every transaction route below is correct end-to-end, proven by an automated test | §13 |
| **G2 — Listing integrity** | Photo/artwork listing (upload → publish → appear → edit) never silently loses data | §14 |
| **G3 — Essential security** | The P0/P1 security set is closed and enforced by CI | CC1–CC4, §5 |
| **G4 — Unknot & shrink** | One source of truth per concept; dead/duplicate surface deleted | §15, §16 |

**Why G4 is not optional cleanup:** the "changes break unrelated features" symptom is not bad luck, it is the direct, predictable output of the duplicate-source-of-truth structure catalogued in §15. Every duplicate pair below has *already* produced a finding in this audit. Fixing G1–G3 on top of the knot will keep regressing until G4 lands, so G4 work that touches a G1 path ships **with** it, not after.

---

## 1. Guiding constraints

- **Secure by construction, not by review.** The recurring root cause is that 122 API routes use the service-role client (RLS bypassed) and hand-write authz + persistence, so any omission is a live bug. The fixes below replace "remember to check" with primitives that fail closed if you forget.
- **No behaviour change without a test that would have caught the bug.**
- **Money and PII first.**
- **Prod parity check.** This branch contains fixes not necessarily deployed. Step 0 of every workstream: confirm what production actually runs before "fixing" something already fixed.

---

## 2. Severity model & phased sequencing

| Phase | Theme | Findings | Rationale |
|---|---|---|---|
| **P0 — stop the bleeding** | Verified criticals, small diffs | E44, E19, E31, E39, E24, E25, E6, E7 | One-request privesc, unauthenticated writes, DM/PII reads, trapped/lost money |
| **P1 — authz/IDOR cluster** | Central authz + allowlists | E17, E18, E20–E23, E26–E28, E32–E34, E45, E46 | Same class as P0; land CC1/CC2 then apply everywhere |
| **P2 — auth/session hardening** | Login/OAuth/abuse | E35, E36, E30 | Depends on the role-model decision (§11.2) |
| **P3 — payments integrity** | Transfer ledger + webhook | E8–E11, E37, E38, E40, Bug 9, Bug 10, Bug 11 | Needs CC6; gated on Stripe Connect review (§11.1) |
| **P4 — emails** | Provision + consolidate + wire | E1, E4, E5 + missing sends | Unblocks the known no-email bug |
| **P5 — frontend data-loss** | Save-flow class | Bug 12, Bug 14, E41–E43 | Needs CC8 |
| **P6 — reporting, naming, hygiene** | Numbers, labels, test data | Bug 1–8, 13, 15, E2, E3, E13–E15, E30 | Correctness/UX |
| **P7 — launch gates** | Owner-owned + monitoring | §11 | Runs in parallel; Stripe is the critical path |

---

## 3. Definition of done (every item)

1. Fix implemented behind the §4 pattern where one exists.
2. Regression test that fails on `main` and passes with the fix.
3. `npm run typecheck && npm run lint && npm test` green.
4. Security items: an explicit negative test (unauthorised caller → 401/403; forged field → ignored/400).
5. DB items: migration idempotent, reversible where possible, `get_advisors(security)` clean.
6. Traceability row (§7) flipped to done with the PR link.

---

## 4. Cross-cutting designs

### CC1 — Central resource-authorization layer
**Kills:** E17, E18, E19, E20, E21, E22, E31, E32, E33, E39 + future IDOR.

`src/lib/authz.ts` with resource-scoped assertions every service-role route must call before reading/mutating a row it did not just create:

```ts
assertOwnsArtistProfile(userId, artistId): Promise<ArtistProfile>
assertOwnsWork(userId, workId): Promise<Work>
assertConversationParticipant(userId, conversationId): Promise<void>
assertPlacementParty(userId, placementId): Promise<Placement>   // artist_user_id OR venue_user_id
assertOrderParty(userId, orderId): Promise<Order>
assertVenueOwner(userId, venueId): Promise<VenueProfile>
assertArtworkRequestOwner(userId, requestId): Promise<Req>
```

- Ownership `.eq()` happens **in the same query** that fetches the row (no fetch-then-compare gap → closes E31/E32).
- Shared-resource reads require membership, not mere authentication (E17, E18, E31).
- **CI gate:** any route importing `getSupabaseAdmin` that mutates must also import from `@/lib/authz`, or sit on an explicit `PUBLIC_ROUTES` allowlist (newsletter, browse, stats/public, qr, contact, waitlist, cron, venues public). Forgetting becomes a build failure.

### CC2 — Allowlisted writes (kill mass-assignment)
**Kills:** E44, E45, E46.

No route spreads a request body into a DB write.

```ts
export const ARTIST_PROFILE_WRITABLE = ["display_name","short_bio","extended_bio","instagram",
  "primary_medium","style_tags","postcode","default_shipping_price", ...] as const;
  // NOT: review_status, subscription_plan/status, is_founding_artist, total_*, user_id, slug
export function pickWritable<T>(body: unknown, allow: readonly string[]): Partial<T>
```

- `subscription_plan/status` writable only by the Stripe webhook; `review_status` only by admin routes.
- Numeric fields (`pricing[].price`, `shipping_price`, `in_store_price`, `bundle_price`) get `z.number().min(0)` + array `.max(n)`.

### CC3 — RLS deny-by-default + committed base schema
**Kills:** E24, E26, E27, E28, E29.

- **Commit the base schema** (`supabase/migrations/000_base_schema.sql`) for `orders`, `placements`, `messages`, `artist_profiles`, `venue_profiles`, `artist_applications`, `conversations` — prerequisite, not optional.
- New migration `074_rls_gap_closure.sql`:
  - `customer_profiles`: ENABLE RLS + owner-scoped `USING (auth.uid() = user_id)` (E24)
  - `placement_record_versions`: ENABLE RLS + party-scoped read (E27)
  - `messages`: confirm RLS, drop always-inert policies (E29)
  - `blogs_update_own`: `WITH CHECK` forbidding the author moving `status` → `published`/`rejected` (E28)
  - Extend the `071` venue-PII revoke to `authenticated`, not just `anon` (E26)
  - **`artist_applications`: see §10.4 — the anon-client insert in `/apply` must be switched to service-role in the SAME release, or applications break.**
- **Constraints (E29):** `CHECK (amount_cents > 0)` on `stripe_transfers`; idempotency-key columns `NOT NULL` (or partial-unique + app guard); replace `EXCEPTION WHEN others THEN NULL` FK adds with hard failures.

### CC4 — Storage: private buckets + signed URLs
**Kills:** E25. **Highest-risk refactor in the queue — sequence per §10.5.**

- Recreate `message-attachments` (audit `collections`, `wall-photos`, `avatars`, `artworks`) as `public = false`.
- Store **opaque refs**, not public URLs (`upload.ts:260` currently stores public URLs). Serve via short-TTL signed URLs from a route that runs `assertConversationParticipant` first. Follow the existing **contracts-bucket pattern**.
- Backfill/migrate existing attachment URLs before the toggle, or every existing attachment 404s.

### CC5 — One email pipeline, provisioned, with the missing triggers
**Kills:** E1, E4, E5 + gaps. See also §11.5 (DNS/deliverability is owner-owned).

- **Provision (E1):** `RESEND_API_KEY`, verified `tx.wallplace.co.uk`, `EMAIL_FROM_*`, `CRON_SECRET` in Vercel prod; paste Supabase auth templates. Add a health assertion that logs loudly if `RESEND_API_KEY` is unset in prod — no more silent `skipped_no_api_key`.
- **Retire the legacy path (E5):** delete `src/lib/email.ts`; move its callers (contact, enquiry, refund-request, curation, venue-registration-admin, venue→artist placement) onto `sendEmail`/`sendTransactional` for suppression, preferences, unsubscribe headers, `email_events`, verified domain.
- **De-duplicate (E4):** one template per order event; retire the legacy `order_placed`/`artist_order_received` duplicates → 1 customer + 1 artist email per purchase.
- **Wire the gaps:** dispute opened/resolved (new templates), newsletter double-opt-in, contact-form sender ack, subscription-started confirmation, branded password-reset/verification.

### CC6 — Payment/transfer ledger integrity
**Kills:** E6–E11, E37, E38, E40.

- **Never swallow the ledger write (E37):** `scheduleTransfer` must check the insert `error` and throw; alert on any `stripe_transfers` write failure.
- **Retry, don't terminate (E37):** `processPendingTransfers` (`stripe-connect.ts:101`) sweeps only `status='pending'`; on error it writes `'failed'` (`:140`) and nothing retries — one transient Stripe blip strands a payout permanently. Add `retry_count` + `next_retry_at`, sweep `failed` with backoff and a cap, alert after N. **Also query prod for already-stranded rows — there may be live victims.**
- **Gate consistently (E38, E8):** one `canReceivePayout(profile)` = `charges_enabled && payouts_enabled && onboarding_complete && !requirements.disabled_reason`, used by cart checkout, offer checkout, and both paid-loan paths. Block up front rather than trapping funds.
- **Offer payout + stock (E6, E10):** the webhook offer branch must `scheduleTransfer` (destination + application fee) exactly like the cart branch, AND decrement quantity / set `available=false`. Add offers to the refund-reversal path.
- **Paid-loan subscription (E7, E11):** add the `mode:"subscription"` + `kind=paid_loan_monthly` webhook branch that stamps `placements.stripe_subscription_id` and writes `placement_recurring_billings`; add a Stripe idempotency key on session create; make the dedup guard and `cancelPaidLoanBilling` read the populated table. Until done, keep the CTA hidden (§12.3).
- **Multi-artist split (E9):** compute `platformFeePct` and the transfer **per artist**, not from the first artist for the whole basket. One `scheduleTransfer` per distinct connected artist.
- **Correctness guards (E40):** require `payment_status === "paid"` before creating orders/scheduling payouts; widen order ids to remove collision risk; make referral credit an atomic `UPDATE ... WHERE referral_credited_at IS NULL`; add a `status='pending'` guard to the refund transfer-cancel.

### CC7 — One label source + one status source
**Kills:** E13, E14, E15, Bug 3. *(#63 canonicalised paid-loan labels; #65 made the lint an error.)*

- `src/lib/arrangement-labels.ts` is the single source. Delete the parallel `status.ts arrangementLabel()` and hardcoded JSX labels. Add `mixed`/`free_loan`. Rename the misleading `revenue_share: "Revenue-share loan (QR-enabled)"` → "Revenue share".
- Statuses render only via `normaliseStatus`/`statusBadgeClass`; delete the hand-rolled capitalisation + colour switch in `PlacementDetailClient.tsx` (E14).
- **Extend the #65 lint rule to statuses.**

### CC8 — Frontend save-flow contract
**Kills:** Bug 12, Bug 14, E41, E42, E43.

- `authFetch`/`mutate()` **throws a typed error on non-2xx**; audit every caller. Cart/saved contexts (optimistic + rollback + toast) are the reference.
- A `useSaveAction` hook: disables the control in-flight, awaits the request, shows success **only** on `res.ok`, rolls back and surfaces errors otherwise, clears the unsaved-changes guard only after confirmed success.
- Sweep: artist profile/portfolio (E41), venue profile toggles + "Not set" input binding (E42), withdraw-offer / mark-fulfilled / save-shipping / wall auto-save / dead enquiries buttons (E43). Remove the dead `localStorage("wallplace-artist-works")` path.

### CC9 — Feature-flag & gating posture
See §12 — GATING_V1 is now live; `BLOGS_V1` and `PAID_LOAN_V2` remain off.

---

## 5. Auth/session hardening (P2)

- **Roles (E35):** remove `"admin"` from user-suppliable roles in `auth-roles.ts`; `oauth-sign-state`/`oauth-finalize` reject roles outside `{artist,customer,venue}`. **Admin gate decision required — see §11.2.**
- **Captcha/rate-limit (E35, E36):** enforce captcha in GoTrue (pass the Turnstile token through `signUp`/`signIn`); `verify-turnstile` must fail **closed** when the secret is unset. Derive rate-limit IP from the platform's trusted header; use shared Upstash in serverless (§11.6).
- **Redirects (E36):** run `next` through `safeRedirect` in `auth/callback` and `demo/login`.
- **Enumeration (E36):** `apply`/`waitlist`/`register-venue` return generic 200 on duplicate.
- **Venue adoption (E34):** delete the `venue_slug`-metadata adoption path; adopt an orphan venue only when the caller's verified email matches the venue's registered email.

---

## 6. Per-workstream catalogue (residual)

### WS-A — Payments & money
- **E6–E11, E37, E38, E40** → CC6, each with a Stripe-test-mode integration test.
- **Bug 9** demo works purchasable then fail → hide Buy Now/Add-to-basket on non-orderable works via `canReceivePayout`; if reached, return "this is a demo artwork", not "try again in a few minutes".
- **Bug 10** ships-to-UK-only unenforced → validate delivery country in `checkout/route.ts` before session create; filter the country dropdown.
- **Bug 11** Stripe shows "Wallspace" → §11.1 (owner-owned, blocks taking money).

### WS-B — Authorization / IDOR
- **E17–E22, E19, E31, E32, E33, E39** → CC1 + a negative test per route.
- **E21** early-escrow release → require buyer confirmation or the delivery webhook, not seller self-attestation.
- **E22** fulfil idempotency → gate on `status !== 'fulfilled'` + idempotency key.
- **E23** review-status gate; direct `status:"completed"` writes must run inventory-restore or be rejected; wire `assertNotDemo` into all mutating placement/order/offer/refund/artwork-request routes.
- **E46** private-request injection → `responses` POST checks `visibility`/`invited_artist_slugs`; free-frame checkout recomputes the frame uplift server-side; `terms/accept` requires auth or a signed token.

### WS-C — Auth/session → §5.
### WS-D — DB/RLS/storage → CC3, CC4, plus **E30** (audit application approve/reject, curation PATCH, refresh-stats; server-side admin route-group guard; append-only `admin_audit_log` + a read view).
### WS-E — Emails → CC5.
### WS-F — Frontend save-flows → CC8, incl. **Bug 14** (Sign In button must trigger the form's `onSubmit`, not only `requestSubmit`) + a Playwright login→logout→login test.

### WS-G — Naming/display → CC7, plus:
- **Bug 4** price sort → global ORDER BY on the flattened work list, not per-gallery interleave. Done: `?gsort=price_low` yields a monotonic sequence.
- **Bug 7 / E12** cart size "undefined" → guard the label (`selectedPricing.label ?? work.dimensions ?? "Original"`) at `ArtworkPageClient.tsx:501`; extend `normaliseSize` to treat the string `"undefined"` as blank.
- **Bug 8** shipping mismatch → product page and cart derive from the same `shipping-calculator.ts` function for the same size.

### WS-H — Data hygiene
- **Bug 2, Bug 3, Bug 6** → `is_published`/`is_demo` gate on `browse-artists`, `browse-collections`, `venues/demand`, blog list, admin "listed" count; purge/relabel test accounts and the junk blog post; homepage stats read the gated counts. See §11.7 (purge list) and §12.1 (the duplicate-profile interaction).
- **Bug 1, Bug 5** → public projections strip `postcode`, `coordinates`, and (for paywalled venues) the name-bearing `slug`; compute distance server-side, return a coarse band.

### WS-I — Reporting
- **Bug 15 / E2** admin £0 vs artist £773 → pick one source of truth; reconcile all three role views.
- **Bug 13 / E3** dashboard 0 views vs analytics 9 → maintain the `total_*` counters or have the dashboard read the analytics aggregation; fix the "Total Sales" vs "your share after fees" label mismatch.

---

## 7. Traceability matrix

| Finding | Fix | Phase | Status |
|---|---|---|---|
| E44 mass-assign privesc | CC2 | P0 | open |
| E31 read any DM | CC1 | P0 | open |
| E19 unauth POST /api/orders | CC1 | P0 | open |
| E39 checkout/session PII leak | CC1 | P0 | open |
| E24 customer_profiles RLS off | CC3 | P0 | open |
| E25 public attachment bucket | CC4 | P0 | open (§10.5) |
| E6 offer never pays artist | CC6 | P0 | open |
| E7 paid-loan orphaned sub | CC6 | P0 | open (#64 adjacent) |
| E17/E18 unauth request reads | CC1 | P1 | open |
| E20/E21/E22/E23 state bypass | CC1/WS-B | P1 | open |
| E26/E27/E28 RLS gaps | CC3 | P1 | open |
| E32/E33 write IDOR | CC1/CC2 | P1 | open |
| E34 venue takeover | §5 | P1 | open |
| E45/E46 mass-assign + validation | CC2 | P1 | open |
| E35/E36 auth hardening | §5 | P2 | open (§11.2 conflict) |
| E30 admin audit/gate | WS-D | P2 | open |
| E8–E11, E37, E38, E40 | CC6 | P3 | open |
| Bug 9/10 checkout guards | WS-A | P3 | open |
| Bug 11 "Wallspace" | §11.1 | P3 | **owner** |
| E1/E4/E5 emails | CC5 | P4 | open |
| Bug 12 blog save | CC8/§12.2 | P5 | open |
| Bug 14 login button | CC8 | P5 | open |
| E41/E42/E43 save-flow loss | CC8 | P5 | open |
| Bug 15/E2, Bug 13/E3 reporting | WS-I | P6 | open |
| E13/E14/Bug 3 labels | CC7 | P6 | partial (#63/#65) |
| E15 plurals | CC7 | P6 | open |
| E16 gating disabled | CC9 | — | **resolved** (GATING_V1 live) |
| Bug 1/Bug 5 public PII | WS-H | P6 | open |
| Bug 2/3/6 test data | WS-H | P6 | open (§11.7) |
| Bug 4 sort, Bug 7 size, Bug 8 shipping | WS-G | P6 | open |
| N1 collect-from-venue size | §10.1 | P3 | open |
| N2 venue-collection intent | §10.2 | P3 | open |

---

## 8. Testing & verification

- **Unit:** `authz` helpers, `pickWritable`, label/status maps, `canReceivePayout`, shipping calculator, plural helper.
- **Integration:** authorized-happy-path + unauthorized/forged-field-negative per route; negative tests named after their E-number.
- **Payments (Stripe test mode):** drive `checkout.session.completed` (cart, offer, paid-loan), `invoice.paid`, `invoice.payment_failed`, `payout.failed`, `transfer.reversed`; assert ledger rows, statuses, redelivery idempotency; multi-artist cart asserts one transfer per artist.
- **RLS:** SQL tests with anon key + non-owner JWT asserting deny; `get_advisors(security)` in CI, fail on new warnings.
- **E2E (Playwright):** login→logout→login (Bug 14); default-size add-to-basket (Bug 7); demo-work checkout blocked (Bug 9); UK-only country blocked (Bug 10); profile/portfolio/venue save persistence (E41/E42); price-sort monotonicity (Bug 4).
- **Email:** dev harness rendering + dry-run-sending every wired template; assert exactly one per event (no E4 duplicates) and an `email_events` row per attempt.

---

## 9. Rollout

1. CC1–CC4 primitives + P0 (vulnerability removal only) — ship after review.
2. P1–P2 in reviewed batches; flip the CI authz-lint to error once all routes comply.
3. P3 payments verified in Stripe test mode; `PAID_LOAN_V2` on only after CC6 proves end-to-end (§12.3).
4. P4 emails: provision first (silent → loud), then enable per stream, monitoring bounce/complaint.
5. P5/P6 as normal releases.
6. **Exit gate:** re-run the full stress test (guest + all roles + the code-audit passes); §7 must be fully "done".

---

## 10. Engineering queue — launch-prep items (reconciled)

Six items owed by the launch-prep track. Overlaps map to existing IDs rather than duplicating.

### 10.1 N1 — Collect-from-venue: size coupling *(NEW — no prior finding)*
`work.placed_at_venue` is a work-level flag with no size attached (`ArtworkPageClient.tsx:225`), but the collect-from-venue option renders **per selected size** (`:586`). Change the print size and collection is still offered, though only one physical size hangs on the wall.
**Fix:** migration to record the placed size + placement→`artist_works` sync + gate the option on the matching size.
**Risk:** medium (schema change). **Phase:** P3. **Done:** selecting a size other than the placed one hides collect-from-venue.

### 10.2 N2 — Collect-from-venue: checkout defaults to "ship" *(NEW)*
Checkout hard-defaults to `"ship"` (`checkout/page.tsx:73`) and its only collection mode is collect-**from-artist** (`offers_pickup`). The cart carries no venue-collection intent, so the product-page choice is silently dropped.
**Fix:** cart item carries the intent; checkout honours it; skip shipping cost + address for venue collection.
**Risk:** medium-high (purchase path). **Phase:** P3. **Done:** choosing collect-from-venue reaches checkout with £0 shipping, no address, and the venue named. **Note:** this is the same *class* as Bug 7/Bug 8 (product-page choice not surviving into the cart) — fix alongside them and reuse the tests.

### 10.3 Stranded failed payouts = **E37**
Confirmed by both audits (`stripe-connect.ts:101` sweeps only `pending`; `:140` writes terminal `failed`). Fix per CC6. **Additionally: query prod for already-stranded `failed` rows — there may be live victims owed money.** **Phase:** P3 (raise to P0 if prod rows exist).

### 10.4 `artist_applications` hardening = **E29/CC3 sequencing constraint**
`/apply` inserts via the **anon** client (`apply/route.ts:109`). Locking RLS to service-role without changing this **breaks artist applications**. Switch the insert to service-role and ship the migration **in the same release**. **Risk:** low-medium if paired, high if split. **Phase:** P1.

### 10.5 `message-attachments` bucket privacy = **E25 / CC4**
Attachments stored as public URLs (`upload.ts:260`); flipping the bucket to private breaks every existing and new attachment. Refactor to opaque refs + a signing endpoint (contracts-bucket pattern) **before** the toggle, and backfill existing rows. **Risk:** high — biggest of the six. **Phase:** P0 by severity, but sequence last within P0/P1 given the refactor size; until it ships, treat DM attachments as public.

### 10.6 Finish the live audit
Covered so far: logged-out + venue (launch-prep), and guest/customer/artist/venue/admin (this stress test). Still outstanding: a **full purchase→payout→QR-share cycle** verifying the venue's share lands at the right stage, which also verifies #64 end-to-end. **Blocked on Stripe Connect activation (§11.1).**

**Suggested order (launch-prep's, endorsed):** 10.4 → 10.3 → 10.1 → 10.2 → 10.5 → 10.6 — contained/high-impact first, the attachments refactor late. *Caveat: 10.5 protects live user data; if DM attachments contain anything sensitive, pull it forward.*

---

## 11. Owner-owned launch gates

Not code. **Stripe is the critical path — start today; reviews take days and gate all payouts.**

### 11.1 Stripe (blocks taking money)
- Rename **"Wallspace" → "Wallplace"** (= **Bug 11**; buyers currently see the wrong brand at the card form)
- Complete account activation
- Activate **Connect + pass platform review** — **until this clears no artist gets paid**, and E6/E38 can't be verified end-to-end
- Create live webhook + live Products/Prices; Radar rules; Stripe Tax; swap live keys into Vercel

### 11.2 Security toggles (~30 min) — ⚠️ **conflict RESOLVED 2026-07-11**
- Enable Leaked Password Protection; Supabase admin MFA; verify the contracts bucket is private; run the anon-RLS spot check.

**The `user_metadata.user_type` conflict — definitive answer.** Admin auth today (`src/lib/admin-auth.ts:38-51`) is a **three-source conjunction**, not an allowlist:

```
user_metadata.user_type === "admin"   AND   ( email ∈ ADMIN_EMAILS  OR  user_id ∈ admin_users )
```

**Verdict: launch-prep is factually right and strategically wrong.**
- *Right:* because it's an `AND`, admins without the metadata stamp genuinely **do** 403 today. Deploying without stamping would lock them out.
- *Wrong:* `ADR 0001:51` justifies the metadata conjunct as a second factor "which can only be set via the service-role API" — **that is false**; four anon-key `signUp` sites set it. So the conjunct **cannot stop an attacker** (it's self-settable) while it **can** strip real admins. It is negative-value security.
- *Not a privesc on its own:* a random user setting `user_type: "admin"` still fails the `ADMIN_EMAILS`/`admin_users` conjunct. The problem is lockout risk and false assurance, not direct escalation.

**Resolution (order matters):** remove the metadata conjunct from the predicate **first**, leaving `email ∈ ADMIN_EMAILS OR user_id ∈ admin_users` as the gate. The stamp then becomes optional cosmetics and no one can be locked out. Ship with the E35 fix (strip `admin` from user-suppliable roles) in the same release.

**Two related landmines:**
- `admin_users` has **no `CREATE TABLE` in any migration** — only a conditional RLS enable in `034`. On a freshly migrated environment the predicate collapses to metadata `AND` allowlist, so `admin_users` is not a standalone path. Also `getAdminUser` **503s for everyone** if `ADMIN_EMAILS` is unset.
- **The app contains the admin-revoking pattern itself:** `api/admin/applications/[id]/route.ts:114-120` replaces `user_metadata` **wholesale**, so approving an application can wipe that user's `user_type`. Fix as part of this work.

**Refuted by re-derivation (do not spend time on these):** E36's `auth/callback` open redirect was already fixed at commit `94a174a`; and rate limiting is **not** advisory — all 19 call sites enforce it (the key is spoofable and the store degrades silently, which remain real but lesser issues).

### 11.3 GitHub
Branch protection on `main` (require check + e2e); add `SUPABASE_ACCESS_TOKEN` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` secrets; apply the workflow change in `website/docs/ci/2026-06-15-required-checks.md` (the agent's token lacked `workflow` scope); enable Dependabot. **Also add the CC1 authz-lint and `get_advisors` check to the required set once they exist.**

### 11.4 Legal (before payments)
Solicitor review of Terms / Privacy (list every sub-processor) / Cookies / Agreements; ICO registration (~£40); sign DPAs; surface the **14-day cancellation right in checkout + confirmation email**. *Note: the confirmation-email half depends on CC5 actually sending mail.*

### 11.5 Email / DNS
Verify the Resend domain and confirm mail **actually delivers**; DMARC record then ratchet `none → quarantine → reject`; create `hello@`, `support@`, `dmarc@`, `privacy@`, `abuse@`; wire Supabase auth email templates. **This is the unblock for E1** — until it's done every "wired" email is a silent no-op.

### 11.6 Infra
Confirm **Upstash env vars are set in Vercel** — without them rate limiting silently degrades to useless (compounds **E36**); Supabase **Pro for PITR/backups before payments**; confirm the 6 cron jobs are registered (see §12.4).

### 11.7 Before public launch
Sentry + uptime + `/api/health`; Stripe webhook failure alerts (pairs with CC6's ledger alerting); deploy/incident runbooks; analytics + sitemap submission; **purge test data** — the "Fin Coles" artist, `test@testingvenue.com`, their placements/orders, **keeping the `/demo` accounts** (= **Bug 2**, and see §12.1 before deleting `fin-coles`); AI-art policy; flip CSP to enforcing after a clean week.

---

## 12. GATING_V1 fallout & flag posture

### 12.1 Live now — needs decisions
1. **6 non-subscribed artists went invisible on `/browse` and are blocked from write actions.** Only one is unambiguously real: **`jamie-green`** — signed up yesterday, now locked out. *Decision needed: comp a trial, or contact them.* This is a real user harmed by the flag flip; treat as urgent.
2. **`maya-chen-demo` inconsistent:** `subscription_plan='pro'` but `subscription_status='none'`. Either flip status to `active` or clear the plan. *(Demo data — relates to Bug 3's duplicate demo personas.)*
3. **`finlay-coles` hidden from listing**; `/browse/finlay-coles` still works only because a 301 redirects to the static `fin-coles` seed profile. **This is exactly Bug 3's duplicate-profile problem surfacing in prod** — the canonical demo/seed and the real account are tangled. Resolve as part of WS-H: pick one canonical row per persona, then purge (§11.7 — do not blind-delete `fin-coles`, the redirect target depends on it).
4. **Smoke test post-flag:** `/browse` renders only seed + active/trialing; artist→artist DM 403s; non-subscribed publish 402s; "All open requests" upgrade prompt appears. **Add these as E2E tests (§8), not a one-off manual pass.**

### 12.2 `BLOGS_V1` — off, zero risk, flip when ready
**Likely explains Bug 12** (blog editor shows "Saved" but persists nothing). **Caveat before closing Bug 12 as "just the flag":** the observed behaviour was *zero network requests* with a **false "Saved"** confirmation and the post absent from the admin queue. A properly gated feature should hide the editor or return 402/403 — silently faking success is a bug in its own right (CC8). **So: flip the flag, retest, and if the editor now persists, still fix the false-success path.**

### 12.3 `PAID_LOAN_V2` — off; prerequisites before flipping
- Create the "Wallplace Paid Loan" product in the Stripe Dashboard
- Set `STRIPE_PAID_LOAN_PRODUCT_ID` in Vercel (Production)
- Verify at least one artist has Stripe Connect onboarded (gated on §11.1)
- **Plus, from this spec:** land the E7 webhook branch + idempotency key first (CC6). Flipping without it risks orphaned, double-billable, uncancellable subscriptions. **Until then keep the "Set up payment" CTA hidden.**

### 12.4 Post-deploy diagnostics outstanding
- **Runtime logs** on the live deploy (`dpl_4wwB4tncgueGvVGREnYPhC1XRFRB`) — check for 500s from Phase 2 code hitting freshly migrated tables.
- **Cron registration** — confirm the once-daily `order-delivery-followup` job is visible in Vercel → Crons (part of §11.6's "6 crons").

### 12.5 Optional cleanup
3 test artist accounts (`test`, `test-artist`, `test-user`) sitting **approved** in the DB — delete or demote `review_status`. Same finding as **Bug 2**; fold into the §11.7 purge.

### 12.6 Open decisions for the owner
| # | Decision | Recommendation |
|---|---|---|
| a | Pull runtime logs now | Yes — cheap, catches migration-related 500s while the deploy is fresh |
| b | Fix `maya-chen-demo` / `finlay-coles` via SQL | Yes for `maya-chen-demo` (pure demo data). For `finlay-coles`, decide the canonical-profile question (§12.1.3) first — an SQL patch now may entrench the duplicate |
| c | Both | Preferred: (a) immediately, (b) split as above |
| d | Wait | Only if you want to make the `jamie-green` call first — that one shouldn't wait |

---

## 13. Gate 1 — Transaction integrity (every route, perfect)

**Rule: a transaction route is "done" only when a test drives it end-to-end against Stripe test mode and asserts (a) the correct DB rows, (b) the correct money split, (c) idempotency on webhook redelivery, (d) the correct emails, (e) a clean failure when a precondition is unmet.** No route may be signed off by manual clicking alone.

### 13.1 Current state per route

| # | Transaction route | State | Blocking defects |
|---|---|---|---|
| T1 | **Buy Now** — single artist, direct purchase | ⚠️ Mostly works | Bug 7 (size `"undefined"`), Bug 8 (shipping quote ≠ charge), Bug 10 (UK-only unenforced), E40 (unpaid session, id collision, referral double-credit) |
| T2 | **Buy Now** — multi-artist cart | ❌ **Broken** | **E9** — entire artist remainder paid to the *first* artist; others get £0; fee at wrong tier |
| T3 | **Make an offer** → accept → pay | ❌ **Broken** | **E6** — money collected, artist **never paid**, no ledger row. **E10** — stock not decremented → double-sell. E33/E31 authz |
| T4 | **Placement request** → accept → install (free / revenue-share) | ⚠️ Authz holes | E20 (declined→force-active), E21 (early escrow release), E33 (any user accepts), E23 (state/demo guards) |
| T5 | **Revenue-share QR sale** | ⚠️ Unverified | Rides T1's path (correct for single artist); **venue's share timing never verified end-to-end** (§10.6) |
| T6 | **Paid loan (monthly)** | ❌ **Broken** | **E7** (orphaned, double-billable, uncancellable), **E8** (charges venue with no artist payout route, funds stuck), E11 (failure handling flag-off in prod), N1/N2 |
| T7 | **Artist subscription** (Core/Premium/Pro) | ✅ Works | E40 epoch bug; no "subscription started" email (CC5) |
| T8 | **Refunds** | ✅ Best-built flow | Cannot reverse T3/T6 payouts — they never create `stripe_transfers` rows (fixed by CC6) |
| T9 | **Collect from venue** | ❌ Not built | N1 (size coupling), N2 (intent dropped at checkout) |
| T10 | **Curation purchase** (£49 tier) | ❓ Unaudited | Webhook branch exists (`stripe:60`); never exercised in this audit — **audit before launch** |

**Four of ten transaction routes are outright broken, and one is unaudited.** T2, T3, T6, T9 are the G1 critical path.

### 13.2 Per-route acceptance criteria (the definition of "perfect")

Every route must satisfy **all** of:

1. **Preconditions enforced up front** — if the artist can't receive payout (`canReceivePayout`, CC6), the work is a demo, the country isn't served, or the item is out of stock, the UI does not offer the action and the API returns a *specific* error. No user ever reaches Stripe on a transaction that cannot complete (kills Bug 9's "try again in a few minutes").
2. **Money is split correctly and provably** — platform fee at the *correct artist's* tier, per-artist transfer, venue revenue-share at the agreed %, shipping to the right party, GBP throughout. Asserted numerically in a test, not eyeballed.
3. **Ledger is written or the transaction fails** — every payout leg creates a `stripe_transfers` row; a failed ledger write throws and alerts (never silently swallowed, E37).
4. **Idempotent under webhook redelivery** — replaying `checkout.session.completed` produces no duplicate orders, transfers, stock decrements, or emails.
5. **Inventory and status move together** — a completed purchase decrements quantity / flips `available`, and a placement's status transitions only along the legal state machine.
6. **Exactly one email per party per event** (CC5/E4), containing the right numbers.
7. **Reversible** — refunds can unwind it, including the payout leg.
8. **Authorized** — only a party to the object can act on it (CC1).

### 13.3 Work order for G1

1. **T3 offers** (E6+E10) — money is being taken and not paid out *today*; smallest correct fix.
2. **T6 paid loan** (E7+E8+E11) — add the webhook branch + idempotency key + `canReceivePayout` gate; keep the CTA hidden until proven (§12.3).
3. **T2 multi-artist split** (E9) — per-artist fee + transfer loop.
4. **T1 hardening** (Bug 7, 8, 10, E40) — the guards; cheap and high-visibility.
5. **T4 authz** (E20, E21, E23, E33) — via CC1.
6. **T9 collect-from-venue** (N1, N2) — build properly or **cut for MVP** (§16).
7. **T5 + T10 verification** — drive the full purchase→payout→QR-share cycle and a curation purchase.

**Exit test for G1:** a single `npm run test:transactions` suite that drives T1–T10 in Stripe test mode and passes.

---

## 14. Gate 2 — Photo/artwork listing integrity

"Photo listing should work perfectly" spans upload → save → publish → appear → edit. Known defects on this path:

| Defect | Effect |
|---|---|
| **E41** | Portfolio/profile save shows **"Saved" but drops the write** — an artist loses a listing they believe is live. Top priority on this gate. |
| **E32** | Any artist can **overwrite another artist's artwork** (write IDOR) |
| **E44/CC2** | Mass-assignment on artist profile — can self-approve past moderation, self-grant Pro |
| **Bug 7 / E12** | Missing size label → `"undefined"` propagates into the cart |
| **Bug 2 / E16 / §12.1** | Listings invisible or polluted: test artists in the marketplace, and GATING_V1 hiding real artists |
| **E46** | Prices accept negative/absurd values (no `z.number().min(0)`) |
| Dead path | `localStorage("wallplace-artist-works")` legacy path still present (CC8) |

**Acceptance:** upload a photo → set sizes/prices → save → hard-reload → it persists exactly; it appears on `/browse` and the public profile within one cache cycle; editing persists; a second artist cannot read or write it; an invalid price is rejected server-side; the size shown is the size that reaches the cart. Covered by CC8 (save contract), CC1/CC2 (authz + allowlist), and an E2E test.

---

## 15. Gate 4a — Unknot: one source of truth per concept

**Diagnosis.** The codebase runs **parallel implementations of the same concept**, usually "legacy + new" with both live. That is precisely why an unrelated-looking change breaks something else. Every pair below has already produced a finding in this audit:

| # | Concept | Duplicate implementations | Damage already caused |
|---|---|---|---|
| K1 | Sending email | `lib/email.ts` (legacy) **and** `lib/email/send.ts` (pipeline) | E4 (2–3 emails per event), E5 (bypasses suppression/logging/verified domain) |
| K2 | Paid-loan billing | `payment/setup` destination-charge path **and** `startPaidLoanBilling` (flag-gated) | E7, E8, E11 — and double-billing if the flag flips |
| K3 | Arrangement labels | `arrangement-labels.ts`, `status.ts`, hardcoded JSX | E13, E14 — same type shown 3 ways, twice on one page |
| K4 | Placement status display | `normaliseStatus` **and** hand-rolled capitalisation in `PlacementDetailClient` | E14 — `paused` reads "Paused" vs "Completed" |
| K5 | Artist stats | `artist_profiles.total_*` counters **and** `analytics_events` aggregation | Bug 13 / E3 — dashboard 0 vs analytics 9 |
| K6 | Platform revenue | `orders.total` **and** `stripe_transfers` / `amount_cents` | Bug 15 / E2 — admin £0 vs artist £773 |
| K7 | Order emails | legacy `customer_order_receipt` **and** new `order_placed` (both fire) | E4 |
| K8 | Demo personas | `maya-chen` + `maya-chen-demo`; `finlay-coles` + `fin-coles` | Bug 3, §12.1.3 — homepage and marketplace link to different profiles |
| K9 | Authorization | 122 service-role routes each hand-rolling checks | The entire E17–E33 IDOR cluster |
| K10 | Migration ordering | **duplicate numbers: `037`, `044`, `045`, `054`** | Non-deterministic apply order; environments can diverge |
| K11 | Schema definition | No committed base schema; only incremental migrations | RLS/constraint state unverifiable (E24, E27, E29) |

**Rule going forward: adding a "new" implementation requires deleting the old one in the same PR.** No `_v2` alongside `_v1` in main.

**Unknot work items**

- **K1** → CC5: delete `lib/email.ts`, migrate callers.
- **K2** → CC6: pick the destination-charge path, delete the other, remove `PAID_LOAN_V2` once landed.
- **K3/K4** → CC7 + extend the #65 lint to statuses; delete the parallel label/status functions.
- **K5/K6** → WS-I: pick one source per number; the other becomes a derived view or is deleted.
- **K7** → CC5 de-dup.
- **K8** → WS-H: one canonical row per demo persona; fix the homepage link; resolve the `finlay-coles`→`fin-coles` 301 before any purge (§12.1.3).
- **K9** → CC1 + the CI gate — this is the single highest-leverage unknot.
- **K10** → renumber the four duplicate pairs to unique sequential ids (or adopt timestamp-prefixed migrations) and verify a clean apply from zero on a scratch DB.
- **K11** → commit `000_base_schema.sql` (CC3).

**Structural item — the monolith.** `browse/page.tsx` is **2,883 lines** and owns the marketplace grid, filters, sort, search, and pagination. Bug 2 (filters), Bug 4 (sort), and E15 (plurals) all live in it, and it is the highest-traffic page. Split it into `useBrowseQuery` (state/URL), a filter panel, a results grid, and a card — each independently testable — **before** more marketplace changes land. This is the clearest "one change breaks three things" hotspot in the repo.

---

## 16. Gate 4b — Shrink the surface

**114 page routes and 122 API routes** for a pre-launch MVP. Every surface is code that can break, must be secured (each service-role route is an authz liability), and must be regression-tested. Cutting surface is the cheapest way to raise quality.

**Method:** classify every route as **Core MVP** (a venue finds art, an artist lists and gets paid, a customer buys) / **Supporting** (needed but not launch-critical) / **Speculative** (built ahead of demand). Then: delete, or hide behind a flag with the code removed from the shipped bundle, or keep.

### Candidate cuts, with measured size

| Surface | Size | Assessment | Recommendation |
|---|---|---|---|
| `dev/profile-designs/[slug]` + `profile-designs` | **1,135 LOC** | Design playground shipped in production | **Delete** (or dev-only build). No user need. |
| **Visualizer** — `lib/visualizer/*` + `venue-portal/walls/*` | **~7,400 LOC** | Largest optional subsystem. Wall photo upload, layouts, renders, quotas, tier limits. Impressive, not required for a venue to accept art | **Decide explicitly.** If not core to the MVP pitch, flag off and exclude from the bundle. Biggest single quality win available. |
| `artist-portal/showroom` (3 pages) | 1,117 LOC | Overlaps portfolio/collections | **Cut or merge** into portfolio |
| `curated/*` (4 pages) | 1,255 LOC | £49 managed-curation upsell; T10 unaudited | **Keep only if selling it at launch**; otherwise cut (removes an unaudited payment path) |
| `artist-portal/posts` (social posts) | 109 LOC | Thin; templates exist but no pipeline | **Cut** |
| `artist-portal/blogs` (3 pages) | 188 LOC | `BLOGS_V1` off; Bug 12 false-save | **Keep flagged off** until CC8; not MVP |
| `account/appeal`, `account/export`, `account/security` | ~small | Data export / deletion / 2FA have **no backend triggers** (E: unwired) | **Cut the pages** or finish the flows — a page that does nothing is worse than none. GDPR export/deletion may be legally required (§11.4) — confirm with the solicitor |
| `feature-requests` (public) | 246 LOC | Public roadmap voting pre-launch | **Cut** or admin-only |
| `apply/claim` | 248 LOC | Profile-claim flow; overlaps E34 venue-adoption risk | **Audit or cut** |
| `emails` — 63 unwired templates | 8,758 LOC total | 113 built, 50 wired | **Keep the files** (cheap, no runtime surface), but **do not wire** beyond CC5's list for MVP |
| `artists`, `customer`, `venues` landing pages | 74–82 LOC each | Possible overlap with `browse` / `customer-portal` / `spaces` | **Review for redundancy**; `galleries` is already a 5-line redirect (fine) |

**Indicative saving if the Speculative column is cut: roughly 10–12k LOC and ~20 pages removed from the security, test, and regression surface.**

**Non-negotiable keeps:** browse/artwork/checkout, artist portfolio + orders + billing, venue placements + orders, messages, admin moderation/financials, auth, legal pages.

**Process:** owner marks each row Keep/Cut/Defer → cuts land as pure-deletion PRs (no behaviour change elsewhere) → each deletion PR must leave the test suite green, which also proves the surface really was unused.

---

## 17. Revised execution order

Supersedes §2 where they conflict.

| Step | Content | Why first |
|---|---|---|
| **1** | **G3 security P0** — E44, E19, E31, E39, E24, E25(sequence per §10.5), + CC1/CC2 primitives | Live exploitable holes; CC1/CC2 are prerequisites for everything else |
| **2** | **K9 + K10 + K11** — authz layer applied repo-wide with the CI gate; renumber migrations; commit base schema | The unknot that stops new authz bugs and makes environments deterministic |
| **3** | **G1 transactions** — T3, T6, T2, then T1 hardening (§13.3), each with its test | Money correctness; the MVP promise |
| **4** | **G2 listing** — E41 save contract (CC8), E32/E44 authz, Bug 7 | Artists must not lose listings |
| **5** | **G4 cull** (§16) — owner decisions, then deletion PRs | Shrinks what steps 6+ must secure and test |
| **6** | **K1–K8 unknot** — email consolidation, labels, stats/finance sources, demo personas; split `browse/page.tsx` | Removes the regression coupling |
| **7** | **G3 remainder** — P1/P2 authz, RLS, auth hardening (§5) | Depth after the critical path |
| **8** | **CC5 emails + §11 launch gates + monitoring** | Needs DNS/Stripe, runs in parallel from day 1 |

**Stripe activation + Connect review (§11.1) starts today regardless** — it gates every payout and cannot be rushed, so it runs alongside step 1.

---

*Generated from the Wallplace stress test of 2026-07-10/11; updated with the launch-prep sync and the MVP/unknot mandate of 2026-07-11 PM.*
