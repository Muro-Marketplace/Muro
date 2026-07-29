# Wallplace Stress Test — Findings Index

**Test date:** 2026-07-10/11. **Target:** wallplace.co.uk (live) + `website/` codebase.
**Remediation spec:** `2026-07-11-stress-test-remediation-spec.md`

> ⚠️ **Partial recovery.** The full findings doc was written to `/tmp` and cleared by the OS before it was copied into the repo. `Bug 1–15` and `E1–E15` are reproduced below with their detail. For **E16–E46** only the verified titles survive — the file:line bodies and exploit steps were lost. The fixes are fully specified in the remediation spec, so no remediation detail is missing; if you need the original repro for a specific E16–E46 item, re-run that audit pass. **Lesson: write audit output into the repo, never `/tmp`.**

---

## Part 1 — UI / live-site bugs (browser-verified)

| # | Sev | Role | Finding |
|---|---|---|---|
| 1 | critical | guest | `/api/browse-artists` leaks every artist's exact **postcode + GPS coords** (e.g. `fin-coles` → `TW12 2TH`, `51.417389,-0.363`) to anonymous users. 41/51 artists carry 4-dp coordinates. |
| 2 | medium | guest | Marketplace polluted with test/duplicate artists — admin's own numbers: **14 registered vs 51 listed**. `/browse?discipline=painting` returns 5 works, **all** test junk ("Test", "Sass Test", "Sam Test"). Venues too (`Testing Venue`, 45 placements). |
| 3 | medium | guest | Two duplicate **Maya Chen** demo profiles. Homepage links `/browse/maya-chen` (picsum, 6 works, "Last Light on Mare Street" **£180–320**); marketplace shows `/browse/maya-chen-demo` (Unsplash, 8 works, same work **£180–580**). `/demo` designates the former as canonical. |
| 4 | medium | guest | **"Sort: Price (low to high)" does not sort.** `?gsort=price_low` yields `30,30,30,30,30,40,60,30,30,…` — a £60 work ranks above a £30 work. It's an artist-interleave, not a global sort. |
| 5 | critical | guest | **`/spaces` paywall bypass.** `/api/venues/demand` correctly blanks `name` but still returns `slug` (which spells the name: `the-copper-kettle` → "The Copper Kettle"), exact GPS for 20/29 venues, `type` and `location`. Everything the £9.99/mo subscription sells, free. Slugs are also in the page HTML. |
| 6 | low | guest | Junk test post live on public `/blog`: `/blog/teest-791hwe`, title "teesttestjfqewifjniej3dfbqwie…". |
| 7 | medium | customer | Adding a work with its **default (pre-selected) size** stores `size: "undefined"` (the string); checkout renders "undefined". Correct value sits in `dimensions`. |
| 8 | medium | customer | **Shipping quote ≠ charge.** Artwork page: "£20.00 · Large parcel · 5 to 10 working days". Checkout for the same item/size: **£18.00**, "5 to 7 working days". |
| 9 | high | customer | Demo works are top of `/browse` with working Buy Now, then always fail at payment: `422 {"error":"maya-chen-demo isn't ready to take orders yet. Try again in a few minutes.","blocked":["maya-chen-demo"]}`. Misleading (never resolves) and **blocks the whole mixed cart**, including a real artist's item. |
| 10 | medium | customer | **"Ships to UK only" not enforced.** UK-only item + Australian address → shipping stays at UK £18, no warning, and checkout **reaches Stripe** (`cs_test_…`, £167.99). |
| 11 | low | customer | Stripe checkout shows the merchant as **"Wallspace"** (brand is Wall**p**lace) at the card form. |
| 12 | high | artist | New-blog editor: "Save as draft"/"Submit for review" show **"Saved"** but fire **zero network requests**; nothing persists, nothing reaches `/admin/blogs`. (Possibly `BLOGS_V1` off — but the false success is a bug regardless; see spec §12.2.) |
| 13 | medium | artist | Dashboard **"Profile Views 0"** vs Analytics **"Profile Views 9"** (same account, same day). Also £773.25 labelled both "Total Sales" and "your share after fees". |
| 14 | medium | any | After logout, the `/login` **"Sign In" button click no longer submits** — no request, no error. Only `form.requestSubmit()` works. Reproduced 3×. |
| 15 | medium | admin | Admin financials report **£0 gross sales / 0 orders** while the artist portal shows **£773.25 across 10 orders** and the venue **£609.75 spent**. |

**Verified working (negative results):** API authorization returns 401 for all sensitive endpoints to guests; mobile 375px clean (no overflow); category filter, search, annual pricing maths, newsletter POST, cart maths, artist↔venue placement-status consistency.

---

