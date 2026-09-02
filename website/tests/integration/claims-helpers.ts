import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Read a repo file relative to the website root. */
export const read = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Files under `dirs` containing `needle`, or [] when nothing matches.
 * grep exits 1 for "no match" and 2 for a real error (bad path, bad
 * pattern); only the former is a legitimate empty result.
 */
export function grepFiles(needle: string, dirs: string[]): string[] {
  try {
    return execFileSync("grep", ["-rl", needle, ...dirs], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    if (err.status === 1) return [];
    throw new Error(`grep failed (exit ${err.status}): ${err.stderr ?? ""}`);
  }
}
