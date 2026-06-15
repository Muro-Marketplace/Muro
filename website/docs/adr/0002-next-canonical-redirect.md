# ADR 0002 - ?next= is the canonical post-auth redirect param

**Status:** Accepted  
**Date:** 2026-06-15

---

## Context

Post-authentication redirects need a way to carry the originally requested destination through the login and signup flows. Before Task 4.1 (Phase 4 remediation), the codebase used two different param names interchangeably:

- `?redirect=` in some links and generated URLs (e.g. `href="/login?redirect=/checkout"`)
- `?next=` in others

The login page read whichever it found, with no defined canonical form. This divergence caused three concrete problems:

1. **Funnel breakage.** A link that used `?redirect=` landed the user at login, but signup pages only forwarded `?next=`, so the destination was lost as soon as the user chose to sign up rather than log in.
2. **No single validation point.** Two names meant two places to validate and two places to forget validation.
3. **OAuth state gaps.** The artist and customer signup pages forwarded the inbound `?next=` correctly in the email/password path but hardcoded role-based fallback destinations (`"/apply"`, `"/browse"`) in the OAuth Google/Apple state payload, silently discarding any `?next=` that arrived via those buttons.

---

## Decision

`?next=` is the single canonical redirect param for all post-auth destinations in Wallplace.

The rules are:

1. **`?next=` only in generated URLs.** No code may construct a URL containing `?redirect=`. Any existing inbound links that use `?redirect=` are supported at the login page through a back-compat read (the page reads `?redirect=` if `?next=` is absent), but this is read-only back-compat, not a licence to generate new `?redirect=` URLs.

2. **All redirect values pass through `safeRedirect()`.** The function in `src/lib/safe-redirect.ts` validates that the value starts with `/`, is not protocol-relative (`//`), and contains no colon or backslash. Code must never pass a raw user-supplied string directly to `router.push`, `window.location`, or `redirect()`.

3. **Signup pages forward the inbound `?next=`, never hardcode it.** When a signup page sends a destination to another service (for example the OAuth state endpoint `/api/auth/oauth-sign-state`), it must use the validated inbound `?next=` param, not a hardcoded string. A hardcoded destination silently drops the deep-link context for every user who arrived via that button.

4. **The whole funnel preserves `?next=`.** Every step in a signup funnel (signup entry, email verification, login after verification) must thread `?next=` through to the final redirect.

---

## Implementation

- `src/lib/safe-redirect.ts`: the single validation function. Reads `?next=` by name; callers responsible for supplying the value.
- `src/app/(pages)/login/page.tsx`: canonical consumer. Reads `?next=` first, falls back to `?redirect=` for back-compat, validates with `safeRedirect`.
- `src/app/(pages)/signup/artist/page.tsx`: reads `?next=` from `window.location.search`, validates via `safeRedirect(inboundNext, "/apply")`, forwards as `postSignupNext` through both the email/password path and the Google/Apple OAuth state payload.
- `src/app/(pages)/signup/customer/page.tsx`: same pattern, default fallback `"/browse"`.
- `src/app/api/auth/oauth-sign-state/route.ts`: validates the incoming `next` field with `safeRedirect` before embedding it in the HMAC-signed state token.

---

## Enforcement

The ESLint rule `wallplace/no-redirect-param` (added in this task) enforces the decision at the code level:

**Check A** (all files): a `Literal` or `TemplateLiteral` quasi whose string value contains the exact substring `?redirect=` is an error. Message: `redirectParam`. This catches any attempt to construct a `?redirect=` URL.

**Check B** (files under `src/app/(pages)/signup/` only): a `Property` whose key is `next` and whose value is a string `Literal` is an error. Message: `hardcodedNext`. This catches hardcoded destinations in OAuth state calls and similar, forcing the author to use the validated inbound `postSignupNext` variable instead.

Neither check flags `.get("redirect")` (a bare param name, not `?redirect=`), template expressions that compute the value (e.g. `` `/login?next=${x}` ``), or `next:` properties whose value is an identifier or call expression.

Both checks exempt test files (`*.test.[jt]sx?`).

The rule is enabled at `"error"` in `eslint.config.mjs` for `src/**/*.{ts,tsx}`.

---

## Consequences

### Positive

- One param name to document, validate, and audit.
- `safeRedirect` is the single choke point for open-redirect risk. Any new path through the funnel that bypasses it will now fail lint before it reaches review.
- OAuth signup flows now carry the deep-link destination correctly, so a user arriving at `/signup/artist?next=/some-artist-page` via Google SSO lands at `/some-artist-page` after auth rather than always at `/apply`.

### Negative / breaking

- Any inbound links from external sources (emails, third-party referrals) that use `?redirect=` will still work at login (back-compat read), but the fallback is intentionally invisible. If a future developer removes the back-compat read, those links break silently. The back-compat read is retained indefinitely unless a deliberate migration of all external links is completed.

### No change

- `safeRedirect` validation rules (path-only, no protocol-relative, no colon, no backslash) are unchanged.
- The OAuth HMAC state format and TTL are unchanged.
- Login error messages and HTTP status codes are unchanged.
