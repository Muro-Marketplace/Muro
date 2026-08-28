#!/usr/bin/env tsx
/**
 * Fetches the latest security + performance advisor lints for the
 * Supabase project and writes them to scripts/audit/<type>-current.json.
 *
 * Compared against scripts/audit/baseline-advisors.json by check-regressions.ts
 * to detect lints introduced since the baseline was seeded.
 *
 * Requires env var SUPABASE_ACCESS_TOKEN (personal access token from
 * https://supabase.com/dashboard/account/tokens). It is NOT set up for you:
 * export it in your shell, or let CI supply it from the repo secret of the same
 * name. Without it this script exits 2 ("SUPABASE_ACCESS_TOKEN not set"), and so
 * does `npm run audit:advisors`.
 *
 * In CI this runs only in .github/workflows/advisors-nightly.yml. It is not a PR
 * gate: see EXECUTION-DECISIONS D12 ruling 3. A clean advisor run is not evidence
 * of RLS health, because the linter skips permissive SELECT policies and so
 * misses this project's list-leak class entirely.
 */

import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_REF = "uwkuhygwvasdzwsusiym";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN not set");
  process.exit(2);
}

type Lint = {
  cache_key: string;
  name: string;
  detail: string;
  level?: string;
  metadata?: { name?: string };
};

async function fetchLints(type: "security" | "performance"): Promise<Lint[]> {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/lints?type=${type}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    console.error(`${type} fetch failed: ${res.status} ${await res.text()}`);
    process.exit(2);
  }
  return (await res.json()) as Lint[];
}

async function main() {
  const outDir = path.join(process.cwd(), "scripts", "audit");
  for (const type of ["security", "performance"] as const) {
    const lints = await fetchLints(type);
    const file = path.join(outDir, `${type}-current.json`);
    await fs.writeFile(file, JSON.stringify(lints, null, 2));
    console.log(`Wrote ${lints.length} ${type} lints to ${file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
