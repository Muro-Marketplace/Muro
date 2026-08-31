#!/usr/bin/env node
/**
 * Fill column 3 of docs/qa/2026-08-28-mvp-functionality-inventory.md by line
 * number.
 *
 * The two production passes used a helper of this shape and never committed it,
 * so the third pass over the same file (the remediation) had to rebuild it. It
 * is committed now.
 *
 * The rules that matter:
 *
 *   - Addresses rows by LINE NUMBER, because that is how every finding, every
 *     log and every plan cites them. "row 727" is a line number.
 *   - REFUSES to overwrite a non-empty cell unless the verdict is prefixed `!`.
 *     Column 3 is the record of what was observed live; silently replacing an
 *     observation with a later one loses the finding.
 *   - Never touches columns 1 or 2. The gap between what column 2 claimed and
 *     what column 3 found is the whole point of the document.
 *   - Escapes `|` in the verdict so a cell cannot split the row.
 *
 * Usage:
 *
 *   node scripts/qa/inventory-verdict.mjs 727 "FIXED. ..."
 *   node scripts/qa/inventory-verdict.mjs 727 "!FIXED. ..."      # overwrite
 *   node scripts/qa/inventory-verdict.mjs --batch verdicts.json  # {"727": "..."}
 *   node scripts/qa/inventory-verdict.mjs --show 727
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/qa/2026-08-28-mvp-functionality-inventory.md",
);

/** Every verdict a column-3 cell may open with. */
const VERDICTS = [
  "WORKS",
  "BROKEN",
  "DIFFERS",
  "FIXED",
  "FLAG STANDS",
  "BLOCKED",
  "NOT SAFE",
  // Two more the passes and the remediation used where neither a plain verdict
  // nor a plain fix was honest: a row the pass corrected itself on, and one
  // where half the finding is fixed and half is not.
  "SELF-CORRECTION",
  "PARTLY FIXED",
];

/**
 * Split an inventory row into `[col1and2, col3]`.
 *
 * A naive split on `|` does not work on this file and never did: 147 of its
 * rows carry an unescaped `|` inside a cell, because the pass quoted real page
 * titles ("Giraffe at Sunset by Fin Coles | Wallplace") and real query strings
 * (`?role=artist|venue`). A helper that split blindly would either refuse those
 * rows or, worse, rewrite them with the wrong boundary and destroy column 2.
 *
 * So the boundary is found from the RIGHT, by the verdict keyword every filled
 * column-3 cell opens with. Column 3 is complete for all 1,793 rows, so this is
 * total; a row that has none is reported rather than guessed at.
 *
 * Returns null for anything that is not a fillable row (prose, headers, the
 * separator line, the summary tables at the top).
 */
export function splitRow(line) {
  const trimmed = line.trimEnd();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  if (/^\|[\s:|-]+\|$/.test(trimmed)) return null; // separator row

  // The LAST `|` that opens a verdict cell, not the first: a verdict may quote
  // an earlier one. The leading space count varies (a few cells open `|  WORKS`).
  let boundary = -1;
  for (const m of trimmed.matchAll(new RegExp(`\\|\\s+(?:${VERDICTS.join("|")})`, "g"))) {
    if (m.index > boundary) boundary = m.index;
  }
  if (boundary < 0) return null;

  const head = trimmed.slice(0, boundary);
  // Pass 2 left 127 rows ending `||` — an empty fourth cell. Strip the row's
  // closing pipe, then any trailing separator wart, so a rewritten row comes
  // out well formed.
  const cell = trimmed.slice(boundary + 1, trimmed.length - 1).replace(/\|\s*$/, "");
  return [head, cell];
}

export function applyVerdict(lines, lineNo, verdict) {
  const idx = lineNo - 1;
  if (idx < 0 || idx >= lines.length) {
    throw new Error(`line ${lineNo} is outside the file (${lines.length} lines)`);
  }
  const row = splitRow(lines[idx]);
  if (!row) {
    throw new Error(`line ${lineNo} is not a fillable inventory row: ${lines[idx].slice(0, 90)}`);
  }
  const [head, existing] = row;
  const force = verdict.startsWith("!");
  const text = (force ? verdict.slice(1) : verdict).trim();
  if (existing.trim() && !force) {
    throw new Error(
      `line ${lineNo} already has a verdict; prefix the new one with "!" to overwrite.\n` +
        `  existing: ${existing.trim().slice(0, 160)}`,
    );
  }
  lines[idx] = `${head}| ${text} |`;
  return lines;
}

function main() {
  const args = process.argv.slice(2);
  let lines = readFileSync(FILE, "utf8").split("\n");

  if (args[0] === "--show") {
    const row = splitRow(lines[Number(args[1]) - 1]);
    console.log(row ? `[1+2] ${row[0].trim()}\n[3] ${row[1].trim()}` : "not a fillable row");
    return;
  }

  // Every table row the helper can address. Run it after a hand edit.
  if (args[0] === "--verify") {
    let rows = 0;
    const unparsed = [];
    lines.forEach((line, i) => {
      if (!line.startsWith("|") || /^\|[\s:|-]+\|$/.test(line.trimEnd())) return;
      rows++;
      if (!splitRow(line)) unparsed.push(i + 1);
    });
    console.log(`${rows} table rows, ${unparsed.length} without an addressable verdict cell`);
    if (unparsed.length) console.log(`  lines: ${unparsed.join(", ")}`);
    return;
  }

  const updates =
    args[0] === "--batch"
      ? Object.entries(JSON.parse(readFileSync(args[1], "utf8")))
      : [[args[0], args.slice(1).join(" ")]];

  // Apply in descending line order so nothing shifts under a later edit. (It
  // cannot today — every write is one line for one line — but the batch form
  // invites an edit that spans lines, and the order costs nothing.)
  const sorted = updates.sort((a, b) => Number(b[0]) - Number(a[0]));
  for (const [lineNo, verdict] of sorted) {
    lines = applyVerdict(lines, Number(lineNo), String(verdict));
  }
  writeFileSync(FILE, lines.join("\n"));
  console.log(`Updated ${sorted.length} row(s): ${sorted.map(([l]) => l).join(", ")}`);
}

if (process.argv[1] && process.argv[1].endsWith("inventory-verdict.mjs")) main();
