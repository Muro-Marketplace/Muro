#!/usr/bin/env tsx
/**
 * Regenerate the phantom-column guard's schema snapshot
 * (tests/integration/schema-columns.json) from the live database.
 *
 * Run this after ANY migration that adds, renames or drops a column, BEFORE you
 * commit — otherwise the guard flags the new *real* column as a phantom and the
 * build breaks. Failing loud is correct, but the tempting wrong fix under time
 * pressure is to add the column to the guard's GRANDFATHERED list, which silently
 * weakens the one guard standing between this codebase and its dominant failure
 * mode. Regenerate instead (supervisor D61 / D17.3).
 *
 *   SUPABASE_ACCESS_TOKEN=... npm run schema:snapshot
 *
 * DEPENDENCY: this needs SUPABASE_ACCESS_TOKEN (a personal access token from
 * https://supabase.com/dashboard/account/tokens — the same token
 * scripts/audit/snapshot-advisors.ts uses, hitting the Supabase Management API).
 * D12 verified that token is absent from this environment (only SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are exported), so the regenerator is INERT here until a
 * human adds it (supervisor D62). It exits 2 with a remedy-pointing message rather
 * than writing an empty snapshot. A no-change run rewrites the file byte-for-byte, so
 * `git status` stays clean unless the schema actually moved.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MISSING_TOKEN_MESSAGE, SNAPSHOT_SQL, serialize, toSnapshot } from "./schema-snapshot.lib";

const PROJECT_REF = "uwkuhygwvasdzwsusiym";

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(MISSING_TOKEN_MESSAGE);
    process.exit(2);
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: SNAPSHOT_SQL }),
  });
  if (!res.ok) {
    console.error(`schema query failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const snapshot = toSnapshot(await res.json());
  const out = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "tests",
    "integration",
    "schema-columns.json",
  );
  await fs.writeFile(out, serialize(snapshot));
  console.log(`Wrote ${Object.keys(snapshot).length} tables to ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
