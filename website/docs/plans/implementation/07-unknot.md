# 07 Unknot: one implementation per concept

**Created:** 2026-07-29
**Owner problem, verbatim:** *"I feel like the code is knotted as a lot of changes we make break other features that weren't meant to be affected."*
**Parent docs:** `../2026-07-11-MASTER-RUNBOOK.md` (Phase 6), `../2026-07-11-stress-test-remediation-spec.md` §15 (K1–K11), `../2026-07-11-stress-test-findings.md` (E-numbers).

---

## 0. The diagnosis, confirmed

The codebase does not have a "quality" problem. It has a **parallelism** problem. For eleven separate concepts there are two live implementations, usually shaped as "legacy + new, both wired". Nobody deleted the first one when the second landed. So:

- A change to the new path leaves the old path untouched, and the old path is still what some routes call.
- A change to the old path leaves the new path untouched, and the new path is what other routes call.
- Neither has a test asserting the other does not exist.

That is precisely the mechanism the owner is describing. "Changes break features that weren't meant to be affected" is what a divergent duplicate feels like from the outside.

**Every one of the eleven knots is confirmed in the code.** Evidence is `file:line` on both sides throughout.

A parallel sweep for *unlisted* duplicates found **27 more true duplicate pairs**, catalogued in §13. Six of them carry a live defect today. Two are worse than several of the original eleven: a **second, entirely separate notification-preference system** whose toggles are written by the UI and read by nothing (§13.1), and **two `parseDimensions` implementations that disagree about orientation and rounding, both called on the same page** (§13.2). The eleven knots were the ones visible from the stress test. They are not the whole knot.

### 0.1 The rule this document exists to install

> **New implementation ⇒ old implementation deleted in the same PR.**
>
> If a PR adds a second way to do something that the codebase already does, that PR must delete the first way. Not deprecate it, not comment it, not `void` it, not leave it behind a flag. Delete it, migrate every call site, and land it as one change.
>
> If the old path genuinely cannot be deleted in the same PR, the PR does not merge. Split the work differently, or put the new implementation behind the old one's interface so there is still only one entry point.

This is already stated as invariant 3 in the master runbook §2. This document makes it enforceable: §14 specifies the lint rules, dependency-cruiser rules and CI checks that make a violation fail the build rather than rely on reviewer memory.

### 0.2 Verification status at a glance

| Knot | Concept | Status | Blocks transactions? |
|---|---|---|---|
| K1 | Sending email | **CONFIRMED**, 15 live legacy functions, 12 route files | **Yes** |
| K2 | Paid-loan billing | **CONFIRMED**, two incompatible fee models | **Yes** |
| K3 | Arrangement labels | **CONFIRMED**, 4 sources, not 3 | No |
| K4 | Placement status display | **CONFIRMED**, `PlacementDetailClient.tsx:552-561` | No |
| K5 | Artist stats | **CONFIRMED with correction**, counters are *written*, but only by a manual admin endpoint. See §5. | No |
| K6 | Platform revenue | **CONFIRMED**, three different revenue definitions | No |
| K7 | Order emails | **CONFIRMED**, 2 customer + 3 artist emails per purchase | **Yes** |
| K8 | Demo personas | **CONFIRMED**, root cause is `merged-data.ts:26` | No |
| K9 | Authorization | **CONFIRMED, count corrected**, 119 route files, 103 use the service-role client | Indirectly |
| K10 | Migration numbering | **CONFIRMED**, exactly 4 collisions, no others | No |
| K11 | No base schema | **CONFIRMED**, 73 migrations, 0 baselines, and a documented prod 500 | No |
| §13 | **27 unlisted duplicate pairs** | **NEW**, found during verification; 6 carry a live defect | 2 of them |

---

## 1. K1: Two email systems

### 1.1 Evidence

**Implementation A (legacy):** `website/src/lib/email.ts`, 16 exported functions, 574 lines.
- `:11`, `const FROM = "Wallplace <notifications@wallplace.co.uk>"`. Hardcoded, unverified sender.
- `:4-8`, its own private `Resend` client, instantiated separately from the pipeline's.
- Every function follows the same shape: `getResend()`, `if (!resend) return`, `await resend.emails.send({...})`, `catch { console.error }`.
- **No** suppression check, **no** notification-preference check, **no** unsubscribe header, **no** `email_events` row, **no** idempotency key. A resend of the same event sends a second email.

**Implementation B (pipeline):** `website/src/lib/email/send.ts`
- `:64`, `export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult>`
- Does idempotency-keyed inserts into `email_events`, suppression, category preferences, stream routing (`website/src/lib/email/streams.ts`), category taxonomy (`website/src/lib/email/categories.ts`).
- `website/src/lib/email/dispatcher.ts:92` `sendTransactional()` layers the template registry on top.

There is no code path where A does something B cannot. A is strictly worse.

### 1.2 Which survives

**`src/lib/email/send.ts` survives. `src/lib/email.ts` is deleted outright.**

Reason: B has the audit trail, the suppression list and the verified-domain routing. A sends from an unverified address, which is the direct cause of finding E1/E5 (mail silently not delivered, no record that it was attempted). There is nothing to salvage from A except the copy, which moves into React Email templates under `src/emails/templates/`.

`confirmApplicationToArtist` (`src/lib/email.ts:49`) has **zero call sites**, it is deleted with no replacement.

### 1.3 Every call site to migrate

15 live functions across 12 route files, plus 8 test mocks. Exhaustive:

| Legacy fn | Call site (`file:line`) | Target template |
|---|---|---|
| `notifyAdminNewApplication` | `src/app/api/apply/route.ts:6` (import), `:211` | new admin template, category `platform_admin` |
| `confirmApplicationToArtist` | **none, dead** | delete |
| `notifyAdminNewEnquiry` | `src/app/api/enquiry/route.ts:4`, `:37` | new admin template |
| `notifyAdminNewContact` | `src/app/api/contact/route.ts:4`, `:36` | new admin template + sender ack (CC5 gap) |
| `notifyNewMessage` | `src/app/api/enquiry/route.ts:4`, `:65-70` | `messages/MessageUnreadNotification.tsx` |
| `notifyPlacementRequest` | `src/app/api/placements/route.ts:10`, `:582-590`; `src/app/api/messages/route.ts:10`, `:489-497` | `placements/VenueNewPlacementRequest.tsx` |
| `notifyPlacementResponse` | `src/app/api/placements/route.ts:10` (import only; `:1665` comments it out); `src/app/api/messages/route.ts:10`, `:521-526` | `placements/*` response template |
| `notifyAdminNewVenue` | `src/app/api/register-venue/route.ts:5`, `:59-65` | new admin template |
| `notifyArtistNewOrder` | `src/app/api/webhooks/stripe/route.ts:5`, `:615` (**`void notifyArtistNewOrder;`, already a no-op**) | delete, superseded by K7 |
| `notifyBuyerStatusUpdate` | `src/app/api/orders/route.ts:4`, `:246` | `orders/Customer*` status templates |
| `notifyVenueOrderFromPlacement` | `src/app/api/webhooks/stripe/route.ts:5`, `:634` | new venue-sale template |
| `notifyRefundRequested` | `src/app/api/refunds/request/route.ts:4`, `:155-164`, `:183-190` (**two call sites**) | `orders/ArtistRefundNotification.tsx` |
| `notifyRefundDecision` | `src/app/api/refunds/process/route.ts:6`, `:134-139`, `:305-310` (**two call sites**) | `orders/CustomerRefundConfirmation.tsx` |
| `notifyAdminCurationRequest` | `src/app/api/curation/route.ts:5`, `:127-136` | new admin template |
| `notifyCurationCustomerEnquiry` | `src/app/api/curation/route.ts:5`, `:140-145` | new curation template |
| `notifyCurationCustomerPaid` | `src/app/api/webhooks/stripe/route.ts:5`, `:102-108` | new curation-paid template |

**Test mocks that must be updated in the same PRs** (they mock `@/lib/email`, so deleting the module makes them fail):
- `src/app/api/apply/route.test.ts:78`
- `src/app/api/messages/route.test.ts:34-36`
- `src/app/api/refunds/request/route.test.ts:28-29`
- `src/app/api/refunds/process/route.test.ts:27-28`
- `src/app/api/orders/route.test.ts:15`, `:20`, `:180`, `:227-231`, `:282`
- `src/app/api/webhooks/stripe/route.test.ts:43-46`
- `tests/integration/stripe-webhook.test.ts:30-33`

### 1.4 Collapse procedure: build green at every step

Six PRs. Each one is independently revertable, and after each the whole suite passes.

**Step 1 `K1a`: delete dead legacy email export**
Delete `confirmApplicationToArtist` (`src/lib/email.ts:49-76`). No call sites, no test changes. Proves the tooling works before touching anything live.
*Green because:* nothing referenced it.

**Step 2 `K1b`: migrate the admin-notification group**
Routes: `apply`, `contact`, `enquiry`, `register-venue`, `curation`. Five templates to add under `src/emails/templates/` + registry entries. Replace each call with `sendEmail({ idempotencyKey, template, category: "platform_admin", to: ADMIN_EMAIL, subject, react })`. Delete the five functions from `src/lib/email.ts` and the imports. Update `apply/route.test.ts:78`.
*Green because:* these are admin-only informational emails; no user-visible behaviour depends on their transport.

**Step 3 `K1c`: migrate the placement group**
`notifyPlacementRequest`, `notifyPlacementResponse`, `notifyNewMessage`. Four call sites across `placements/route.ts` and `messages/route.ts`. `placements/route.ts:1665` already comments the legacy call out. Remove the dead comment and the now-unused import.
*Green after updating* `messages/route.test.ts:34-36`.

**Step 4 `K1d`: migrate the refund group**
`notifyRefundRequested` (2 sites), `notifyRefundDecision` (2 sites). Both routes already import `sendEmail` (`refunds/process/route.ts:7`), so this is swapping the call, not adding an import. Update `refunds/request/route.test.ts:28`, `refunds/process/route.test.ts:27`.
*Watch:* `orders/route.test.ts:227` asserts a *rejecting* mail helper still returns 200. Preserve that guarantee, `sendEmail` never throws by contract (`dispatcher.ts:77`), so the assertion holds, but keep the test.

**Step 5 `K1e`: migrate the order/webhook group**
`notifyBuyerStatusUpdate` (`orders/route.ts:246`), `notifyVenueOrderFromPlacement` (`stripe/route.ts:634`), `notifyCurationCustomerPaid` (`stripe/route.ts:102`), and delete the `void notifyArtistNewOrder;` line at `stripe/route.ts:615`. Update `webhooks/stripe/route.test.ts:43-46` and `tests/integration/stripe-webhook.test.ts:30-33`.
**Sequencing note:** do this *after* K7, or in the same PR as K7. Both touch the same 200-line block of `stripe/route.ts`.

**Step 6 `K1f`: delete `src/lib/email.ts`**
The file is now empty of live exports. `git rm website/src/lib/email.ts`. Add the guard from §1.6.
*Green because:* step 5 removed the last import.

**Step 7 `K1g`: collapse the duplicated email enums** (found during the §13 sweep, folded in here because it is the same module):
`EmailStream` and `EmailCategory` are each declared **twice**, with no cross-import:
- `src/emails/types/emailTypes.ts:9` (`EmailStream`) and `:13` (`EmailCategory`), what every template's `EmailShell` props are typed against
- `src/lib/email/streams.ts:8` and `src/lib/email/categories.ts:6`, the copies that carry the behaviour (`STREAMS`, `CATEGORY_RULES`)

Adding a category requires editing both, or a template silently cannot declare it. Define once in `src/lib/email/` and import from `emails/types/emailTypes.ts`. Also delete `emailTypes.ts:31 formatMoney`, a fourth currency formatter (§13.24).

### 1.5 The test that proves the duplicate is gone

`website/tests/integration/no-legacy-email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

describe("K1: one email pipeline", () => {
  it("src/lib/email.ts does not exist", () => {
    expect(existsSync("src/lib/email.ts")).toBe(false);
  });

  it("nothing imports the legacy module", () => {
    const hits = execSync(
      `grep -rn 'from "@/lib/email"' src/ tests/ || true`,
      { encoding: "utf8" },
    ).trim();
    expect(hits).toBe("");
  });

  it("only one module constructs a Resend client", () => {
    const hits = execSync(
      `grep -rln 'new Resend(' src/ || true`,
      { encoding: "utf8" },
    ).trim().split("\n").filter(Boolean);
    expect(hits).toEqual(["src/lib/email/send.ts"]);
  });
});
```

The third assertion is the one that matters long-term: it stops anyone from starting a *third* email path without noticing.

### 1.6 Guard against recurrence

**dependency-cruiser rule** in `website/.dependency-cruiser.cjs`, this is the right tool because it operates on the import graph, and there is already a precedent rule (`no-admin-client-in-client`) in that file:

```js
{
  name: "one-email-entrypoint",
  comment:
    "All outbound mail goes through src/lib/email/send.ts (suppression, " +
    "preferences, unsubscribe headers, email_events audit trail). Importing " +
    "the `resend` package anywhere else re-creates the K1 legacy split.",
  severity: "error",
  from: { pathNot: "^src/lib/email/send\\.ts$" },
  to: { path: "^resend$", dependencyTypes: ["npm"] },
}
```

`npm run depcheck` already exists in `package.json:16`. Add it to the CI `check` job (see §14.1).

---

## 2. K2: Two paid-loan billing implementations

### 2.1 Evidence

**Implementation A, destination charge via Checkout:** `website/src/app/api/placements/[id]/payment/setup/route.ts`
- `:59-94`, `stripe.checkout.sessions.create({ mode: "subscription", ... })`
- `:86`, `application_fee_percent: feePct` where `feePct = platformFeePercentForArtist(artistProfile)` (`:54`)
- `:87-89`, `transfer_data: { destination: artistProfile.stripe_connect_account_id }`
- **Fee model:** Stripe splits at charge time. The venue's card is charged, Stripe routes the net to the artist's connected account and retains `application_fee_percent` for the platform. The platform never holds the money.
- Reached from the UI at `src/app/(pages)/placements/[id]/payment/PaymentClient.tsx:24`.
- `:18` admits its own provisionality: *"scaffolded here with a 10% application fee placeholder"*.
- **Not flag-gated.** This route is live regardless of `PAID_LOAN_V2`.

**Implementation B, platform subscription + separate transfer:** `website/src/lib/placements/paid-loan-billing.ts`
- `:184` `startPaidLoanBilling()`, gated at `:188` by `isFlagOn("PAID_LOAN_V2")`
- `:261-281`, `stripe.subscriptions.create({ customer, items: [...], ... })` with **no** `transfer_data`, **no** `application_fee_percent`
- `:409`, comment: *"Trigger payout to the artist (gross venue fee minus platform cut)"*. The transfer is a **separate** call inside `handleInvoicePaid` (`:361`).
- **Fee model:** platform charges in full, holds the money, then transfers the artist's share out on `invoice.paid`.
- Writes its own ledger table `placement_recurring_billings` (`:291-310`), which implementation A never touches.
- Called from `src/app/api/placements/route.ts:1310` (accept path) and `:1330` (`cancelPaidLoanBilling`).

### 2.2 Why this is the most dangerous knot

The two paths do not merely differ in style. They differ in **who holds the money** and **which table records it**:

| | A (`payment/setup`) | B (`startPaidLoanBilling`) |
|---|---|---|
| Trigger | Venue clicks "Set up payment" | Placement acceptance, automatic |
| Stripe object | Checkout Session → Subscription | Subscription, created server-side |
| Money flow | Destination charge, split at source | Platform charge, later transfer |
| Platform fee | `application_fee_percent` on the subscription | Computed in `handleInvoicePaid` |
| Ledger | none (relies on `placements.stripe_subscription_id`) | `placement_recurring_billings` |
| Idempotency | `:41-43` guard on `stripe_subscription_id` | `:196-211` guard on the billing row |
| Flag | none, always live | `PAID_LOAN_V2` |

`PAID_LOAN_V2` is `prodDefault: false` (`src/lib/feature-flags.ts:75`) and `devDefault: true` (`:74`). So **dev and prod run different billing systems today.** The moment the flag is flipped in prod, a placement that is accepted (fires B) and whose venue then clicks "Set up payment" (fires A) produces **two live Stripe subscriptions billing the same venue for the same placement**. A's dedup guard reads `placements.stripe_subscription_id`, which B never writes; B's dedup guard reads `placement_recurring_billings`, which A never writes. Neither guard can see the other.

This is E7 + E11 in the findings, and it is the single highest-severity item in this document.

### 2.3 Which survives

