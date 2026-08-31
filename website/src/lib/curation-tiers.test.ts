import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURATION_TIERS,
  CURATION_TIER_KEYS,
  PROGRAMME_LADDER,
  PROGRAMME_PIECE_RENT_MIN_GBP,
  PROGRAMME_PIECE_RENT_TARGET_GBP,
  PROGRAMME_RENT_SHARE_MAX,
  PROGRAMME_FOUNDING_SITE_LIMIT,
} from "./curation-tiers";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, "../../supabase/migrations");

/** The tier values the latest tier CHECK in the migrations permits. */
function tierValuesFromMigrations(): string[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let latest: string[] | null = null;
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    // Match the ARRAY[...] / IN (...) list of a tier check on curation_requests.
    const check = /curation_requests_tier_check[\s\S]{0,400}?CHECK\s*\(([\s\S]*?)\)\s*;/i.exec(sql);
    if (!check) continue;
    const values = [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    if (values.length) latest = values;
  }
  if (!latest) throw new Error("no curation_requests tier CHECK found in any migration");
  return latest;
}

// Wallplace Programmes plan, Task 1. Supersedes the T10-era version of this
// file: managed_monthly and managed_quarterly never sold a unit (their Stripe
// price IDs were never configured, so the route 503'd), and are retired here
// in favour of one quoted `programme` tier. Every programme deal is quoted by
// an admin, so there is no fixed price ID and nothing to keep in step with a
// Stripe price. The old DB-CHECK/code sync tests this file used to carry
// (T10's actual regression guard) moved with the tier CHECK migration to
// Task 2 (below), which is the task that teaches curation_requests.tier about
// `programme`.

// Task 2. The T10 guard used to assert the CHECK's values equal
// CURATION_TIER_KEYS exactly. That equality no longer holds by design: the
// migration widening the CHECK for `programme` (121) deliberately keeps
// managed_monthly and managed_quarterly in the CHECK for historical rows,
// even though Task 1 already dropped them from CURATION_TIERS, so the CHECK
// is now a strict superset of the live tier keys, not a mirror of them. The
// guard below is adjusted accordingly: every live tier key must still be
// permitted (the actual T10 defect: code accepts a value the DB rejects), but
// the CHECK is allowed to additionally permit values code no longer offers.
describe("tier CHECK / code sync (T10 regression guard)", () => {
  it("permits every current tier key", () => {
    const permitted = tierValuesFromMigrations();
    for (const key of CURATION_TIER_KEYS) {
      expect(permitted, `${key} must be permitted by the tier CHECK`).toContain(key);
    }
  });

  it("still permits the retired managed tiers, for historical rows", () => {
    // Postgres revalidates every CHECK on a row on any UPDATE, not just the
    // touched columns, so dropping these would break an update to an old
    // managed-tier row (D25-style: fix, don't remove, applies to CHECK values
    // too, not just whole constraints).
    const permitted = tierValuesFromMigrations();
    expect(permitted).toContain("managed_monthly");
    expect(permitted).toContain("managed_quarterly");
  });
});

describe("programme tier", () => {
  it("is quote-first, from £79.99, on a 12 month term", () => {
    expect(CURATION_TIERS.programme.priceGbp).toBe(79.99);
    expect(CURATION_TIERS.programme.payFirst).toBe(false);
    expect(CURATION_TIERS.programme.termMonths).toBe(12);
  });

  it("retires the fixed-price managed tiers", () => {
    expect("managed_monthly" in CURATION_TIERS).toBe(false);
    expect("managed_quarterly" in CURATION_TIERS).toBe(false);
  });

  it("prices the ladder at about £25 per piece per month", () => {
    expect(PROGRAMME_LADDER).toHaveLength(4);
    for (const rung of PROGRAMME_LADDER) {
      const perPiece = rung.monthlyGbp / rung.pieces;
      expect(perPiece).toBeGreaterThanOrEqual(24);
      expect(perPiece).toBeLessThanOrEqual(27);
    }
  });

  it("keeps the artist rent guardrails", () => {
    expect(PROGRAMME_PIECE_RENT_MIN_GBP).toBe(5);
    expect(PROGRAMME_PIECE_RENT_TARGET_GBP).toBe(10);
    expect(PROGRAMME_RENT_SHARE_MAX).toBe(0.7);
  });

  it("keeps the artist share near 40% at every rung when rent is on target", () => {
    for (const rung of PROGRAMME_LADDER) {
      const share = (rung.pieces * PROGRAMME_PIECE_RENT_TARGET_GBP) / rung.monthlyGbp;
      expect(share).toBeGreaterThan(0.35);
      expect(share).toBeLessThan(PROGRAMME_RENT_SHARE_MAX);
    }
  });

  // Task 4: mirrors FOUNDING_ARTIST_LIMIT (src/lib/pricing.ts), which the admin
  // quote route's founding-cohort guard is built against.
  it("caps the founding cohort at 5 sites", () => {
    expect(PROGRAMME_FOUNDING_SITE_LIMIT).toBe(5);
  });
});
