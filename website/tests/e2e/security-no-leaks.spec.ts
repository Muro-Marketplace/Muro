/**
 * Paywall + PII-leak guard for unauthenticated callers.
 *
 * These assertions only mean something against a project that holds real data.
 * Pointed at a placeholder Supabase project the routes return 404s and 500s, so
 * the suite can neither pass honestly nor detect an actual leak. It therefore
 * SKIPS LOUDLY when no real credentials are present, and never passes quietly:
 * a silent pass on missing config is the exact failure mode being removed here
 * (EXECUTION-DECISIONS D13.1 and D14.3).
 *
 * Target environment comes from Playwright's own `baseURL`, so requests below use
 * relative paths. Override per run with PLAYWRIGHT_BASE_URL:
 *   PLAYWRIGHT_BASE_URL=https://www.wallplace.co.uk npx playwright test tests/e2e/security-no-leaks.spec.ts
 */

import { expect, test } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * A value counts as absent when it is unset or still a placeholder. CI's default
 * env uses `https://placeholder.supabase.co` and `eyJhbGciOi_PLACEHOLDER_...`,
 * and GitHub withholds secrets from fork PRs, so both land here by design.
 */
const isPlaceholder = (value: string): boolean =>
  value === "" || /placeholder/i.test(value);

const CREDENTIALS_MISSING = isPlaceholder(SUPABASE_URL) || isPlaceholder(ANON_KEY);

const SKIP_REASON =
  "no real Supabase credentials, so these assertions cannot detect a leak. " +
  "Set the repo secrets NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
  "(fork PRs never receive secrets, so they always land here). " +
  `Saw NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL || "(unset)"}", ` +
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY ? "(placeholder)" : "(unset)"}.`;

test.describe("Public API surface — no PII / paywalled-data leaks @security", () => {
  // Loud skip, not a quiet pass. With credentials present these tests run and
  // fail on any leak they find.
  test.skip(CREDENTIALS_MISSING, SKIP_REASON);

  test("GET /api/venues/demand redacts paywalled fields", async ({ request }) => {
    const res = await request.get("/api/venues/demand");
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const v of body.venues ?? []) {
      expect(v.name, `venue ${v.slug} leaked name`).toBeFalsy();
      expect(v.description, `venue ${v.slug} leaked description`).toBeFalsy();
      expect(v.displayInstallNotes, `venue ${v.slug} leaked install notes`).toBeFalsy();
      expect((v.images?.length ?? 0) === 0, `venue ${v.slug} leaked images`).toBeTruthy();
      // Bug 5 / G-B: the identity fields were blanked but the exact fix was left
      // on the row. Coarsened, not dropped, because /spaces sorts by distance
      // client-side, so the assertion is on precision.
      if (!v.coordinates) continue;
      for (const axis of ["lat", "lng"] as const) {
        const value = v.coordinates[axis];
        const decimals = String(value).split(".")[1]?.length ?? 0;
        expect(decimals, `venue ${v.slug} leaked ${axis}=${value} at ${decimals}dp`).toBeLessThanOrEqual(2);
      }
    }
  });

  test("GET /api/venues/:slug redacts postcode for anon callers", async ({ request }) => {
    const slug = "the-copper-kettle-demo";
    const res = await request.get(`/api/venues/${slug}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.venue?.postcode, "venue postcode leaked").toBeFalsy();
  });

  test("GET /api/artwork-requests blocks anon, or redacts internal IDs", async ({ request }) => {
    const res = await request.get("/api/artwork-requests");
    if (res.status() === 401 || res.status() === 403) return;
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const r of body.requests ?? []) {
      expect(r.venue_user_id, `request ${r.id} leaked venue_user_id`).toBeFalsy();
      expect(
        (r.invited_artist_slugs?.length ?? 0) === 0,
        `request ${r.id} leaked invited list`,
      ).toBeTruthy();
      expect(r.budget_min_pence, `request ${r.id} leaked budget`).toBeFalsy();
      expect(r.budget_max_pence, `request ${r.id} leaked budget`).toBeFalsy();
    }
  });

  test("GET /api/browse-artists publishes no postcode and no exact coordinates", async ({ request }) => {
    // Bug 1 / G-A. D8 says "strip postcode and coordinates". Postcode is stripped
    // outright. Coordinates are COARSENED rather than removed, because the browse
    // page filters by distance client-side and its smallest radius is 5 miles;
    // removing them entirely would delete local search. So the assertion is that no
    // published coordinate is more precise than the public projection allows.
    const res = await request.get("/api/browse-artists");
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const a of body.artists ?? []) {
      expect(a.postcode, `artist ${a.slug} leaked a postcode`).toBeFalsy();
      if (!a.coordinates) continue;
      for (const axis of ["lat", "lng"] as const) {
        const value = a.coordinates[axis];
        const decimals = String(value).split(".")[1]?.length ?? 0;
        expect(decimals, `artist ${a.slug} leaked ${axis}=${value} at ${decimals}dp`).toBeLessThanOrEqual(2);
      }
    }
  });

  test("Storage bucket message-attachments listing is not anon-accessible", async ({ request }) => {
    // No per-test skip needed: the describe-level guard already covers an unset
    // or placeholder ANON_KEY, and covers it more strictly.
    const url = `${SUPABASE_URL}/storage/v1/object/list/message-attachments`;
    const res = await request.post(url, {
      headers: {
        apikey: ANON_KEY,
        authorization: `Bearer ${ANON_KEY}`,
        "content-type": "application/json",
      },
      data: { prefix: "", limit: 10 },
    });
    expect([400, 401, 403, 404], `list returned ${res.status()}`).toContain(res.status());
  });
});
