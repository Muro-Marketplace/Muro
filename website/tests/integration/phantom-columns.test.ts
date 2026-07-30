// Guard against the phantom-column class (D17.3).
//
// The failure is always the same and always silent: a `.select()` names a column
// that does not exist, PostgREST rejects the ENTIRE query, the `|| []` or `?? null`
// fallback yields a plausible-but-wrong value, and nothing throws. Four instances
// have cost real money or real entitlements so far:
//
//   orders.amount_cents          Bug 15  /admin read £0 against £1174.87 of sales
//   artist_profiles.free_until   D17.1   every artist charged 15%, premium owed 8%
//   ships_internationally        G-C     every artwork page claimed "UK only"
//   placements.requester_user_id N3      accept/decline never rendered
//
// This file is the narrow version, scoped to the columns already proven absent
// against project uwkuhygwvasdzwsusiym. D17.3 mandates the general form: a
// committed schema-columns.json snapshot plus a scan of every select. That is
// ledger item 7b; this is the part that pays for itself now.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");

/**
 * Verified absent from a SPECIFIC live table, keyed "table.column".
 *
 * Table-aware on purpose. The first cut of this guard matched on column name
 * alone and immediately flagged `stripe_transfers.amount_cents`, which is a real
 * column: only `orders.amount_cents` was ever phantom. A guard that cries wolf
 * teaches people to add exemptions, so it must be as precise as the schema.
 *
 * `ships_internationally` and `international_shipping_price` are deliberately
 * absent from this list: they WERE phantom, and migration 081 made them real.
 */
const PHANTOM: Record<string, string> = {
  "artist_profiles.free_until": "D17.1. Real column is trial_end",
  "orders.amount_cents": "Bug 15. Use total (pounds) and convert",
  "artist_works.in_store_price": "A8. Still absent",
  "placements.requester_user_id": "N3. Real column is proposed_by_user_id",
};

/**
 * Parked by an explicit decision, not by neglect. Each entry names the decision.
 */
const EXEMPT = [
  {
    file: "app/api/webhooks/stripe/route.ts",
    column: "free_until",
    // Matched on the EXACT column list, not just the file. A file-level exemption
    // here silently un-guarded the fee select in the same file, which is the one
    // line D17.1 exists to protect: reverting that fix left the suite green. Found
    // by probing the guard rather than trusting it.
    columns: "id, free_until",
    why: "D17.2: the referral path WRITES a free window and where it should write is "
       + "an open owner question (trial_end is Stripe-managed). Left as the silent "
       + "no-op it already is rather than half-migrated. Remove this exemption when "
       + "D17.2 is answered.",
  },
];

/**
 * Real bugs, found by this guard, queued as their own work. Kept SEPARATE from
 * EXEMPT so nobody reads a bug as a decision. The count below is a ratchet: it may
 * shrink, never grow, so a newly introduced phantom select still fails the build.
 */
const KNOWN_UNFIXED = [
  {
    file: "app/api/placements/route.ts",
    column: "requester_user_id",
    columns: "artist_user_id, venue_user_id, artist_slug, venue_slug, venue, status, requester_user_id",
    finding: "N3 follow-up",
    why: "This route integrates the phantom column in roughly twenty places: reads, "
       + "an insert, an update, a role-flip, a strip-candidate list and a backfill. "
       + "The real column is proposed_by_user_id, which lib/authz.ts already uses. "
       + "Untangling it is its own task, not a side effect of the D17.1 fee fix. The "
       + "site is not currently failing for users because it retries without the "
       + "column, at the cost of one guaranteed-rejected query per request.",
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
 * Every `.from("table")` paired with the `.select("...")` that follows it, with the
 * select's 1-indexed line. Chained calls may sit on separate lines, so the pair is
 * matched across a bounded window of intervening whitespace and comments.
 */
function tableSelects(source: string): { table: string; columns: string; line: number }[] {
  const found: { table: string; columns: string; line: number }[] = [];
  const re = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)[\s\S]{0,200}?\.select\(\s*(["'`])([\s\S]*?)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const selectAt = m.index + m[0].lastIndexOf(".select(");
    found.push({
      table: m[1],
      columns: m[3],
      line: source.slice(0, selectAt).split("\n").length,
    });
  }
  return found;
}

const FILES = walk(SRC);

describe("no .select() names a column the live schema lacks", () => {
  it("scans a meaningful number of source files", () => {
    // Cheap insurance: a broken walk would make every assertion below vacuous.
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("finds table/select pairs to check", () => {
    const total = FILES.reduce((n, f) => n + tableSelects(readFileSync(f, "utf8")).length, 0);
    expect(total).toBeGreaterThan(50);
  });

  it("has no unexempted phantom column in any select", () => {
    const offences: string[] = [];
    for (const file of FILES) {
      const rel = path.relative(SRC, file);
      for (const { table, columns, line } of tableSelects(readFileSync(file, "utf8"))) {
        const named = columns.split(",").map((c) => c.trim().split(/[\s(]/)[0]);
        for (const column of named) {
          const key = `${table}.${column}`;
          if (!PHANTOM[key]) continue;
          const parked = [...EXEMPT, ...KNOWN_UNFIXED].some(
            (e) => rel === e.file && e.column === column && e.columns === columns,
          );
          if (parked) continue;
          offences.push(`${rel}:${line} selects "${key}" (${PHANTOM[key]})`);
        }
      }
    }
    expect(offences, `phantom column(s) in a select:\n${offences.join("\n")}`).toEqual([]);
  });

  it("holds the known-unfixed list at its recorded size, so new debt fails the build", () => {
    // A ratchet, not a cap on effort: shrink it by fixing something, and lower the
    // number in the same commit.
    expect(KNOWN_UNFIXED).toHaveLength(1);
    for (const k of KNOWN_UNFIXED) {
      expect(k.finding.length, "each entry names the finding it belongs to").toBeGreaterThan(1);
      expect(k.why.length, "each entry explains why it is not fixed here").toBeGreaterThan(60);
    }
  });

  it("keeps every exemption honest: the site must still exist and still name it", () => {
    // A stale exemption is worse than none, it hides a regression behind a
    // reason that no longer applies.
    for (const e of [...EXEMPT, ...KNOWN_UNFIXED]) {
      const full = path.join(SRC, e.file);
      const source = readFileSync(full, "utf8");
      const stillThere = tableSelects(source).some((s) => s.columns === e.columns);
      expect(stillThere, `exemption for ${e.file}:${e.column} is stale, delete it`).toBe(true);
      expect(e.why.length, `exemption for ${e.file} needs a reason`).toBeGreaterThan(40);
    }
  });
});
