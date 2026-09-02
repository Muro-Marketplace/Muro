import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Files under `dirs` containing `needle`, or [] (grep exits 1 on no match). */
function grepFiles(needle: string, dirs: string[]): string[] {
  try {
    return execFileSync("grep", ["-rl", needle, ...dirs], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch (e) {
    const out = (e as { stdout?: string }).stdout ?? "";
    return out.split("\n").filter(Boolean);
  }
}

// Launch audit. Each entry is a claim the site made that it could not
// evidence, pinned so it cannot come back.
describe("public claims the site cannot evidence stay out", () => {
  it("no page says venues are looking for art 'right now'", () => {
    for (const p of [
      "src/app/page.tsx",
      "src/components/marketing/ArtistGuide.tsx",
      "src/app/(pages)/spaces/page.tsx",
    ]) {
      expect(read(p), p).not.toMatch(/looking for art right now|actively seeking|Active Demand/i);
    }
  });
});

export { grepFiles, read };
