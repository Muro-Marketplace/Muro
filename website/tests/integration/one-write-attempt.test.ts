// One write attempt per write.
//
// Nine strip-and-retry ladders were found across four files, and every one of
// them was the same shape: a write fails, the code deletes some columns from the
// payload and writes again, and the caller is told it worked. What they actually
// did:
//
//   api/apply           destroyed the referral code on EVERY application ever
//                       submitted, because `referred_by_code` was not a column.
//                       13 applications, 7 artists holding a code to share, 0
//                       records of who referred whom. (migration 109)
//   api/messages        dropped message_type, metadata and attachments from any
//                       message the moderation filter flagged, because `flagged`
//                       was not a column. A flagged placement request was stored
//                       as plain text with none of its terms. (09 item 2.2)
//   placements/route.ts seven sites, every stripped column present in prod, so
//                       each could only turn a real failure into a false
//                       success. (row 22 / D65)
//   admin/applications  would have recorded an accept without who did it or
//                       when, and returned 200.
//   venues/[slug]       ran a second full query on every 404 of a public route
//                       and swallowed the error.
//
// The pattern is worth a guard because it looks defensive. It reads as "cope
// with an older schema" and behaves as "write less than you were asked to and
// say nothing".
//
// This is a HEURISTIC, and deliberately a narrow one: it looks for the specific
// idiom, a property being deleted from an object that a write then receives. It
// will not catch every possible rewrite of the shape, and it does not try to.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

/**
 * The one deliberate ladder, with its reason.
 *
 * `upsertWork` writes core columns first and then applies each extended column
 * individually, so a failure on one newer column cannot silently kill the
 * description save. That is the opposite of the pattern above: it reports every
 * dropped column back to the caller through `droppedColumns` and
 * `fallbackErrors`, and the route logs them. Migration 104 records why it stays.
 */
const ALLOWED = new Map<string, string>([
  [
    "src/lib/db/artist-works.ts",
    "upsertWork writes core columns first and then applies each extended column " +
      "INDIVIDUALLY, so a failure on one newer column cannot silently kill the " +
      "description save. It reports every dropped column back through droppedColumns " +
      "and fallbackErrors, and the route logs them, which is the opposite of the " +
      "pattern above. Migration 104 records why it stays.",
  ],
  [
    "src/app/api/webhooks/stripe/route.ts",
    "D6 kept this one on purpose and hardened it: REQUIRED_MONEY_COLS can never be " +
      "stripped, and a retry that surfaces one refuses to book the order. An order " +
      "arriving from Stripe is money already taken, so refusing to write it at all " +
      "is worse than writing it without an optional column.",
  ],
]);

function sourceFiles(): string[] {
  let out = "";
  try {
    out = execFileSync(
      "grep",
      ["-rl", "--include=*.ts", "--include=*.tsx", "-E", "\\.(insert|update|upsert)\\(", "src"],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch {
    return [];
  }
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !/\.test\.tsx?$/.test(f));
}

/** Comments stripped: several of these files DESCRIBE the deleted pattern. */
function code(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("no strip-and-retry write ladders", () => {
  it("finds files that write at all, so the sweep is not vacuous", () => {
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  it("nothing deletes a column from a payload it then writes", () => {
    // `delete safeRow[col]` followed by `.insert(safeRow)` — the idiom every one
    // of the nine used.
    //
    // The object matters, not just the delete. `artwork-requests/route.ts`
    // deletes four keys from a row it is about to RETURN, to redact a public
    // response, and a check that only looked for "a delete and a write in the
    // same file" flagged it. It was a false positive when this was first run,
    // which is why the identifier is tracked through to the write.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (ALLOWED.has(file)) continue;
      const src = code(file);
      for (const m of src.matchAll(/\bdelete\s+(\w+)\s*[[.]/g)) {
        const target = m[1];
        const written = new RegExp(`\\.(insert|update|upsert)\\(\\s*${target}\\b`).test(src);
        if (written) {
          offenders.push(`${file} → ${target}`);
          break;
        }
      }
    }
    expect(
      offenders,
      "a write that drops columns and tries again reports success while storing less than it was " +
        "asked to. Check the column against tests/integration/schema-columns.json: if it exists, " +
        "delete the ladder; if it does not, add a migration (109 is the worked example).",
    ).toEqual([]);
  });

  // NOT ASSERTED: "no write inside an `if (error)` block". That heuristic was
  // written, run, and thrown away: a window after any error branch catches
  // thirteen unrelated files, because "handle the error then carry on writing"
  // is ordinary code. A guard needing a thirteen-entry allowlist is not a
  // guard, it is a list. The delete-from-payload check above is the sharp
  // signal, and it is the one all nine sites actually shared.

  it("keeps every allowlisted ladder honest: the file exists and still has one", () => {
    // A stale allowlist entry is the failure mode the public-route audit exists
    // to catch, and the same applies here: an exemption that outlives the code
    // it excused silently covers whatever appears at that path next.
    for (const [file, reason] of ALLOWED) {
      expect(() => readFileSync(path.join(ROOT, file), "utf8"), file).not.toThrow();
      expect(code(file), `${file} no longer has a ladder; remove its allowlist entry`).toMatch(
        /\bdelete\s+\w+\s*[[.]/,
      );
      expect(reason.length, `${file} needs a real reason`).toBeGreaterThan(60);
    }
  });
});
