// Every index a migration DROPS must leave something behind that covers it.
//
// 07 K10d, found by asking whether the deleted `002_run_me.sql` was ever applied
// to production. It was, and its residue is load-bearing:
//
//   001 creates idx_ae_artist_slug / idx_ae_event_type / idx_ae_venue_name
//   070 drops all three as "redundant duplicate indexes"
//   ...and the indexes they duplicated (idx_analytics_artist / _type / _venue)
//      came from 002_run_me.sql, which was pasted into the dashboard and then
//      deleted, so no committed migration ever created them.
//
// The result: production keeps the un-migrated set, doing 837 / 1079 / 130
// scans, and a database built from the repo alone ends with NO index on
// analytics_events(artist_slug), (event_type) or (venue_name) at all. That is
// K11's thesis failing in one measurable place, on the busiest table in the
// system. Migration 108 restores them under the names production uses.
//
// This replays every index-creating and index-dropping statement in filename
// order and fails when a (table, columns) pair that once had an index ends with
// nothing covering it. It is a text scan, not a planner, so it knows the
// statement forms this repo uses, understands leading-column prefixes the way
// Postgres does, and asserts it parsed a plausible number of statements.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");

/**
 * Index removals that are deliberate and verified against production, with the
 * reason. An entry here is a claim that nothing should cover these columns.
 */
const INTENTIONALLY_UNCOVERED: Record<string, string> = {
  "placements(artist_slug,venue_slug)":
    "021 drops idx_placements_unique_active on purpose: a venue can legitimately " +
    "hold several works by one artist at once, so the uniqueness rule was wrong. " +
    "It was a constraint, not an access path, and production has no such index.",
};

interface Live {
  name: string;
  table: string;
  columns: string[];
}

const CREATE_RE =
  /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)\s+on\s+(?:public\.)?([a-z0-9_]+)\s*\(([^)]*)\)/gi;
const DROP_RE = /drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi;
// A UNIQUE constraint gets a backing index that no CREATE INDEX statement names.
const CONSTRAINT_RE =
  /(?:add\s+constraint\s+[a-z0-9_]+\s+)?unique\s*\(([^)]*)\)/gi;
const TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(/gi;
const ALTER_RE = /alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z0-9_]+)/gi;
// `email TEXT UNIQUE NOT NULL` inside a CREATE TABLE body.
const INLINE_UNIQUE_RE = /^\s*([a-z0-9_]+)\s+[a-z0-9_ ()]*?\bunique\b/gim;

function strip(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
}

const bare = (n: string) => n.replace(/"/g, "").replace(/^public\./, "").trim().toLowerCase();
const cols = (list: string) =>
  list.split(",").map((c) => c.trim().toLowerCase().replace(/\s+.*$/, "")).filter(Boolean);
const key = (table: string, c: string[]) => `${table}(${c.join(",")})`;

function replay() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const live = new Map<string, Live>();
  const everHad = new Map<string, string>(); // key -> file it first appeared in
  let creates = 0;
  let drops = 0;
  let constraints = 0;

  for (const file of files) {
    const sql = strip(readFileSync(MIGRATIONS + "/" + file, "utf8"));

    // Statements in the order they appear. 074 drops an index and recreates it
    // two lines later, so processing all creates before all drops would delete
    // the replacement.
    const events: { at: number; run: () => void }[] = [];

    for (const m of sql.matchAll(CREATE_RE)) {
      const rec: Live = { name: bare(m[1]), table: m[2].toLowerCase(), columns: cols(m[3]) };
      events.push({ at: m.index ?? 0, run: () => { live.set(rec.name, rec); creates++; } });
      const k = key(rec.table, rec.columns);
      if (!everHad.has(k)) everHad.set(k, file);
    }
    for (const m of sql.matchAll(DROP_RE)) {
      const name = bare(m[1]);
      events.push({ at: m.index ?? 0, run: () => { live.delete(name); drops++; } });
    }
    events.sort((a, b) => a.at - b.at).forEach((e) => e.run());

    // UNIQUE constraints, attributed to the nearest preceding CREATE/ALTER TABLE.
    const owners = [...sql.matchAll(TABLE_RE), ...sql.matchAll(ALTER_RE)]
      .map((m) => ({ at: m.index ?? 0, table: m[1].toLowerCase() }))
      .sort((a, b) => a.at - b.at);
    const ownerAt = (pos: number) => {
      let t: string | null = null;
      for (const o of owners) { if (o.at < pos) t = o.table; else break; }
      return t;
    };
    for (const re of [CONSTRAINT_RE, INLINE_UNIQUE_RE]) {
      for (const m of sql.matchAll(re)) {
        const table = ownerAt(m.index ?? 0);
        if (!table) continue;
        const c = cols(m[1]);
        if (!c.length) continue;
        const name = `constraint:${table}:${c.join(",")}`;
        live.set(name, { name, table, columns: c });
        constraints++;
      }
    }
  }

  return { files, live, everHad, creates, drops, constraints };
}

/** Postgres serves a leading-prefix lookup from a wider index, so this does too. */
function coveredBy(liveIndexes: Live[], table: string, wanted: string[]): boolean {
  return liveIndexes.some(
    (i) => i.table === table && wanted.every((c, n) => i.columns[n] === c),
  );
}

describe("no migration drops an index without leaving a replacement", () => {
  it("parses a realistic number of statements", () => {
    // Guards the guard: a regex that quietly stopped matching would turn the
    // sweep below into a test that passes because it found nothing.
    const { creates, drops, constraints, files } = replay();
    expect(files.length).toBeGreaterThan(70);
    expect(creates).toBeGreaterThan(100);
    expect(drops).toBeGreaterThan(10);
    expect(constraints).toBeGreaterThan(10);
  });

  it("leaves every once-indexed (table, columns) pair still covered", () => {
    const { live, everHad } = replay();
    const indexes = [...live.values()];

    const orphaned: string[] = [];
    for (const [k, file] of everHad) {
      if (k in INTENTIONALLY_UNCOVERED) continue;
      const [table, rest] = [k.slice(0, k.indexOf("(")), k.slice(k.indexOf("(") + 1, -1)];
      if (!coveredBy(indexes, table, rest.split(","))) {
        orphaned.push(`${k}, first created in ${file}`);
      }
    }

    expect(
      orphaned,
      "a migration dropped the only index covering these columns. If that is deliberate, " +
        "add it to INTENTIONALLY_UNCOVERED with the reason; if the index survives in " +
        "production under a name the repo does not know, add a migration creating it " +
        "under THAT name (migration 108 is the worked example).",
    ).toEqual([]);
  });

  it("still holds the three analytics_events indexes 070 dropped", () => {
    // The specific case, named, so an edit to 108 fails here and not only in
    // the general sweep.
    const { live } = replay();
    for (const name of ["idx_analytics_artist", "idx_analytics_type", "idx_analytics_venue"]) {
      expect(live.has(name), name).toBe(true);
    }
  });
});
