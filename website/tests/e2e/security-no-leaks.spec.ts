/**
 * Paywall + PII-leak guard for unauthenticated callers.
 *
 * Today (2026-05-27) these tests are EXPECTED TO FAIL against production —
 * they document the bugs that Phases A and B close. Once those phases land
 * the suite turns green and stays green; any new leak surfacing in a later
 * PR re-fails the suite in CI.
 *
 * Run with E2E_BASE_URL pointing at the env to test:
 *   E2E_BASE_URL=https://www.wallplace.co.uk npx playwright test tests/e2e/security-no-leaks.spec.ts
 */

import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://uwkuhygwvasdzwsusiym.supabase.co";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

test.describe("Public API surface — no PII / paywalled-data leaks @security", () => {
  test("GET /api/venues/demand redacts paywalled fields", async ({ request }) => {
    const res = await request.get(`${BASE}/api/venues/demand`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const v of body.venues ?? []) {
      expect(v.name, `venue ${v.slug} leaked name`).toBeFalsy();
      expect(v.description, `venue ${v.slug} leaked description`).toBeFalsy();
      expect(v.displayInstallNotes, `venue ${v.slug} leaked install notes`).toBeFalsy();
      expect((v.images?.length ?? 0) === 0, `venue ${v.slug} leaked images`).toBeTruthy();
    }
  });

  test("GET /api/venues/:slug redacts postcode for anon callers", async ({ request }) => {
    const slug = "the-copper-kettle-demo";
    const res = await request.get(`${BASE}/api/venues/${slug}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.venue?.postcode, "venue postcode leaked").toBeFalsy();
  });

  test("GET /api/artwork-requests blocks anon, or redacts internal IDs", async ({ request }) => {
    const res = await request.get(`${BASE}/api/artwork-requests`);
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

  test("Storage bucket message-attachments listing is not anon-accessible", async ({ request }) => {
    test.skip(!ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY not set");
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
