# Mobile ADR 01: Expo and React Native, sharing logic but not components

**Status:** Proposed
**Date:** 2026-09-06
**Applies to:** the iOS and Android applications
**Relates to:** [ADR 02](2026-09-06-mobile-adr-02-subscription-purchase-channel.md), [ADR 03](2026-09-06-mobile-adr-03-visualiser-in-a-webview.md), [ADR 04](2026-09-06-mobile-adr-04-one-token-source.md), and §4 of `2026-09-06-wallplace-mobile-app-plan.md`

## Context

Wallplace needs first-class iOS and Android applications that share the existing backend, accounts, data, business rules and visual identity. The constraints that decide it:

1. **One person builds and maintains everything**, with AI coding agents. Anything that doubles the codebase doubles the maintenance forever.
2. **The domain rules are already written once, in TypeScript, and the repository fights hard to keep them that way.** `website/src/lib/pricing.ts`'s header exists because plan prices were duplicated across four files and a reprice could desynchronise the MRR dashboard from what Stripe charges. `plan-features.ts` exists because a trial-ending email had drifted from the pricing cards and promised features that were not plan features. `tests/integration/one-curated-price-source.test.ts`, `one-revenue-source.test.ts`, `one-label-source.test.ts` and `one-stats-source.test.ts` each enforce a single source for something that previously had two.
3. **The web's UI is desktop-first and should not be carried across.** Measured on 2026-09-06: of 157 component files, 86 declare `"use client"`, 57 import from `next/*`, 51 touch `window` or `document`. The largest are 4,774, 2,139, 2,025, 2,013 and 1,997 lines.
4. **The web's logic is portable.** Measured on the same day: of 170 non-test modules in `website/src/lib`, **85 (8,130 lines) import nothing outside the repository** and a further 15 (2,669 lines) import only `@supabase/supabase-js`. 136 test files sit alongside them.

## Options considered

| Option | Verdict |
|---|---|
| **Expo / React Native, sharing pure TypeScript, not sharing components** | **Chosen.** Scored 50 of 55 in §4.2 of the plan |
| Expo / React Native with React Native Web, also sharing components | 43. Its only advantage is sharing the part that should not be shared |
| Capacitor or an equivalent wrapper around the Next.js site | 34. Fails Apple 4.2 and cannot make a native list out of a 120-card, 6,791-pixel, 191KB web page |
| Flutter | 36. Discards 8,130 lines of tested logic and reintroduces duplicate constants by construction |
| Native Swift and Kotlin | 30. Two codebases for one person, and the same duplication twice |
| Native shell with selected web views | 31. The per-screen justification test passes for two screens, not for a product |

## Decision

Build **one Expo / React Native application in TypeScript**, in the same repository, with:

- `packages/core`: the 85 pure modules plus the 15 supabase-only ones, **moved** out of `website/src/lib` and re-exported from their old paths so every existing import and every path-scanning integration guard keeps working. Their 136 test files move with them.
- `packages/tokens`: the design tokens (see ADR 04).
- `packages/api-client`: a typed client generated from the 14 zod schemas in `website/src/lib/validations.ts`.
- `apps/mobile`: the Expo app. **No UI component is shared with the web.**
- Expo SDK 56, which ships React Native 0.85 and **React 19.2**, matching the web's `react@19.2.4`, with a floor of iOS 16.4 and Android 7 (raised to API 26 for notification channels).

A dependency-cruiser rule forbids `packages/*` from importing `@/`, so the dependency runs one way only.

## Consequences

**Positive**
- A change to `WORKS_CAP`, `PLATFORM_FEE_PERCENT`, `OUTREACH_WEEKLY_LIMIT` or a state machine reprices the web copy, the app copy and both enforcement paths in one commit.
- The app's forms validate against the same zod objects the server validates against.
- One language, one type system, one test runner, one lint configuration, one CI gate.
- The 136 existing tests cover the shared package from day one.

**Negative**
- The ceiling on list and animation performance is lower than native, and the browse grid will need FlashList plus derived thumbnails to hold 60fps on a 4GB Android device. That work is scheduled in P1 regardless.
- Two Expo SDK upgrades a year, each a real upgrade, at roughly 0.5 to 1 engineer-day per week amortised.
- No component reuse means the app's UI is written from scratch. That is a cost of about 20 engineer-weeks and is also the point: the mobile information architecture is different by design.

**Neutral**
- The two canvas editors do not port and are handled in ADR 03.

## What would reverse this

- Expo's minimum OS floor rising above what UK adoption supports (today it costs about 2% of UK iOS users).
- `@supabase/supabase-js` dropping React Native support.
- The browse list failing the 60fps and 250MB budgets on the reference low device **after** FlashList, derived thumbnails and Hermes are all applied. At that point the honest answer is a native rewrite of that one screen, not of the app.
- Apple beginning to reject React Native applications as such, which it does not.
