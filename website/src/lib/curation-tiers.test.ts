import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { CURATION_TIERS, CURATION_TIER_KEYS } from "./curation-tiers";

// T10. The curation_requests.tier CHECK allowed only single_wall / full_space /
// bespoke, while the route accepted managed_monthly and managed_quarterly too. Any
// managed sign-up therefore violated the constraint on insert and 500'd, so the
// £79.99/month and £199.99/quarter tiers were unsellable.
//
// D0 rules "fix, don't remove": widen the CHECK. This file is the guard that stops
// the two drifting apart again, which is the actual defect. A tier added in code
// without a matching migration fails here.

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

describe("curation tiers", () => {
  it("exposes all five tiers, including the two managed ones", () => {
    expect(CURATION_TIER_KEYS).toEqual([
      "single_wall",
      "full_space",
      "bespoke",
      "managed_monthly",
      "managed_quarterly",
    ]);
  });

  it("prices the managed tiers as advertised", () => {
    expect(CURATION_TIERS.managed_monthly).toMatchObject({
      kind: "managed",
      priceGbp: 79.99,
      interval: "month",
    });
    expect(CURATION_TIERS.managed_quarterly).toMatchObject({
      kind: "managed",
      priceGbp: 199.99,
      interval: "quarter",
    });
  });

  it("keeps the DB CHECK in step with the code, which is the T10 defect", () => {
    // If these ever disagree the managed tiers become unsellable again: the route
    // accepts the value and the insert violates the constraint.
    expect([...tierValuesFromMigrations()].sort()).toEqual([...CURATION_TIER_KEYS].sort());
  });

  it("has a migration that permits both managed tiers", () => {
    const permitted = tierValuesFromMigrations();
    expect(permitted).toContain("managed_monthly");
    expect(permitted).toContain("managed_quarterly");
  });

  it("still permits the three original tiers, so existing rows stay valid", () => {
    const permitted = tierValuesFromMigrations();
    for (const tier of ["single_wall", "full_space", "bespoke"]) {
      expect(permitted, `${tier} must remain valid`).toContain(tier);
    }
  });
});
