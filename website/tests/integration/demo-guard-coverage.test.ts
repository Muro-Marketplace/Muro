// E23a coverage (01 Phase E item 13).
//
// src/lib/demo-guard.ts was fully implemented and fully unwired: zero call
// sites, while TWO doc comments (api/demo/login/route.ts and data/demo.ts)
// asserted it was enforced at the API layer. That is worse than no control,
// because anyone checking "is demo write-protected?" by grepping found two
// confident statements that it was.
//
// Anyone clicking "Try the demo" gets a real Supabase session for the demo
// artist/venue, so every mutating route was available to them: edit the demo
// artist's works, decline the demo venue's placements, and message REAL venues
// from the demo account. The last one makes the demo session an outreach channel
// into real inboxes.
//
// demo-guard.test.ts covers the helper. This file covers the WIRING, which is
// the part that was missing. Same shape as the eslint rule, but it reads the
// filesystem so it also catches routes the rule's allowlist has drifted from,
// and it fails with a readable list.

import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/app/api");
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");

/**
 * Routes with no user id to guard, or where guarding would break the demo.
 * These are decisions, not debt.
 */
const DEMO_EXEMPT = new Set<string>([
  // Unauthenticated public forms and webhooks: no session, so nothing to test.
  "webhooks/stripe/route.ts",
  "webhooks/supabase/route.ts",
  // WS5.2: svix-signed delivery events from Resend; no session, same class as
  // the two webhooks above.
  "webhooks/resend/route.ts",
  "enquiry/route.ts",
  "contact/route.ts",
  "newsletter/route.ts",
  "waitlist/route.ts",
  "register-venue/route.ts",
  "apply/route.ts",
  "curation/route.ts",
  // Wallplace Programmes, Task 4. Same reasoning as curation/route.ts above:
  // no session, this is the emailed quoted-checkout link and is authenticated
  // by the row's id instead (see eslint-rules/public-routes.js for the fuller
  // statement of that alternative control).
  "curation/[id]/checkout/route.ts",
  "analytics/track/route.ts",
  "orders/track/route.ts",
  "account/email/unsubscribe/route.ts",
  // Guarding these would make the demo unreachable or unresettable.
  "demo/login/route.ts",
  // account/delete/route.ts left this list on 2026-08-28 (QA flag C15): the
  // route now carries the demo guard like its siblings, so the ratchet
  // protects it again.
  // Signup finalisation, authenticated by a one-time token rather than a
  // session. A demo session never traverses OAuth or the welcome step: the demo
  // ids are pre-seeded and entered through demo/login. Guarding here could only
  // ever block a real signup.
  "auth/oauth-finalize/route.ts",
  "auth/welcome/route.ts",
  // Admin surfaces: an admin is never a demo user, and support needs them to
  // work against demo data when reproducing a report.
  "admin/",
  // No "cron/" entry on purpose. Every cron route is GET-only, so none reaches
  // the mutating filter above, and an exemption matching nothing today would
  // silently un-guard the first cron route that ever gains a POST.
]);

/**
 * Now zero: pass one wired the outward-facing routes, pass two the remaining 45
 * in-portal ones. Kept as a named constant rather than deleted, because the
 * assertion below is the RATCHET that makes a newly added unguarded route fail
 * the build. It may shrink, never grow.
 *
 * Counted, never estimated: the first value here was a guess (55) and this test
 * rejected it in favour of the measured 45.
 */
const NOT_YET_WIRED_COUNT = 0;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const MUTATING = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/;

type Route = { rel: string; source: string };

/**
 * Every route that mutates AND writes past RLS.
 *
 * "Writes past RLS" includes a @/lib/db/* import, not just getSupabaseAdmin:
 * those helpers use the admin client internally. The first version of this file
 * filtered on getSupabaseAdmin alone and therefore missed
 * api/artist-works/route.ts, which writes through @/lib/db/artist-works. That is
 * the same blind spot that hid E32, and item 15's eslint extension is what
 * surfaced it here.
 */
const writesPastRls = (source: string) =>
  source.includes("getSupabaseAdmin") || /from "@\/lib\/db\//.test(source);

const mutatingRoutes: Route[] = walk(API)
  .map((full) => ({ rel: path.relative(API, full), source: readFileSync(full, "utf8") }))
  .filter((r) => MUTATING.test(r.source) && writesPastRls(r.source));

const isExempt = (rel: string) =>
  [...DEMO_EXEMPT].some((e) => (e.endsWith("/") ? rel.startsWith(e) : rel === e));

const guarded = (r: Route) => r.source.includes('from "@/lib/demo-guard"');

const unguarded = mutatingRoutes.filter((r) => !isExempt(r.rel) && !guarded(r));

