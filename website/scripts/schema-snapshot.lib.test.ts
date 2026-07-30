// ROW 20 (supervisor D61). Guards the schema-snapshot regenerator: the pure
// transform that rebuilds tests/integration/schema-columns.json, and the wiring
// (npm script + guard-header reference) that makes it discoverable instead of a
// buried SQL comment that gets bypassed by adding a column to GRANDFATHERED.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SNAPSHOT_SQL, serialize, toSnapshot } from "./schema-snapshot.lib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SNAPSHOT_PATH = path.join(ROOT, "tests", "integration", "schema-columns.json");

describe("toSnapshot() (row 20)", () => {
  it("extracts the { table: [cols] } object from the query API's row array", () => {
    const rows = [{ snapshot: { orders: ["id", "total"], walls: ["id", "name"] } }];
    expect(toSnapshot(rows)).toEqual({ orders: ["id", "total"], walls: ["id", "name"] });
  });

  it("accepts a bare object too", () => {
    expect(toSnapshot({ orders: ["id"] })).toEqual({ orders: ["id"] });
  });

  it("throws on a malformed result rather than writing a broken snapshot", () => {
    expect(() => toSnapshot([{ snapshot: null }])).toThrow();
    expect(() => toSnapshot([{ snapshot: { orders: "not-an-array" } }])).toThrow();
    expect(() => toSnapshot([])).toThrow();
  });
});

describe("serialize() matches the committed on-disk format (row 20)", () => {
  it("emits 2-space keys with inline, comma-space column arrays", () => {
    expect(serialize({ orders: ["id", "total"], walls: ["id"] })).toBe(
      '{\n  "orders": ["id", "total"],\n  "walls": ["id"]\n}\n',
    );
  });

  it("round-trips the committed snapshot byte-for-byte (a no-change regen is a git no-op)", () => {
    const committed = readFileSync(SNAPSHOT_PATH, "utf8");
    // JSON.parse preserves string-key insertion order, and serialize walks it in
    // that order, so re-serialising the parsed file must reproduce it exactly.
    expect(serialize(JSON.parse(committed))).toBe(committed);
  });
});

describe("the regenerator is wired and discoverable, not a buried SQL comment (row 20)", () => {
  it("package.json exposes `npm run schema:snapshot` pointing at the script", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["schema:snapshot"]).toBe("tsx scripts/schema-snapshot.ts");
  });

  it("the phantom guard header names `npm run schema:snapshot` as the regeneration step", () => {
    const guard = readFileSync(path.join(ROOT, "tests", "integration", "phantom-columns.test.ts"), "utf8");
    expect(guard).toContain("npm run schema:snapshot");
  });

  it("the SQL the script runs still selects public columns by ordinal position", () => {
    // If this query drifts from the guard header's documented one, the snapshot the
    // script writes stops matching what the guard expects.
    expect(SNAPSHOT_SQL).toContain("information_schema.columns");
    expect(SNAPSHOT_SQL).toContain("table_schema='public'");
    expect(SNAPSHOT_SQL).toContain("order by ordinal_position");
  });
});
