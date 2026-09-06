# Mobile ADR 02: The artist subscription is sold on the web only

**Status:** Proposed
**Date:** 2026-09-06
**Applies to:** iOS and Android, all regions, v1
**Relates to:** §6 of `2026-09-06-wallplace-mobile-app-plan.md`

## Context

Wallplace has thirteen distinct money flows (§6.1 of the plan). Twelve are settled by written store rules with no judgement required, and all twelve keep Stripe:

- Artwork purchases, purchase offers: **physical goods**. Apple 3.1.3(e) states that an app enabling the purchase of physical goods "must use purchase methods other than in-app purchase to collect those payments, such as Apple Pay or traditional credit card entry" (retrieved 2026-09-06). Google Play's payments policy lists physical goods as not supported by its billing system.
- Venue paid loans, Curated, Programmes: **physical services**. Same Apple clause; Play names "physical services (transportation, airfare, gym memberships, food delivery)" as an exception.
- Connect payouts, programme rent, refunds and disputes: money moving to the user, or reversals. No store rule engages.

The thirteenth, the **artist membership** (£9.99, £24.99 or £49.99 a month), is the only contested one, because it unlocks capacity and features inside the app: the works cap, the active-placement cap, the outreach allowance, Featured artist, Artwork of the Week, profile themes and visualiser quota. Apple 3.1.1 says that unlocking features or functionality within an app requires in-app purchase.

Three further facts decide the answer:

1. **The artist funnel already runs through the web.** Apply at `/apply` (a 1,019-line form), an admin accepts, Supabase sends an invite, then the artist subscribes at `/artist-portal/billing`. Three of five steps are already off-app and one is a human decision. **The app is where a subscribed artist works, not where an unsubscribed one converts.**
2. **The cost is large and measurable.** After 20% UK VAT (which the stores deduct as merchant of record and Wallplace does not currently owe, being below the registration threshold) and Apple's 15% Small Business Program rate, a £9.99 plan yields £7.08 against Stripe's £9.57. At 1,000 artists on the plan's stated mix that is £57,432 a year.
3. **Apple 3.1.3 permits honouring an entitlement bought elsewhere** and prohibits only the call to action: "Apps in this section cannot, within the app, encourage users to use a purchasing method other than in-app purchase" (retrieved 2026-09-06).

## Options considered

| Option | Net per £9.99/month | Engineering | Verdict |
|---|---|---|---|
| **(a) Web-only purchase; the app reads entitlement and shows no purchase flow** | **£9.57** | none | **Chosen** |
| (b) Store IAP alongside Stripe, with `subscription_source`, App Store Server Notifications V2 and Play RTDN | £7.08 | 4 to 6 engineer-weeks, plus three permanent billing reconciliations | Rejected on cost and complexity |
| (c) A subscription-management service unifying Stripe and both stores | £7.08 less the service fee | 2 to 3 weeks plus about 1% of tracked revenue | Rejected: it solves a problem created by (b) |
| (d) External purchase links where a region permits them | Android UK £8.57; iOS UK not permitted today | 1 to 2 weeks, plus Billing Choice Program enrolment | Held as an owner decision (Q1). Google has permitted this in the UK since 2026-06-30 at a 10% service fee; Apple has not, and the CMA's steering measures are proposed but not in force |

## Decision

**Option (a), both platforms, both regions, v1.**

1. `GET /api/me/subscription` is the app's only view of the subscription. `POST /api/subscribe` and `POST /api/subscribe/portal` are never called from a mobile client.
2. The Stripe webhook keeps its status as the **only** writer of `subscription_status` and `subscription_plan`.
3. **No `subscription_source` column is added.** It would be speculative schema.
4. On iOS the app may state **what is true** (this is your tier, this is the limit, that tier includes this) and may never state **what to do about it** (buy, upgrade, tap here, visit our site). §6.5 of the plan inventories all nineteen affected surfaces and §6.7 gives the exact copy.
5. Cancellation, upgrades, downgrades, trials, the founding 180 days and the referral fee-free window all stay in Stripe and the database, where they already are and where StoreKit could not express several of them.
6. Physical-goods checkout uses a native Stripe PaymentSheet with Apple Pay and Google Pay, which 3.1.3(e) names.

## Consequences

**Positive**
- Nothing is given away. 95.8% to 97.4% of subscription revenue is retained.
- No grandfathering problem, because there is no second channel. Every existing web subscriber sees their plan in the app immediately.
- One VAT treatment, one set of invoices, one reconciliation.
- The founding cohort's 180-day trial and the referral window keep working, where StoreKit introductory offers and Play base plans could not express "the first 20 people ever" without an offer-code campaign.

**Negative**
- An artist cannot subscribe from the phone. This is a real cost and the only user-visible one.
- The posture is a judgement, not a written permission. 3.1.3(b)'s "provided those items are also available as in-app purchases within the app" has been enforced inconsistently across the industry.
- Nineteen web surfaces need platform-conditional copy, which is nineteen places a careless change can reintroduce a call to action. Maestro flow 11 asserts the **absence** of a purchase control on the works-cap sheet for exactly this reason.

## Contingency if Apple rejects it

1. Appeal once, on the 3.1.3(e) argument: the app's whole commerce surface is physical goods and physical services, correctly using Stripe, and the membership unlocks capacity in that physical business.
2. If the appeal fails, add StoreKit for the membership on iOS only, and either absorb the 29% or gross the iOS price to £13.49 / £33.99 / £68.99, which holds the net roughly level. Apple does not require price parity across channels, only that the app does not steer. §6.6 of the plan lists the schema, the webhook and the reconciliation work that follows.

## What would reverse this

- Apple rejecting the posture at review (contingency above).
- A measured conversion problem: if the subscription conversion rate for artists who install the app is materially below the web rate, option (d) on Android and possibly (b) on iOS become worth their cost. The instrumentation for that measurement is WP-X-REVREPORT.
- The CMA's proposed UK steering measures coming into force, which would make an iOS link-out permissible and change the iOS column of the analysis.
