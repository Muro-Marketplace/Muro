# ADR 0007: Canonical arrangement-type semantics

**Status:** Accepted (2026-06-15)

## Context

A placement's `arrangement_type` is overloaded and was checked ad-hoc across the app:

- `free_loan` is a legacy value that means a **paid loan** when a positive monthly fee is attached, but a genuine **free display** when there is no fee.
- `paid_loan` is the newer canonical value (post migration 045 / the `PAID_LOAN_V2` flag).
- `mixed` is a paid loan plus revenue share.
- `revenue_share` and `purchase` are distinct.

Display and notification code hand-rolled `arrangement_type === "free_loan"` checks and silently mishandled `paid_loan` rows. This caused real user-facing bugs:

- The placement detail page branched `revenue_share` then `free_loan` then else, so a `paid_loan` placement fell into the else and rendered as "Direct purchase / Venue owns the work / Outright sale" (it is the opposite, an ongoing paid loan).
- The placement-request email labelled `paid_loan` as "Direct Purchase".
- The `PaidLoanPaymentChip` "Set up payment" entry only recognised `free_loan`, so a `paid_loan` placement with no populated monthly fee on the card rendered no chip, leaving the venue no way into billing setup.

`src/lib/arrangement-labels.ts` already held a `free_loan -> paid_loan` alias for labels, but nothing branched through it for semantics.

## Decision

1. Add `src/lib/arrangement-type.ts` as the single owner of arrangement-type semantics: `isPaidLoan(type, fee)`, `isFreeDisplay(type, fee)`, `isRevenueShare(type)`, `isPurchase(type)`, `isLoan(type)`, and `arrangementLabel` (re-exporting `labelForArrangement`). The predicates encode the fee-dependent and `mixed` nuances once, with full unit-test coverage.
2. Route display and notification sites through the predicates. Migrated in this change: the placement detail summary grid and header label (flag-off path), the placement-request email, and `PaidLoanPaymentChip`.
3. Add the `wallplace/no-raw-arrangement-type` ESLint rule, which forbids raw `=== "free_loan"` / `=== "paid_loan"` comparisons outside the canonical files.

## Consequences

- `paid_loan` and `mixed` placements now render and bill correctly wherever the migrated sites are used, regardless of whether the placement came from a direct request, an offer, or an artwork-request fulfilment. Offers and artwork-requests carry no additional raw comparisons, so they are covered by the shared helper.
- The lint rule is now set to **error** (raised 2026-06-15). Fixing the remaining sites surfaced a genuine bug: `PlacementNegotiationLog.describeTerms` gated on `=== "free_loan"`, so a `paid_loan` entry with no monthly fee showed no loan term. It now uses `isLoan()`.
- The remaining raw comparisons are legitimate (not the bug pattern) and are explicitly handled so the rule passes at error:
  - `SpacesPlacementRequestForm.tsx` is exempted in the rule itself: it types its arrangement as a strict `"revenue_share" | "free_loan" | "purchase"` union where `free_loan` IS the paid-loan option (`paid_loan` is not a possible value), so its comparisons are type-checked and correct.
  - the flag-on detail label in `PlacementDetailClient.tsx` and the negotiation-log term text in `placements/route.ts` carry a targeted `eslint-disable-next-line` with a reason: both handle `paid_loan` and `free_loan` explicitly, so neither is missed. The `free_loan` -> "Display" flag-on nuance is preserved pending a product decision.
- Any NEW `=== "free_loan"` / `=== "paid_loan"` in non-exempt code now fails CI.