**Implementation A survives** (`payment/setup/route.ts`, the destination-charge path). **`startPaidLoanBilling` / `cancelPaidLoanBilling` are deleted;** the invoice/subscription webhook handlers are **kept and rewired** to A.

Reasons, in order:

1. **Destination charges keep the platform out of the money path.** With `transfer_data.destination`, funds never sit in the Wallplace balance. That is materially better for regulatory posture, for reconciliation, and for what happens when a transfer fails, B's model can strand a payout (finding E37 documents this happening on the sales path already).
2. **A is what is live in production today.** B is flag-off in prod. Collapsing onto the live path means the migration has no production behaviour change on day one.
3. **A is 105 lines. B is 523.** Less code to keep correct.
4. The spec already made this call (`../2026-07-11-stress-test-remediation-spec.md:467`: *"pick the destination-charge path, delete the other"*).

**A third duplicate hides inside B.** `paid-loan-billing.ts:64` defines a **private `isPaidLoan`**, `new Set(["paid_loan", "mixed"])`, shadowing the canonical `src/lib/arrangement-type.ts:22`. The canonical one also classifies a legacy `free_loan` row **with a positive monthly fee** as a paid loan; the billing copy does not. So the billing module will never bill a legacy row that the rest of the app displays as a paid loan. Deleting `paid-loan-billing.ts` removes this for free, but the surviving path (`payment/setup/route.ts`) must use the canonical predicate, not re-invent a third.

**What must be carried over from B before it is deleted**, B is not strictly worse, it has three things A lacks:
- `placement_recurring_billings` ledger rows. **Keep the table**, populate it from A's webhook branch.
- `handleInvoicePaymentFailed` (`:467`) and `handleSubscriptionDeleted` (`:505`), dunning and cancellation handling. A has neither.
- `ensureVenueCustomer` + `hasAttachedCard` + the SetupIntent fallback (`:213-236`). A uses Checkout, which collects the card itself, so this is genuinely redundant under A.

### 2.4 Every call site to migrate

| Site | Current | Action |
|---|---|---|
| `src/app/api/placements/route.ts:4` | imports `startPaidLoanBilling, cancelPaidLoanBilling` | remove import |
| `src/app/api/placements/route.ts:1310` | `await startPaidLoanBilling({...})` on accept | replace with: create the `placement_recurring_billings` row in `pending` state and surface the "Set up payment" CTA. No Stripe call at accept time. |
| `src/app/api/placements/route.ts:1330` | `await cancelPaidLoanBilling(id)` | replace with a direct `stripe.subscriptions.update(id, { cancel_at_period_end: true })` keyed off `placements.stripe_subscription_id` |
| `src/app/api/webhooks/stripe/route.ts:24-26` | aliased imports of the three handlers | keep the handlers, move them out of the flag-gated module |
| `src/app/api/webhooks/stripe/route.ts:1007` | `handleInvoicePaidPaidLoan(invoice)` | rewire: **no transfer call** (destination charge already paid the artist); just stamp the ledger period |
| `src/app/api/webhooks/stripe/route.ts:1015` | `handleInvoicePaymentFailedPaidLoan` | keep, drop the flag gate |
| `src/app/api/webhooks/stripe/route.ts:1023` | `handleSubscriptionDeletedPaidLoan` | keep, drop the flag gate |
| `src/lib/placements/paid-loan-billing.test.ts:42-46` | tests all five exports | rewrite against the surviving handlers |
| `src/app/api/webhooks/stripe/route.test.ts:95-97` | mocks the three handlers | update import path |
| `src/lib/feature-flags.ts:34`, `:68-77` | `PAID_LOAN_V2` flag definition | delete once landed |

### 2.5 Collapse procedure