## Part 2 — Backend audit (emails, transactions, naming)

| # | Finding |
|---|---|
| **E1** | **Transactional email silently no-ops.** `send.ts:26-30,154-158` — with `RESEND_API_KEY` unset it logs `skipped_no_api_key` and returns `{ok:true, skipped:true}`, so callers see success. `OUTSTANDING.md:3`: **"113 templates built · 50 wired · 63 outstanding"**, and §1.1 flags Resend DNS as "blocking all sends". Root cause of the known "artist not emailed on sale" bug. Genuinely missing sends: disputes (both directions, no template), newsletter confirmation, contact-form ack, subscription-started, branded password-reset/verification. |
| **E2** | Admin financials read Stripe-derived tables orders never populate — `financials:137-154` reads `stripe_transfers` (empty); `stats:82-101` comment admits orders "never populated amount_cents, so the headline read £0". Seed script writes no `orders`/`stripe_transfers`. Root cause of Bug 15. |
| **E3** | `dashboard:110` reads `artist_profiles.total_views`; `analytics/artist:77-79` counts `analytics_events`. The `total_*` counters are never maintained (public API shows all-zero for an artist with 14 placements/10 orders). Root cause of Bug 13. |
| **E4** | One purchase fires **2 emails to the customer, 3 to the artist** (legacy + new templates, distinct idempotency keys, no dedupe). Comment at `stripe:414-417` admits both fire "for backwards compatibility". |
| **E5** | Two parallel email systems. Legacy `lib/email.ts` (contact, enquiry, refund-request, curation, venue-registration, venue→artist placement) sends from unverified `notifications@`, with **no suppression, preference, unsubscribe or `email_events` logging**. |
| **E6** | **Accepted offers collect money but never pay the artist.** `offers/[id]/checkout:52-85` — plain platform charge, no `transfer_data`/`application_fee`; webhook `:117-160` marks paid and **returns at :158** before payout. No ledger row. Refunds can't reverse it. |
| **E7** | **Paid-loan subscription orphaned.** No webhook branch handles `mode:"subscription"` + `kind=paid_loan_monthly`, so `placements.stripe_subscription_id` is never written → dedup guard at `setup:41` can never fire and there's no Stripe idempotency key (**click twice = two live subscriptions**), and `cancelPaidLoanBilling` reads a never-populated table (**uncancellable**). |
| **E8** | Paid loan charges the venue when the artist has **no payout route** — `setup:86-89` only checks account-id presence, not `charges_enabled`. `PaymentClient.tsx:61-69` promises "we'll release it once they finish onboarding"; **no release mechanism exists**. |
| **E9** | **Multi-artist cart pays the first artist everything.** Fee from first artist's plan (`stripe:202-207`), pooled remainder (`:267`), single transfer (`:675-695`). £400 A + £600 B → A gets ~all, B gets £0. |
| **E10** | A paid offer never decrements stock / sets `available=false` (`stripe:136-156` skips the `:441-464` logic) → a 1-of-1 can be sold twice. |
| **E11** | `PAID_LOAN_V2` **off in prod**, so `invoice.payment_failed` handling is a no-op — a failing card leaves the placement "active", nobody notified. Plus `stripe:722` can stamp period-end as **1970-01-01**. |
| **E12** | Root cause of Bug 7: `ArtworkPageClient.tsx:501` `` `${selectedPricing.label}${frameLabel}` `` coerces a missing label to `"undefined"`; `normaliseSize` only rescues blank strings. |
| **E13** | `revenue_share` labelled 3 ways — "Revenue-share loan (QR-enabled)" / "Revenue share" / "Revenue Share (30%)" — from 3 sources; **two of them on `/spaces` simultaneously**. Canonical label wrongly calls it a "loan". |
| **E14** | `PlacementDetailClient:516-529,553-560` hand-rolls labels and raw-capitalises status instead of `normaliseStatus` → a **`paused` placement reads "Paused" on detail, "Completed" in the portal**; `sold` badge colour differs. |
| **E15** | Unguarded plurals — "1 artists" / "1 works" (`browse:1555-1556`, `collections:131`), "1 venues" in two email templates. `labelForArrangement("mixed")` → "Other arrangement". |
| — | **Currency is clean:** GBP enforced via `Intl.NumberFormat("en-GB")`; no USD leaks. |

---

## Part 3 — Full codebase review (titles only; bodies lost with `/tmp`)

Verified titles as recorded. **Fixes for all of these are fully specified in the remediation spec** (see its traceability matrix, §7).

