// Pure transform for the schema-snapshot regenerator (scripts/schema-snapshot.ts).
// Kept separate from the runner so it can be unit-tested without a network call.

/**
 * The query the phantom guard's snapshot is built from. `jsonb_agg` orders the
 * columns by `ordinal_position`; `jsonb_object_agg`'s key order is JSONB-canonical
 * (by key length, then bytewise), which is deterministic for a given schema, so a
 * re-run reproduces the committed file's table order exactly.
 */
export const SNAPSHOT_SQL =
  "select jsonb_object_agg(table_name, cols) as snapshot from (" +
  "select table_name, jsonb_agg(column_name order by ordinal_position) cols " +
  "from information_schema.columns where table_schema='public' group by table_name) t;";

/**
 * Printed and returned exit 2 when the runner has no credential. D12 verified
 * SUPABASE_ACCESS_TOKEN is absent from this environment (only SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are exported), so this fires at exactly the moment a
 * migration has just broken the guard. It names the remedy, not just the variable,
 * because the tempting wrong shortcut here is to add the new real column to the
 * guard's GRANDFATHERED list (supervisor D61.3 / D62.4).
 */
export const MISSING_TOKEN_MESSAGE =
  "SUPABASE_ACCESS_TOKEN not set; the schema-snapshot regenerator needs it (see " +
  "EXECUTION-DECISIONS D12/D62). Do NOT add the new column to GRANDFATHERED instead — " +
  "regenerate the snapshot once the token is set.";

export type Snapshot = Record<string, string[]>;

/**
 * Extract the `{ table: [columns...] }` object from the query result. Accepts the
 * array-of-rows the Supabase query API returns (`[{ snapshot: {...} }]`) or a bare
 * object, and validates the shape — it throws rather than writing a malformed
 * snapshot that would silently mis-arm the guard.
 */
export function toSnapshot(queryResult: unknown): Snapshot {
  const row = Array.isArray(queryResult) ? queryResult[0] : queryResult;
  const obj =
    row && typeof row === "object" && "snapshot" in row
      ? (row as { snapshot: unknown }).snapshot
      : row;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("schema snapshot query returned no object");
  }
  const out: Snapshot = {};
  for (const [table, cols] of Object.entries(obj as Record<string, unknown>)) {
    if (!Array.isArray(cols) || !cols.every((c) => typeof c === "string")) {
      throw new Error(`schema snapshot: table ${table} did not return a string[] of columns`);
    }
    out[table] = cols as string[];
  }
  return out;
}

/**
 * Serialise to the committed on-disk format: a 2-space-indented object with each
 * table's column list inline (", "-separated) and a trailing newline. This matches
 * tests/integration/schema-columns.json byte-for-byte, so a no-change regeneration
 * is a no-op in git rather than a whole-file reformat.
 */
export function serialize(snapshot: Snapshot): string {
  const body = Object.entries(snapshot)
    .map(([table, cols]) => `  ${JSON.stringify(table)}: [${cols.map((c) => JSON.stringify(c)).join(", ")}]`)
    .join(",\n");
  return `{\n${body}\n}\n`;
}
