// A4.7. Money rendered with `toLocaleString()` and a hand-written £ prefix.
//
// `Number.prototype.toLocaleString()` with no options gives at most three
// decimals and no minimum, so £1,127.20 renders as "£1,127.2" and £150.00 as
// "£150". Production showed an artist their earnings as £1,127.2 on the
// portal dashboard. It is not wrong by a penny, it just does not look like
// money, on the screens where looking like money matters most.
//
// `formatPounds` in lib/format-currency.ts has always been the answer. This
// holds the count of sites that still bypass it so it can only shrink.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Currency-prefixed `toLocaleString()` calls, in any of the three ways the
 * codebase writes a pound sign: literal £, the &pound; entity, and £.
 */
const PATTERN = String.raw`(£|&pound;|\\u00a3)\{?[^}\n]*\.toLocaleString\(\)`;

/**
 * Measured, not estimated. The one remaining site is `formatPoundsCompact` in
 * the analytics chart, which deliberately renders axis labels as "£12k" and
 * "£500" and documents that it is not for full currency strings.
 *
 * Lower this in the same commit that removes a site. NEVER raise it.
 */
const FLOOR: number = 1;

function findSites(): string[] {
  try {
    const out = execFileSync(
      "grep",
      ["-rEn", PATTERN, "--include=*.tsx", "--include=*.ts", path.join(ROOT, "src")],
      { encoding: "utf8" },
    );
    return out.trim().split("\n").filter(Boolean);
  } catch (err) {
    // grep exits 1 when it matches nothing, which is the goal state.
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

describe("money formatting ratchet", () => {
  it("does not add new hand-rolled currency formatting", () => {
    const sites = findSites();
    expect(
      sites.length,
      `Use formatPounds from @/lib/format-currency instead of a £ prefix with ` +
        `toLocaleString(). Sites found:\n${sites.join("\n")}`,
    ).toBeLessThanOrEqual(FLOOR);
  });

  it("keeps the floor honest, so a fixed site lowers it", () => {
    expect(findSites().length).toBe(FLOOR);
  });

  it("the one remaining site is the documented chart-axis helper", () => {
    const sites = findSites();
    if (sites.length === 0) return;
    expect(sites.every((s) => s.includes("analytics"))).toBe(true);
  });
});
