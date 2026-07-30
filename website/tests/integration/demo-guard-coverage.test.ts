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

import { describe, it, expect } from "vitest";
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
  "enquiry/route.ts",
  "contact/route.ts",
  "newsletter/route.ts",
  "waitlist/route.ts",
  "register-venue/route.ts",
  "apply/route.ts",
  "curation/route.ts",
  "analytics/track/route.ts",
  "orders/track/route.ts",
  "account/email/unsubscribe/route.ts",
  // Guarding these would make the demo unreachable or unresettable.
  "demo/login/route.ts",
  "account/delete/route.ts",
  // Admin surfaces: an admin is never a demo user, and support needs them to
  // work against demo data when reproducing a report.
  "admin/",
  // No "cron/" entry on purpose. Every cron route is GET-only, so none reaches
  // the mutating filter above, and an exemption matching nothing today would
  // silently un-guard the first cron route that ever gains a POST.
]);

/**
 * Not yet wired. Kept SEPARATE from DEMO_EXEMPT so nobody reads debt as a
 * decision. 01 §E23a says to split this across two passes if the diff exceeds
 * ~30 files; 68 routes were flagged, so pass one wired the outward-facing set
 * (real emails, real money, public content) and this is the remainder. Counted,
 * not estimated: the first value here was a guess and this test rejected it.
 *
 * The length assertion below is a RATCHET: it may shrink, never grow, so a newly
 * added unguarded route still fails the build.
 */
const NOT_YET_WIRED_COUNT = 45;

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

/** Every route that mutates AND uses the service-role client. */
const mutatingRoutes: Route[] = walk(API)
  .map((full) => ({ rel: path.relative(API, full), source: readFileSync(full, "utf8") }))
  .filter((r) => MUTATING.test(r.source) && r.source.includes("getSupabaseAdmin"));

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

  it("holds the unwired count at its recorded value, so new debt fails the build", () => {
    // Shrink this number in the same commit that wires more routes.
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
      expect(
        /every mutation|all mutations|every mutating/i.test(source),
        `${rel} claims blanket demo protection, which is not true while ${NOT_YET_WIRED_COUNT} routes are unwired`,
      ).toBe(false);
    }
  });
});
