// K3 (07 §3.5). One source for arrangement labels.
//
// There were four implementations plus two API-layer ladders, producing five
// vocabularies for the same five values — including two different functions
// both called `arrangementLabel`, so which one a file got depended on its
// import line. `/spaces` rendered two of them on one page (finding E13).
//
// §3.5 says the last assertion here is worth more than the others, and it is
// right: a suppression comment is a knot being tied in front of you.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const CANONICAL = path.join("src", "lib", "arrangement-labels.ts");

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path.relative(process.cwd(), full));
    }
  }
  return out.sort();
}

/** Source with comments stripped: these checks are about code, not prose. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("one arrangement-label source (K3)", () => {
  it("has exactly one exported label function", async () => {
    // There were two, both named `arrangementLabel`: one in placements/status.ts
    // and one re-exported from arrangement-type.ts under the same name.
    const files = await sourceFiles(SRC);
    const exporters = files.filter((f) =>
      /export\s+(?:async\s+)?function\s+(arrangementLabel|labelForArrangement)\b|export\s+const\s+arrangementLabel\b/.test(
        code(f),
      ),
    );
    expect(exporters).toEqual([CANONICAL]);
  });

  it("has no `arrangementLabel` IMPORT or EXPORT left anywhere", async () => {
    // The name itself is the hazard: an alias that renames a function to
    // collide with a different function's name means the import line decides
    // which behaviour you get. A local `const arrangementLabel = ...` holding
    // the canonical function's RESULT is a value, not a second implementation,
    // so it is not what this guards.
    const files = await sourceFiles(SRC);
    const offenders = files.filter((f) =>
      /import[\s\S]{0,200}?\barrangementLabel\b[\s\S]{0,80}?from|export[^\n]*\barrangementLabel\b/.test(
        code(f),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("no longer derives an arrangement LABEL from prose", async () => {
    // Two places used to scan the free-text request message for "£X/month" when
    // the fee column was null, and pick a LABEL from what they found:
    // placements/status.ts inside arrangementLabel(), and PlacementContextPanel
    // with its own copy of the same regex. So the words a user saw depended on
    // wording someone had typed, and silently disagreed with every surface that
    // did not parse it. Both are gone.
    //
    // Named files rather than a sweep, because the sweep's honest version has a
    // false positive: PlacementDetailClient still parses the message for a
    // displayed monthly-fee AMOUNT, with a "re-confirm with the other party
    // before payout" caveat beside it. Measured against prod, 3 of 86
    // placements have a fee in the message and nothing in the column, so
    // deleting that would show "Free display" on three real negotiated
    // placements. That is a data backfill decision for the owner, recorded in
    // PROGRESS, not a duplicate-label cleanup.
    const FEE_FROM_PROSE = /(?:£|gbp)[\s\S]{0,20}?\\d\{2,5\}/i;
    for (const file of [
      path.join("src", "lib", "placements", "status.ts"),
      path.join("src", "components", "PlacementContextPanel.tsx"),
    ]) {
      expect(FEE_FROM_PROSE.test(code(file)), file).toBe(false);
    }
  });

  it("has no eslint-disable of no-raw-arrangement-type", async () => {
    // §3.5: worth more than the other assertions. A suppression comment is a
    // knot being tied in front of you.
    //
    // Comments are NOT stripped here, for the obvious reason.
    const files = await sourceFiles(SRC);
    const offenders = files.filter((f) =>
      /eslint-disable[^\n]*wallplace\/no-raw-arrangement-type/.test(readFileSync(f, "utf8")),
    );
    expect(
      offenders,
      "each of these is a place the guard was told to look away; route the label through arrangement-labels instead",
    ).toEqual([]);
  });

  it("finds source files at all, so an empty sweep cannot pass vacuously", async () => {
    expect((await sourceFiles(SRC)).length).toBeGreaterThan(200);
  });
});
