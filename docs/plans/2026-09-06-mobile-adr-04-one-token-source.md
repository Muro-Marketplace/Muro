# Mobile ADR 04: One token source for the web and the app

**Status:** Proposed
**Date:** 2026-09-06
**Applies to:** colour, typography, spacing and radius across `website/` and `apps/mobile`
**Relates to:** §4.5 and §9 of `2026-09-06-wallplace-mobile-app-plan.md`

## Context

The visual identity lives in CSS custom properties on `:root` in `website/src/app/globals.css`: `--color-background: #FAFAF8`, `--color-foreground: #1A1A1A`, `--color-accent: #C17C5A`, `--color-accent-hover: #A8684A`, `--color-accent-text: #9C5F42`, `--color-accent-text-hover: #8A5439`, `--color-muted: #6B6B6B`, `--color-border: #E5E2DD`, `--color-surface: #FFFFFF`, plus `--font-sans` and `--font-serif` bound to DM Sans and DM Serif Display.

Three of those values are not arbitrary. The file carries a contrast table showing that `#C17C5A` scores 3.33 on white and **fails** WCAG AA for small text, `#A8684A` scores 4.43 and still fails, and `#9C5F42` scores 5.09 and passes. The distinction between `--color-accent` (large text and non-text only) and `--color-accent-text` (small text) is an accessibility decision encoded in a variable name, and an app that gets it wrong ships inaccessible text without anyone noticing.

Tailwind 4 consumes those properties. React Native cannot. So the app needs the same values in a form it can read.

## Options considered

| Option | Verdict |
|---|---|
| **Move the palette to `packages/tokens`; the web generates its `:root` block from it, the app imports it directly** | **Chosen** |
| Fork the palette into the app as a constants file | Rejected. This repository has been burned by exactly this mechanism at least four times, which is why `pricing.ts`, `plan-features.ts`, `curated-tiers.ts` and `one-curated-price-source.test.ts` exist |
| Parse `globals.css` at app build time | Rejected. It works until someone writes a value in a media query or a nested selector, and then it silently reads the wrong one |
| Keep the web as the source and hand-copy on change | Rejected. It is the fork option with extra steps and a promise |

## Decision

`packages/tokens` is a plain TypeScript module and the **only** place a Wallplace colour, font family, type size, spacing step or radius is written.

- The web generates the `:root` block of `globals.css` from the module at build time. A test in the package's suite fails if the generated CSS and the module disagree, in the same spirit as `tests/integration/one-curated-price-source.test.ts`.
- The app imports the module directly into its theme object.
- The accent distinction is preserved as a **type-level** constraint, not a comment: the token for small text is named so that a lint rule can forbid `accent` in a text style, mirroring the contrast table that lives in `globals.css` today.
- DM Sans and DM Serif Display are bundled into the app with `expo-font` rather than fetched at runtime, so the app renders correctly offline and on first launch.
- The six Premium and Pro profile themes (`website/src/lib/profile-themes.ts`) and the QR label colour themes are **data**, not CSS, and move to `packages/core` with everything else in ADR 01.

## Consequences

**Positive**
- A palette change is one commit and reaches both platforms.
- The accessibility distinction between `accent` and `accentText` cannot be lost in translation, because it is the same identifier on both sides.
- The app cannot drift into a slightly different off-white, which on a product whose entire visual argument is an off-white gallery ground would be immediately visible in a screenshot next to the site.

**Negative**
- `globals.css` gains a generation step, which is one more thing that can be forgotten. The test is what stops that.
- The generated block must not be hand-edited, which needs a comment saying so at the top of it.

## What would reverse this

- The web moving to a design-token pipeline of its own (Style Dictionary or similar), at which point `packages/tokens` becomes that pipeline's source rather than a bespoke module.
- A decision to ship dark mode, which would double the token set and is deferred in §9.6 of the plan. The module handles that by holding two palettes rather than one; nothing about this decision changes.
