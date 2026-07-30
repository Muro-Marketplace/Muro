// Guard against the phantom-column class (D17.3), full form (ledger 7b).
//
// The failure is always the same and always silent: a `.select()` names a column
// that does not exist, PostgREST rejects the ENTIRE query, the `|| []` or `?? null`
// fallback yields a plausible-but-wrong value, and nothing throws. Instances have
// cost real money or real entitlements:
//
//   orders.amount_cents          Bug 15  /admin read £0 against £1174.87 of sales
//   artist_profiles.free_until   D17.1   every artist charged 15%, premium owed 8%
//   ships_internationally        G-C     every artwork page claimed "UK only"
//   placements.requester_user_id N3      accept/decline never rendered
//
// The narrow first cut hard-coded a denylist of four columns already proven
// absent. This is the general form D17.3 mandated: a committed snapshot of every
// column in the live schema (schema-columns.json, generated from project
// uwkuhygwvasdzwsusiym) plus a scan of every select against it. Any select naming
// a column the snapshot lacks is a phantom, whether or not anyone knew about it.
//
// Regenerate the snapshot after a migration:
//   select jsonb_object_agg(table_name, cols) from (
//     select table_name, jsonb_agg(column_name order by ordinal_position) cols
//     from information_schema.columns where table_schema='public' group by table_name) t;

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../src");
const SCHEMA: Record<string, string[]> = JSON.parse(
  readFileSync(path.join(HERE, "schema-columns.json"), "utf8"),
);

/**
 * Phantom selects that already exist, grandfathered so the build passes while a
 * NEWLY introduced phantom still fails. Each is a real bug found by this guard,
 * queued as its own work; the `why` names the real column. A ratchet, not a cap:
 * shrink it by fixing something and lower the count in the same commit. NEVER add
 * to it to make a new phantom select pass, that is the one thing it exists to stop.
 *
 * Matched on the EXACT columns string, not the file alone: a file-level exemption
 * would silently un-guard every other select in the same file.
 */
