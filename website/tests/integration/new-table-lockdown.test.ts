// A new service-role-only table must revoke its client grants in the same
// migration that creates it.
//
// Owner decision 12. Supabase's stock default privileges grant `anon` and
// `authenticated` the full set on every table in `public`, so a `CREATE TABLE`
// that only enables RLS is protected by the ABSENCE of a policy and nothing
// else. Two things that made the width matter:
//
//   TRUNCATE is not subject to RLS. Policies filter SELECT, INSERT, UPDATE and
//   DELETE; a table-level TRUNCATE right is not a row operation. So on any such
//   table, RLS was never the last line of defence people assumed.
//
//   One permissive policy added later, for any reason, meets a standing grant
//   that is already there.
//
// Migrations 112 and 113 took those back across the whole schema, and set
// ALTER DEFAULT PRIVILEGES so new tables no longer inherit TRUNCATE, REFERENCES
// or TRIGGER. What a default privilege cannot cover is SELECT/INSERT/UPDATE/
// DELETE on a table that is meant to be service-role-only, which is what this
// checks.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");

/**
 * Only migrations from 111 on. Everything before predates the rule, and 112
 * fixed the whole backlog in one sweep, so retrofitting the requirement onto
 * history would mean editing applied files to satisfy a test.
 */
const FIRST_ENFORCED = 111;

interface Migration {
  file: string;
  number: number;
  sql: string;
}

function migrations(): Migration[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({
      file: f,
      number: Number.parseInt(f.slice(0, 3), 10),
      sql: readFileSync(path.join(MIGRATIONS, f), "utf8"),
    }))
    .filter((m) => Number.isFinite(m.number))
    .sort((a, b) => a.number - b.number);
}

/** Tables a migration creates, by name. */
function tablesCreated(sql: string): string[] {
  return [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)/gi)].map(
    (m) => m[1].toLowerCase(),
  );
}

describe("a new table locks itself down", () => {
  it("sees the migrations at all", () => {
    expect(migrations().length).toBeGreaterThan(90);
    expect(migrations().some((m) => m.number >= FIRST_ENFORCED)).toBe(true);
  });

  it("every table created since 111 revokes its client grants", () => {
    const offences: string[] = [];
    for (const m of migrations()) {
      if (m.number < FIRST_ENFORCED) continue;
      for (const table of tablesCreated(m.sql)) {
        // The revoke may name the table or sweep every table in the schema.
        const named = new RegExp(`revoke\\s+all[\\s\\S]{0,80}?\\b${table}\\b`, "i").test(m.sql);
        const swept = /revoke\s+all[\s\S]{0,200}?from\s+anon/i.test(m.sql) && /for\s+\w+\s+in|loop/i.test(m.sql);
        if (!named && !swept) {
          offences.push(`${m.file} creates "${table}" without revoking anon/authenticated`);
        }
      }
    }
    expect(
      offences,
      "Supabase grants anon and authenticated the full set on every new table in public. " +
        "RLS with no policy is not enough on its own: TRUNCATE is not an RLS-filtered " +
        "operation. Migration 111 is the worked example.",
    ).toEqual([]);
  });

  it("112 and 113 are on disk, because they are what the backlog fix was", () => {
    // A future squash that drops them would silently restore the grants on a
    // fresh build while production stayed correct, which is the divergence
    // K10d was about.
    const files = migrations().map((m) => m.file);
    expect(files.some((f) => f.startsWith("112_"))).toBe(true);
    expect(files.some((f) => f.startsWith("113_"))).toBe(true);
  });
});
