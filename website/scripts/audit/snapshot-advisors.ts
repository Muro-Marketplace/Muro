#!/usr/bin/env tsx
/**
 * Fetches the latest security + performance advisor lints for the
 * Supabase project and writes them to scripts/audit/<type>-current.json.
 *
 * Compared against scripts/audit/baseline-advisors.json by check-regressions.ts
 * to detect lints introduced since the baseline was seeded.
 *
 * Requires env var SUPABASE_ACCESS_TOKEN (personal access token from
 * https://supabase.com/dashboard/account/tokens). Already exported in the
 * developer's ~/.zshrc for this project; in CI it comes from GitHub Secrets.
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