const GRANDFATHERED: Array<{ file: string; columns: string; phantom: string[]; why: string }> = [
  {
    file: "app/api/webhooks/stripe/route.ts",
    columns: "id, free_until",
    phantom: ["free_until"],
    why: "D17.2: the referral path writes a free window and where it should write is an open owner question (trial_end is Stripe-managed). Left as the silent no-op it already is. Remove when D17.2 is answered.",
  },
  {
    file: "app/api/placements/[id]/route.ts",
    columns: "name, slug, image",
    phantom: ["image"],
    why: "artist_profiles has profile_image, not image. The artist image reads null on the placement detail path. Fix: select profile_image.",
  },
  {
    file: "app/sitemap.ts",
    columns: "title, updated_at, artist_profiles!inner(slug)",
    phantom: ["updated_at"],
    why: "artist_works has created_at, not updated_at. The sitemap lastmod is null (the whole select is rejected). Fix: select created_at.",
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every `.from("table")` paired with the `.select("...")` that follows it, with the
 * select's 1-indexed line. Chained calls may sit on separate lines, so the pair is
 * matched across a bounded window of intervening whitespace and comments.
 */
function tableSelects(source: string): { table: string; columns: string; line: number }[] {
  const found: { table: string; columns: string; line: number }[] = [];
  const re = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)[\s\S]{0,200}?\.select\(\s*(["'`])([\s\S]*?)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const selectAt = m.index + m[0].lastIndexOf(".select(");
    found.push({
      table: m[1],
      columns: m[3],
      line: source.slice(0, selectAt).split("\n").length,
    });
  }
  return found;
}

/**
 * Split a PostgREST select on its TOP-LEVEL commas only, so an embed like
 * `orders(id, total)` stays one token instead of leaking its inner columns as
 * bare tokens of the parent table (which is how the naive split cried wolf on
 * `refunds.buyer_email`).
 */
function topLevelColumns(columns: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of columns) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const PLAIN_COLUMN = /^[a-z_][a-z0-9_]*$/;

/**
 * The columns a select names that the table's live schema lacks. Only PLAIN column
 * tokens are checked: `*`, embeds `foo(...)`, aliases `a:b`, casts `x::text`, json
 * ops `x->>y` and aggregates are skipped, because those are not "column X of this
 * table" claims. Returns [] for a table the snapshot does not cover (e.g. a table a
 * pending migration will add), so the guard never blocks on an unknown table.
 */
export function phantomColumns(table: string, columns: string, schema = SCHEMA): string[] {
  const known = schema[table];
  if (!known) return [];
  const set = new Set(known);
  const bad: string[] = [];
  for (const raw of topLevelColumns(columns)) {
    const token = raw.trim();
    if (!PLAIN_COLUMN.test(token) || token === "count") continue;
    if (!set.has(token)) bad.push(token);
  }
  return bad;
}

const FILES = walk(SRC);

describe("no .select() names a column the live schema lacks (D17.3, full form)", () => {
  it("scans a meaningful number of source files", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("checks a meaningful number of table/select pairs against the snapshot", () => {
    let checked = 0;
    for (const f of FILES) {
      for (const { table } of tableSelects(readFileSync(f, "utf8"))) {
        if (SCHEMA[table]) checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("has no phantom column in any select except the grandfathered ones", () => {
    const offences: string[] = [];
    for (const file of FILES) {
      const rel = path.relative(SRC, file);
      for (const { table, columns, line } of tableSelects(readFileSync(file, "utf8"))) {
        for (const column of phantomColumns(table, columns)) {
          const parked = GRANDFATHERED.some(
            (g) => g.file === rel && g.columns === columns && g.phantom.includes(column),
          );
          if (parked) continue;
          offences.push(`${rel}:${line} selects "${table}.${column}" (not in the live schema)`);
        }
      }
    }
    expect(offences, `phantom column(s) not grandfathered:\n${offences.join("\n")}`).toEqual([]);
  });

  it("holds the grandfathered list at its recorded size, so new debt fails the build", () => {
    // A ratchet, not a cap on effort: shrink it by fixing a select, and lower the
    // number in the same commit. It must never grow.
    expect(GRANDFATHERED).toHaveLength(3);
    for (const g of GRANDFATHERED) {
      expect(g.phantom.length, "each entry lists the phantom column(s) it parks").toBeGreaterThan(0);
      expect(g.why.length, "each entry names the real column and why it is not fixed here").toBeGreaterThan(60);
    }
  });

  it("keeps every grandfathered entry honest: the select must still exist and still trip the guard", () => {
    // A stale entry hides a regression behind a reason that no longer applies.
    for (const g of GRANDFATHERED) {
      const source = readFileSync(path.join(SRC, g.file), "utf8");
      const match = tableSelects(source).find((s) => s.columns === g.columns);
      expect(match, `grandfathered select for ${g.file} is gone, delete this entry`).toBeTruthy();
      const stillPhantom = phantomColumns(match!.table, match!.columns);
      for (const col of g.phantom) {
        expect(stillPhantom, `${g.file}: ${col} is no longer phantom, remove it from the entry`).toContain(col);
      }
    }
  });
});

describe("phantomColumns() allowlist logic", () => {
  const schema = { orders: ["id", "total", "items"], artist_profiles: ["id", "name"] };

  it("flags a column the table's schema lacks (what the narrow denylist could not)", () => {
    expect(phantomColumns("orders", "id, total_amount", schema)).toEqual(["total_amount"]);
  });

  it("passes a select naming only real columns", () => {
    expect(phantomColumns("orders", "id, total, items", schema)).toEqual([]);
  });

  it("does not leak an embed's inner columns as phantom columns of the parent", () => {
    // artist_profiles(name) is a foreign-table embed; name belongs to it, not orders.
    expect(phantomColumns("orders", "id, total, artist_profiles(name)", schema)).toEqual([]);
  });

  it("skips *, aliases, casts and json ops rather than treating them as columns", () => {
    expect(phantomColumns("orders", "*", schema)).toEqual([]);
    expect(phantomColumns("orders", "gross:total, id::text", schema)).toEqual([]);
  });

  it("returns [] for a table the snapshot does not cover, so an unknown table never blocks", () => {
    expect(phantomColumns("admin_users", "id, whatever", schema)).toEqual([]);
  });
});
