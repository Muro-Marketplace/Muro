// The advisor allowlist and its documentation must agree.
//
// `known-acceptable.json` suppresses a `rls_enabled_no_policy` INFO lint for
// every table that is service-role-only by design. `check-regressions.ts` has
// pointed at `docs/security/service-role-only-tables.md` since it was written,
// and **that file did not exist**, so nothing connected a suppression to a
// reason. Two tables (`artist_applications`, `stripe_webhook_events`) were live
// and in neither list, which means the nightly advisor job was failing on a
// deliberate design, and four more would have joined them.
//
// The advisor job is nightly rather than part of `npm run check` (ledger row
// 0b), so forgetting the allowlist entry fails later and somewhere else. This
// test is in `check`, which is where the mistake is actually made.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const PREFIX = "rls_enabled_no_policy_public_";

function suppressed(): string[] {
  const json = JSON.parse(
    readFileSync(path.join(ROOT, "scripts/audit/known-acceptable.json"), "utf8"),
  ) as { ignore_cache_keys: string[] };
  return json.ignore_cache_keys
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => k.slice(PREFIX.length));
}

function documented(): string {
  return readFileSync(path.join(ROOT, "docs/security/service-role-only-tables.md"), "utf8");
}

describe("service-role-only tables are documented", () => {
  it("suppresses a realistic number of lints", () => {
    expect(suppressed().length).toBeGreaterThan(15);
  });

  it("every suppressed table is named in the doc", () => {
    const doc = documented();
    const undocumented = suppressed().filter((t) => !doc.includes(`\`${t}\``));
    expect(
      undocumented,
      "a suppression with no entry in docs/security/service-role-only-tables.md is an " +
        "unexplained one. Add a row saying which route writes the table.",
    ).toEqual([]);
  });

  it("the doc names a writer for each, not just the table", () => {
    // A row that lists the table and nothing else is a list, not documentation.
    const rows = documented()
      .split("\n")
      .filter((l) => l.startsWith("| `"));
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      expect(cells.length, row).toBeGreaterThanOrEqual(2);
      expect(cells[1].length, row).toBeGreaterThan(5);
    }
    expect(rows.length).toBeGreaterThan(15);
  });
});
