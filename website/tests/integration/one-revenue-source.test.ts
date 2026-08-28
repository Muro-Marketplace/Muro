// K6 (07 §6). "Revenue" had several definitions and nobody owned any of them.
//
// The two admin endpoints reported different numbers under the same word:
// /api/admin/stats excluded refunded, cancelled, failed and void;
// /api/admin/financials excluded only cancelled, so a refunded order counted as
// revenue there. That is finding E2/Bug 15, the one where admin reported £0
// gross while the artist portal showed £773.25.
//
// This drives BOTH real route handlers over ONE seeded order set and asserts
// they agree to the penny. A unit test of the shared module could not catch a
// route quietly keeping its own copy.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

// Both routes resolve the admin through the real getAdminUser, so the mock has
// to answer the auth lookup as well as the data queries.
let activeFrom: (table: string) => unknown = () => ({});
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser },
    from: (table: string) => activeFrom(table),
  }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: vi.fn() }));

import { GET as statsGET } from "@/app/api/admin/stats/route";
import { GET as financialsGET } from "@/app/api/admin/financials/route";

/**
 * One order set, spanning every status that matters. `total` is pounds, as the
 * column stores it.
 */
const THIS_MONTH = new Date();
THIS_MONTH.setUTCDate(2);
const ISO = THIS_MONTH.toISOString();

const ORDERS = [
  { total: 100.0, artist_revenue: 85.0, status: "paid", created_at: ISO },
  { total: 250.5, artist_revenue: 212.93, status: "delivered", created_at: ISO },
  { total: 19.99, artist_revenue: 16.99, status: "shipped", created_at: ISO },
  // The disagreement: financials used to count these two.
  { total: 500.0, artist_revenue: 425.0, status: "refunded", created_at: ISO },
  { total: 75.0, artist_revenue: 63.75, status: "partially_refunded", created_at: ISO },
  // Both always excluded this one.
  { total: 999.0, artist_revenue: 849.15, status: "cancelled", created_at: ISO },
];

/** 100.00 + 250.50 + 19.99, in pence. */
const EXPECTED_GROSS_PENCE = 10000 + 25050 + 1999;

/** A query builder over a fixed row set that ignores filters it is given. */
function rows(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "gte", "lte", "lt", "gt", "order", "limit", "in", "is"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error: null, count: data.length }).then(resolve);
  builder.maybeSingle = async () => ({ data: data[0] ?? null, error: null });
  builder.single = async () => ({ data: data[0] ?? null, error: null });
  return builder;
}

function tableRouter(overrides: Record<string, unknown[]> = {}) {
  return (table: string) => {
    if (table === "admin_users") return rows([]);
    if (table === "orders") return rows(ORDERS);
    return rows(overrides[table] ?? []);
  };
}

function req(): Request {
  return new Request("http://localhost/api/admin/x", {
    headers: { authorization: "Bearer x" },
  });
}

beforeEach(() => {
  getUser.mockReset();
  process.env.ADMIN_EMAILS = "boss@example.com";
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
  activeFrom = tableRouter();
});

describe("one revenue source (K6)", () => {
  it("stats and financials agree on gross to the penny, over one order set", async () => {
    const stats = await (await statsGET(req())).json();
    const financials = await (await financialsGET(req())).json();

    expect(stats.payouts.grossCents).toBe(EXPECTED_GROSS_PENCE);
    expect(financials.revenue.thisMonthPence).toBe(EXPECTED_GROSS_PENCE);
    expect(financials.revenue.thisMonthPence).toBe(stats.payouts.grossCents);
  });

  it("neither counts a refunded order as revenue", async () => {
    // The £500 refund and the £75 partial are the two rows financials used to
    // include. If either endpoint slips back, this number moves.
    const stats = await (await statsGET(req())).json();
    expect(stats.payouts.grossCents).not.toBe(EXPECTED_GROSS_PENCE + 50000);
    expect(stats.payouts.count).toBe(3);
  });

  it("counts orders against the same denominator that produced the total", async () => {
    const stats = await (await statsGET(req())).json();
    expect(stats.payouts.count).toBe(3);
    expect(stats.payouts.grossCents).toBe(EXPECTED_GROSS_PENCE);
  });
});

/**
 * Source with comments stripped. These checks are about code: the comments in
 * the repointed files deliberately quote the old expressions to say what they
 * replaced, and an assertion that tripped on that would push people to delete
 * the explanation.
 */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("no route re-derives order money for itself (K6)", () => {
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

  it("has no hand-rolled pounds-to-pence conversion outside lib/finance", async () => {
    // `Math.round(x * 100)` on an order amount was copied into both admin
    // routes. One owner now: poundsToPence.
    const files = (await sourceFiles(path.join(process.cwd(), "src"))).filter(
      (f) => !f.startsWith(path.join("src", "lib", "finance")),
    );
    const offenders = files.filter((f) =>
      /\.total\s*(\?\?|\|\|)[^)]*\)\s*\*\s*100/.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it("has one owner for the per-order artist payout", async () => {
    // Four copies before: api/dashboard, artist-portal/analytics,
    // artist-portal/page, artist-portal/orders. The analytics one carried a
    // comment saying it "mirrors the dashboard's calculation", which is what a
    // copy looks like when it knows it is one.
    const files = await sourceFiles(path.join(process.cwd(), "src"));
    const offenders = files.filter((f) => {
      if (f.startsWith(path.join("src", "lib", "finance"))) return false;
      // The shape of the duplicated rule: test artist_revenue, else fall to total.
      return /artist_revenue[\s\S]{0,220}?:\s*[\s\S]{0,120}?\btotal\b[\s\S]{0,60}?:\s*0\b/.test(code(f));
    });
    expect(offenders).toEqual([]);
  });

  it("has no file outside lib/finance AGGREGATING order money", async () => {
    // 07 §6.5 words this as "no file outside src/lib/finance selects `total`
    // from the orders table". Taken literally that flags single-order display
    // reads — api/orders/track and api/orders/[id]/events read `total` to render
    // one order — and the allowlist needed to keep it green would grow until the
    // guard meant nothing. Narrowed to what actually recurs: reading the raw
    // amount column AND folding it, in the same file. A second definition of
    // revenue always looks like that.
    const files = (await sourceFiles(path.join(process.cwd(), "src"))).filter(
      (f) => !f.startsWith(path.join("src", "lib", "finance")),
    );
    const offenders = files.filter((f) => {
      const source = code(f);
      const readsTotal =
        /\.from\(\s*["\x27]orders["\x27]\s*\)[\s\S]{0,200}?\.select\(\s*["\x27][^"\x27]*\btotal\b/.test(source);
      if (!readsTotal) return false;
      return /\.reduce\(/.test(source) || /\*\s*100\b/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
