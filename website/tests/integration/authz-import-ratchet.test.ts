// 01 Phase E item 15, the half that could not land yet.
//
// Item 15 says: extend require-authz-on-mutation to treat @/lib/db/* as
// service-role-equivalent, then flip the rule from "warn" to "error", and "land
// only once phases B to D are green, or CI will be red on known work".
//
// The extension shipped and is covered by
// tests/integration/eslint-require-authz-on-mutation.test.ts. The FLIP has not,
// and the doc's stated precondition turns out to be the wrong one.
//
// Phases B to D ARE green: every finding in them is fixed. But the rule's
// criterion is "imports @/lib/authz or @/lib/admin-auth, or is allowlisted",
// which is much broader than "the findings are fixed". 43 route files still fail
// it, and they are NOT unauthorised: sampled, they authorise inline by
// self-scoping the query, e.g.
//
//     .eq("user_id", auth.user!.id)
//
// which is real authorisation, just not routed through the shared helpers. So
// flipping today would turn CI red over a CONVENTION migration, not a security
// gap, and would do it across 43 files at once.
//
// This file is the mechanism that makes the flip reachable: the count may shrink,
// never grow. Nobody can add a new unannotated mutating route, and every route
// migrated to an assert* helper (or allowlisted with its real alternative
// control) lowers the number until the flip costs nothing.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Measured, not estimated. Lower it in the same commit that migrates or
 * allowlists a route. When it reaches 0, flip the rule to "error" in
 * eslint.config.mjs and delete this file.
 */
// Typed as number, not the literal 43, so the zero comparisons below stay
// meaningful to the typechecker rather than being narrowed away.
const ROUTES_WITHOUT_AUTHZ_IMPORT: number = 43;

type EslintFile = { filePath: string; messages: { ruleId?: string; message?: string }[] };

/**
 * Run eslint and return its JSON report, tolerating a non-zero exit.
 *
 * eslint exits 1 when it reports an error, and execFileSync throws on non-zero,
 * taking the whole test file down at collection time. That is not hypothetical:
 * probing this file by flipping the rule to "error" produced "no tests" rather
 * than a failure, which means the severity assertion below could never actually
 * have run in the state it exists to catch. The report is on stdout either way.
 */
function eslintReport(): EslintFile[] {
  try {
    const out = execFileSync("npx", ["eslint", "src/app/api/**/route.ts", "-f", "json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout;
    if (!stdout) throw err;
    return JSON.parse(stdout);
  }
}

function routesMissingAuthzImport(): string[] {
  const report = eslintReport();
  const files = new Set<string>();
  for (const f of report) {
    for (const m of f.messages || []) {
      if (m.ruleId !== "wallplace/require-authz-on-mutation") continue;
      // The rule reports two distinct things; only the authz arm is counted here.
      if ((m.message || "").includes("@/lib/authz")) {
        files.add(f.filePath.split("/src/app/api/")[1] ?? f.filePath);
      }
    }
  }
  return [...files].sort();
}

describe("authz-import ratchet (01 Phase E item 15)", () => {
  const missing = routesMissingAuthzImport();

  it("does not grow: no new mutating route may skip the authz helpers", () => {
    expect(
      missing.length,
      `Expected ${ROUTES_WITHOUT_AUTHZ_IMPORT}, found ${missing.length}.\n` +
        `If you migrated or allowlisted a route, LOWER the constant in this file.\n` +
        `If you added a route, import an assert* from @/lib/authz or add it to\n` +
        `PUBLIC_ROUTES with its real alternative control.\n\n${missing.join("\\n")}`,
    ).toBe(ROUTES_WITHOUT_AUTHZ_IMPORT);
  });

  it("keeps the rule at warn while the count is non-zero, so CI is not red on convention debt", () => {
    // The two must move together. Flipping to "error" with a non-zero count
    // breaks every PR; leaving it at "warn" once the count is zero throws away
    // the guarantee the whole of Phase A built.
    const config = execFileSync("cat", ["eslint.config.mjs"], { cwd: ROOT, encoding: "utf8" });
    const severity = /"wallplace\/require-authz-on-mutation":\s*"(warn|error)"/.exec(config)?.[1];
    expect(severity, "rule severity not found in eslint.config.mjs").toBeTruthy();
    expect(
      severity,
      ROUTES_WITHOUT_AUTHZ_IMPORT === 0
        ? "the count is 0, so flip the rule to error and delete this file"
        : `${ROUTES_WITHOUT_AUTHZ_IMPORT} routes still lack the import, so the rule must stay at warn`,
    ).toBe(ROUTES_WITHOUT_AUTHZ_IMPORT === 0 ? "error" : "warn");
  });

  it("still enforces the demo-guard arm at zero, which item 13 already achieved", () => {
    // Proof the two arms are independent: demo coverage is complete even though
    // the authz arm is not, which is why the rule reports them separately.
    const demoOffenders = eslintReport().flatMap((f) =>
      (f.messages || [])
        .filter(
          (m) =>
            m.ruleId === "wallplace/require-authz-on-mutation" &&
            (m.message || "").includes("demo-guard"),
        )
        .map(() => f.filePath.split("/src/app/api/")[1]),
    );
    expect(demoOffenders, `demo-guard regressed:\n${demoOffenders.join("\\n")}`).toEqual([]);
  });
});