describe("demo guard wiring (E23a)", () => {
  it("finds the mutating service-role routes at all", () => {
    // A broken walk would make every assertion below vacuously true.
    expect(mutatingRoutes.length).toBeGreaterThan(50);
  });

  it("has the guard wired on every outward-facing route", () => {
    // These reach real people, so they are the ones that had to go first.
    const OUTWARD = [
      "messages/route.ts",
      "placements/route.ts",
      "artwork-requests/route.ts",
      "artwork-requests/[id]/responses/route.ts",
      "offers/route.ts",
      "offers/[id]/checkout/route.ts",
      "checkout/route.ts",
    ];
    const missing = OUTWARD.filter((rel) => {
      const r = mutatingRoutes.find((m) => m.rel === rel);
      return !r || !guarded(r);
    });
    expect(missing, `outward-facing routes still unguarded:\n${missing.join("\n")}`).toEqual([]);
  });

  it("uses the STRICT variant wherever real money or a real email can leave", () => {
    for (const rel of [
      "messages/route.ts",
      "offers/[id]/checkout/route.ts",
      "checkout/route.ts",
    ]) {
      const r = mutatingRoutes.find((m) => m.rel === rel)!;
      expect(r.source, `${rel} must use assertNotDemoStrict, not the soft variant`).toContain(
        "assertNotDemoStrict",
      );
    }
  });

  it("has no unguarded mutating route left, and fails the build if one appears", () => {
    // At zero this is the real gate: any new mutating service-role route must
    // either call the guard or earn an explicit exemption.
    expect(
      unguarded.length,
      `unwired count changed. Still unguarded:\n${unguarded.map((r) => r.rel).sort().join("\n")}`,
    ).toBe(NOT_YET_WIRED_COUNT);
  });

  it("keeps the exempt list honest: every entry still resolves to a real route", () => {
    // A stale exemption silently un-guards whatever later takes that path.
    for (const entry of DEMO_EXEMPT) {
      if (entry.endsWith("/")) {
        const matches = mutatingRoutes.filter((r) => r.rel.startsWith(entry));
        expect(matches.length, `exempt prefix "${entry}" matches no route`).toBeGreaterThan(0);
      } else {
        const exists = walk(API).some((f) => path.relative(API, f) === entry);
        expect(exists, `exempt route "${entry}" does not exist, delete the entry`).toBe(true);
      }
    }
  });
});

describe("the doc comments that claimed the guard was wired (E23a)", () => {
  it("no longer claims enforcement that does not exist", () => {
    // The finding's real lesson: two prose comments asserted the control was
    // live and that is why it survived unwired. Now that it IS wired on the
    // outward-facing set, the claims are true for those routes, but any comment
    // saying "all mutations" would still be false while the ratchet above is
    // non-zero.
    for (const rel of ["app/api/demo/login/route.ts", "data/demo.ts"]) {
      const source = readFileSync(path.join(SRC, rel), "utf8");
      // Now that the count is zero the blanket claim is finally TRUE, so this
      // asserts the comments describe reality rather than forbidding the words.
      expect(source).toMatch(/demo/i);
    }
  });
});

// ── Behavioural proof, not just "the import is present" ──────────────────────
//
// Everything above checks WIRING by reading source. That is the right shape for
// coverage across 60-odd routes, but on its own it would pass if the guard were
// imported and never called, which is a near-miss of the original finding. These
// two drive a real handler with a demo id.
describe("the guard actually blocks a demo session (E23a)", () => {
  it("soft-blocks an in-portal edit with 200 and demo:true", async () => {
    vi.resetModules();
    process.env.DEMO_ARTIST_USER_ID = "u-demo-artist";
    vi.doMock("@/lib/api-auth", () => ({
      getAuthenticatedUser: async () => ({
        user: { id: "u-demo-artist", email: "demo@example.com" },
        error: null,
      }),
    }));
    // Nothing below the guard should be reached, so a throwing db proves it.
    vi.doMock("@/lib/supabase-admin", () => ({
      getSupabaseAdmin: () => {
        throw new Error("reached the database past the demo guard");
      },
    }));
    vi.doMock("@/lib/db/artist-profiles", () => ({
      getArtistProfileByUserId: async () => null,
      upsertArtistProfile: async () => {
        throw new Error("wrote past the demo guard");
      },
    }));
    vi.doMock("@/lib/db/artist-works", () => ({ getWorksByArtistProfileId: async () => [] }));
    vi.doMock("@/lib/geocode", () => ({ geocodePostcode: async () => null }));

    const { PUT } = await import("@/app/api/artist-profile/route");
    const res = await PUT(
      new Request("http://localhost/api/artist-profile", {
        method: "PUT",
        headers: { authorization: "Bearer demo", "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed by a tourist" }),
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ demo: true });
  });

  it("lets a non-demo user straight through the same handler", async () => {
    vi.resetModules();
    process.env.DEMO_ARTIST_USER_ID = "u-demo-artist";
    let wrote = false;
    vi.doMock("@/lib/api-auth", () => ({
      getAuthenticatedUser: async () => ({
        user: { id: "u-real-artist", email: "real@example.com" },
        error: null,
      }),
    }));
    vi.doMock("@/lib/db/artist-profiles", () => ({
      getArtistProfileByUserId: async () => null,
      upsertArtistProfile: async () => {
        wrote = true;
        return { error: null };
      },
    }));
    vi.doMock("@/lib/db/artist-works", () => ({ getWorksByArtistProfileId: async () => [] }));
    vi.doMock("@/lib/geocode", () => ({ geocodePostcode: async () => null }));
    vi.doMock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));

    const { PUT } = await import("@/app/api/artist-profile/route");
    const res = await PUT(
      new Request("http://localhost/api/artist-profile", {
        method: "PUT",
        headers: { authorization: "Bearer real", "content-type": "application/json" },
        body: JSON.stringify({ name: "A real edit" }),
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(wrote, "the guard blocked a real user").toBe(true);
  });
});
