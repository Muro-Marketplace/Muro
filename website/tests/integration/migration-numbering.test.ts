import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

// X1/K10 (02-rls-db-storage.md §8): four migration numbers were used twice
// (037, 044, 045, 054), and a block of six files had been renumbered by hand
// with their headers left pointing at the old number. Both are the kind of drift
// that only bites much later, on a fresh bootstrap or when a human runs files by
// number, so both are locked here instead of in the bash script §8.5 proposes:
// this runs inside `npm run check`, which is already a blocking CI gate.

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, "../../supabase/migrations");

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const numberOf = (file: string): string => file.slice(0, 3);

describe("supabase migration numbering", () => {
  it("finds the migration directory", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("uses every numeric prefix at most once", () => {
    const byNumber = new Map<string, string[]>();
    for (const file of files) {
      const n = numberOf(file);
      byNumber.set(n, [...(byNumber.get(n) ?? []), file]);
    }
    const collisions = [...byNumber.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([n, group]) => `${n}: ${group.join(", ")}`);

    // A repeated prefix collides on the CLI's version key, so on a fresh
    // bootstrap one of the pair is skipped or errors depending on CLI version.
    expect(collisions, `duplicate migration numbers:\n${collisions.join("\n")}`).toEqual([]);
  });

  it("names every file <NNN>_<lower_snake>.sql", () => {
    const offenders = files.filter((f) => !/^\d{3}_[a-z0-9_]+\.sql$/.test(f));
    expect(offenders, `off-convention filenames: ${offenders.join(", ")}`).toEqual([]);
  });

  it("keeps each header's number in step with its filename", () => {
    // Most files open with `-- NNN_name.sql` or `-- NNN: description`. Where a
    // leading number is present it must match, else the file claims to be a
    // migration it is not, which is how the 038-to-043 block drifted.
    const mismatched: string[] = [];
    for (const file of files) {
      const firstLine = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").split("\n")[0];
      const declared = firstLine.match(/^--\s*(\d+)/)?.[1];
      if (declared && declared !== numberOf(file)) {
        mismatched.push(`${file} declares ${declared}`);
      }
    }
    expect(mismatched, `header/filename mismatches:\n${mismatched.join("\n")}`).toEqual([]);
  });
});