**Step 1 `K2a`: add the missing subscription webhook branch (prerequisite, no deletion)**
`stripe/route.ts` currently has no branch for `checkout.session.completed` with `mode: "subscription"` and `metadata.kind === "paid_loan_monthly"` (finding E7). Add it. It must:
- stamp `placements.stripe_subscription_id` (this makes A's dedup guard at `setup/route.ts:41` actually able to fire, today it never can)
- insert the `placement_recurring_billings` row
- be idempotent on `session.id`

Also add a Stripe idempotency key to `stripe.checkout.sessions.create` at `setup/route.ts:96`, derived from `placement.id`, so a double-click cannot mint two sessions.
*Green because:* purely additive. Test: a replayed webhook produces one row.

**Step 2 `K2b`: move the invoice handlers out of the flag-gated module**
Create `src/lib/placements/paid-loan-webhooks.ts` containing `handleInvoicePaid`, `handleInvoicePaymentFailed`, `handleSubscriptionDeleted`, **without** the `isFlagOn` early-returns and **without** the transfer call in `handleInvoicePaid` (destination charges already settled the artist's share). Repoint `stripe/route.ts:24-26`.
*Green because:* the flag is off in prod, so removing the gate on handlers that currently no-op changes nothing until a subscription exists, and none exist yet, because step 1 only just made them recordable.

**Step 3 `K2c`: repoint placement acceptance**
`placements/route.ts:1310` stops calling `startPaidLoanBilling` and instead writes a `pending` billing row. `:1330` cancels via `stripe.subscriptions.update`. Delete both imports.
*Green because:* under the prod flag state, `startPaidLoanBilling` already returned `{ status: "skipped" }` at `:188`, this step makes explicit what was already happening.

**Step 4 `K2d`: delete `paid-loan-billing.ts`**
`git rm src/lib/placements/paid-loan-billing.ts` and its test. Rewrite the surviving tests against `paid-loan-webhooks.ts`.

**Step 5 `K2e`: delete the `PAID_LOAN_V2` flag**
Remove from `feature-flags.ts:34` and `:68-77`. Sweep every `isFlagOn("PAID_LOAN_V2")` call site, note there are UI ones too, e.g. `PlacementDetailClient.tsx:510` (see K3), so **K3 must land before K2e** or the label branch collapses to the wrong side.

### 2.6 The test that proves the duplicate is gone

`website/tests/integration/paid-loan-single-path.test.ts`:

1. **File-absence:** `src/lib/placements/paid-loan-billing.ts` does not exist.
2. **Single subscription creator:** exactly one module in `src/` calls `stripe.subscriptions.create` or `stripe.checkout.sessions.create` with `mode: "subscription"` **for paid loans**. Assert by grep that `subscriptions.create(` appears in at most one file under `src/lib/placements/` and `src/app/api/placements/`.
3. **Double-setup is refused:** POST `payment/setup` twice for the same placement → second returns 400 `"Monthly payment already set up"`. This test **fails today** because nothing writes `stripe_subscription_id`; it passes after step 1.
4. **Flag is gone:** `FeatureFlag` union does not include `"PAID_LOAN_V2"`.

### 2.7 Guard

**ESLint rule** `eslint-rules/no-parallel-billing.js`, following the existing rule pattern (`no-ad-hoc-cap.js` is the closest precedent):

> Forbid `stripe.subscriptions.create(` and `stripe.checkout.sessions.create(` outside an allowlist of exactly the files that own a billing entry point. Message: *"Subscription creation lives in one place per product. Adding a second creator is how K2 happened."*

Allowlist starts as `["src/app/api/placements/[id]/payment/setup/route.ts", "src/app/api/subscriptions/**"]`. Adding a file to the allowlist is a deliberate, reviewable act.

Plus, per the master runbook §1, ship `tests/integration/eslint-no-parallel-billing.test.ts` that lints a fixture and asserts the rule fires.

---

## 3. K3: Four sources of arrangement labels

### 3.1 Evidence

The spec says three. There are **four**, plus a fifth in the API layer.

1. **`website/src/lib/arrangement-labels.ts`**, declared "single source of truth" at `:1`.
   - `:9-13` `ARRANGEMENT_LABEL = { paid_loan: "Paid loan", revenue_share: "Revenue-share loan (QR-enabled)", purchase: "Direct purchase" }`
   - `:22` `labelForArrangement(raw)`, returns `"Other arrangement"` for `mixed` and for `free_loan`-with-no-fee. Both are real values in the DB.
   - Callers: `admin/applications/page.tsx:6`, `spaces/page.tsx:18`, `admin/venues/page.tsx:6`, `components/ApplicationForm.tsx:8`.

2. **`website/src/lib/placements/status.ts:60`** `arrangementLabel(input)`, a *different* function with a *different* vocabulary.
   - Returns `"Paid loan + QR"`, `"Paid loan"`, `"Direct purchase"`, `"Revenue share"`, `"Free display"`.
   - `:69-71` parses the free-text message body with a regex looking for `£X/month` to infer a fee when the column is null.
   - Callers: `artist-portal/placements/page.tsx:14`, `venue-portal/placements/page.tsx:14`, `artist-portal/analytics/page.tsx:7`, `components/PlacementContextPanel.tsx:17`.

3. **`website/src/lib/arrangement-type.ts:54`**, `export const arrangementLabel = labelForArrangement;` A **re-export alias** with the same name as (2). Two different functions called `arrangementLabel` are in scope in this codebase depending on which module you import.

4. **Hardcoded JSX in `PlacementDetailClient.tsx:510-530`**, a flag-gated ladder producing a **fifth** vocabulary: `"Purchase"`, `"Paid Loan"`, `"Display"`, `"Revenue Share (30%)"`, `"Paid Loan + Rev Share"`, `"Placement"`. Note the title-casing differs from every other source. It carries two `// eslint-disable-next-line wallplace/no-raw-arrangement-type` suppressions (`:516`, `:518`), the guard rule exists and is being explicitly overridden here.

5. **`src/app/api/placements/route.ts:538-540` and `:616-618`**, the same three-way ladder duplicated **twice within one file**, building label strings server-side for email/message summaries.

**The `/spaces` collision:** `spaces/page.tsx:359` renders the literal `"Revenue Share"` while `:538` renders `ARRANGEMENT_LABEL.revenue_share` = `"Revenue-share loan (QR-enabled)"`. Both appear on the same page. That is finding E13.

### 3.2 Full hardcoded-label inventory

Production label strings that must be routed through the canonical source (excluding comments, form field labels, marketing prose and email mock data, which are prose not labels):

| File | Lines |
|---|---|
| `src/app/(pages)/placements/[id]/PlacementDetailClient.tsx` | 515, 516, 518, 519, 520, 521, 527, 530, 937, 969, 995 |
| `src/app/(pages)/spaces/page.tsx` | 359, 392 |
| `src/app/(pages)/venues/[slug]/VenueProfileBody.tsx` | 168, 169, 170 |
| `src/app/(pages)/venue-portal/profile/page.tsx` | 719, 720, 721 |
| `src/app/(pages)/venue-portal/artwork-requests/[id]/page.tsx` | 289 |
| `src/app/(pages)/profile-designs/page.tsx` | 52, 53, 56, 57 |
| `src/app/(pages)/dev/profile-designs/[slug]/page.tsx` | 53, 54, 57, 58 |
| `src/app/(pages)/browse/[slug]/page.tsx` | 189, 190, 193, 194 |
| `src/app/(pages)/curated/CuratedClient.tsx` | 689, 695 |
| `src/app/(pages)/artist-portal/placements/page.tsx` | 1442 |
| `src/app/(pages)/venue-portal/placements/page.tsx` | 1536 |
| `src/app/api/placements/route.ts` | 538, 539, 540, 616, 617, 618, 1043, 1046, 1053, 1105 |
| `src/app/api/curation/route.ts` | 53, 54 |
| `src/components/MessageInbox.tsx` | 1255, 1257, 1259, 1260 |
| `src/components/PlacementContextPanel.tsx` | 530, 531, 537, 893 |
| `src/components/CounterPlacementDialog.tsx` | 156, 159, 192 |
| `src/components/PlacementNegotiationLog.tsx` | 45, 47, 55 |

Three of these are near-identical copies of the same profile-attribute list: `profile-designs/page.tsx:52-57`, `dev/profile-designs/[slug]/page.tsx:53-58`, `browse/[slug]/page.tsx:189-194`. See §13.22, that is a separate duplicate-component finding, and two of the three are dev-only surfaces that §08 should cull rather than fix.

### 3.3 Which survives

**`src/lib/arrangement-labels.ts` survives, extended.** It must gain:
- `mixed: "Paid loan + revenue share"`
- `free_loan` handling that returns `"Free display"` when there is no fee and `"Paid loan"` when there is (the overload that `arrangement-type.ts` already models correctly)
- The fee/QR-aware combination logic currently in `status.ts:60-78`, so `"Paid loan + QR"` is expressible
- `revenue_share` renamed from `"Revenue-share loan (QR-enabled)"` to `"Revenue share"`. The current string calls it a loan, which it is not.

Proposed surviving signature, one function, all inputs:

```ts
export function labelForArrangement(input: {
  arrangementType?: string | null;
  monthlyFeeGbp?: number | null;
  qrEnabled?: boolean | null;
  revenueSharePercent?: number | null;
}): string
```

`status.ts:60 arrangementLabel` is **deleted**. `arrangement-type.ts:54`'s re-export alias is **deleted** (import `labelForArrangement` directly, an alias that renames a function to collide with a different function's name is pure hazard).

The message-body regex at `status.ts:69-71` is **not** carried over. Inferring a monetary amount by regexing free text a user typed is a bug generator; if `monthly_fee_gbp` is null on legacy rows, backfill the column (migration) rather than parse prose at render time.

### 3.4 Collapse procedure

**Step 1 `K3a`: extend `arrangement-labels.ts`** with the full input shape, `mixed`, `free_loan` fee-awareness, and the renamed `revenue_share` string. Keep the old `ARRANGEMENT_LABEL` map export as-is so existing callers still compile. Add unit tests for all five values × fee present/absent × QR on/off.
*Green because:* purely additive.

**Step 2 `K3b`: migrate the four `status.ts` callers** to the extended function, then delete `status.ts:55-78`. Four files, listed in §3.1(2).

**Step 3 `K3c`: delete the alias** at `arrangement-type.ts:54`; repoint any importer.

**Step 4 `K3d`: kill the API-layer ladders**: `placements/route.ts:538-540`, `:616-618`, `:1043-1053`, `:1105`; `curation/route.ts:53-54`.

**Step 5 `K3e`: kill the JSX ladders**, file by file, in the order of the §3.2 table. Each file is its own commit; the table is the checklist. `PlacementDetailClient.tsx` goes **last** because it is entangled with K4 and with the `PAID_LOAN_V2` gate.

**Step 6 `K3f`: remove the eslint-disable suppressions** at `PlacementDetailClient.tsx:516` and `:518`. If the rule now fires, the migration was incomplete.

### 3.5 The test that proves it

`tests/integration/one-label-source.test.ts`:

```
- No file other than src/lib/arrangement-labels.ts contains the literal
  "Paid loan", "Free display", "Revenue share", "Direct purchase",
  "Paid Loan", "Revenue Share", or "Direct Purchase" inside JSX or a
  returned string. (Comments and *.test.* files excluded; marketing prose
  in src/data/blog-posts.ts and src/components/marketing/** excluded by
  an explicit allowlist.)
- No `export function arrangementLabel` exists outside arrangement-labels.ts.
- grep for `wallplace/no-raw-arrangement-type` eslint-disable comments
  returns zero results.
```

That last assertion is worth more than the other two. A suppression comment is a knot being tied in front of you.

### 3.6 Guard

Extend the existing `eslint-rules/no-raw-arrangement-type.js`. It currently flags only `=== "free_loan"` / `=== "paid_loan"` comparisons (`:47`). Add a second check: a string **literal** matching `/^(Paid loan|Paid Loan|Free display|Revenue share|Revenue Share|Direct purchase|Direct Purchase|Revenue-share)/` in a JSX text node or a returned expression, outside `src/lib/arrangement-labels.ts` and the marketing allowlist.

And **shrink the exemption list** at `no-raw-arrangement-type.js:35-45`: `SpacesPlacementRequestForm.tsx` is exempted because its local union type happens to be safe. That reasoning is correct today and silently wrong the day someone widens the type. Replace the file-level exemption with a narrow `satisfies` type assertion in that file.

---

## 4. K4: Two placement-status renderers

### 4.1 Evidence

**Canonical:** `website/src/lib/placements/status.ts`
- `:18-29` `normaliseStatus(raw)`, note `:26`: `case "completed": case "paused": return "Completed";`. A **paused** placement is deliberately displayed as "Completed".
- `:33-41` `statusBadgeClass(status)`, `bg-green-50 text-green-700 border border-green-200` etc. Softened tones, with borders.
- Callers: `artist-portal/placements/page.tsx:14`, `venue-portal/placements/page.tsx:14`, `components/PlacementContextPanel.tsx:17`.

**Hand-rolled:** `website/src/app/(pages)/placements/[id]/PlacementDetailClient.tsx:552-561`
- `:553-558`, its own colour switch: `bg-green-100 text-green-700` / `bg-amber-100` / `bg-red-100` / `bg-gray-100`. **No borders, `-100` instead of `-50`.** Visually different badge.
- `:560`, `{placement.status.charAt(0).toUpperCase() + placement.status.slice(1)}`. Raw capitalisation.
- **This file does not import from `@/lib/placements/status` at all.**

**The concrete divergence:** a `paused` placement renders as **"Paused"** with a **grey** badge on the detail page, and as **"Completed"** with a **neutral bordered** badge in both portals. Same row, same moment, two answers. `sold` gets `bg-gray-100` on detail and `bg-blue-50` in the portals. That is finding E14.

There is one more hand-roller: `src/components/offers/OffersList.tsx:90`, `return status.charAt(0).toUpperCase() + status.slice(1);` for offer status. Different domain (offers, not placements), so it is not the same knot, but it is the same *anti-pattern* and the guard in §4.5 will catch it. Handle it by adding an `offer-status.ts` alongside, or fold offers into the same module.

### 4.2 Which survives

**`src/lib/placements/status.ts` `normaliseStatus` + `statusBadgeClass` survive.** The hand-rolled block at `PlacementDetailClient.tsx:552-561` is deleted.

Two things to settle while collapsing, because the collapse forces the question:

1. **Is `paused` → `"Completed"` correct?** It is a deliberate mapping (`status.ts:26`), but "Completed" is a *lie* about a paused placement. Recommend adding `"Paused"` to `DisplayStatus` and giving it its own badge class. That is a **behaviour change** and belongs in its own commit with the owner's sign-off, not smuggled into a refactor.
2. `normaliseStatus`'s `default: return "Active"` (`:27`) turns an unknown status into "Active". For a money-adjacent surface, defaulting to the most permissive-looking label is the wrong direction. Recommend `default: return "Pending"` or a distinct `"Unknown"`.

Both are noted here and deferred: **the collapse must be behaviour-preserving.** Do the collapse first, then change the mapping in a separate, visible PR.

### 4.3 Call sites

Only one to migrate:
- `src/app/(pages)/placements/[id]/PlacementDetailClient.tsx:552-561` → replace with `<span className={statusBadgeClass(normaliseStatus(placement.status))}>{normaliseStatus(placement.status)}</span>`, adding the import.

Separately (same anti-pattern, different concept):
- `src/components/offers/OffersList.tsx:90`

### 4.4 Collapse procedure

One PR. It is nine lines.

**Step 1 `K4`: route placement status through `normaliseStatus`**
- Add `import { normaliseStatus, statusBadgeClass } from "@/lib/placements/status";` to `PlacementDetailClient.tsx`
- Replace `:552-561` with the canonical call
- Add a component test asserting a `paused` placement renders the *same* text on the detail page as `normaliseStatus("paused")` returns

*Green because:* no other file reads that block.

**Expect a visual diff.** The badge changes from `-100` fills to `-50` fills with borders, and `paused` changes from "Paused" to "Completed". Screenshot that in the PR so the owner sees it. If they dislike it, that is the trigger for the §4.2(1) conversation, which is exactly the conversation this codebase has been avoiding by keeping two renderers.

### 4.5 The test that proves it

Add to `tests/integration/one-label-source.test.ts`:

```
- grep for /\.charAt\(0\)\.toUpperCase\(\)\s*\+/ across src/ returns zero
  hits in any file whose path contains "placement".
- No file outside src/lib/placements/status.ts contains a Tailwind class
  string matching /bg-(green|amber|red|blue|gray|neutral)-\d{2,3}\s+text-/
  in the same expression as a `.status` member access.
```

The second is heuristic and will need tuning, but a heuristic that fires on the pattern is worth more than nothing here.

### 4.6 Guard

Extend `eslint-rules/no-raw-arrangement-type.js` (rename it `no-raw-domain-display.js`, or add a sibling `no-raw-status-display.js`) to flag `.charAt(0).toUpperCase()` applied to any identifier or member expression named `status`. Message: *"Status text comes from normaliseStatus(). Hand-rolled capitalisation diverges the moment the canonical mapping changes, see K4."*

The spec already calls for this (`../2026-07-11-stress-test-remediation-spec.md:164`: *"Extend the #65 lint rule to statuses"*).

---

## 5. K5 Artist stats: two sources, and the counters are **not** dead

### 5.1 Evidence

**Source A, cached counters on `artist_profiles`:**
- Read at `website/src/app/api/dashboard/route.ts:109-110`:
  ```ts
  enquiries: artistProfile.total_enquiries || 0,
  views: artistProfile.total_views || 0,
  ```
- Also read via `src/lib/db/artist-profiles-transform.ts:141-144` → `totalViews`, `totalPlacements`, `totalSales`, `totalEnquiries` on the public `Artist` shape.
- **Written at `website/src/lib/stats-cache.ts:51-59`**, inside `refreshArtistStatsCaches()`.

**Source B, live aggregation from `analytics_events`:**
- `website/src/app/api/analytics/artist/route.ts:45-46` selects raw events, `:76-79` counts `profile_view` into `totals.profile_views`.
- Also recounts placements (`:111`) and enquiries (`:118`) directly.

### 5.2 The correction: they are not dead columns

The brief hypothesised the `total_*` columns might be dead. **They are not.** `stats-cache.ts` writes them, computing exactly the same numbers `analytics/artist/route.ts` computes live (`stats-cache.ts:25-29` counts `analytics_events` where `event_type = 'profile_view'`, identical predicate to `analytics/artist/route.ts:77`).

The real defect is **when** they are written:

- `refreshArtistStatsCaches` has exactly **one** caller: `src/app/api/admin/refresh-stats/route.ts:18`.
- That route is `POST`, admin-gated (`:14`), and **manual**.
- `website/vercel.json` lists nine cron entries. `/api/admin/refresh-stats` is **not** among them.
- Nothing else in `src/` writes any `total_*` column. No trigger, no webhook, no incrementing anywhere.

So the columns are **stale by construction**: they hold whatever the last human-triggered admin POST computed, which for a fresh artist is `0` (the column default), forever, unless an admin remembers. That is the precise mechanism of Bug 13, dashboard "Profile Views 0" next to analytics "Profile Views 9" for the same account on the same day. Not a dead column: a **write-once-by-accident** column.

This distinction matters for the fix. "Delete the dead columns" would be wrong, something *does* write them, and `artist-profiles-transform.ts` exposes them on the public artist shape, so a naive drop would break `/api/browse-artists` consumers.

### 5.3 Which survives

**`analytics_events` aggregation survives as the source of truth. The `total_*` columns become a derived cache with an enforced refresh, or they are dropped.**

Two viable designs. Recommend (a):

**(a) Drop the columns, serve one endpoint.** `dashboard/route.ts` stops reading `artist_profiles.total_*` and calls the same aggregation `analytics/artist/route.ts` uses, extracted into `src/lib/analytics/artist-totals.ts`. Migration drops `total_views`, `total_placements`, `total_sales`, `total_enquiries` from `artist_profiles`. Delete `stats-cache.ts` and `api/admin/refresh-stats/`. Remove the four fields from `artist-profiles-transform.ts:48-51` and `:141-144`.
- *Cost:* the dashboard does 4 counting queries instead of reading 4 columns. At current scale (51 artists, ~14 registered) this is irrelevant. Revisit if `analytics_events` passes ~10⁶ rows.
- *Benefit:* one number, one definition, structurally impossible to diverge.

**(b) Keep the cache, make the refresh automatic.** Add `/api/cron/refresh-artist-stats` to `vercel.json`, and stamp `stats_refreshed_at`. Every read site must then surface staleness ("as of 3h ago") or the mismatch just becomes less frequent rather than impossible.
- *Cost:* the divergence still exists, just on a timer. Every future stat added has to be added in two places. This is how K5 happened.

Take (a). If performance ever demands a cache, add it as a materialised view with a defined refresh, not as hand-updated columns.

### 5.4 Call sites

| Site | Action |
|---|---|
| `src/app/api/dashboard/route.ts:109-110` | read from the extracted aggregation helper |
| `src/lib/db/artist-profiles-transform.ts:48-51` (type) | delete the four optional fields |
| `src/lib/db/artist-profiles-transform.ts:141-144` (mapping) | delete, or map from the aggregation |
| `src/lib/stats-cache.ts` (whole file, 72 lines) | delete |
| `src/app/api/admin/refresh-stats/route.ts` (whole route) | delete |
| `src/app/api/admin/refresh-stats/route.test.ts:14-15` | delete |
| any admin UI button calling `/api/admin/refresh-stats` | delete, **grep before landing**; §08 cull covers admin surface |
| new migration `074_drop_artist_total_counters.sql` | `ALTER TABLE artist_profiles DROP COLUMN total_views, ...` |

Consumers of `totalViews`/`totalSales` etc. on the public `Artist` object must be swept before the transform fields are removed, grep `totalViews|totalPlacements|totalSales|totalEnquiries` across `src/`.

### 5.5 Collapse procedure

**Step 1 `K5a`: extract the aggregation** into `src/lib/analytics/artist-totals.ts`, used by `analytics/artist/route.ts`. Pure refactor, unit-tested.
**Step 2 `K5b`: repoint the dashboard** at the helper. **Bug 13 is fixed at this commit**: dashboard and analytics now agree.
**Step 3 `K5c`: delete the cache writer**: `stats-cache.ts`, the admin route, its test, any UI trigger.
**Step 4 `K5d`: drop the columns**: migration + transform cleanup. Runs last so a rollback of steps 1–3 does not hit a missing column.

### 5.6 The test that proves it

`tests/integration/one-stats-source.test.ts`:
- `GET /api/dashboard` and `GET /api/analytics/artist` return the **same** `profile_views` number for the same seeded artist. Seed 9 `profile_view` events; assert both report 9. **This test fails on today's code** (dashboard would report 0), which is what makes it a real regression test.
- No file in `src/` references `total_views`, `total_placements`, `total_sales` or `total_enquiries`.

### 5.7 Guard

Convention, enforced by the §5.6 grep test rather than a lint rule: **derived aggregates are computed in one exported function; a database column that mirrors a computed value must be either (i) written by a DB trigger, or (ii) written by a scheduled job listed in `vercel.json`.** A column written only by a manual admin endpoint is banned.

Add that sentence to `website/AGENTS.md` under a new "Data invariants" heading so it lands in every agent's context.

---

## 6. K6: Three definitions of platform revenue

### 6.1 Evidence

**`website/src/app/api/admin/stats/route.ts`**, "gross paid" GMV
- `:48` selects `total, amount_cents, status, created_at` from `orders`
- `:82-101` `sumPaid()`: `row.amount_cents != null ? Number(row.amount_cents) : Math.round(Number(row.total || 0) * 100)`
- `:90-92` carries the confession: *"Orders are written by the Stripe webhook as `total` in pounds and never populated amount_cents, so the headline read £0."*
- Filters to paid statuses (`:46-47`).

**`website/src/app/api/admin/financials/route.ts`**, a different "revenue"
- `:99-111` `sumOrders()`: `orders.total * 100`, **ignores `amount_cents` entirely**, filters `.neq("status", "cancelled")`, a *different, wider* status filter than `stats`.
- `:138-141` top artists from `stripe_transfers.recipient_user_id, amount_cents`, a **third** money source.
- `:119-122` top venues from `placement_recurring_billings.monthly_amount_pence`, a **fourth**.
- `:68` MRR from a local `PRICES_PENCE` map × subscription counts, a **fifth**.

So `/admin/stats` and `/admin/financials` will disagree on "revenue this month" whenever any order is in a status that is neither cancelled nor in the paid set, or whenever any legacy row has `amount_cents` populated. Neither is wrong; they are answering different questions under the same label. That is finding E2/Bug 15: admin reports £0 gross while the artist portal shows £773.25.

### 6.2 Which survives

**Neither, as-is. Extract one module and have both routes call it.**

`website/src/lib/finance/revenue.ts`, the single owner of every money aggregate, with the questions named explicitly rather than all called "revenue":

```ts
/** Gross merchandise value: what buyers paid, before any split. */
export async function grossMerchandiseValuePence(range: DateRange): Promise<number>

/** Platform net: application fees + subscription revenue. What Wallplace keeps. */
export async function platformNetRevenuePence(range: DateRange): Promise<number>

/** Artist earnings, from the transfer ledger. */
export async function artistEarningsPence(range: DateRange): Promise<Map<UserId, number>>

/** Venue spend, from the recurring-billing ledger. */
export async function venueSpendPence(range: DateRange): Promise<Map<UserId, number>>

/** Subscription MRR. */
export async function subscriptionMrrPence(): Promise<number>
```

Both admin routes become thin presenters. The unit is **pence, everywhere**, the `total`-in-pounds / `amount_cents`-in-pence split is itself part of the knot.

**Settle the amount question inside the module, once:** `orders.total` (pounds, float) and `orders.amount_cents` (integer pence, mostly null) are two columns for one fact. Pick `amount_cents`, backfill it from `total` in a migration, add `CHECK (amount_cents > 0)` (already required by CC3/E29), and make the Stripe webhook write it. Then `orderAmountPence(row)` has one branch, not two.

### 6.3 Call sites

| Site | Action |
|---|---|
| `src/app/api/admin/stats/route.ts:48`, `:82-113` | replace `sumPaid` with `grossMerchandiseValuePence` |
| `src/app/api/admin/financials/route.ts:99-116` | replace `sumOrders` with `grossMerchandiseValuePence` (same range semantics) |
| `src/app/api/admin/financials/route.ts:119-135` | → `venueSpendPence` |
| `src/app/api/admin/financials/route.ts:137-154` | → `artistEarningsPence` |
| `src/app/api/admin/financials/route.ts:60-70` | → `subscriptionMrrPence` |
| Stripe webhook order-insert | write `amount_cents` alongside `total` |
| new migration | backfill `amount_cents` from `total`; add the CHECK |

Also sweep the artist and venue portals, they compute their own totals inline. The §13 sweep found **four copies of the per-order artist payout derivation** (`artist_revenue ?? total ?? 0`):
- `src/app/api/dashboard/route.ts:88-96`
- `src/app/(pages)/artist-portal/analytics/page.tsx:38` `orderPayout()`, its comment at `:35` says it "mirrors the dashboard's calculation … so Analytics and Dashboard show the same number"
- `src/app/(pages)/artist-portal/page.tsx:213-217`
- `src/app/(pages)/artist-portal/orders/page.tsx:586`, **uses `||` not `??`**, so a legitimate £0 payout falls through and displays the *gross order value* as the artist's earnings

And **two copies of the placement realised-revenue query**: `src/app/api/placements/route.ts:175-186` (list) and `src/app/api/placements/[id]/route.ts:34-42` (detail). The detail endpoint's comment at `:33` admits it re-uses the list's approach. They pick the viewer's side differently, list uses `role.type === "venue"`, detail uses `placement.venue_user_id === user.id`, so a user who is both an artist and a venue sees a different number on the two pages.

All six collapse into `src/lib/finance/revenue.ts` in this knot. The `||` bug at `orders/page.tsx:586` is a real money-display defect and closes with it.

### 6.4 Collapse procedure

**Step 1 `K6a`: write `src/lib/finance/revenue.ts`** with unit tests over a fixture dataset. No callers yet.
**Step 2 `K6b`: backfill `amount_cents`**: migration + webhook write. Verify against a Stripe test-mode order.
**Step 3 `K6c`: repoint `/api/admin/stats`.** Snapshot the numbers before and after; they should change only where the pre-fix code was wrong.
**Step 4 `K6d`: repoint `/api/admin/financials`.** Now the two endpoints are structurally incapable of disagreeing.
**Step 5 `K6e`: repoint the portal totals.**

### 6.5 The test that proves it

`tests/integration/one-revenue-source.test.ts`:
- Seed a known order set. Assert `/api/admin/stats` gross **equals** `/api/admin/financials` gross to the penny.
- Assert `grossMerchandiseValuePence >= platformNetRevenuePence` for any dataset (a sanity invariant that catches unit confusion).
- Grep: no file outside `src/lib/finance/` selects `"total"` from the `orders` table.

### 6.6 Guard

**ESLint rule** `no-inline-money-aggregate`: flag `.from("orders")` combined with a `.reduce(` or `.select("total")` in the same function, outside `src/lib/finance/**`. Same shape as the existing `no-ad-hoc-cap.js`, which already exists to stop exactly this genre of inline recomputation for outreach caps, reuse its structure.

---

## 7. K7: Order emails fire twice (customer) and three times (artist)

### 7.1 Evidence

`website/src/app/api/webhooks/stripe/route.ts`, in the `checkout.session.completed` branch:

**New pipeline, at `:414-441`:**
```
// J1 (Phase 2.3): log the initial order.placed event +
// dispatch the matching Phase 2.0c emails. Best-effort,
// legacy templates below continue to fire for backwards
// compatibility.
```
`:427` calls `recordOrderEvent({ ... newStatus: "confirmed" ... })`.
→ `src/lib/orders/lifecycle.ts:57-61` maps `order.placed` to **two** sends: `artist_order_received` to the artist and `order_placed` to the buyer.
→ `src/lib/email/dispatcher.ts:43-44` binds those to registry templates `artist_order_received` and `customer_order_placed`.

**Legacy templates, in the same handler:**
- `:524-559`, `sendEmail({ idempotencyKey: 'order_receipt:...', template: "customer_order_receipt", react: CustomerOrderReceipt({...}) })` → **buyer**
- `:571-591`, `sendEmail({ idempotencyKey: 'artist_work_sold:...', template: "artist_work_sold", react: ArtistWorkSold({...}) })` → **artist**
- `:593-610`, `sendEmail({ idempotencyKey: 'artist_order_confirmation:...', template: "artist_order_confirmation", react: ArtistOrderConfirmation({...}) })` → **artist**
- `:565-568`, the comment defending the artist double-send: *"Two emails to the artist: the celebration ('you made a sale') and the operational receipt (order confirmation). They serve different purposes... Idempotency keys are distinct."*

**Net per purchase: buyer gets 2, artist gets 3.** Idempotency keys are deliberately distinct, so `send.ts`'s dedupe cannot suppress them, the duplication is by design in the code and by accident in the product. That is finding E4.

Templates involved, all present in `src/emails/templates/orders/`: `CustomerOrderReceipt.tsx`, `CustomerOrderPlaced.tsx`, `ArtistWorkSold.tsx`, `ArtistOrderConfirmation.tsx`, `ArtistOrderReceived.tsx`.

### 7.2 Which survives

**The dispatcher path survives** (`recordOrderEvent` → `sendTransactional` → `order_placed` / `artist_order_received`). The three inline legacy sends are deleted.

Reasons:
- The dispatcher writes an `order_events` row (`lifecycle.ts:60-75`) with its own idempotency key, so the email is tied to a recorded lifecycle event rather than fired ad hoc from inside a 900-line webhook handler.
- It is the path every *other* order status already uses (`order.processing`, `order.out_for_delivery`, `order.delivered`, `lifecycle.ts:62-66`). Keeping `order.placed` special is the anomaly.
- It centralises the template binding in one table (`dispatcher.ts:42-49`) rather than scattering `react: SomeComponent({...})` through the webhook.

**Content to carry over before deleting:** `CustomerOrderReceipt` is much richer than `CustomerOrderPlaced`, it carries `items[]`, `subtotal`, `shipping`, `total`, both addresses and a signed `trackingToken` (`:518-521`). That content is *wanted*. The move is to enrich `CustomerOrderPlaced` (or rebind `order_placed` → `customer_order_receipt` in `dispatcher.ts:44`) so the surviving email keeps the receipt detail. Do **not** delete `CustomerOrderReceipt.tsx`, rebind to it.

For the artist: `ArtistWorkSold` (celebration) and `ArtistOrderConfirmation` (operational) genuinely say different things, and `ArtistOrderReceived` is a third. Three artist templates for one event is two too many. **Merge into one**, `ArtistOrderReceived`, that opens with the celebration line and continues with the itemised next-steps block. One email, both jobs.

### 7.3 Call sites

| Site | Action |
|---|---|
| `stripe/route.ts:414-417` | delete the "legacy templates below continue to fire" comment |
| `stripe/route.ts:524-559` | **delete** the `customer_order_receipt` send |
| `stripe/route.ts:571-591` | **delete** the `artist_work_sold` send |
| `stripe/route.ts:593-610` | **delete** the `artist_order_confirmation` send |
| `stripe/route.ts:615` | delete `void notifyArtistNewOrder;` (also K1) |
| `src/lib/email/dispatcher.ts:44` | rebind `order_placed` → `customer_order_receipt` (the rich template) |
| `src/lib/orders/lifecycle.ts:59` | keep `artist_order_received`, now the merged template |
| `src/lib/orders/lifecycle.ts` | `recordOrderEvent` must receive the full receipt payload (items, totals, addresses, tracking token), its `data` field is currently `Record<string, unknown>` (`lifecycle.ts` / `dispatcher.ts:26`), so widen the caller at `stripe/route.ts:427-437` to pass everything `CustomerOrderReceipt` needs |
| `src/emails/templates/orders/ArtistWorkSold.tsx` | fold copy into `ArtistOrderReceived.tsx`, delete |
| `src/emails/templates/orders/ArtistOrderConfirmation.tsx` | fold copy into `ArtistOrderReceived.tsx`, delete |
| `src/emails/templates/orders/CustomerOrderPlaced.tsx` | delete (rebinding to the receipt), or keep as the canonical and enrich it. Pick one; do not keep both |
| `src/emails/registry.ts` | remove deleted entries |
| `webhooks/stripe/route.test.ts:53` | assert exactly 1 buyer + 1 artist send |
| `tests/integration/stripe-webhook.test.ts` | same |

**Order of operations matters here.** Enrich the surviving template *first* (step 1), then delete the legacy sends (step 2). Reversing that ships a checkout where the buyer receives a receipt missing their items and address.

### 7.4 Collapse procedure

**Step 1 `K7a`: enrich the surviving templates.** Rebind `order_placed` → `customer_order_receipt` in `dispatcher.ts:44`; merge the two artist templates into `ArtistOrderReceived`. Widen the `recordOrderEvent` call at `stripe/route.ts:427` to pass the full payload. **At this point four emails fire, one of them now a duplicate of the receipt**. Verify by preview route; do not deploy this commit alone.
**Step 2 `K7b`: delete the three legacy sends** (`:524-559`, `:571-591`, `:593-610`) and the defending comments. Buyer 1, artist 1.
**Step 3 `K7c`: delete the orphaned templates** and registry entries.

Steps 1 and 2 should land as **one PR**, per the §0.1 rule. Split only if the PR is unreviewable, and then deploy them together.

### 7.5 The test that proves it

Extend `src/app/api/webhooks/stripe/route.test.ts`:

```ts
it("a completed checkout sends exactly one email per party", async () => {
  await POST(checkoutCompletedRequest());
  const recipients = sendEmailMock.mock.calls.map((c) => c[0].to);
  expect(recipients.filter((r) => r === BUYER_EMAIL)).toHaveLength(1);
  expect(recipients.filter((r) => r === ARTIST_EMAIL)).toHaveLength(1);
});
```

This fails on today's code with 2 and 3. That is the point.

Add a companion in `tests/integration/`: **no `sendEmail(` call appears inside `src/app/api/webhooks/stripe/route.ts`**, every send goes through `sendTransactional`. That structurally prevents a fourth inline template from being added.

### 7.6 Guard

**ESLint rule** `no-inline-email-in-webhook`: forbid `sendEmail(` inside any file under `src/app/api/webhooks/**`. Webhooks record events; the dispatcher decides what to send. Message: *"Webhooks call recordOrderEvent(), not sendEmail(). Inline sends in the webhook are how K7 produced 5 emails per purchase."*

---

## 8. K8: Duplicate demo personas

### 8.1 Evidence

**`maya-chen` vs `maya-chen-demo`:**
- `maya-chen` is **static seed data**: `src/data/artists.ts:144` (`slug`), with works at `:176-244`, images seeded from picsum.
- `maya-chen-demo` exists in **exactly one file in the whole repo**: `website/scripts/seed-demo-accounts.ts:108`. Nothing in `src/` or `supabase/` knows the slug exists. It is purely a live DB row created by that script.
- Homepage picks the slug positionally: `src/app/page.tsx:14`, `const featuredArtists = artists.slice(0, 6);` and `:272` links `/browse/${a.slug}`. `maya-chen` is index 0 of the static array, so the homepage always shows it.
- `/demo` picks it from config: `src/app/(pages)/demo/page.tsx:6` imports `DEMO_ARTIST_SLUG`, `:35` resolves `artists.find(a => a.slug === DEMO_ARTIST_SLUG) || artists[0]`. `src/data/demo.ts:21-22` defaults to `"maya-chen"`.

**The root cause is the merge, not the seeder:** `website/src/lib/db/merged-data.ts`
- `:19`, `const dbSlugs = new Set(dbArtists.map(a => a.slug));`
- `:25-26`, static entries are dropped **only when a DB row has the same slug**
- `:33`, `const merged = [...dbArtists, ...staticOnly];` DB rows are prepended
- Since `maya-chen` ≠ `maya-chen-demo`, the dedupe never fires and **both survive**. DB rows are ordered `created_at DESC` (`src/lib/db/artist-profiles.ts:70`), so `maya-chen-demo` floats to the top of `/browse` while the homepage links `maya-chen`. Two Maya Chens, different prices (£180–320 vs £180–580), different images (picsum vs Unsplash).

That is Bug 3, and it escalates to **Bug 9 (high)**: `maya-chen-demo` sits at the top of `/browse` with a working Buy Now that always 422s at payment and blocks the entire mixed cart.

**`finlay-coles` vs `fin-coles`:**
- `website/next.config.ts:113`, `{ source: "/browse/finlay-coles", destination: "/browse/fin-coles", permanent: true }` (a 308; `permanent: true`).
- `fin-coles` has **no static seed entry**, verified absent from `src/data/artists.ts`. It is a live DB row only. So the redirect target resolves through `getArtistBySlug` → Supabase (`merged-data.ts:48-58`). **Deleting that DB row turns a permanent redirect into a 404**, and browsers cache 308s.
- `finlay-coles` appears in `src/app/api/apply/route.test.ts:151-167`, but that is unrelated, it tests slug-collision suffixing.

### 8.2 Which survives

**Artist demo persona: `maya-chen-demo` (the DB row) survives. `maya-chen` static seed is deleted.**

This is the opposite of what the audit assumed (`/demo` designates `maya-chen` canonical), and the reasoning is:
- The DB row is the one a real visitor can actually interact with: it has a Supabase auth user (`seed-demo-accounts.ts:35`), a stable UUID (`:33`), a subscription plan (`:148`) and `review_status: "approved"` (`:152`). The static row is a hardcoded object that can never be a demo *account*.
- The `/demo` funnel's Phase 2 (`src/data/demo.ts:14-18`, `src/app/api/demo/login/route.ts`) signs the visitor **in**. That requires the DB row.
- `src/lib/demo-guard.ts` protects it from mutation via `DEMO_ARTIST_USER_ID`.

**But three things must be fixed on the surviving row before the static one is deleted:**
1. Rename the slug `maya-chen-demo` → `maya-chen` in the seeder and the live DB (so existing `/browse/maya-chen` links, including the homepage's, keep working).
2. Set `subscription_status`, the seeder writes `subscription_plan: "pro"` (`:148`) but never `subscription_status`, which is why `GATING_V1` filtering behaves oddly for it (`merged-data.ts:41`).
3. Make Buy Now either work or be hidden. Bug 9's 422 comes from the demo artist lacking a Connect account. Either complete Connect in test mode, or gate the CTA on `canReceivePayout` (CC6/E38). **Do not ship a Buy Now that always fails.**

**`finlay-coles` → `fin-coles`: keep the redirect, keep `fin-coles`.** The redirect is correct and cheap. What must change:
- Add a **test** asserting the redirect target resolves, otherwise a future data purge silently creates a permanent 404.
- Add a comment on the DB row / seeder noting that `fin-coles` is a redirect target and cannot be deleted without also removing `next.config.ts:113`.

### 8.3 Call sites

| Site | Action |
|---|---|
| `scripts/seed-demo-accounts.ts:108` | `slug: "maya-chen"` |
| `scripts/seed-demo-accounts.ts:127` | fix the `website:` field, currently `https://example.com/maya-chen` |
| `scripts/seed-demo-accounts.ts` (~`:148`) | add `subscription_status: "active"` |
| live DB | `UPDATE artist_profiles SET slug = 'maya-chen' WHERE slug = 'maya-chen-demo'`, **run after** the static row is removed, or the merge produces a collision |
| `src/data/artists.ts:144-244` | delete the `maya-chen` static entry and its six works |
| `src/data/demo.ts:21-22` | keep `"maya-chen"` default, now unambiguous |
| `src/data/demo.ts:32-40` | delete `DEMO_USER_IDS` + `isDemoUser`, dead duplicate, see §13.19 |
| `src/lib/demo-guard.ts` | **`assertNotDemo` and `assertNotDemoStrict` have zero call sites in the entire repo.** No mutation route is actually guarded. Wire them, or delete the module and stop claiming demo protection exists. This is a security finding, not a tidiness one. |
| `src/app/(pages)/demo/page.tsx:35` | resolve against merged data, not the static array. Today `.find()` returning `undefined` falls back to `artists[0]` **silently**, a misconfigured `NEXT_PUBLIC_DEMO_ARTIST_SLUG` produces no error, just the wrong artist. Make it throw in dev. |
| `.env.example` | document `NEXT_PUBLIC_DEMO_ARTIST_SLUG` / `_VENUE_SLUG` / `DEMO_ARTIST_USER_ID` / `DEMO_VENUE_USER_ID`, currently **zero `DEMO` entries** in that file |
| `next.config.ts:113` | keep; add the §8.5 test |
| `tests/e2e/visualizer-customer.spec.ts:20` | `const ARTIST_SLUG = "maya-chen"`, still valid after the rename |
| `src/lib/db/merged-data.ts:25-33` | see §8.4 step 4 |

### 8.4 Collapse procedure

**Step 1 `K8a`: fix the seeder.** Slug rename, `subscription_status`, `website` field. No live effect until re-run.
**Step 2 `K8b`: delete the static `maya-chen`** from `src/data/artists.ts`. At this commit `/browse/maya-chen` resolves to the DB row (still slugged `maya-chen-demo`) → 404 for `maya-chen`. **So steps 2 and 3 deploy together.**
**Step 3 `K8c`: rename the live row** (`UPDATE ... SET slug = 'maya-chen'`). Homepage, `/demo` and `/browse` now all point at the same profile.
**Step 4 `K8d`: harden the merge.** `merged-data.ts` gains a dev-time assertion: if two entries share a normalised display name but differ in slug, throw in development and `console.error` in production. That is the guard that would have caught this on day one.
**Step 5 `K8e`: test-data hygiene.** Bug 2 (14 registered vs 51 listed; "Test", "Sass Test", "Sam Test" artists) is the same class of problem and belongs in the same sweep, see §08 cull. Add an `is_test` / `review_status` predicate to `getAllDatabaseArtists` (`src/lib/db/artist-profiles.ts:70`) rather than filtering in the browse page.
**Step 6 `K8f`: redirect integrity test.**

### 8.5 The tests that prove it

`tests/e2e/demo-personas.spec.ts`:
- `/` → the first featured artist link, followed, returns 200 and its `<h1>` matches the artist shown on `/demo`.
- `/browse` contains **exactly one** result whose display name is "Maya Chen".
- `/browse/finlay-coles` returns 308 → `/browse/fin-coles` → **200** (not 404). This is the test that stops a data purge from breaking a permanent redirect.
- Every `redirects()` entry in `next.config.ts` whose destination is under `/browse/` resolves to 200. Generalise it, there will be more.

Unit: `merged-data.test.ts`, given a DB artist and a static artist with the same display name and different slugs, `getAllArtists()` throws in dev.

### 8.6 Guard

Two, both cheap:
1. **The redirect-integrity e2e above**, run in CI. It converts "someone deleted a row" from a silent 404 into a red build.
2. **`merged-data.ts` name-collision assertion.** The knot here was not the duplicate row; it was that nothing noticed. Make the merge loud.

Convention for `AGENTS.md`: *demo/seed personas live in exactly one place, the seeder. Static `src/data/*.ts` fixtures are for content that has no DB row, and a slug must never exist in both.*

---

## 9. K9: Hand-rolled authorization across the route surface

**This knot is being fixed separately by CC1 (`implementation/01-authz-idor.md`). This section quantifies it and states the interface contract so the other knots' PRs do not fight it.**

### 9.1 Measured, not estimated

| Measure | Count |
|---|---|
| `route.ts` files under `src/app/api/` | **119** |
| …importing `getSupabaseAdmin` (service-role, RLS bypassed) | **103** |
| …calling `getAuthenticatedUser` | **73** |
| `src/lib/authz.ts` | **does not exist** |

The spec's figure of 122 is close; the verified number is **119 route files, 103 of which hold a service-role client**. The gap that matters is **103 − 73 = 30 route files that take a service-role client and never identify the caller.** Some are legitimately public (browse, stats, waitlist, cron, QR). The rest are the E17–E33 IDOR cluster.

Every one of those 103 files hand-rolls its own ownership check, in its own shape, at its own point in the handler. `payment/setup/route.ts:35-37` is representative:

```ts
if (placement.venue_user_id !== auth.user!.id) {
  return NextResponse.json({ error: "Only the venue can set up payment" }, { status: 403 });
}
```

Fetch, then compare. The row is already in memory before the check runs, which is why E31/E32 (read-IDOR) exist even on routes that "have" a check.

### 9.2 Why it belongs in this document

Because it is the same disease and the **highest-leverage single collapse**. 103 implementations of "may this user touch this row" is 103 places to get it wrong, and every new route adds a 104th. The other ten knots each cost you a wrong label or a duplicate email. This one costs you data.

### 9.3 Contract for the other knots

While CC1 lands, every PR in this document must:
- **Not add** a new hand-rolled ownership comparison. If a knot's PR touches a route that needs one, use `assertPlacementParty` / `assertOrderParty` etc. from `@/lib/authz` if it exists yet, and otherwise leave the existing check untouched rather than copying it into a new file.
- **Not add** a new `getSupabaseAdmin()` import to a route that did not have one.

K2's changes to `payment/setup/route.ts` and `placements/route.ts` will collide with CC1. **Sequence CC1's changes to those two files before K2c**, or expect a merge conflict in the ownership block.

### 9.4 Guard

Per CC1: a CI check that any route importing `getSupabaseAdmin` and performing a mutation must also import from `@/lib/authz`, or appear on an explicit `PUBLIC_ROUTES` allowlist. Detail in `implementation/01-authz-idor.md`.

---

## 10. K10: Duplicate migration numbers

### 10.1 Evidence

`website/supabase/migrations/` holds **73** files, all `NNN_name.sql`. Exactly four prefixes collide, and **there are no others** (all 73 prefixes checked):

| # | File A | File B |
|---|---|---|
| **037** | `037_walls_public_profile_toggle.sql`, adds `walls.is_public_on_profile` | `037_welcomed_at.sql`, adds `welcomed_at` to `artist_profiles` + `venue_profiles` |
| **044** | `044_cart_sessions.sql`, `CREATE TABLE cart_sessions` | `044_feature_requests.sql`, `CREATE TABLE feature_requests` |
| **045** | `045_artist_charges_cache.sql`, adds `stripe_charges_enabled` to `artist_profiles` | `045_purchase_offers.sql`, `CREATE TABLE purchase_offers` |
| **054** | `054_artwork_request_response_placement_terms.sql` | `054_customer_addresses.sql`, `CREATE TABLE customer_addresses` |

**Provenance:** two files carry stale self-identifying headers proving they were renumbered upward and collided:
- `044_feature_requests.sql:1` reads `-- 041_feature_requests.sql`
- `045_purchase_offers.sql:1` reads `-- 042_purchase_offers.sql`

Both were renumbered in commit `424563a`.

**Gaps also present:** `017`, `068`, `069` never existed. `002_run_me.sql` existed briefly (added `b22c19d`, deleted `72b1f72`, same day) and may have been applied to production before deletion.

### 10.2 The actual risk

Not what you would expect. **No colliding pair touches the same object**, 037 is `walls` vs `artist_profiles`; 044 is `cart_sessions` vs `feature_requests`; 045 is `artist_profiles` columns vs `purchase_offers`; 054 is `artwork_request_responses` vs `customer_addresses`. So apply *order* within a pair is harmless.

The real hazard is **version-key collision**. The Supabase CLI keys `supabase_migrations.schema_migrations.version` on the leading numeric prefix, and it is a primary key. On a fresh environment, `supabase db push` records one `044` and **silently skips the sibling**. Downstream migrations then fail:
- `049_purchase_offers_created_by.sql` ALTERs `purchase_offers` (needs `045_purchase_offers`)
- `046`, `062_arrangement_type_mixed.sql`, `070_qa44_db_hardening.sql` reference `purchase_offers`
- `058_moderation_queue.sql`, `070` reference `feature_requests`
- `070` references `cart_sessions`
- `072_drop_redundant_indexes.sql`, `061_blogs.sql`, `070` reference `walls`

Mitigating: all eight colliding files are `IF NOT EXISTS`-guarded, so re-running against the **existing** prod DB is a no-op. The exposure is a **fresh or branch environment**, exactly what you need for CI, for a preview branch, or for onboarding a second developer. Today the repo cannot reliably build its own database from scratch.

### 10.3 How migrations are applied today

**Nothing applies them automatically.** Verified:
- `.github/workflows/ci.yml`, two jobs, zero DB steps; Supabase env vars are placeholders (`:27-29`)
- `website/package.json`, no `migrate` / `db:push` script; the `supabase` CLI is **not a dependency**
- **No `supabase/config.toml` anywhere in the repo**, no `seed.sql`
- Docs describe it as manual: `npx supabase db push --linked`, or pasting into the dashboard SQL editor, or the Supabase MCP `apply_migration`

So the ordering is whatever a human did, in whatever order they did it, in each environment independently. **That is K10's real content:** there is no defined apply order to be non-deterministic about.

### 10.4 Collapse procedure

**Step 1 `K10a`: renumber the four younger files.** Take the newest of each pair and give it the next free number. Using the gaps (`017`, `068`, `069`) is tempting but confusing; go above the current maximum instead:
- `037_walls_public_profile_toggle.sql` → `074_walls_public_profile_toggle.sql`
- `044_cart_sessions.sql` → `075_cart_sessions.sql`
- `045_artist_charges_cache.sql` → `076_artist_charges_cache.sql`
- `054_customer_addresses.sql` → `077_customer_addresses.sql`

Choose the *later-authored* file of each pair to move (per git dates: `walls_public_profile_toggle` 2026-04-27 vs `welcomed_at` 2026-04-26; `cart_sessions` 2026-05-02 vs `feature_requests` 2026-04-30; `artist_charges_cache` 2026-05-02 vs `purchase_offers` 2026-04-30; `customer_addresses` 23:39 vs `artwork_request_response…` 23:26). Moving the later one preserves authored order.

Also fix the two stale headers (`044_feature_requests.sql:1`, `045_purchase_offers.sql:1`).

**Renumbering is safe on the existing prod DB** only if the already-applied version rows are reconciled. Before landing: query `supabase_migrations.schema_migrations` on production, and insert the new version keys as already-applied (the files are `IF NOT EXISTS`-guarded, so a re-run would be harmless either way, but the version table must not think 074–077 are pending).

**Step 2 `K10b`: adopt the Supabase CLI as a devDependency** and add `supabase/config.toml`. Add `npm run db:push` and `npm run db:reset`.

**Step 3 `K10c`: prove a clean apply from zero.** A CI job that spins a scratch Postgres, applies all migrations in filename order, and fails on any error. This is the only thing that actually verifies K10 is fixed, and it doubles as the K11 verification.

**Step 4 `K10d`: document the 002_run_me.sql` situation.`** Either confirm it was never applied to prod, or capture what it did in the base schema (§11).

### 10.5 The test that proves it

The CI job from step 3, plus a unit test:

`tests/integration/migrations-unique.test.ts`:
```ts
it("every migration has a unique numeric prefix", () => {
  const files = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql"));
  const prefixes = files.map(f => f.slice(0, 3));
  expect(new Set(prefixes).size).toBe(prefixes.length);
});

it("every migration filename matches NNN_snake_case.sql", () => { ... });
```

Sub-second, catches the next collision at the moment it is authored.

### 10.6 Guard

The unit test above **is** the guard, and it is better than a lint rule because it runs in `npm run check` and cannot be disabled with a comment. Add a line to `AGENTS.md`: *new migrations take the next free number above the current maximum; never reuse, never backfill a gap.*

---

## 11. K11: No committed base schema

### 11.1 Evidence

**Confirmed: there is no baseline.** No `schema.sql`, `structure.sql`, `dump.sql`, `seed.sql`, `config.toml`, or any `*baseline*` SQL anywhere in the repo. The only `baseline` hit is `website/scripts/audit/baseline-advisors.json`, a Supabase advisor-lint snapshot, unrelated to schema.

**The seven `website/supabase-*.sql` root files are not a baseline.** Every one is headed "Run this in Supabase SQL Editor", and every one is frozen on **2026-04-11**:

| File | Lines | Last commit |
|---|---|---|
| `website/supabase-migration.sql` | 120 | 2026-04-11 00:20 |
| `website/supabase-admin-migration.sql` | 47 | 2026-04-11 01:02 |
| `website/supabase-tables-migration.sql` | 119 | 2026-04-11 02:25 |
| `website/supabase-all-migrations.sql` | 219 | 2026-04-11 13:47 |
| `website/supabase-coordinates-migration.sql` | 7 | 2026-04-11 13:47 |
| `website/supabase-rls-fix.sql` | 40 | 2026-04-11 13:47 |
| `website/supabase-subscriptions-migration.sql` | 10 | 2026-04-11 13:47 |

Migration `001_analytics_events.sql` landed 2026-04-11 **23:26**, *after* the newest of them. So the entire numbered series (001–073, two and a half months of schema change) is invisible to these files.

`supabase-all-migrations.sql` is the one that looks like a baseline and is not: its header (`:1-4`) says *"WALLSPACE: Complete database setup / Run this ONCE"*, still carrying the pre-rename brand, and `:6-8` shows it is a concatenation of its three same-day siblings. Running it on a fresh DB gets you an April-11 schema, ~70 migrations behind. It also **omits** the `artist_profiles` / `artist_works` / `venue_profiles` block that `supabase-migration.sql` defines, so it is not even a faithful concatenation.

**This has already caused a production outage.** `website/src/app/api/account/preferences/route.ts:15-22` documents a live 500 whose stated cause is exactly this: *the repo migration that defined the column was never applied, and the prod bootstrap from `supabase-all-migrations.sql` omits it.* That comment is the strongest possible argument for K11, production was bootstrapped from a file that is not the schema, and a route had to be defensively coded around the resulting drift.

**Totals:** 73 numbered migrations, +1 legitimate backfill helper (`website/supabase/backfill-accepted-artists.sql`), +7 stale root one-offs, +1 audit query. **82 `.sql` files, 0 baselines.**

### 11.2 Why this compounds every other knot

Without a committed schema you cannot answer, from the repo alone: which tables have RLS enabled, which columns are nullable, what the constraints are, whether `orders.amount_cents` has a CHECK. Findings E24, E27 and E29 are all "RLS is off on table X", and there is no artefact in this repo that would have told you. The only way to know the schema is to ask production.

That also means **K5, K6, K10 and CC3 cannot be verified**, only asserted.

### 11.3 Procedure

**Step 1 `K11a`: dump the current production schema** to `website/supabase/migrations/000_base_schema.sql`:
```bash
npx supabase db dump --linked --schema public --file supabase/migrations/000_base_schema.sql
```
Include RLS policies, constraints, indexes, triggers and functions. Exclude data.

**Step 2 `K11b`: reconcile.** Apply `000` + `001`–`077` to a scratch DB, dump the result, diff against the production dump. Any difference is either a migration that was never applied to prod, or a manual prod change that was never migrated. **Both are findings.** Expect the `002_run_me.sql` ghost (§10.1) to show up here.

**Step 3 `K11c`: delete the seven stale root files.** `git rm website/supabase-*.sql`. They are actively misleading, a new contributor running `supabase-all-migrations.sql` gets an April schema and a brand name that no longer exists. Belongs in the §08 cull.

**Step 4 `K11d`: wire the CI schema job** (shared with K10c): fresh Postgres → apply `000` through the highest → run `npm run audit:advisors` against it → fail on any advisor regression.

### 11.4 The test that proves it

The CI job. Specifically: **a fresh database built from the repo alone reaches the same schema as production.** Until that job is green, K11 is not fixed.

Plus a cheap unit test: `000_base_schema.sql` exists and is non-empty.

### 11.5 Guard

- **CI job** from step 4 on every migration PR.
- **Convention:** any structural change to production goes through a migration file. No dashboard SQL that is not also committed. Add to `AGENTS.md`.
- Regenerate `000_base_schema.sql` on a schedule (quarterly) or when the migration count passes a threshold, squashing applied migrations into it.

---

## 12. The monolith: decomposing `browse/page.tsx`

### 12.1 What is in there

`website/src/app/(pages)/browse/page.tsx`, **2,883 lines**, 146 KB, one `"use client"` component.

Already extracted (do not redo):
- `browse/filterParams.ts` (456 lines), URL ⇄ state serialisation, with 296 lines of tests
- `browse/locationParams.ts` (123 lines), location params, with tests
- `components/BrowseArtistCard.tsx`, `components/CollectionCard.tsx`, `components/browse/SizeBands.tsx`

Still inside the monolith:

| Concern | Lines |
|---|---|
| Local helpers (`calcDistance`, `CheckPill`, `DistanceSliderControl`) | 40–271 |
| Constants (`VENUE_TYPES`, `DISTANCE_OPTIONS`, `Filters`, `DEFAULT_FILTERS`, `PAGE_SIZE`) | 57–115, 285 |
| **~45 `useState` hooks** | 299–614 |
| URL hydrate + mirror effects | 616–760 |
| Geolocation / postcode | 469–551, 789–828 |
| Data fetch (`/api/browse-artists`, `/api/browse-collections`) | 544–566 |
| Derivations: `filteredArtists`, `allGalleryWorks`, `filteredGalleryWorks` + sorts | 829–1210 |
| Artists view (sidebar + grid) | 1564–1902 |
| Gallery view (sidebar + masonry grid + pagination) | 1903–2686 |
| Collections view (sidebar + grid) | 2687–2839 |
| Footer sections | 2840–2883 |

Three audit findings live in here:
- **Bug 4**, "Sort: Price (low to high)" does not sort
- **Bug 2**, test/duplicate artists leak through (14 registered vs 51 listed)
- **E15**, "1 artists" / "1 works" unguarded plurals at `:1555-1556`

### 12.2 What I found about the price sort: read this before "fixing" it

**The comparator is correct.** `page.tsx:1061-1076`:
```ts
if (gallerySort === "price_low") {
  const aPrices = a.pricing.map(p => p.price).filter(n => n > 0);
  const bPrices = b.pricing.map(p => p.price).filter(n => n > 0);
  const aMin = aPrices.length > 0 ? Math.min(...aPrices) : Infinity;
  const bMin = bPrices.length > 0 ? Math.min(...bPrices) : Infinity;
  return aMin - bMin;
}
```
That takes the minimum entry price and sorts ascending. It is right. URL hydration is also wired (`filterParams.ts:145` maps `gallerySort` → `gsort`; `page.tsx:702` applies it on mount).

**The scrambling happens at render.** `page.tsx:2409-2411`:
```ts
const visibleWorks = filteredGalleryWorks.slice(0, loadedWorks);
const masonryCols = Array.from({ length: galleryColCount }, () => []);
visibleWorks.forEach((w, i) => masonryCols[i % galleryColCount].push(w));
```
Sorted items are dealt round-robin into 2 or 3 flex columns (`:439-448`). The comment at `:435-437` claims this preserves reading order, and it would, *if every card were the same height*. They are not; that is the point of a masonry layout. With unequal heights the rows do not line up, so the visual sequence down and across is not the sort order. The audit's observed `30,30,30,30,30,40,60,30,30` is exactly what a 3-column round-robin of a sorted list looks like when you read it as rendered.

**So Bug 4 is a layout bug wearing a sorting bug's clothes.** Which is itself the argument for this decomposition: with the comparator in a pure module and the masonry in a presentational component, the comparator gets a unit test that passes, the layout gets a test that fails, and you find that out in seconds instead of from a stress test.

*Stated confidence: the comparator is verified correct by reading; the layout explanation is consistent with the audit's observed output but I did not re-run the live repro.*

### 12.3 Target structure

```
src/app/(pages)/browse/
  page.tsx                       ~150 lines: Suspense boundary, view switch, layout
  filterParams.ts                (exists)
  locationParams.ts              (exists)
  useBrowseQuery.ts              NEW, all filter state + URL hydrate/mirror
  useBrowseData.ts               NEW, the two fetches + dataReady
  selectors.ts                   NEW, pure filter + sort functions
  constants.ts                   NEW, VENUE_TYPES, DISTANCE_OPTIONS, PAGE_SIZE, DEFAULT_FILTERS
  components/
    BrowseFilterPanel.tsx        NEW, sidebar, parameterised by view
    BrowseResultsGrid.tsx        NEW, grid + masonry + pagination
    GalleryWorkCard.tsx          NEW, the inline card at :2409-2540
    CheckPill.tsx                MOVED from :117
    DistanceSliderControl.tsx    MOVED from :185
```

Each independently testable:
- `selectors.ts`, pure functions, no React. `sortWorks(works, "price_low")` is a one-line test.
- `useBrowseQuery`, `renderHook` + a mock `useSearchParams`. The existing `page.test.tsx:106-176` tests move here almost unchanged.
- `useBrowseData`, mock `fetch`, assert `dataReady` flips after both settle.
- `BrowseFilterPanel`, render, click, assert the callback fires. No router, no data.
- `BrowseResultsGrid`, render N works, assert **DOM order matches input order**. This is the test that catches Bug 4.
- `GalleryWorkCard`, snapshot + a11y.

### 12.4 Extraction order: page works at every commit

Deliberately **inside-out**: pure things first, stateful things last, so each step's blast radius shrinks rather than grows.

**Step 1 `B1`: constants.ts.** Move `VENUE_TYPES` (:57), `DISTANCE_OPTIONS` (:67), `Filters` (:76), `DEFAULT_FILTERS` (:95), `PAGE_SIZE` (:285). Pure move, re-import.
*Risk: nil. Verify: `npm run check`.*

**Step 2 `B2`: presentational leaves.** Move `CheckPill` (:117-184) and `DistanceSliderControl` (:185-271) to `components/`. Both already take props only.
*Risk: nil.*

**Step 2b `B2b`: kill the three SIZE_BANDS` and the duplicate `calcDistance`.`** The §13 sweep found:
- `SIZE_BANDS` defined **three times**: `components/browse/SizeBands.ts:20` (canonical, keys, labels, cm ranges, hints), `browse/filterParams.ts:36` (key-only + the `SizeBand` type at `:34`), and a **third local table** at `browse/page.tsx:1188` whose labels have already diverged (`"Extra-large"` vs the canonical `"XL"`). `browse/page.tsx:16` already imports `bandsForWork` from the canonical module while rendering from its own table, and `browse/collections/[collectionId]/page.tsx:15` imports `SIZE_BANDS` correctly. So the two size filters inside the same feature show different labels.
- `calcDistance` (haversine, `R = 3958.8`) is duplicated verbatim at `browse/page.tsx:40` and `spaces/page.tsx:58`. Step 3 moves it to `selectors.ts`; repoint `spaces/page.tsx` too, or it stays a duplicate.
- `SearchParamsLike` is declared identically in the two sibling files `locationParams.ts:46` and `filterParams.ts:176`.

*Risk: low. This is the cheapest correctness win in the whole decomposition.*

**Step 3 `B3`: selectors.ts**, the highest-value step. Extract as pure functions:
- `filterArtists(artists, criteria): Artist[]` from `:851-972`
- `filterWorks(works, criteria): GalleryWork[]` from the `.filter()` at `:985-1051`
- `sortWorks(works, sort, userCoords): GalleryWork[]` from the `.sort()` at `:1052-1090`
- `sortArtists(artists, sort, userCoords)`
- `calcDistance` (:40)

Signature discipline: no hooks, no `window`, no `document`, every input explicit. The `useMemo`s in `page.tsx` become one-line calls.

**Write the tests at this step, not later.** In particular:
```ts
it("price_low returns works ordered by their cheapest price", () => {
  const out = sortWorks([w(60), w(30), w(40)], "price_low");
  expect(out.map(cheapest)).toEqual([30, 40, 60]);
});
```
This **passes** on the extracted code, and that is the finding: it proves the comparator was never the bug and points at step 6.
*Risk: low, pure functions. Verify: existing `page.test.tsx` still green.*

**Step 4 `B4`: useBrowseData.ts.** Extract `:544-566`. Returns `{ artists, collections, dataReady }`.
*Risk: low, one effect with no dependencies.*

**Step 5 `B5`: useBrowseQuery.ts**, the big one, ~40 `useState` hooks plus the hydrate (`:697-735`) and mirror (`:746-758`) effects plus the `filterState` memo (`:636-693`).

Return a single object:
```ts
const { filters, setFilter, resetFilters, location, setLocation, sort, setSort } = useBrowseQuery();
```
Consider `useReducer` over 40 `useState`s, a reducer makes "which filters exist" a single readable list and makes `resetFilters` one dispatch. Do that inside the hook, so `page.tsx` never sees it.

**Preserve the two non-obvious invariants** documented at `:616-631` and `:694-696`, and put them in the hook's doc comment:
1. **Local state is the owner.** URL hydrates once on mount (`hydratedRef`), then state mirrors to URL. No filter is a URL-controlled-every-render value, otherwise sliders snap back mid-drag.
2. **The loop guard** (`:753`): `if (nextQs === currentQs) return;` before `router.replace`.

Move `page.test.tsx:106-176` to `useBrowseQuery.test.ts` unchanged, they are already testing exactly this hook's behaviour, just through the page.
*Risk: highest in the sequence. Mitigation: the four existing URL-sync tests are the safety net. If they stay green, the extraction is faithful.*

**Step 6 `B6`: BrowseResultsGrid.tsx + `GalleryWorkCard.tsx`.** Extract `:2400-2560` (masonry, cards, "Show more"). Grid props: `items`, `columns`, `pageSize`, `loaded`, `onLoadMore`.

**Fix the masonry here.** Either drop to CSS grid with `grid-auto-flow: row` (reading order = DOM order, no redistribution), or keep columns and accept that visual order ≠ sort order and say so in the UI. Recommend the former.

The regression test:
```ts
it("renders items in the order given", () => {
  render(<BrowseResultsGrid items={[a, b, c]} columns={3} ... />);
  expect(screen.getAllByTestId("work-card").map(el => el.dataset.id))
    .toEqual(["a", "b", "c"]);
});
```
**Bug 4 closes at this commit.**

**Step 7 `B7`: BrowseFilterPanel.tsx.** The three sidebars (`:1569`, `:1908`, `:2695`) are near-identical structures over different field sets. Extract one component taking a field descriptor list. This is the largest line reduction and the lowest risk, because by now the panel is pure props.

**Step 8 `B8`: split the three views** into `ArtistsView.tsx`, `GalleryView.tsx`, `CollectionsView.tsx`. `page.tsx` becomes the Suspense boundary plus a switch.

**Step 9 `B9`: the plurals and the test-data filter.**
- Add `src/lib/pluralise.ts`, **there is no plural helper in this codebase today** (verified). Fix `:1555-1556`, and sweep the other unguarded sites found: `browse/collections/[collectionId]/page.tsx:131`, `artist-portal/portfolio/page.tsx:1846`, `api/placements/route.ts:648`, `api/offers/route.ts:478`, `components/offers/OffersList.tsx:291`, `emails/_components/Cards.tsx:137`. (E15 also names two email templates with "1 venues".)
- **Test-data leak (Bug 2): fix it at the source, not in the grid.** `browse/page.tsx` fetches `/api/browse-artists` (`:544`), which calls `getAllArtists()` → `merged-data.ts:17`. Add the review-status / test predicate in `src/lib/db/artist-profiles.ts:70`, so **every** consumer benefits. Filtering in the browse page would be a fourth place that knows what a "real" artist is. See K8 step 5.

### 12.5 Guard

A file-length check in CI, as a unit test so it runs in `npm run check`:

```ts
// tests/integration/no-monoliths.test.ts
const LIMIT = 600;
const ALLOWLIST = new Set<string>([]); // shrinks over time, never grows
it("no source file exceeds 600 lines", () => { /* walk src/, assert */ });
```

Seed the allowlist with today's offenders (`browse/page.tsx` while decomposition is in flight, `api/placements/route.ts`, `api/webhooks/stripe/route.ts`, `PlacementDetailClient.tsx`, the two portal placements pages) and require that **removing an entry is allowed, adding one needs a written reason in the PR**. A 2,883-line file is not a style problem: it is the reason three unrelated bugs could live in one file without anyone noticing they were neighbours.

---

## 13. The other 27 duplicate pairs

None of these are in the original eleven. Each was verified by reading both sides. They are ordered by **live blast radius**, not by size.

There is no `-v2`, `legacy`, `deprecated` or `.bak` filename anywhere in `src/`, which is why these were invisible. **The knot in this codebase does not announce itself in filenames.** It hides as two files with sensible, different names doing the same job.

### Tier 1: carries a live defect today

#### 13.1 Two entirely separate notification-preference systems ★ worst find

| | |
|---|---|
| A | `src/app/api/account/preferences/route.ts:33`, `PREF_FIELDS = [email_digest_enabled, message_notifications_enabled, order_notifications_enabled]`, stored as **columns** on `artist_profiles` / `venue_profiles` / `customer_profiles`. Client: `src/lib/use-notification-prefs.ts:22` (the same array re-declared verbatim). Rendered by **all three** portal settings pages: `artist-portal/settings/page.tsx:16`, `venue-portal/settings/page.tsx:58`, `customer-portal/settings/page.tsx:10`. |
| B | `src/app/api/account/email-preferences/route.ts:18`, `BOOLEAN_FIELDS = [placements_enabled, messages_enabled, digests_enabled, recommendations_enabled, tips_enabled, newsletter_enabled, promotions_enabled]`, stored in the **`email_preferences` table**. Client: `src/app/(pages)/account/email/page.tsx:45`. |

**TRUE DUPLICATE, and already a live bug.** `src/lib/email/send.ts:108` reads **only** `email_preferences` (system B), via `preferenceKeyFor` (`src/lib/email/categories.ts:48`). So:
- `email_digest_enabled` and `order_notifications_enabled` are **written by the settings UI and read by nothing**. They are inert switches. A user who turns off order notifications still gets them.
- `message_notifications_enabled` is read only at `src/app/api/messages/route.ts:541` and `:564`, so message emails are gated by **two independent toggles in two different UIs**, and turning one off does not turn the other off.

This is a user-trust defect, not a tidiness one. It should be treated at K1/K7 severity. **Survivor: system B** (`email_preferences`). It is what the send pipeline reads, it has the finer taxonomy, and it is table-backed rather than column-per-profile-type. Migrate the three portal settings pages onto it, drop the three columns, delete `use-notification-prefs.ts` and `api/account/preferences/`.

Sub-duplicate inside A: `PREF_FIELDS` and the `DEFAULT_*` objects are declared identically in both the route (`:33`) and the hook (`:22`), with no shared import, so the server validates against its own private copy of the schema.

#### 13.2 Two `parseDimensions`, both called on the same page

| | |
|---|---|
| A | `src/lib/shipping-calculator.ts:59`, sorts the numeric pair **descending** (loses width/height orientation), `>300 ⇒ mm`, `Math.round`s to integers, A0–A5 only (**A4 = 21×30**) |
| B | `src/lib/visualizer/dimensions.ts:79`, **preserves orientation**, prefers the parenthesised hint, adds B-series/Letter/Legal/Tabloid and metres, `<30 ⇒ in`, `>1000 ⇒ mm`, no rounding (**A4 = 21×29.7**) |

**TRUE DUPLICATE with disagreeing output.** `src/app/(pages)/browse/[slug]/[workSlug]/ArtworkPageClient.tsx:17-21` imports `parseDimensions` from B **and** `resolveShippingCost` + `formatDimensionsForDisplay`, which internally call A. **The same page parses the same `work.dimensions` string with two parsers that disagree.**

This is the mechanism behind Bug 7 (size stored as the string `"undefined"`) and Bug 8 (artwork page quotes £20 shipping, checkout charges £18). Fixing either bug without collapsing this pair will fix it on one surface and leave the other.

Usage: A has 7 importers (checkout, portfolio, `ArtworkPageClient`, `components/browse/SizeBands.ts:5`, `lib/shipping-checkout.ts`, `lib/format-dimensions.ts:23`, `lib/dimensions.ts:24`); B has 4 (`ArtworkPageClient.tsx`, `components/visualizer/{WorksPanel,ItemToolbar,WallVisualizer}.tsx`).

**Survivor: B.** It is strictly more capable and it preserves orientation, which a shipping calculator genuinely needs (a 100×20 canvas is not a 20×100 parcel). Port A's callers to B, then delete A.

#### 13.3 Two dimension-display formatters, one self-documented as a copy

| | |
|---|---|
| A | `src/lib/dimensions.ts:53` `displayPhysicalDimensions`, hides pixel/implausible strings, returns the original string on success |
| B | `src/lib/format-dimensions.ts:57` `formatDimensionsForDisplay`, same guards, but reformats to `"24 × 35 in (60 × 90 cm)"` |

`PIXEL_HINT`, `RAW_PIXEL_PAIR`, `MAX_REASONABLE_CM` and the `>1000 both sides` guard are copy-pasted. `format-dimensions.ts:31` says so out loud: *"Mirrored in lib/dimensions.ts → displayPhysicalDimensions so the two helpers agree."* **A comment promising two files will stay in sync is a knot with a note attached.**

Usage: B has 4 call sites, A has 2, both **venue-facing** (`venue-portal/labels/page.tsx:239`, `components/offers/OffersList.tsx:369`). So venues see the unformatted variant. **Survivor: B.** Collapse with §13.2.

#### 13.4 Two carrier-tracking resolvers that disagree, and the dead one has the better name

| | |
|---|---|
| A | `src/lib/shipping.ts:11` `detectCarrier`, 7 carriers, **no URL-encoding**, `dhl.co.uk`. **Zero call sites. The whole file is dead.** |
| B | `src/lib/carrier-tracking.ts:36` `detectCarrierUrl`, 4 carriers, URL-encodes, `dhl.com`. 3 call sites (`artist-portal/orders/page.tsx:215`, `customer-portal/page.tsx:192`, `venue-portal/orders/page.tsx:149`) |

**TRUE DUPLICATE with opposite behaviour on the same input:** a 12-digit tracking number matches **DHL** in A (`/^\d{10,12}$/`) and **FedEx** in B.

The trap is the naming. `detectCarrier` is the obvious thing to grep for, and it is the dead one. Anyone extending carrier support will find A first, edit it, and ship nothing. **`git rm src/lib/shipping.ts`**, but port its three extra carriers (Evri, UPS, Parcelforce) into B first.

#### 13.5 Three parallel client-side stores for saved items

| | |
|---|---|
| A | `src/context/SavedContext.tsx:21`, the global provider (`useSaved`). Consumers: `venue-portal/saved/page.tsx:17`, `SaveButton`, the header count |
| B | `src/app/(pages)/artist-portal/saved/page.tsx:70`, `:105`, own `useState` + direct `authFetch("/api/saved")` |
| C | `src/app/(pages)/customer-portal/saved/page.tsx:86`, `:104`, the same again |

**TRUE DUPLICATE.** Live consequence: unsaving on the artist or customer page does not update the context, so **the header's saved count goes stale** until a reload. The venue page, which uses the context, behaves correctly. **Survivor: A.** Two pages to migrate.

#### 13.6 Artist payout derivation, four copies, one with a `||`/`??` bug

Covered in §6.3, folded into K6.

#### 13.7 Five venue-type vocabularies that cannot match each other

| Source | Shape |
|---|---|
| `src/app/(pages)/browse/page.tsx:57` | `["Cafés","Restaurants","Hotels","Offices","Bars","Galleries","Salons"]` (plural, accented) |
| `src/app/(pages)/spaces/page.tsx:66` | `["All","Café","Restaurant","Hotel","Office","Salon","Gallery","Coworking","Wine Bar"]` (singular) |
| `src/app/(pages)/curated/CuratedClient.tsx:21` | 11 entries incl. `"Bar / pub"`, `"Clinic"`, `"Event space"`, `"Other"` |
| `src/app/(pages)/signup/venue/page.tsx:15` | slash-form: `"Café / Coffee Shop"`, … |
| `src/components/ApplicationForm.tsx:42` + `src/app/(pages)/artist-portal/profile/page.tsx:292` | ampersand-form: `"Cafes & Coffee Shops"`, … (byte-identical to each other) |

Ground truth in `src/data/venues.ts:4` is **a sixth set**.

**TRUE DUPLICATE of a taxonomy, fully diverged.** The consequence is concrete: a venue that signs up and picks `"Café / Coffee Shop"` **can never be matched by the browse filter**, which looks for `"Cafés"`. This is a silent marketplace-matching failure, and it is invisible in testing unless you sign a venue up through the real form and then try to find it.

Fix as K3-class work: one `src/data/venue-types.ts` exporting the canonical enum plus a display map, imported by all six. Add a migration normalising existing rows.

### Tier 2: true duplicates, no known live defect yet

#### 13.8 Two arrangement-type domains (folded into K3)
`src/lib/placements/arrangement.ts:38-52` `deriveArrangementType()` returns **five** values (`free_loan`, `paid_loan`, `revenue_share`, `purchase`, `mixed`); `src/lib/arrangement-labels.ts:6-7` `ARRANGEMENT_TYPES` has **three**. The writer can produce values the labeller has no label for, that is E15's second half, `labelForArrangement("mixed")` → `"Other arrangement"`, shown to users. Fixed in **K3a**.

#### 13.9 Duplicate `ArrangementType` type name
`arrangement-labels.ts:7` (3-member union) and `placements/arrangement.ts:23-28` (5-member union). Same exported name, different types. Collapse to one in **K3a**.

#### 13.10 Two wall visualisers, both branches live behind one flag
`src/components/WallVisualiser.tsx` (139 lines, CSS overlay, British spelling) vs `src/components/visualizer/WallVisualizer.tsx` (1,815 lines, Konva editor). `ArtworkPageClient.tsx:62` picks between them on `WALL_VISUALIZER_V1`, rendering the legacy modal at `:702` when off. The flag is `prodDefault: true` and documented as a kill switch, so the off-branch is **shipped but never exercised**. Textbook §0.1 violation: the v2 landed, the v1 stayed. Delete `WallVisualiser.tsx` and the flag.

#### 13.11 HMAC signed-token module copy-pasted
`src/lib/oauth-state.ts` vs `src/lib/order-tracking-token.ts`. `base64url` (`:24`/`:22`), `fromBase64url` (`:32`/`:28`), `getSecret`, `SignOptions` (`:38`/`:32`) and the sign/verify bodies (`payload.expiresAt.sig`, `timingSafeEqual`) are near-verbatim; only the env var, payload shape and TTL differ. **This is crypto.** A fix to the signature comparison or the padding in one will not reach the other. Extract `src/lib/signed-token.ts`; both callers parameterise on secret + payload type.

#### 13.12 QR-label builder duplicated per persona
`artist-portal/labels/page.tsx` (559 lines) vs `venue-portal/labels/page.tsx` (566 lines), a 922-line diff. Both import the same `LABEL_SIZES` / `LABEL_STYLES` / renderers from `components/labels/QRLabel.tsx`, then re-implement the entire config/preview/print flow. **Already diverged:** default `showMedium` is `true` (artist) vs `false` (venue); the venue page pipes through `displayPhysicalDimensions` and the artist page does not; the artist page has portfolio-label and venue-picker features the venue page lacks.

#### 13.13 Wall-list card duplicated, with three fixes on one side only
`artist-portal/showroom/page.tsx:132` `WallCard` + `:184` `LoadingGrid` vs `venue-portal/walls/page.tsx:171` + `:234`. `LoadingGrid` is byte-identical. The **venue** card received three fixes the artist one never did: an empty-string guard on `source_image_url`, `ImageWithFallback` instead of a raw `<img>`, and `displayWallName()` for the title. So a legacy wall named `","` renders as a comma in the artist showroom and "Untitled wall" in the venue portal.

**This is the clearest single illustration of the owner's complaint in the whole codebase.** Three bugs were found and fixed, once, in a file that had a twin nobody remembered.

#### 13.14 `displayWallName` defined three times
`venue-portal/walls/page.tsx:29`, `venue-portal/walls/[id]/page.tsx:37`, `components/VenueWallCard.tsx:35`, byte-identical. Plus a fourth site that should have it and doesn't (§13.13).

#### 13.15 Counter-offer submission implemented twice
`components/CounterOfferDialog.tsx:79` `submit()` (used only by `MessageInbox.tsx:1608`) vs `components/offers/OffersList.tsx:218` `openCounter` / `:224` `submitCounter`. Both POST `/api/offers` with the same body. The dialog's docblock (`:8`) admits it "mirrors the dialog used on /artist-portal/offers and /venue-portal/offers (see OffersList.tsx)". **Already diverged:** the dialog re-fetches `GET /api/offers/[id]` to recover the latest amount; the list uses a possibly-stale row. That is a race on a money field.

#### 13.16 Placement lifecycle stage table, three copies
`components/PlacementStepper.tsx:82-86` (**6** steps) vs `artist-portal/placements/page.tsx:92` `MiniStatusBar` (**5** stages) vs `venue-portal/placements/page.tsx:115` `MiniStatusBar` (5, near-identical JSX). Adding a lifecycle stage needs three edits and one of them changes a count.

In the same two files: `nextActionText` (`artist:83`, `venue:97`) are **dead stubs that `return null`**, still called at two render sites each (artist `:1305`, `:1706`; venue `:1388`, `:1825`). Duplicated dead code, invoked four times.

#### 13.17 Four portal shells, two title algorithms, two with none
`ArtistPortalLayout.tsx:50-60` derives the document title from `[...navItems, ...secondaryItems]` with a longest-href sort. `VenuePortalLayout.tsx:35-51` uses a **separately hand-maintained `TITLE_BY_PREFIX` table** re-listing every venue nav label, driven off `usePathname()`. `CustomerPortalLayout.tsx` and `AdminPortalLayout.tsx` have no title sync at all. And `components/portal-nav.test.ts:36` hardcodes **its own third copy** of the artist nav hrefs, so the test cannot detect drift in the layout it is meant to protect.

*Judged on structure and shared imports rather than a line-by-line read of ~1,100 lines. The persona data models genuinely differ, so extracting one shell may cost more than it saves, but the two title algorithms and the test's private nav copy should be collapsed regardless.*

#### 13.18 Slug → display name, five implementations
`artist-portal/page.tsx:74`, `artist-portal/saved/page.tsx:55`, `customer-portal/saved/page.tsx:40`, `venue-portal/page.tsx:73` (all named `formatName`; three byte-identical, one defaults to `"Venue"` instead of `""`), plus `venue-portal/artwork-requests/[id]/page.tsx:18` `artistDisplayName` (also splits on `_`, defaults to `"Artist"`, no "already has a space" shortcut).

A **server-side sibling already exists and is the right answer**: `src/emails/_helpers/resolve-artist-name.ts:17` `resolveArtistName`, DB-backed with a `looksLikeSlug` check. The five client copies are approximations of a function that already exists.

#### 13.19 Two `isDemoUser`: one is a security function that always returns `false`

| | |
|---|---|
| A | `src/data/demo.ts:37-40`, reads `DEMO_USER_IDS` (`:31-35`), a hardcoded array with **both entries commented out**, so it returns `false` unconditionally. **Zero call sites.** |
| B | `src/lib/demo-guard.ts:42-47`, reads `DEMO_ARTIST_USER_ID` / `DEMO_VENUE_USER_ID` from env at call time |

**TRUE DUPLICATE, A is dead and dangerous.** Same name, both in obvious places; importing the wrong one silently opens every demo-mutation guard. Delete `src/data/demo.ts:27-40` in **K8a**.

Worse, and separate: **`assertNotDemo` and `assertNotDemoStrict` have zero call sites in the whole repo.** The only mention is a doc comment at `api/demo/login/route.ts:23`. No mutation route is guarded. The demo-protection layer exists entirely as a module nobody calls. Wire it or delete it, a security control that is documented but not invoked is worse than none, because it stops people looking.

#### 13.20 Analytics range helpers, two byte-identical pairs
`getDateCutoff`: `api/analytics/artist/route.ts:5` and `api/analytics/venue/route.ts:17`. `dateRangeToParam` (and the `dateRanges` array above it): `artist-portal/analytics/page.tsx:11` and `venue-portal/analytics/page.tsx:17`.

#### 13.21 Currency formatting: one library, four reimplementations
Canonical `src/lib/format-currency.ts` has only **3** importers. Bypassed by `admin/page.tsx:37` `formatGbp`, `admin/financials/page.tsx:27` `fmt`, `orders/track/page.tsx:57` `fmtMoney` (a straight duplicate of `formatCurrency`, minus the invalid-ISO fallback), and `emails/types/emailTypes.ts:31` `formatMoney`. Plus ~60 raw `` `£${x.toFixed(2)}` `` sites. The `"From £X"` price-band string is derived independently **six times** in `artist-portal/profile/page.tsx:623` and `artist-portal/portfolio/page.tsx:945,1075,1250,1281,1711`.

Fold into K6's `src/lib/finance/` work, same guard, same lint rule.

#### 13.22 Three copies of the artist profile-attribute list
`browse/[slug]/page.tsx:189-194`, `profile-designs/page.tsx:52-57`, `dev/profile-designs/[slug]/page.tsx:53-58`. **Two of three are dev surfaces**, `profile-designs` and `dev/profile-designs` also duplicate each other wholesale (555 vs 580 lines, sharing `BoolCard`, `VariantSection`, `VariantA`–`VariantD`, differing only in data source and render mode). **Do not deduplicate, cull.** Route to §08. Deleting two files beats deduplicating three.

#### 13.23 Small helpers duplicated verbatim

| Helper | Locations | Note |
|---|---|---|
| `slugify` | `src/lib/slugify.ts:34` (accent-folding, Nordic map, NFD) vs `apply/claim/page.tsx:25` (naive `[^\w\s-]` strip) | **Diverged, and it matters**, the local copy keeps underscores and mangles accented names, and it generates the artist's *claimed slug* |
| `formatRelativeTime` | `artist-portal/page.tsx:516`, `venue-portal/page.tsx:59` | **Diverged**, venue has `if (diffMins < 1) return "just now"`, artist renders `"0m ago"` |
| `clamp` | `artist-portal/showroom/new/page.tsx:591`, `venue-portal/walls/new/page.tsx:556` (identical), `components/visualizer/WallCanvas.tsx:700` (no `Math.round`) | |
| `daysSince` | `api/cron/onboarding-nudges/route.ts:31`, `api/cron/inactive-users/route.ts:26` | identical |
| `linkForItem` | `artist-portal/saved/page.tsx:43`, `customer-portal/saved/page.tsx:28` | identical |
| `formatDate` | `orders/[id]/page.tsx:69`, `PlacementStepper.tsx:33`, `PlacementContextPanel.tsx:64` | partial overlap |
| `statusBadge` | `admin/curation/page.tsx:59`, `artist-portal/blogs/page.tsx:29`, `artist-portal/billing/page.tsx:50` | same pattern, different vocabularies, K4-adjacent |
| `WorkOrientation` | `src/data/artists.ts:3`, `src/lib/visualizer/dimensions.ts:223` | identical union |

Create `src/lib/utils/` (or extend the existing single-purpose lib modules) and import. `slugify` and `formatRelativeTime` first, they are the two that have already diverged.

#### 13.24 Duplicated email enums
`EmailStream` / `EmailCategory` declared in both `src/emails/types/emailTypes.ts:9,13` and `src/lib/email/streams.ts:8` / `src/lib/email/categories.ts:6`. Folded into **K1g** (§1.4 step 7).

#### 13.25 Two schema-bootstrap paths
Folded into **K11** (§11.1), including the documented production 500 it caused.

#### 13.26 Offer status capitalisation
`src/components/offers/OffersList.tsx:90` hand-rolls `status.charAt(0).toUpperCase() + status.slice(1)` exactly as `PlacementDetailClient.tsx:560` does. Different domain, same anti-pattern; the K4 lint rule catches it.

#### 13.27 Dead code found in passing
- `src/data/artists.ts:4084` `getWorkById` and `:4092` `getArtistBySlug`, zero call sites. The **live** `getArtistBySlug` is `src/lib/db/merged-data.ts:48`. The static one shadows the name in every search, which is how someone ends up editing the wrong function.
- `src/lib/shipping.ts`, entire file dead (§13.4).
- `src/lib/feature-flags.ts:126` `listFlags()`, no callers; the `/api/_internal/flags` page it was written for does not exist.

### 13.28 Every feature flag has both branches live

This deserves its own note, because it is the §0.1 rule being violated systematically rather than accidentally.

| Flag | dev / prod | Both branches live? |
|---|---|---|
| `WALL_VISUALIZER_V1` | on / **on** | **Yes**, 21 call sites; the off-branch renders the legacy `WallVisualiser` (`ArtworkPageClient.tsx:702`). Shipped, never exercised. |
| `OAUTH_GOOGLE_APPLE` | off / off | **Yes**, three `{!isFlagOn} / {isFlagOn}` pairs (`login/page.tsx:179,184`; `signup/artist/page.tsx:202,207`; `signup/customer/page.tsx:167,172`). The on-branch has never shipped. |
| `PAID_LOAN_V2` | on / **off** | **Yes**, K2, plus UI branches at `PlacementDetailClient.tsx:510,534` |
| `GATING_V1` | off / off | **Yes**, 7 sites (`api/placements/route.ts:322,807`; `api/messages/route.ts:341`; `api/me/subscription/route.ts:22`; `api/artist-works/route.ts:48,156`; `lib/db/merged-data.ts:35`). Off in prod, so the entire paywall path is dead in production. |
| `BLOGS_V1` | on / **off** | **Guard-only, and inconsistently**, only 2 API sites gate (`api/blogs/route.ts:84`, `api/blogs/[id]/route.ts:100`, both 404). `artist-portal/blogs/`, `admin/blogs/`, `components/BlogEditor.tsx`, `lib/blogs/` and the sidebar entry (`ArtistPortalLayout.tsx:35`) are **not** gated, so the UI ships in production and calls APIs that 404. **That is Bug 12**: the blog editor shows "Saved" and persists nothing. |

**Five flags, five pairs of live branches.** A flag is meant to gate a rollout and then be deleted. Here they have become the mechanism by which duplicates are made permanent and given a justification. Add to the §14.3 rule: *a flag whose losing branch is still in the tree one release after the flag landed is a knot; delete the branch.*

`GATING_V1` and `BLOGS_V1` in particular should be resolved with a decision, not a refactor: either turn them on and delete the off-branch, or turn them off and delete the feature.

---

## 14. Making the guards real

Every guard in this document is worthless under the current CI configuration. **Fix that first.**

### 14.1 The blocker

`.github/workflows/ci.yml:41-43`:
```yaml
- name: Lint (informational)
  run: npm run lint
  continue-on-error: true
```

**Lint does not block CI.** PR #65 raised `no-raw-arrangement-type` to `"error"`, and it blocks nothing. Every ESLint-based guard proposed here (§2.7, §3.6, §4.6, §6.6, §7.6) is decoration until this flag is removed. This is Task 0 in the master runbook §1.1 and it is a genuine prerequisite for Phase 6, not a nice-to-have.

Also missing from CI: `npm run depcheck` (needed for §1.6) and `npm run audit:advisors` (needed for §11).

### 14.2 Guard inventory

| Knot | Guard | Mechanism | Blocked on |
|---|---|---|---|
| K1 | one email entrypoint | dependency-cruiser rule + `depcheck` in CI | adding `depcheck` to CI |
| K2 | one subscription creator | ESLint `no-parallel-billing` | lint blocking |
| K3 | one label source | extend `no-raw-arrangement-type` to literals | lint blocking |
| K4 | one status renderer | ESLint `no-raw-status-display` | lint blocking |
| K5 | no manually-refreshed cache columns | grep test in `npm run check` | nothing |
| K6 | one revenue module | ESLint `no-inline-money-aggregate` | lint blocking |
| K7 | no `sendEmail` in webhooks | ESLint `no-inline-email-in-webhook` | lint blocking |
| K8 | redirect + name-collision integrity | Playwright e2e + dev assertion | nothing |
| K9 | authz-or-allowlist | CI check (CC1) | `implementation/01` |
| K10 | unique migration prefixes | unit test in `npm run check` | nothing |
| K11 | schema builds from zero | CI job on a scratch Postgres | new CI job |
| Monolith | 600-line file cap | unit test in `npm run check` | nothing |
| §13 | no "mirrors X" sync-promise comments | grep test in `npm run check` | nothing |
| §13.28 | no flag with both branches live | manual review at flag-deletion time | nothing |

**Six guards need nothing but the code.** Land those first, they are the ones that will still be working in six months.

The sync-promise guard is the cheapest high-value one in the table. Every instance of a comment saying one file mirrors another turned out to be a divergence:
- `format-dimensions.ts:31` "Mirrored in lib/dimensions.ts … so the two helpers agree" → §13.3, diverged
- `artist-portal/analytics/page.tsx:35` "Mirrors the dashboard's calculation … so Analytics and Dashboard show the same number" → §6.3, diverged (`||` vs `??`)
- `CounterOfferDialog.tsx:8` "Mirrors the dialog used on … see OffersList.tsx" → §13.15, diverged
- `placements/[id]/route.ts:33` "re-use same approach as the list endpoint" → §6.3, diverged
- `placements/arrangement.ts:19-21` "matches the placement status helper … so the derived header label and the stored column don't diverge" → §13.8, diverged

Test it as a grep for `/[Mm]irror(s|ed)? (in|the)|same approach as|kept (in sync|consistent) with/` across `src/`, with the message: *"If two things must agree, make them one thing. This comment has a 5-for-5 track record of preceding a divergence."*

Per the master runbook §1, every new ESLint rule ships with `tests/integration/eslint-<rule>.test.ts` that lints a fixture and asserts the rule fires. That is the established convention here; follow it.

### 14.3 The repo-wide rule, as text to paste

Add to `website/AGENTS.md`:

```markdown
## One implementation per concept

Adding a new implementation requires deleting the old one in the same PR.

If you are writing a second way to do something this codebase already
does (a second email sender, a second billing path, a second label
function, a second revenue calculation), the PR that adds it must also
delete the first one and migrate every call site. Not deprecate. Not
comment out. Not `void oldThing;`. Not "keep for backwards
compatibility". Delete.

If the old path cannot be deleted in the same PR, do not open the PR.
Either split the work so it can be, or put the new implementation
behind the old one's interface so there is still exactly one entry point.

Never introduce a `-v2` / `_new` / `Legacy` name. A name that
distinguishes two implementations of the same concept is a confession
that both are live.

Feature flags gate a *rollout*, not two permanent code paths. A flag
whose losing branch is still in the tree one release after the flag
landed is a knot. Delete the losing branch when the flag lands. As of
2026-07-29 all five flags in this repo have both branches live.

Never write a comment promising two files will stay in sync
("Mirrors X", "same approach as Y", "kept consistent with Z"). There
are five of those in this codebase and every one of them is now a
divergence. If two things must agree, they must be one thing.

Cost of ignoring this, measured: 38 concepts with two or more live
implementations, producing 5 emails per purchase, two billing systems
that can double-charge, six vocabularies for one venue-type enum,
notification toggles that are written and never read, and a dashboard
that disagrees with its own analytics page.
```

Also add to §"Data invariants" (new):
```markdown
- A DB column that mirrors a computed value must be written by a trigger
  or by a scheduled job in vercel.json. A column written only by a manual
  admin endpoint is banned.
- New migrations take the next free number above the current maximum.
  Never reuse a number, never backfill a gap.
- Structural changes to production go through a committed migration.
  No dashboard SQL that is not also in the repo.
```

---

## 15. Ordered task checklist

Sequenced so knots blocking the transaction work come first. Each row is one PR unless noted; each leaves `npm run check` green.

### Phase 0: Make guards enforceable (prerequisite, ~½ day)

- [ ] **0.1** Remove `continue-on-error: true` from `.github/workflows/ci.yml:43`. Clear the React Compiler warning backlog first if needed.
- [ ] **0.2** Add `npm run depcheck` to the CI `check` job.
- [ ] **0.3** Add `npm run audit:advisors` as a CI job.
- [ ] **0.4** Add the three no-blocker guards now: migration-prefix test (§10.5), file-length cap (§12.5), stats-source grep test (§5.6).
- [ ] **0.5** Paste §14.3 into `website/AGENTS.md`.

### Phase 1: Transaction-blocking knots (K1, K2, K7)

**K7 first**, it is contained, high-visibility, and shares a file with K1e/K2.

- [ ] **1.1** `K7a` enrich `CustomerOrderReceipt` binding + merge the three artist templates into `ArtistOrderReceived`
- [ ] **1.2** `K7b` delete the three legacy sends (`stripe/route.ts:524-559`, `:571-591`, `:593-610`), *land with 1.1 as one PR*
- [ ] **1.3** `K7c` delete orphaned templates + registry entries; add the "exactly one email per party" test (§7.5)
- [ ] **1.4** `K7d` ESLint `no-inline-email-in-webhook` + its fixture test

- [ ] **1.5** `K2a` add the `mode:"subscription"` webhook branch + Stripe idempotency key on `setup/route.ts:96` **← highest severity item in this document**
- [ ] **1.6** `K2b` move the invoice handlers to `paid-loan-webhooks.ts`, ungated, no transfer call
- [ ] **1.7** `K2c` repoint `placements/route.ts:1310` and `:1330`
- [ ] **1.8** `K2d` delete `src/lib/placements/paid-loan-billing.ts` + rewrite its tests
- [ ] **1.9** `K2f` ESLint `no-parallel-billing` + fixture test
- [ ] *(K2e: delete the `PAID_LOAN_V2` flag. Deferred to 2.6, after K3.)*

- [ ] **1.9b** §13.1 **Collapse the two notification-preference systems** onto `email_preferences`. Promoted from Phase 7: `order_notifications_enabled` is a live, user-visible toggle that does nothing, and order email is transaction work.

- [ ] **1.10** `K1a` delete dead `confirmApplicationToArtist`
- [ ] **1.11** `K1b` migrate the admin-notification group (apply, contact, enquiry, register-venue, curation)
- [ ] **1.12** `K1c` migrate the placement group (2 routes, 4 sites)
- [ ] **1.13** `K1d` migrate the refund group (2 routes, 4 sites)
- [ ] **1.14** `K1e` migrate the order/webhook group + delete `void notifyArtistNewOrder;`
- [ ] **1.15** `K1f` `git rm src/lib/email.ts` + the §1.5 test + the dependency-cruiser rule
- [ ] **1.16** `K1g` collapse the duplicated `EmailStream` / `EmailCategory` enums (§13.24); delete `emailTypes.ts:31 formatMoney`

### Phase 2: Display divergence (K3, K4)

- [ ] **2.1** `K3a` extend `arrangement-labels.ts`: `mixed`, fee-aware `free_loan`, QR combination, rename `revenue_share`. **Unify `ArrangementType` with `placements/arrangement.ts` (§13.2, §13.3) in this PR.**
- [ ] **2.2** `K3b` migrate the four `status.ts` callers; delete `status.ts:55-78`
- [ ] **2.3** `K3c` delete the `arrangementLabel` alias at `arrangement-type.ts:54`
- [ ] **2.4** `K3d` kill the API-layer ladders (`placements/route.ts` ×4, `curation/route.ts`)
- [ ] **2.5** `K3e` kill the JSX ladders, file by file per the §3.2 table; `PlacementDetailClient.tsx` last
- [ ] **2.6** `K2e` delete the `PAID_LOAN_V2` flag, *now safe, the label branch is gone*
- [ ] **2.7** `K4` route `PlacementDetailClient.tsx:552-561` through `normaliseStatus`/`statusBadgeClass`; **screenshot the badge diff in the PR**
- [ ] **2.8** `K3f`/`K4b` remove the two eslint-disable suppressions; extend the lint rule to string literals and status capitalisation; add the §3.5 test
- [ ] **2.9** *(separate, owner sign-off)* decide whether `paused` should keep mapping to "Completed" (§4.2)

### Phase 3: Reporting truth (K5, K6)

- [ ] **3.1** `K5a` extract `src/lib/analytics/artist-totals.ts`
- [ ] **3.2** `K5b` repoint `dashboard/route.ts:109-110`, **Bug 13 closes here**
- [ ] **3.3** `K5c` delete `stats-cache.ts` + `api/admin/refresh-stats/` + its test + any UI trigger
- [ ] **3.4** `K5d` migration dropping the four `total_*` columns + transform cleanup
- [ ] **3.5** `K6a` write `src/lib/finance/revenue.ts` with fixture tests
- [ ] **3.6** `K6b` backfill `orders.amount_cents`; make the webhook write it; add `CHECK (amount_cents > 0)`
- [ ] **3.7** `K6c` repoint `/api/admin/stats`
- [ ] **3.8** `K6d` repoint `/api/admin/financials`, **Bug 15 closes here**
- [ ] **3.9** `K6e` repoint the portal totals, the four artist-payout copies (**fixes the `||`/`??` bug at `artist-portal/orders/page.tsx:586`**) and the two placement realised-revenue queries; add the §6.5 equality test
- [ ] **3.10** `K6f` ESLint `no-inline-money-aggregate`

### Phase 4: Data hygiene (K8)

- [ ] **4.1** `K8a` fix the seeder (slug, `subscription_status`, `website`); **delete `src/data/demo.ts:27-40` (§13.19)**
- [ ] **4.2** `K8b`+`K8c` delete the static `maya-chen`; rename the live row, *deploy together*
- [ ] **4.3** `K8d` name-collision assertion in `merged-data.ts`
- [ ] **4.4** `K8e` move the test-artist filter into `artist-profiles.ts:70`, **Bug 2 closes here**
- [ ] **4.5** `K8f` redirect-integrity e2e (§8.5), protects `finlay-coles` → `fin-coles`
- [ ] **4.6** Resolve Bug 9: gate demo Buy Now on `canReceivePayout`, or complete Connect for the demo artist
- [ ] **4.7** Document the four `DEMO_*` env vars in `.env.example`

### Phase 5: Foundations (K10, K11)

*Can run in parallel with Phases 1–4; touches no application code.*

- [ ] **5.1** `K10a` renumber the four later files to 074–077; fix the two stale headers; reconcile `schema_migrations` on prod first
- [ ] **5.2** `K10b` add the Supabase CLI as a devDependency + `supabase/config.toml` + `db:push` / `db:reset` scripts
- [ ] **5.3** `K11a` dump production to `supabase/migrations/000_base_schema.sql`
- [ ] **5.4** `K11b` reconcile: scratch DB vs prod dump; **investigate every diff** (expect the `002_run_me.sql` ghost)
- [ ] **5.5** `K11c` `git rm website/supabase-*.sql` (the seven stale April-11 files)
- [ ] **5.6** `K10c`/`K11d` CI job: fresh Postgres → apply `000`–`077` → `audit:advisors` → fail on regression

### Phase 6: The monolith

*Do after §08 cull, and after K3/K4 (the browse page renders arrangement labels).*

- [ ] **6.1** `B1` `constants.ts`
- [ ] **6.2** `B2` `CheckPill` + `DistanceSliderControl` to `components/`
- [ ] **6.2b** `B2b` collapse the three `SIZE_BANDS`, the duplicate `calcDistance` and the duplicate `SearchParamsLike` (§12.4 step 2b)
- [ ] **6.3** `B3` `selectors.ts` + its tests, **proves the price comparator is correct**
- [ ] **6.4** `B4` `useBrowseData.ts`
- [ ] **6.5** `B5` `useBrowseQuery.ts`; move `page.test.tsx:106-176` across unchanged
- [ ] **6.6** `B6` `BrowseResultsGrid` + `GalleryWorkCard`; **fix the masonry redistribution, Bug 4 closes here**
- [ ] **6.7** `B7` `BrowseFilterPanel`
- [ ] **6.8** `B8` split the three views; `page.tsx` down to ~150 lines
- [ ] **6.9** `B9` `src/lib/pluralise.ts` + sweep the seven unguarded sites, **E15 closes here**
- [ ] **6.10** Remove `browse/page.tsx` from the file-length allowlist

### Phase 7: The other 27 duplicates (§13)

**7a, Tier 1, carries a live defect. Promote these: 7.1 and 7.2 belong in Phase 1, not Phase 7.**

- [ ] **7.1** §13.1 Collapse onto `email_preferences`; migrate the three portal settings pages; drop the three profile columns; delete `use-notification-prefs.ts` + `api/account/preferences/`. **Inert notification toggles close here.** *(Do with K1.)*
- [ ] **7.2** §13.2 + §13.3 Collapse `parseDimensions` onto `lib/visualizer/dimensions.ts`; collapse `displayPhysicalDimensions` into `formatDimensionsForDisplay`. **Prerequisite for fixing Bug 7 and Bug 8 once rather than twice.** *(Do before the §05 shipping work.)*
- [ ] **7.3** §13.4 Port Evri/UPS/Parcelforce into `carrier-tracking.ts`; `git rm src/lib/shipping.ts`
- [ ] **7.4** §13.5 Migrate the artist + customer saved pages onto `SavedContext`, fixes the stale header count
- [ ] **7.5** §13.7 One `src/data/venue-types.ts`; migrate all six vocabularies; normalise existing rows. **Fixes venues that can never be found by the browse filter.**

**7b, Tier 2**

- [ ] **7.6** §13.10 Delete `components/WallVisualiser.tsx` + the `WALL_VISUALIZER_V1` flag
- [ ] **7.7** §13.11 Extract `src/lib/signed-token.ts`; repoint `oauth-state.ts` + `order-tracking-token.ts`. **Crypto, review carefully.**
- [ ] **7.8** §13.19 Wire `assertNotDemo` into mutation routes, or delete `demo-guard.ts` and stop claiming the protection exists. **Security decision, needs the owner.**
- [ ] **7.9** §13.13 + §13.14 One `WallCard` + one `LoadingGrid` + one `displayWallName`; carry the three venue-side fixes to the artist showroom
- [ ] **7.10** §13.15 One counter-offer submission path; keep the dialog's re-fetch
- [ ] **7.11** §13.16 One lifecycle stage table; delete the four calls to the dead `nextActionText` stubs
- [ ] **7.12** §13.18 Replace the five `formatName`/`artistDisplayName` copies with `resolveArtistName`
- [ ] **7.13** §13.20 Extract `getDateCutoff` + `dateRangeToParam` + `dateRanges`
- [ ] **7.14** §13.21 Route the four currency formatters and the six `"From £X"` derivations through `format-currency.ts` *(with K6's lint rule)*
- [ ] **7.15** §13.23 Extract the duplicated small helpers; **`slugify` and `formatRelativeTime` first**, already diverged, and `slugify` generates claimed artist slugs
- [ ] **7.16** §13.12 One label-builder, or an explicit written decision to keep two
- [ ] **7.17** §13.17 One title algorithm across the four portal shells; delete `portal-nav.test.ts:36`'s private nav copy
- [ ] **7.18** §13.26 Offers status module (or fold into `placements/status.ts`)
- [ ] **7.19** §13.22 Route `profile-designs` + `dev/profile-designs` to §08 cull
- [ ] **7.20** §13.27 Delete `src/data/artists.ts:4084,4092` and `feature-flags.ts:126 listFlags()`
- [ ] **7.21** §13.28 Resolve `GATING_V1` and `BLOGS_V1` by decision, then delete the losing branch. **`BLOGS_V1` ungated UI is Bug 12**, the editor shows "Saved" against a 404.

### K9: tracked, not owned here

- [ ] **9.1** `implementation/01-authz-idor.md` owns CC1. **Sequence CC1's changes to `payment/setup/route.ts` and `placements/route.ts` before task 1.7**, or expect a conflict in the ownership block.

---

## 16. Exit criterion

Phase 6 of the master runbook is complete when:

1. Every §15 box is ticked.
2. `npm run audit:full` is green, with lint **blocking**.
3. The five structural tests pass: one email pipeline, one billing path, one label source, one revenue module, unique migration prefixes.
4. A fresh database built from the repo alone matches production.
5. `grep -rn "eslint-disable.*wallplace/" src/` returns nothing.
6. No feature flag has both branches live.

Point 5 is the honest one. The guards only work if nobody is allowed to turn them off in passing.

### 16.1 If you only do three things

The checklist is long. If it has to be triaged, these three carry most of the risk:

1. **§15 task 1.5 (`K2a`)**: the missing subscription webhook branch. Until it lands, the paid-loan dedup guard is structurally incapable of firing, `cancelPaidLoanBilling` reads a table nothing populates, and flipping `PAID_LOAN_V2` in production can double-bill a venue. This is the only item here that can lose real money.
2. **§15 Phase 0**: remove `continue-on-error: true` from the CI lint step. Every guard in this document is decoration until that flag is gone, and without guards the eleven knots become twelve.
3. **K9 / CC1**: 103 route files each hand-rolling authorization. The other knots cost you a wrong label or a duplicate email. This one costs you data. It is owned by `implementation/01-authz-idor.md`, but it is the highest-leverage collapse in the codebase and should not wait behind cosmetic work.

---

*Verification was done read-only against the working tree at `claude/wallplace-stress-test-035bd9`. Every `file:line` reference was read, not inferred. Where the code contradicted the brief, the code won and the correction is stated inline: K5's counters are written (by a manual admin endpoint, never scheduled) rather than dead; K3 has four label sources plus two API-layer ladders, not three; K9 is 119 route files with 103 service-role clients, not 122; K10 has exactly four collisions and no others; Bug 4's price comparator is correct and the scrambling is the masonry redistribution. The eleven knots were also not the full set: §13 adds 27 more pairs, six of them carrying a live defect.*
