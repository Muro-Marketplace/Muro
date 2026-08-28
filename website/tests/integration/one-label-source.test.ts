// K3 (07 §3.5). One source for arrangement labels.
//
// There were four implementations plus two API-layer ladders, producing five
// vocabularies for the same five values — including two different functions
// both called `arrangementLabel`, so which one a file got depended on its
// import line. `/spaces` rendered two of them on one page (finding E13).
//
// §3.5 says the last assertion here is worth more than the others, and it is
// right: a suppression comment is a knot being tied in front of you.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const CANONICAL = path.join("src", "lib", "arrangement-labels.ts");

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path.relative(process.cwd(), full));
    }
  }
  return out.sort();
}

/** Source with comments stripped: these checks are about code, not prose. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("one arrangement-label source (K3)", () => {
  it("has exactly one exported label function", async () => {
    // There were two, both named `arrangementLabel`: one in placements/status.ts
    // and one re-exported from arrangement-type.ts under the same name.
    const files = await sourceFiles(SRC);
    const exporters = files.filter((f) =>
      /export\s+(?:async\s+)?function\s+(arrangementLabel|labelForArrangement)\b|export\s+const\s+arrangementLabel\b/.test(
        code(f),
      ),
    );
    expect(exporters).toEqual([CANONICAL]);
  });

  it("has no `arrangementLabel` IMPORT or EXPORT left anywhere", async () => {
    // The name itself is the hazard: an alias that renames a function to
    // collide with a different function's name means the import line decides
    // which behaviour you get. A local `const arrangementLabel = ...` holding
    // the canonical function's RESULT is a value, not a second implementation,
    // so it is not what this guards.
    const files = await sourceFiles(SRC);
    const offenders = files.filter((f) =>
      /import[\s\S]{0,200}?\barrangementLabel\b[\s\S]{0,80}?from|export[^\n]*\barrangementLabel\b/.test(
        code(f),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("no longer derives an arrangement LABEL from prose", async () => {
    // Two places used to scan the free-text request message for "£X/month" when
    // the fee column was null, and pick a LABEL from what they found:
    // placements/status.ts inside arrangementLabel(), and PlacementContextPanel
    // with its own copy of the same regex. So the words a user saw depended on
    // wording someone had typed, and silently disagreed with every surface that
    // did not parse it. Both are gone.
    //
    // Owner decision 6 (2026-08-28) closed the last one: the three live rows
    // whose fee existed only in the message were backfilled into
    // `monthly_fee_gbp`, and PlacementDetailClient's parse was deleted with the
    // reason recorded at the site. So the sweep is now total: NOTHING may infer
    // a monetary amount from prose, and the file list below is every surface
    // that ever did.
    const FEE_FROM_PROSE = /(?:£|gbp)[\s\S]{0,20}?\\d\{2,5\}/i;
    for (const file of [
      path.join("src", "lib", "placements", "status.ts"),
      path.join("src", "components", "PlacementContextPanel.tsx"),
      path.join("src", "app", "(pages)", "placements", "[id]", "PlacementDetailClient.tsx"),
    ]) {
      expect(FEE_FROM_PROSE.test(code(file)), file).toBe(false);
    }
  });

  it("has no hardcoded arrangement label left in a rendering surface", async () => {
    // 07 §3.2's inventory, as a check rather than a table. The canonical labels
    // are short common phrases, so this is scoped to the string- and
    // JSX-literal forms that are actually labels: `"Paid loan"` as a value, and
    // `>Paid loan<` as element text. Prose that happens to contain the words is
    // not matched, and comments are stripped.
    const files = await sourceFiles(SRC);
    const LABELS = ["Paid loan", "Revenue share", "Direct purchase", "Free display"];
    const offenders: string[] = [];
    for (const f of files) {
      if (f === CANONICAL || f.startsWith(path.join("src", "emails"))) continue;
      const src = code(f);
      for (const label of LABELS) {
        const asValue = new RegExp(`(?:[:=(,[]\\s*|\\?\\s*|label=)"${label}"`);
        const asText = new RegExp(`>\\s*${label}\\s*<`);
        if (asValue.test(src) || asText.test(src)) offenders.push(`${f} → "${label}"`);
      }
    }
    expect(
      offenders,
      "route these through ARRANGEMENT_LABEL / labelForArrangement in @/lib/arrangement-labels",
    ).toEqual([]);
  });

  it("has no TITLE-CASED variant of a canonical label anywhere", async () => {
    // The E13 class, and the one that was still live after the K3 collapse:
    // /browse rendered "Paid Loan" on a card while the artist's own profile
    // rendered "Paid loan", and venue-portal/profile disagreed with ITSELF, the
    // toggles title-cased and the summary under them sentence-cased.
    //
    // These are wrong however they are produced, so this checks the raw text
    // including comments: a comment quoting the old form is fine, a literal is
    // not, and the difference is the quotes.
    const files = await sourceFiles(SRC);
    const WRONG = ['"Paid Loan"', '"Revenue Share"', '"Direct Purchase"', '"Free Display"'];
    const offenders: string[] = [];
    for (const f of files) {
      const src = code(f);
      for (const w of WRONG) if (src.includes(w)) offenders.push(`${f} → ${w}`);
    }
    expect(
      offenders,
      "the canonical labels are sentence case; title case makes the same concept read two ways on two pages",
    ).toEqual([]);
  });

  it("has no eslint-disable of no-raw-arrangement-type", async () => {
    // §3.5: worth more than the other assertions. A suppression comment is a
    // knot being tied in front of you.
    //
    // Comments are NOT stripped here, for the obvious reason.
    const files = await sourceFiles(SRC);
    const offenders = files.filter((f) =>
      /eslint-disable[^\n]*wallplace\/no-raw-arrangement-type/.test(readFileSync(f, "utf8")),
    );
    expect(
      offenders,
      "each of these is a place the guard was told to look away; route the label through arrangement-labels instead",
    ).toEqual([]);
  });

  it("finds source files at all, so an empty sweep cannot pass vacuously", async () => {
    expect((await sourceFiles(SRC)).length).toBeGreaterThan(200);
  });
});

// K4 (07 §4.5). One placement-status renderer.
//
// PlacementDetailClient had its own colour switch and its own
// `charAt(0).toUpperCase()`, in a file that did not import from
// @/lib/placements/status at all. Same row, same moment, two answers: a
// `paused` placement read "Paused" with a grey badge there and "Completed" with
// a bordered neutral badge in both portals; `sold` was grey there and blue here.
// That is finding E14.
describe("one placement-status renderer (K4)", () => {
  it("has no hand-rolled status capitalisation in any placement surface", async () => {
    const files = await sourceFiles(SRC);
    const offenders = files.filter((f) => {
      if (!/placement/i.test(f)) return false;
      const src = code(f);
      // The slug title-casers elsewhere in the app split on "-" first; this is
      // the single-value form applied straight to a status.
      return /\bstatus\b[^\n]{0,40}\.charAt\(0\)\.toUpperCase\(\)/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("has no Tailwind status palette in a placement surface outside the canonical module", async () => {
    // Heuristic, and 07 §4.5 says so, but a heuristic that fires on the pattern
    // is worth more than nothing: a colour ladder keyed on `.status` is a second
    // renderer by definition.
    //
    // Scoped to placement surfaces, which is what K4 is about. Orders,
    // applications and disputes each have their own status vocabulary and their
    // own palette; those are separate domains, not copies of this one, and
    // sweeping them in would make the guard noise rather than signal.
    const files = await sourceFiles(SRC);
    const CANONICAL_STATUS = path.join("src", "lib", "placements", "status.ts");
    const offenders = files.filter((f) => {
      if (f === CANONICAL_STATUS || !/placement/i.test(f)) return false;
      const src = code(f);
      return /\.status\s*===[\s\S]{0,80}?bg-(?:green|amber|red|blue|gray|neutral)-\d{2,3}\s+text-/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("finds placement surfaces at all, so the sweep is not vacuous", async () => {
    const files = await sourceFiles(SRC);
    expect(files.filter((f) => /placement/i.test(f)).length).toBeGreaterThan(5);
  });
});