| # | Title |
|---|---|
| E16 | Subscription gating flag-disabled in production — paid tiers unenforced *(now resolved: GATING_V1 live)* |
| E17 | `GET /api/artwork-requests/[id]` — no auth, leaks private brief + all competing bids |
| E18 | `GET /api/artwork-requests/[id]/responses` — no auth, leaks competing offers |
| E19 | `POST /api/orders` completely unauthenticated — forge "confirmed" orders |
| E20 | `PATCH /api/placements` — a declined/cancelled placement can be force-activated |
| E21 | `PATCH /api/orders` — seller self-attests delivery to release escrow early |
| E22 | `POST /api/artwork-requests/[id]/fulfill` — no status/idempotency gate → duplicate payable artifacts |
| E23 | Other authz/state gaps + a systemic demo-guard gap |
| E24 | `customer_profiles` has RLS **disabled** — anon key can read/write every customer's name + email |
| E25 | `message-attachments` storage bucket is **public** — cross-user DM attachment reads |
| E26 | Any authenticated user can read all venue PII directly |
| E27 | `placement_record_versions` RLS disabled — anon-readable private commercial terms |
| E28 | Non-admin can self-publish blogs via RLS, bypassing admin moderation |
| E29 | DB integrity gaps — idempotency NULL holes, no `amount > 0` checks, silently-skipped FKs |
| E30 | Two admin gaps — unaudited application decisions + a fragile client-only-gated admin surface |
| E31 | Any authenticated user can read **any private conversation** (deterministic ID) |
| E32 | Any artist can overwrite/hijack another artist's artwork (write IDOR) |
| E33 | Any authenticated user can accept/decline any placement via a message |
| E34 | Venue takeover via self-asserted `venue_slug` metadata |
| E35 | Captcha + rate-limiting advisory only; admin `user_type` is **self-settable** |
| E36 | Two open redirects + spoofable rate-limit key + user enumeration |
| E37 | Payout legs can vanish silently; failed transfers are terminal (never retried) |
| E38 | Payout capability not gated on `payouts_enabled`; plan mapping silently falls back to the 15% fee |
| E39 | `/api/checkout/session` unauthenticated → cross-customer PII disclosure |
| E40 | Order-creation robustness gaps (unpaid sessions, id collisions, referral double-credit, refund TOCTOU) |
| E41 | Artist profile + portfolio saves show "Saved" but **drop the write** (data loss) |
| E42 | Venue profile toggles that persist nothing + input corruption |
| E43 | More silent no-op / false-success actions |
| E44 | `PUT /api/artist-profile` mass-assignment → **self-approve past moderation + self-grant Pro tier** |
| E45 | `PUT /api/venue-profile` mass-assignment → set `user_id`/`slug`, no validation |
| E46 | Other validation gaps (prices, ToS forgery, free frames, private-request injection) |

### 🔴 NEW — found while re-deriving E24–E29 (2026-07-11). Not in the original 61.

**B1 — Bootstrap RLS policies grant every authenticated user read access to whole tables.** Verified first-hand in `website/supabase-tables-migration.sql` (and mirrored in `supabase-all-migrations.sql`, `supabase-admin-migration.sql`):

| Line | Policy | Effect if live |
|---|---|---|
| `:59` | `"Authenticated can read orders" ON orders FOR SELECT USING (auth.role() = 'authenticated')` | **Any signed-up user reads EVERY order** — customer names, addresses, amounts |
| `:75-76` | `"Authenticated can read messages"` **+ `"...can update messages"`** ON `messages` | **Any user reads AND EDITS every private DM** |
| `:43` | `enquiries` SELECT | All enquiry content |
| `:27` / `:14` / `:119` | `contact_submissions`, `waitlist_signups`, `venue_registrations` SELECT | All submitted PII |
| `supabase-admin-migration.sql:42` | `artist_applications` SELECT | Every applicant's details |

These sit on the **anon key path**, so they don't need an app route at all — a logged-in user with the public anon key can query the tables directly. If live, this is **strictly worse than E31** (which needed a guessable conversation id) and supersedes it in severity.

**✅ VERIFIED IN PROD 2026-07-11** (queried `uwkuhygwvasdzwsusiym` directly via `pg_policies` + `get_advisors`). Result is mixed — the two worst are already fixed, five lesser leaks remain live:

**FIXED (the scary part of B1 is NOT live):**
- `orders` → single policy `orders_select_party`, correctly scoped to `buyer_user_id OR artist_user_id OR venue-of-placement OR buyer_email OR service_role`. No blanket read.
- `messages` → `messages_select_party` (sender/recipient only), `messages_update_recipient` (recipient only), `messages_insert_self`. The dangerous read+**write**-for-any-authenticated policies were replaced. **B1 as originally feared (any user reads orders / reads+edits DMs) is NOT live.**

