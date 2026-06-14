# ADR 0004: Defence-in-depth read restriction on venue PII

Date: 2026-06-15
Status: Accepted

## Context

The weekly audit and the residual `AUDIT.md` checklist flagged that four public-facing tables (`venue_profiles`, `artist_profiles`, `artist_works`, `artist_collections`) all carry a `SELECT` policy of `USING (true)` for the `public` role. The application reads these tables almost entirely through API routes that use the service-role client and redact sensitive fields before returning them to anon callers (covered by `tests/e2e/security-no-leaks.spec.ts`, e.g. "redacts postcode for anon callers").

The gap is defence in depth: a holder of the public anon key (which ships in the browser bundle) can query PostgREST directly and read whatever the row policy allows, bypassing the API's redaction. For `venue_profiles` that means contact PII: `email`, `phone`, `address_line1`, `address_line2`, `postcode`, `contact_name`.

## Decision

Use **column-level `REVOKE`** on the anon role rather than introducing `*_public` views.

`migration 071` revokes anon `SELECT` on the six venue PII columns. Postgres then denies any anon read of those columns (including `select=*`, which expands to them), while leaving the rest of the row readable for the public marketplace.

Views were considered and rejected for this change: they would require repointing every anon read at the view and revoking base-table access anyway, for no extra safety over a column grant. The column `REVOKE` is the smaller, clearer mechanism and is exactly the "tightened SELECT access" option the design doc allowed.

## Why this is safe (no application breakage)

- The app's server routes read venue data with the service-role client, which is **not** subject to column-level grants.
- The only anon-client `SELECT *` helper for this table, `getVenueProfileBySlug`, had no callers. It has been repointed to an explicit non-PII column list so it stays correct if revived.
- The public stats endpoint reads only `id` (a count), which is unaffected.

## Scope and follow-ups

- **`authenticated` role left untouched.** A logged-in user could still read these columns directly. That is a smaller risk (accountable accounts, and the venue owner legitimately reads their own row, though via the service-role API today). Tightening `authenticated` is a sensible follow-up but carries more breakage risk and is deferred.
- **`artist_profiles` / `artist_works` / `artist_collections` not restricted.** They hold no contact PII. The only arguably-sensitive fields are `location`, `postcode` and `lat`/`lng`, which are public by design for a listed artist (they drive the marketplace map and delivery-radius display via `getAllDatabaseArtists`, an anon `SELECT *`). Restricting them would break the public marketplace for no clear privacy gain.

## Validation

The migration was validated on a Supabase preview branch (apply, confirm anon is denied `SELECT` on the PII columns and still allowed the public columns, run the security and performance advisors) before being applied to the live project `uwkuhygwvasdzwsusiym`. Advisors were re-run after the live apply.
