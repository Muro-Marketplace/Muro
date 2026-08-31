// Shared source scanner for the two database-write guards:
//
//   phantom-write-columns.test.ts   does the write name a column that exists?
//   not-null-writes.test.ts         can the value it writes be null?
//
// Both need the same thing out of the source: every `.from("t").insert({...})`
// with its top-level keys. The second also needs each key's VALUE expression,
// which is why the key scan below returns entries rather than bare names.
//
// This is deliberately a regex-and-brace scanner rather than a TypeScript AST
// pass. It has to survive being read at 2am by someone who has just broken the
// guard with a migration, and the failure mode that matters is a false positive
// making it ignorable. Anything it cannot parse confidently is skipped.

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export type WriteEntry = { key: string; value: string };

export type InlineWrite = {
  table: string;
  op: string;
  entries: WriteEntry[];
  keys: string[];
  line: number;
};

/** Every `.ts`/`.tsx` under `dir`, excluding test files. */
export function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The TOP-LEVEL `key: value` pairs of the object literal whose `{` is at
 * `openAt`.
 *
 * Top-level only, so `metadata: { foo: 1 }` contributes one entry keyed
 * `metadata` whose value is the whole nested literal, which is what the table
 * actually has a column for. Returns null when the braces do not balance inside
 * a sane window, so a parse failure skips the write rather than inventing keys
 * for it.
 *
 * Shorthand (`{ foo }`), spreads and computed keys produce no entry: each needs
 * a name the scanner cannot resolve without an AST, and a guess is worse than a
 * gap. `eslint-no-spread-into-db-write` covers the spread case separately.
 */
export function topLevelEntries(source: string, openAt: number): WriteEntry[] | null {
  let depth = 0;
  let end = -1;
  for (let i = openAt; i < source.length && i < openAt + 8000; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;

  const entries: WriteEntry[] = [];
  let d = 0;
  let pendingKey: string | null = null;
  let pendingValue: string[] = [];

  const flush = () => {
    if (pendingKey) {
      entries.push({ key: pendingKey, value: pendingValue.join("\n").trim().replace(/,\s*$/, "") });
    }
    pendingKey = null;
    pendingValue = [];
  };

  for (const line of source.slice(openAt + 1, end).split("\n")) {
    const before = d;
    for (const ch of line) {
      if (ch === "{" || ch === "[" || ch === "(") d++;
      else if (ch === "}" || ch === "]" || ch === ")") d = Math.max(0, d - 1);
    }
    if (before !== 0) {
      // A continuation line of a multi-line value.
      if (pendingKey) pendingValue.push(line);
      continue;
    }
    const km = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:/);
    if (km) {
      flush();
      pendingKey = km[1];
      pendingValue = [line.slice(line.indexOf(":") + 1)];
    } else if (pendingKey) {
      pendingValue.push(line);
    }
  }
  flush();
  return entries;
}

/**
 * Every `.from("table").insert({ ... })` / `.update({ ... })` / `.upsert({ ... })`
 * where the payload is an INLINE object literal, with the entries it names.
 *
 * A payload passed as an IDENTIFIER (`insert(fullRow)`) is resolved when the file
 * declares it as an object literal in the same scope, which is the shape every
 * one of these used. That is not decoration: `api/apply` hid
 * `artist_applications.referred_by_code` behind exactly this indirection, and it
 * destroyed a referral code on every application ever submitted. The SAME
 * indirection then hid `primary_medium: d.primaryMedium || null` writing NULL
 * into a NOT NULL column, which 500'd every application that left the optional
 * medium select blank.
 *
 * An identifier that cannot be resolved to a literal is skipped rather than
 * guessed at, because a guess here produces the false positives that make a
 * guard ignorable.
 */
export function inlineWrites(source: string): InlineWrite[] {
  const found: InlineWrite[] = [];
  // The `.from(...)` must be the NEAREST one before the write: `[^]{0,200}?`
  // happily spans an intervening `.from("other_table")`, which attributed a
  // placements insert to venue_profiles two lines above it and produced eleven
  // false positives on the first run.
  const re =
    /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,200}?)\.(insert|update|upsert)\(\s*(\{|([A-Za-z_$][\w$]*)\s*[,)])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const op = m[3];
    // An identifier payload: resolve it to its `const x = { ... }` declaration.
    if (m[5]) {
      const decl = new RegExp(`\\b(?:const|let|var)\\s+${m[5]}\\s*(?::[^=]{0,120})?=\\s*\\{`).exec(source);
      if (!decl) continue;
      const entries = topLevelEntries(source, decl.index + decl[0].length - 1);
      if (entries === null) continue;
      found.push({
        table: m[1],
        op,
        entries,
        keys: entries.map((e) => e.key),
        line: source.slice(0, m.index).split("\n").length,
      });
      continue;
    }
    const openAt = m.index + m[0].length - 1;
    const entries = topLevelEntries(source, openAt);
    if (entries === null) continue;
    found.push({
      table: m[1],
      op,
      entries,
      keys: entries.map((e) => e.key),
      line: source.slice(0, openAt).split("\n").length,
    });
  }
  return found;
}