**STILL LIVE — any authenticated user can read the entire table (PII lists):**
| Table | Live policy | Exposed |
|---|---|---|
| `artist_applications` | `"Authenticated users can read applications"` SELECT `auth.role()='authenticated'` | every applicant's name, email, portfolio |
| `contact_submissions` | `"Authenticated can read contact"` | all contact-form PII |
| `venue_registrations` | `"Authenticated can read venue reg"` | all venue registration details |
| `waitlist_signups` | `"Authenticated can read waitlist"` | all waitlist emails |
| `enquiries` | `"Artists can read their enquiries"` with `USING (true)` | **all** enquiries — this permissive policy is OR'd with the correct owner-scoped one, so it wins |

Severity: **high** (PII lists on the anon-key path, exploitable by any signed-up account) — but **not critical**, because no order, message, or financial data is exposed. Downgraded from the original B1 framing.

**⚠️ The Supabase linter does NOT catch these.** `get_advisors(security)` flagged none of the five — its `rls_policy_always_true` lint deliberately skips `SELECT USING(true)`, and these are `auth.role()='authenticated'`, which it doesn't test at all. Manual review was required to find them; do not rely on the advisor for this class.

**Fix:** replace each with an owner/party-scoped `SELECT` policy (applicants/enquiries/contact are effectively admin-only reads → restrict to service-role + admin). Sequencing trap still applies: `artist_applications` reads/inserts flow through specific roles — change the app's insert path in the same migration (see `implementation/02`). Verification query for after the fix:
```sql
select tablename, policyname, cmd, qual from pg_policies
where schemaname='public' and cmd='SELECT'
  and qual = '(auth.role() = ''authenticated''::text)';  -- must return 0 rows
```

**Other confirmed prod facts:**
- `customer_profiles` and `placement_record_versions` **do not exist in prod** → E24 and E27 are **latent, not live**. Confirmed.
- ~19 tables have RLS enabled with **no policy** (`email_events`, `analytics_events`, `purchase_offers`, `moderation_queue`, `admin_audit_log`, `commissions`, `artwork_requests`, …). This is **deny-by-default and safe** for anon/authenticated — those tables are reachable only via the service-role (the app). Not a leak, but it confirms the entire model rests on the app-layer authz (CC1).
- `terms_acceptances` has `INSERT WITH CHECK (true)` for anyone → confirms the **E46 ToS-forgery** finding at the DB level.
- **Leaked Password Protection is disabled** (advisor WARN) — confirms the launch-prep toggle; enable it.

