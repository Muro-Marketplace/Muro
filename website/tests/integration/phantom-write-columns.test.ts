// The phantom-column class, on the WRITE side.
//
// `phantom-columns.test.ts` scans every `.select()` against a snapshot of the
// live schema, because a select naming a column that does not exist is rejected
// whole by PostgREST and the `?? null` fallback yields a plausible-but-wrong
// value. Writes fail exactly the same way and were never scanned, and two live
// bugs were sitting in that gap:
//
//   artist_applications.referred_by_code   destroyed the referral code on EVERY
//                                          application ever submitted, because a
//                                          strip-and-retry re-inserted without
//                                          it. 13 applications, 0 referrals
//                                          recorded. (migration 109)
//   messages.flagged / flagged_reason      dropped message_type, metadata and
//                                          attachments from any message the
//                                          moderation filter flagged, so a
//                                          flagged placement request was stored
//                                          as plain text with none of its terms.
//                                          (09 item 2.2)
//
// Both were found by hand. This finds the next one.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../src");
const SCHEMA: Record<string, string[]> = JSON.parse(
  readFileSync(path.join(__dirname, "schema-columns.json"), "utf8"),
);

/**
 * Writes that name a column the live schema lacks, kept deliberately.
 *
 * Each entry is a claim that the write is a no-op on that column and that this
 * is understood. Shrink it, never grow it.
 */
const GRANDFATHERED: Array<{ file: string; table: string; phantom: string; why: string }> = [
  {
    file: "app/api/webhooks/stripe/route.ts",
    table: "artist_profiles",
    phantom: "free_until",
    why:
      "D17.2, the same parked question the SELECT side is grandfathered on in " +
      "phantom-columns.test.ts. The referral credit writes a free window and WHERE it " +
      "should be written is an open owner decision, because trial_end is Stripe-managed. " +
      "Left as the silent no-op it already is; remove both entries together when D17.2 " +
      "is answered.",
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every `.from("table").insert({ ... })` / `.update({ ... })` / `.upsert({ ... })`
 * where the payload is an INLINE object literal, with the keys it names.
 *
 * A payload passed as an identifier (`insert(row)`) is skipped: resolving it
 * would mean following the variable, and a regex that guessed would produce the
 * false positives that make a guard ignorable. Those are covered instead by
 * `one-write-attempt.test.ts`, which is about the same class from the other end.
 */
function inlineWrites(source: string): { table: string; op: string; keys: string[]; line: number }[] {
  const found: { table: string; op: string; keys: string[]; line: number }[] = [];
  // The `.from(...)` must be the NEAREST one before the write: `[^]{0,200}?`
  // happily spans an intervening `.from("other_table")`, which attributed a
  // placements insert to venue_profiles two lines above it and produced eleven
  // false positives on the first run.
  const re =
    /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,200}?)\.(insert|update|upsert)\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const openAt = m.index + m[0].length - 1;
    const op = m[3];
    // Balance braces to find the literal's end, so a nested object (metadata,
    // shipping) does not truncate the scan halfway.
    let depth = 0;
    let end = openAt;
    for (let i = openAt; i < source.length && i < openAt + 8000; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = source.slice(openAt + 1, end);
    // TOP-LEVEL keys only: `metadata: { foo: 1 }` contributes `metadata`, not `foo`.
    const keys: string[] = [];
    let d = 0;
    for (const line of body.split("\n")) {
      const before = d;
      for (const ch of line) {
        if (ch === "{" || ch === "[" || ch === "(") d++;
        else if (ch === "}" || ch === "]" || ch === ")") d = Math.max(0, d - 1);
      }
      if (before !== 0) continue;
      const km = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:/);
      if (km) keys.push(km[1]);
    }
    found.push({
      table: m[1],
      op,
      keys,
      line: source.slice(0, openAt).split("\n").length,
    });
  }
  return found;
}

function scan() {
  const offences: string[] = [];
  let writesChecked = 0;
  let keysChecked = 0;

  for (const file of walk(SRC)) {
    const rel = path.relative(path.resolve(__dirname, "../../src"), file);
    const source = readFileSync(file, "utf8");
    for (const w of inlineWrites(source)) {
      const known = SCHEMA[w.table];
      // A table the snapshot does not cover (one a pending migration will add)
      // is skipped rather than treated as having no columns.
      if (!known) continue;
      writesChecked++;
      for (const key of w.keys) {
        keysChecked++;
        if (known.includes(key)) continue;
        if (
          GRANDFATHERED.some(
            (g) => rel.endsWith(g.file) && g.table === w.table && g.phantom === key,
          )
        ) {
          continue;
        }
        offences.push(`${rel}:${w.line} ${w.op}s "${w.table}.${key}", which the live schema lacks`);
      }
    }
  }
  return { offences, writesChecked, keysChecked };
}

describe("no .insert/.update names a column the live schema lacks", () => {
  it("scans a realistic number of writes, so the sweep cannot pass vacuously", () => {
    const { writesChecked, keysChecked } = scan();
    expect(writesChecked).toBeGreaterThan(30);
    expect(keysChecked).toBeGreaterThan(150);
  });

  it("has no phantom write column that is not grandfathered", () => {
    const { offences } = scan();
    expect(
      offences,
      "PostgREST rejects the WHOLE statement, so this write stores nothing, or a " +
        "strip-and-retry quietly stores less than it was asked to. Add a migration " +
        "(109 is the worked example) or drop the field.",
    ).toEqual([]);
  });

  it("keeps the grandfather list shrinking: every entry still applies", () => {
    const { offences } = scan();
    for (const g of GRANDFATHERED) {
      expect(g.why.length, `${g.file} ${g.table}.${g.phantom} needs a real reason`).toBeGreaterThan(40);
      expect(
        offences.some((o) => o.includes(`${g.table}.${g.phantom}`)),
        `${g.table}.${g.phantom} is no longer written; remove its entry`,
      ).toBe(false);
    }
  });
});
