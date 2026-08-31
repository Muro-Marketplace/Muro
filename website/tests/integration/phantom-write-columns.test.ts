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
//
// TWO VARIANTS ARE DELIBERATELY NOT COVERED, and both were swept by hand on
// 2026-08-28 and found clean:
//
//   .rpc("fn", {...})            a function that does not exist, or an argument
//                                name that does not match. All four call sites
//                                (claim_artist_work_slot, decrement_work_stock,
//                                increment_placement_revenue, restock_work)
//                                match production exactly.
//   .upsert(..., { onConflict }) a conflict target with no matching unique
//                                constraint, which errors at runtime. All eight
//                                distinct targets have one.
//
// Covering them needs the snapshot to carry functions and unique constraints,
// which means changing its format, its generator and its round-trip test. The
// three variants above found fifteen live defects between them; these two found
// none. Recorded rather than built, so the gap is a decision and not an
// oversight.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inlineWrites, walk } from "./db-write-scan";

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
  // EMPTY. The one entry ever held here (the referral credit's `free_until`)
  // became a real column in migration 115, removed together with the SELECT
  // side's entry as both said to do. Ratchet: shrink only.
];

// `topLevelKeys` and `inlineWrites` live in ./db-write-scan.ts, shared with
// not-null-writes.test.ts, which asks the other question of the same writes:
// can the VALUE be null on a NOT NULL column? The doc comments moved with them.

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

/**
 * Tables the code may name that the snapshot does not carry, with the reason.
 *
 * Empty on purpose. Three entries would have belonged here and are now real
 * tables instead (migration 111): `conversation_reports`, `user_blocks` and
 * `placement_record_versions`, each written by a shipped feature, each write
 * failing, each error swallowed into a `console.warn` behind an `{ ok: true }`.
 */
const PHANTOM_TABLE_ALLOWED = new Map<string, string>();

/** Every `.from("table")` in the source, whatever it does with it. */
function tablesNamed(source: string): { table: string; line: number }[] {
  const out: { table: string; line: number }[] = [];
  for (const m of source.matchAll(/\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/g)) {
    out.push({ table: m[1], line: source.slice(0, m.index ?? 0).split("\n").length });
  }
  return out;
}

// A table that does not exist fails EXACTLY like a column that does not exist,
// and it hid in the same place: `DELETE /api/account` wrote to `from("waitlist")`
// and `from("applications")`, neither of which is a table (they are
// `waitlist_signups` and `artist_applications`), so a person's right to erasure
// silently left their waitlist entry and their whole application in place.
describe("no .from() names a table the live schema lacks", () => {
  it("names only tables that exist", () => {
    const offences: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file);
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const { table, line } of tablesNamed(source)) {
        if (SCHEMA[table]) continue;
        if (PHANTOM_TABLE_ALLOWED.has(table)) continue;
        offences.push(`${rel}:${line} reads or writes "${table}", which is not a table`);
      }
    }
    expect(
      offences,
      "PostgREST rejects the whole statement, so this does nothing at all. Check the " +
        "name against tests/integration/schema-columns.json, or add the table (migration " +
        "111 is the worked example).",
    ).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    for (const [table, why] of PHANTOM_TABLE_ALLOWED) {
      expect(why.length, `${table} needs a real reason`).toBeGreaterThan(40);
      expect(SCHEMA[table], `${table} exists now; remove its entry`).toBeUndefined();
    }
  });
});

/**
 * Filter columns that do not exist, with the reason. Empty on purpose.
 *
 * A `.eq("nope", x)` is rejected exactly like a phantom select or a phantom
 * write, and it reads as "no rows" rather than as an error, which is the most
 * convincing wrong answer of the three.
 */
const PHANTOM_FILTER_ALLOWED = new Map<string, string>();

const FILTER_METHODS = "eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|order";

// The third variant of the class. `.select()` is guarded by
// phantom-columns.test.ts and writes by the block below; FILTERS were not, and
// four were live:
//
//   artist_works.artist_user_id   (x2) the column is `artist_id` and it holds the
//                                 PROFILE id, so the day-4 "upload your first
//                                 artwork" nudge went to every artist including
//                                 those who had already uploaded
//   analytics_events.venue_slug   the weekly venue digest reported zero views for
//                                 every venue, and skipped venues whose week was
//                                 mostly views
//   placements.requester_user_id  the anti-spam outreach cap counted zero
//                                 placement requests, so on that surface it did
//                                 not exist: a Core artist limited to 2 first
//                                 contacts a day could send unlimited ones
describe("no filter names a column the live schema lacks", () => {
  it("filters only on columns that exist", () => {
    const offences: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file);
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // Nearest `.from(...)`, then its chain, bounded so a later unrelated call
      // is not attributed to it.
      const chains = source.matchAll(
        /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,900})/g,
      );
      for (const c of chains) {
        const known = SCHEMA[c[1]];
        if (!known) continue;
        for (const f of c[2].matchAll(
          new RegExp(`\\.(${FILTER_METHODS})\\(\\s*["'\`]([a-z_][a-z0-9_]*)["'\`]`, "g"),
        )) {
          if (known.includes(f[2])) continue;
          if (PHANTOM_FILTER_ALLOWED.has(`${c[1]}.${f[2]}`)) continue;
          const line = source.slice(0, (c.index ?? 0) + (f.index ?? 0)).split("\n").length;
          offences.push(`${rel}:${line} filters ${c[1]} on .${f[1]}("${f[2]}"), which does not exist`);
        }
      }
    }
    expect(
      offences,
      "PostgREST rejects the whole query, and a rejected count reads as zero rather " +
        "than as an error, which is the most convincing wrong answer this class produces.",
    ).toEqual([]);
  });
});

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