**B2 — The base schema exists, but outside `supabase/migrations/`.** Seven un-numbered files (`supabase-all-migrations.sql`, `supabase-tables-migration.sql`, `supabase-admin-migration.sql`, `supabase-rls-fix.sql`, …) bootstrapped prod. They are not in the migration sequence, so the numbered migrations alone never describe the real schema — which is why RLS state was unverifiable. *(Corrects K11: a base schema exists; it just isn't tracked.)*

**B3 — `EXCEPTION WHEN others THEN NULL` hid failed FK adds.** `012:23-39` wraps two FK additions in a handler that swallows `foreign_key_violation`, so the migration reported success while possibly adding neither constraint — and the repo cannot tell you which.

**Correction to E24:** `customer_profiles` RLS-disabled appears to be **latent, not live** — the table was likely never created in prod (`api/account/preferences/route.ts:15-22`, `050:10-17`). Still fix it, but it drops below B1 in priority.

### ❌ E1 IS REFUTED FOR PRODUCTION — emails ARE sending

**`email_events`: 238 sent, 1 render_failed, and `skipped_no_api_key` = 0.** First send 2026-04-29, **most recent 2026-07-29** (today). `RESEND_API_KEY` is configured and Resend is live. **My headline email finding — "every email silently no-ops in production" — is WRONG.** `OUTSTANDING.md`'s "blocking all sends" is stale documentation, not current reality. 41 distinct templates have delivered, including `venue_weekly_digest:38`, `offer_received:12`, `placement_scheduled:12`, `subscription_renewal_receipt:12`, `customer_order_receipt:6`.

The `send.ts` silent-`ok:true` design flaw is still real and still worth fixing (it would hide a future outage), but it is **not** currently causing an outage. Drop CC5's "provision Resend" from the critical path.

### 🎯 THE KNOWN "ARTIST GETS NO EMAIL WHEN WORK SELLS" BUG — CONFIRMED, WITH THE REAL MECHANISM

Hard data: **zero** emails matching `artist_order_*` / `artist_work_sold` have **ever** been sent, while `customer_order_receipt:6` went out over the same period. So the buyer is emailed and **the artist is never told they sold anything** — and it is *not* an infrastructure problem (238 other emails delivered fine). The artist-side trigger in the order path never fires, or its template binding fails to resolve. **This is a code bug in the webhook/lifecycle artist branch — fix it there, not in provisioning.** (`implementation/09-emails.md` §C owns the de-duplication; this is now its highest-priority item.)

### 💸 E6 HAS REAL VICTIMS — two paid offers, no orders, no payouts

`purchase_offers` contains **`paid:2`**: `off_1778` **£33** and `off_1779` **£27**, both for artist **`fin-coles`**, paid May 2026. And:
- `orders` created from offers: **0** — no order row exists for either payment
- `stripe_transfers`: **0 rows** platform-wide

So two customers paid **£60 total**, no order record was written, and the artist was never paid. E6 is not theoretical — it has already happened twice in production. **Reconcile these two payments against Stripe manually and pay `fin-coles` out of band.**

### 🗄️ PROD DATABASE VERIFICATION (2026-07-11, queried `uwkuhygwvasdzwsusiym` directly)

**T10 curation — CONFIRMED BROKEN IN PROD.** The live constraint is `CHECK ((tier = ANY (ARRAY['single_wall','full_space','bespoke'])))`. `managed_monthly` / `managed_quarterly` **cannot be inserted**. Corroborated by data: `curation_requests` contains only `single_wall:2` rows — zero managed rows have ever been created. **Both managed tiers (£79.99/mo, £199.99/qtr) are unsellable while the marketing pages advertise live CTAs.** No longer UNCONFIRMED.

**🎯 Bug 15 root cause — DEFINITIVE, and better than my earlier explanation.** `orders` has **no `amount_cents` column** (columns are `subtotal, shipping_cost, total, …`). `api/admin/stats/route.ts:48` runs `.select("total, amount_cents, status, created_at")` → PostgREST rejects the unknown column → `ordersAll.data` is `null` → `(ordersAll.data || [])` yields `[]` → **gross sales £0.00, orders 0**. That is exactly what I saw live. My earlier "reads a different table" account was incomplete: the query **fails entirely and the failure is swallowed**. ⚠️ **The `amount_cents ?? total*100` fallback in this branch does NOT fix it** — the SELECT itself errors before any row is seen. The fix is to stop selecting the non-existent column.

**💸 `stripe_transfers` is EMPTY — 0 rows against 12 orders.** No payout has *ever* been ledgered in production. This is the hard confirmation of E6/E37 and of the admin's "No earnings yet": the transfer ledger has never functioned. Any artist paid so far was paid outside this system, or not at all. **Verify against the Stripe dashboard whether transfers exist there but not in the DB** (silent ledger-write failure, E37) or whether no payout ever occurred.

**E29 — confirmed precisely.** `stripe_transfers` constraints are **PK only**: no `amount_cents > 0` CHECK. There *is* `UNIQUE (order_id, recipient_user_id)` — but `recipient_user_id` is **NULLABLE** and btree treats NULLs as distinct, so **two NULL-recipient rows bypass the unique guard**. The E29 "NULL hole" is real.

**E25 — CONFIRMED LIVE.** `storage.buckets`: `message-attachments = public:true`. Private DM attachments are world-readable by URL. (`contracts` and `wall-photos` are correctly private; `avatars`, `artworks`, `collections`, `wall-renders` are public, which is intended for the first three — **`wall-renders` should be reviewed**.)

**E34 — LATENT, not live.** `venue_profiles.user_id` is **NOT NULL**, so there are no orphan venues to adopt. Deprioritise.

**`admin_users` does NOT exist in prod.** So the live admin predicate reduces to `user_metadata.user_type='admin' AND email ∈ ADMIN_EMAILS`. This **confirms launch-prep is factually correct** — without the metadata stamp, admins are locked out today. Ship the predicate fix (drop the metadata conjunct) *before* deploying, then no stamping is needed.

**Data hygiene / GATING_V1 fallout confirmed:** artist subscription statuses are `active:2, none:10, canceled:2`. Three plan/status mismatches exist: `maya-chen-demo` (plan=pro, status=none — the demo profile the launch note flagged), `mark-smith` (core/canceled), `sam-test` (core/canceled).

**Useful for T9:** `orders` already has `fulfilment_method`, `collection_address`, `collection_notes` — collect-from-venue has partial schema support already.

### 💰 TRANSACTION ROUTE VERDICT (full audit, 2026-07-11)

Against the mandate *"every transaction route works PERFECTLY"* — **no route is currently OK as-is; every one needs at least one fix.**

| Route | Verdict | Headline defect |
|---|---|---|
| T1 Buy Now (single artist) | ⚠️ At risk | Bug 7/8/10, E40 |
| T2 Buy Now (multi-artist cart) | ❌ **Broken** | E9 — first artist paid everything |
| T3 Offers | ❌ **Broken** | **E6** — money taken, artist never paid, no ledger row, no email |
| T4 Placement request/accept | ⚠️ At risk | E20/E21/E23/E33 authz + state |
| T5 Revenue-share QR | ⚠️ At risk | Venue share timing never verified |
| T6 Paid loan | ❌ **Broken** | E7/E8/E11 — orphaned, double-billable, uncancellable, funds trapped |
| T7 Subscription | ⚠️ At risk | E40 epoch bug; no start email |
| T8 Refunds | ⚠️ At risk | Can't reverse T3/T6 (no `stripe_transfers` rows) |
| T9 Collect from venue | ❌ **Never built** | N1/N2 |
| T10 Curation | ❌ **Broken** | Schema/API mismatch — see below |

**T10 curation — first-ever audit, and it's unsellable.** Verified in-repo: migration `013:18` declares `tier TEXT NOT NULL CHECK (tier IN ('single_wall','full_space','bespoke'))` and **no later migration widens it**, yet `api/curation/route.ts:28` accepts `managed_monthly`/`managed_quarterly` and `:100` inserts them. The insert violates the CHECK → the route 500s. **Both managed tiers (£79.99/month and £199.99/quarter) cannot be sold while the marketing pages advertise live CTAs.**
*(Marked UNCONFIRMED against production — several migrations were applied by hand, so prod may differ. Verify with `select pg_get_constraintdef(oid) from pg_constraint where conname like '%curation%tier%';`)*

Cascade of further curation defects: the error path **deletes a row whose Stripe session is still live and payable** (money taken, no record); a subscription id is written into `stripe_payment_intent_id`, so **no refund path can work**; managed subs have **no `invoice.paid` / `payment_failed` / `subscription.deleted` handling**, so a cancelled sub stays `in_progress` forever; the quarterly interval is decorative and unvalidated; no admin is notified when money lands; and `/curated/success` asserts "Payment received" without checking anything.

**Further payment defects found beyond the briefed set:**
- `.single()` on the artist profile lookup **silently zeroes the payout**
- An unknown Stripe price id **silently downgrades an artist to `core`**, tripling their platform fee
- The `subscription.deleted` stale guard `return`s from the whole handler, **skipping the paid-loan reconciler**
- `POST /api/orders` is order forgery **and** an order-id squatting vector

**Prerequisite for all payout work (C3):** `scheduleTransfer` must **throw** instead of swallowing the ledger insert error — otherwise every other payout fix is unverifiable.

### 🔺 Severity UPGRADES found while re-deriving (2026-07-11)

**E32 → CRITICAL (artwork theft + revenue redirection).** The IDOR is not in the route, it's in `src/lib/db/artist-works.ts:22-33`. `upsertWork` probes for an existing row by `id` **alone** and updates by `.eq("id")` **alone**, while the row it writes carries the *caller's* `artist_id`. One POST containing a victim's work id **rewrites their artwork and reassigns ownership to the attacker**. Because checkout attributes the seller from the profile slug, the stolen listing then **pays the attacker**. `deleteWork`, twelve lines below, *is* correctly scoped — so the pattern was understood and simply not applied here.

**E31 → enumerable, not merely exploitable.** Conversation IDs are `dm-<slugA>__<slugB>`, derived from two **public** artist slugs. An attacker doesn't need to guess or intercept an id — they can compute every conversation id in the platform from the public artist directory and read the lot.

**E23 → the demo guard is decorative.** `assertNotDemo` has **zero call sites**. The only greps that hit it are doc comments claiming it is wired up. Every "demo accounts can't mutate real data" protection is currently imaginary.

**Sequencing trap for E17.** The artist-portal page calls `/api/artwork-requests/[id]` with plain `fetch`, not `authFetch`. Adding the auth check to the route **breaks the page** unless both land in the same PR.

**E44 → CONFIRMED, and it is the keystone.** `api/artist-profile/route.ts:42` does `const updatePayload: Record<string, unknown> = { ...body };` → `lib/db/artist-profiles.ts:113` `.update({ ...data, updated_at })` on the **service-role** client (RLS bypassed; only `.eq("user_id", userId)` constrains it). One request with the attacker's own valid token:

```json
{"review_status":"approved","subscription_plan":"pro",
 "subscription_status":"active","is_founding_artist":true}
```

`subscription_status` is the column `isSubscribed()` reads, so this defeats **every** paid gate at once; `subscription_plan` raises the work cap 8→50; `is_founding_artist` converts a 30-day trial into 180 (`subscribe/route.ts:79`). The Stripe webhook is otherwise the only writer of these columns. **It also writes `stripe_connect_account_id`** — the payout `transfer_data.destination` — which is a KYC bypass.

**🔗 Attack chain (E32 + E44):** steal a victim's listing via `upsertWork` (E32) → the listing now attributes to the attacker → set your own `stripe_connect_account_id` via E44 → **the victim's artwork sells and pays the attacker**, with no KYC. Fix both together.

**E16 → REFUTED as written.** `GATING_V1` enforcement **is** server-side, in six places (`artist-works:48,156`, `placements:322,807`, `messages:341`, `merged-data:35`), all reading the DB via `isSubscribed()`. But E44 writes the exact column those gates read — **so fixing E44 is what makes gating real.**

**Scope is contained:** a sweep of all 119 API routes found only **two files / three methods** that spread the request body — `artist-profile` PUT and `venue-profile` PUT+PATCH. Everything else builds payloads from named fields, and no zod schema uses `.passthrough()`.

**E19 → delete, don't fix.** `POST /api/orders:329` has no auth and inserts `status:"confirmed"` orders — and it is **dead code**. Remove the route rather than adding authorization to it.

### 🪢 UNKNOT RESULTS — 11/11 knots confirmed, **27 new duplicate pairs found**

The knot does **not** announce itself: nothing in `src/` is named `-v2`, `legacy` or `deprecated`. It hides as **two sensibly-named files**. Six of the new pairs carry live defects; two outrank several of the original eleven:

**N-K1 — Two notification-preference systems; one is a lie.** `send.ts:108` reads only `email_preferences`. The columns `email_digest_enabled` and `order_notifications_enabled` are **written by all three portal settings pages and read by nothing**. A user who turns off order notifications still gets them. (User-facing false promise; also a consent-record problem.)

**N-K2 — Two `parseDimensions` that disagree, both imported by the same file.** They differ on orientation and rounding (A4 = 21×30 vs 21×29.7) and are **both called from `ArtworkPageClient.tsx:17-21`**. This is the shared mechanism behind **Bug 7 *and* Bug 8** — fixing either symptom without collapsing this pair only fixes one surface.

**N-K3 — Six diverged venue-type vocabularies.** A venue that signs up as "Café / Coffee Shop" can **never** match the browse filter's "Cafés". Core marketplace matching is silently broken by vocabulary drift.

Also: `assertNotDemo` has **zero call sites** repo-wide (independently confirmed twice); a dead `src/lib/shipping.ts` whose `detectCarrier` is the name people will grep for; and **all five feature flags have both branches live**.

**Corrections the code forced:**
- **K5 — the `total_*` counters are NOT dead.** `lib/stats-cache.ts:51-59` writes them, but its only caller is the manual `POST /api/admin/refresh-stats`, which is **absent from `vercel.json`'s nine crons**. So they are write-once-by-accident and **stale by construction**. "Drop the dead columns" would have been the wrong fix — `artist-profiles-transform.ts:141-144` exposes them publicly. Correct fix: schedule the refresh, or read live.
- **K3 has four label sources**, not three, plus two duplicated ladders inside `api/placements/route.ts`.
- **K9 quantified:** 119 route files, **103 hold a service-role client, only 73 identify the caller** — the **30-file gap is the IDOR cluster**.

### ✏️ CORRECTIONS to my own live-test findings (2026-07-11)

**Bug 4 — I misdiagnosed this. The price sort is not broken; the layout is.** The comparator at `browse/page.tsx:1061-1076` is **correct**. The scrambling comes from the **masonry round-robin at `:2409-2411`**, which deals an already-sorted list into 2–3 unequal-height columns — which is exactly why I saw the repeating `[30,30,30,30,30,40,60]` pattern (I was reading down a column-interleaved DOM, not the sort order). It is a layout bug wearing a sorting bug's clothes. **Fix the masonry dealing, not the comparator.**


**Bug 12 — my report was partly wrong; `BLOGS_V1` does NOT explain it.** The flag gates only the API (`api/blogs/route.ts:84`, `[id]/route.ts:100` → 403), and `BlogEditor.tsx:126-131` *does* check `res.ok` and render "Save failed" via `describeSaveError`. So the flag path produces **one visible request and a visible error** — the opposite of what I observed. The literal "Saved with zero requests" symptom is now **UNCONFIRMED**: nothing sets `saving="saved"` without a 2xx. The one code path that produces zero requests is `authFetch` throwing inside `supabase.auth.getSession()` *before* `fetch` runs (`api-client.ts:8`) — which is plausible given I was hitting session problems in that same browser session (see Bug 14). **The real, confirmed defect here is different and still serious:** there is **no client-side gate at all**, so in production every artist sees a Blogs nav item and a fully interactive editor whose every save 403s.

**Bug 14 — root cause confirmed, and it explains the exact asymmetry I saw.** `login/page.tsx:75` awaits `signIn()` with **no try/catch**. supabase-js *returns* auth errors but *rejects* on transport failure; the rejection escapes, so `setLoading(false)` never runs and `disabled={loading}` leaves the button **permanently inert**. `element.click()` on a disabled button is a silent no-op, while `form.requestSubmit()` bypasses the button entirely — precisely the behaviour I reported. The success path (`:86`) also deliberately never resets `loading`. Fix: try/catch/finally + a re-entry guard. *(Secondary: `CookieBanner.tsx:22-24` is `opacity-0` without `pointer-events-none` for 300ms, so it can swallow clicks.)*

**E41 → worse than titled. This is the worst data-loss path in the app.** `artist-portal/portfolio/page.tsx:404` `saveWorks()` **re-POSTs the artist's entire portfolio on every edit**, never awaits or checks any response, and **strips `pricesBySize`** — while the caller clears the dirty snapshot and toasts "Artwork updated" synchronously. **A single price tweak can silently damage every work the artist owns.** Runner-up is server-side: `lib/db/venue-profiles.ts:54-95` silently strips seven columns (including `images`) and still returns `{success:true}`.

**Scale of the false-success class:** 24 confirmed false-success or dead controls across the three portals plus the public artist page (14 verified safe, 16 unverified). Full inventory with file:line in `implementation/05`.

### ✉️ Email corrections

- **`OUTSTANDING.md`'s "113 built / 50 wired / 63 outstanding" is stale.** Actual: **123 template files, 122 registry entries, 66 wired.**
- **Dispute templates already exist and are registered.** The real gap is that **nothing anywhere creates a dispute row** — so `/api/disputes` is a *feature build*, not an email-wiring task. (Corrects my earlier "no template exists".)
- **17 live legacy-module call sites** across 11 route files, plus 3 dead references and 7 test files mocking it.
- **Only 5 of 61 send call sites inspect the result** — so the E1 "fail loud" fix must come from a boot assertion + health route, not from caller error branches.
- **Minimum MVP set: 32 templates** (order lifecycle 9, refunds/disputes 5, payouts 4, subscriptions 5, placements 5, auth 3, support/applications 5, messages 1). 11 need building; 57 stay deliberately unwired.

### 🔴 NEW — surface/security items found during the cull audit

**B4 — `/email-preview` is unauthenticated in production.** `src/app/email-preview/page.tsx:6` carries a comment about restricting it in production, but no auth check exists; the only "protection" is a robots.txt disallow. It renders the internal email template library to anyone who knows the URL. 243 LOC. **Cut it, or gate it to admin + non-prod.**

**B5 — `BLOGS_V1` is off in prod, but the nav links to `/blog` and `/artist-portal/blogs` are unconditional** — so artists navigate to a live editor and hit a 403 on save. (Interacts with Bug 12; see `implementation/05` for whether the flag fully explains that bug's *zero-request* false "Saved".)

**B6 — Two parallel feature-request systems.** The live path is `FeedbackBubble` → `/api/moderation`; the `/feature-requests` page + 2 API routes (366 LOC) have **zero inbound links**. A new knot (K12a).

**B7 — Two visualizer implementations, both imported into the highest-traffic page.** `ArtworkPageClient.tsx:11-13` imports the legacy `WallVisualiser` **and** the new `CustomerWallSheet`, switched by `isFlagOn("WALL_VISUALIZER_V1")` at `:62`. A new knot (K12b) — and it means the visualizer is **not cleanly cuttable**, it is coupled into the core artwork page.

**Correction to my earlier sizing:** the visualizer is **~14,000 prod LOC**, not the ~7,400 I estimated — my recon omitted `src/components/visualizer/*` (5,230 LOC, **zero tests**) and the showroom. It is also **flag-ON in production**. This materially raises both the cost of keeping it and the risk of cutting it.

**Correction on Curated:** it is **five Stripe tiers up to £199.99/quarter recurring**, not a single £49 upsell — so T10 is a *recurring* payment path that has never been audited. Raise its priority accordingly.

### New items from the launch-prep track (not in the original 61)

| # | Title |
|---|---|
| N1 | Collect-from-venue: `placed_at_venue` is work-level with no size attached, but the option renders per selected size |
| N2 | Collect-from-venue: checkout hard-defaults to "ship"; the cart carries no venue-collection intent, so the choice is silently dropped |

---

*Index compiled 2026-07-11. Full remediation in `2026-07-11-stress-test-remediation-spec.md`.*
