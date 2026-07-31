// 05 E43 / supervisor D67. The grandfathered ratchet for wallplace/no-authfetch-mutation.
//
// The E43 family is one defect: authFetch resolves on a non-2xx response (it does
// not throw), so a mutation written with it runs its success path on a 403/500.
// The hand-written list (E43-a..k) was ~11 items; the rule, run over all of src,
// finds 94 mutating authFetch calls across 44 files. That gap is exactly why D67
// moved the rule to the front: a read finds roughly half the surface, a detector
// finds all of it.
//
// This file holds the count so it can only shrink. Each migration of an authFetch
// mutation to mutate() lowers LITERAL_FLOOR in the same commit. When it reaches 0,
// flip wallplace/no-authfetch-mutation to "error" in eslint.config.mjs and delete
// this file. The rule stays at "warn" until then so CI is not red on the migration.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Measured, not estimated (npx eslint over src/**, counted below). Lower it in
 * the same commit that migrates an authFetch mutation to mutate(). NEVER raise
 * it: a new mutating authFetch is the one thing this rule exists to stop.
 *
 * Typed as number, not the literal, so the zero comparison below stays meaningful
 * to the typechecker rather than being narrowed away.
 */
const LITERAL_FLOOR: number = 71;

type EslintFile = { filePath: string; messages: { ruleId?: string; message?: string }[] };

/**
 * Run eslint over all of src and return its JSON report, tolerating a non-zero
 * exit (eslint exits 1 when any error-level rule fires elsewhere; execFileSync
 * would otherwise throw and take the whole file down at collection time — the
 * authz ratchet learned this the hard way). The report is on stdout either way.
 */
function eslintReport(): EslintFile[] {
  try {
    const out = execFileSync("npx", ["eslint", "src/**/*.{ts,tsx}", "-f", "json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout;
    if (!stdout) throw err;
    return JSON.parse(stdout);
  }
}

function authfetchMutationCount(report: EslintFile[]): { total: number; byFile: Record<string, number> } {
  const byFile: Record<string, number> = {};
  let total = 0;
  for (const f of report) {
    for (const m of f.messages || []) {
      if (m.ruleId !== "wallplace/no-authfetch-mutation") continue;
      total++;
      const rel = f.filePath.split("/website/")[1] ?? f.filePath;
      byFile[rel] = (byFile[rel] || 0) + 1;
    }
  }
  return { total, byFile };
}

describe("no-authfetch-mutation ratchet (05 E43 / D67)", () => {
  const { total, byFile } = authfetchMutationCount(eslintReport());

  it("does not grow: no new authFetch mutation may be introduced", () => {
    const breakdown = Object.entries(byFile)
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `  ${n}  ${f}`)
      .join("\n");
    expect(
      total,
      `Expected ${LITERAL_FLOOR} authFetch mutations, found ${total}.\n` +
        `If you migrated one to mutate(), LOWER LITERAL_FLOOR in this file.\n` +
        `If this went UP, you added an authFetch mutation — use mutate() instead.\n\n${breakdown}`,
    ).toBe(LITERAL_FLOOR);
  });

  it("keeps the rule at warn while the count is non-zero, so CI is not red on the migration", () => {
    // The two move together: flipping to "error" with a non-zero count breaks
    // every PR; leaving it at "warn" once the count is zero throws away the guard.
    const config = readFileSync(path.join(ROOT, "eslint.config.mjs"), "utf8");
    const severity = /"wallplace\/no-authfetch-mutation":\s*"(warn|error)"/.exec(config)?.[1];
    expect(severity, "rule severity not found in eslint.config.mjs").toBeTruthy();
    expect(
      severity,
      LITERAL_FLOOR === 0
        ? "the count is 0, so flip the rule to error and delete this file"
        : `${LITERAL_FLOOR} authFetch mutations remain, so the rule must stay at warn`,
    ).toBe(LITERAL_FLOOR === 0 ? "error" : "warn");
  });
});
