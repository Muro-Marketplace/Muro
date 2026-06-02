#!/usr/bin/env tsx
/**
 * Compares scripts/audit/security-current.json (just-fetched lints)
 * against scripts/audit/baseline-advisors.json (snapshot at last known
 * green state) and against scripts/audit/known-acceptable.json
 * (intentional INFO-level lints we've explicitly accepted, e.g. the
 * service-role-only tables documented in docs/security/service-role-only-tables.md).
 *
 * Exits 1 when a new lint is present that is not in either allow-list.
 * Exits 0 otherwise.
 *
 * Designed to run after snapshot-advisors.ts in `npm run audit:advisors`.
 */

import fs from "node:fs/promises";
import path from "node:path";

type Lint = { cache_key: string; name?: string; detail?: string; [k: string]: unknown };

type Acceptable = { ignore_cache_keys: string[] };

export function findNewLints(
  baseline: Lint[],
  current: Lint[],
  acceptable: Acceptable = { ignore_cache_keys: [] },
): Lint[] {
  const seen = new Set(baseline.map((l) => l.cache_key));
  const ignored = new Set(acceptable.ignore_cache_keys);
  return current.filter((l) => !seen.has(l.cache_key) && !ignored.has(l.cache_key));
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

async function main() {
  const dir = path.join(process.cwd(), "scripts", "audit");
  const baseline = await readJson<Lint[]>(path.join(dir, "baseline-advisors.json"));
  const current = await readJson<Lint[]>(path.join(dir, "security-current.json"));
  let acceptable: Acceptable = { ignore_cache_keys: [] };
  try {
    acceptable = await readJson<Acceptable>(path.join(dir, "known-acceptable.json"));
  } catch {
    // file optional
  }

  const added = findNewLints(baseline, current, acceptable);
  if (added.length) {
    console.error(`\nFAIL: ${added.length} new advisor lint(s) introduced since baseline:\n`);
    for (const l of added) {
      console.error(`  - ${l.name ?? "?"}: ${l.detail ?? l.cache_key}`);
    }
    console.error("\nIf intentional, add the cache_key to scripts/audit/known-acceptable.json.\n");
    process.exit(1);
  }
  console.log(
    `PASS: no new advisor lints (${current.length} total, ${baseline.length} in baseline, ${acceptable.ignore_cache_keys.length} acceptable).`,
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
