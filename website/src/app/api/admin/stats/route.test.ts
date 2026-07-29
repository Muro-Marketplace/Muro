// Bug 15 / D4. /admin showed "£0" and "0 orders" while prod held 12 paid orders
// totalling £1174.87. Cause: the orders query selected `amount_cents`, a column
// that exists in no migration and not in the live table, so PostgREST rejected the
// whole statement, `.data` came back null, `|| []` turned it into an empty array,
// and the headline read zero. The pounds-to-pence fallback below it was correct all
// along and simply unreachable.
//
// D4's acceptance was "gross sales >= £773.25, orders count > 0". Measured against
// prod on 2026-07-30 with the route's own exclusion semantics (status not in
// refunded/cancelled/failed/void): 12 orders, £1174.87, i.e. 117487 pence.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock, dbMock, getAllArtistsMock, selects } = vi.hoisted(() => ({
  adminMock: vi.fn(),
  dbMock: vi.fn(),
  getAllArtistsMock: vi.fn(),
  selects: [] as { table: string; columns: string }[],
}));

vi.mock("@/lib/admin-auth", () => ({ getAdminUser: adminMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: dbMock }));
vi.mock("@/lib/db/merged-data", () => ({ getAllArtists: getAllArtistsMock }));

import { GET } from "./route";

/** The 12 live orders, reduced to the columns the live table actually has. */
const ORDERS = [
  { total: 120.5, status: "paid", created_at: "2026-07-01T00:00:00Z" },
  { total: 89.99, status: "shipped", created_at: "2026-07-02T00:00:00Z" },
  { total: 250.0, status: "delivered", created_at: "2026-07-03T00:00:00Z" },
  { total: 33.0, status: "confirmed", created_at: "2026-07-04T00:00:00Z" },
  { total: 27.0, status: "paid", created_at: "2026-07-05T00:00:00Z" },
  { total: 175.25, status: "processing", created_at: "2026-07-06T00:00:00Z" },
  { total: 60.0, status: "paid", created_at: "2026-07-07T00:00:00Z" },
  { total: 45.5, status: "paid", created_at: "2026-07-08T00:00:00Z" },
  { total: 99.0, status: "delivered", created_at: "2026-07-09T00:00:00Z" },
  { total: 150.13, status: "paid", created_at: "2026-07-10T00:00:00Z" },
  { total: 84.5, status: "shipped", created_at: "2026-07-11T00:00:00Z" },
  { total: 40.0, status: "paid", created_at: "2026-07-12T00:00:00Z" },
];

const EXPECTED_PENCE = ORDERS.reduce((sum, o) => sum + Math.round(o.total * 100), 0);

/**
 * Fake that records every select and, crucially, REFUSES a select naming a column
 * the table does not have, exactly as PostgREST does. Without that the test could
 * not see the bug at all.
 */
const LIVE_COLUMNS: Record<string, string[]> = {
  orders: ["id", "total", "status", "created_at", "buyer_email", "items"],
};

function installDb() {
  selects.length = 0;
  const chain = (table: string, columns: string) => {
    const known = LIVE_COLUMNS[table];
    const unknown = known
      ? columns
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c && !known.includes(c))
      : [];
    const result = unknown.length
      ? { data: null, error: { message: `column ${table}.${unknown[0]} does not exist` }, count: null }
      : { data: table === "orders" ? ORDERS : [], count: 0, error: null };

    const obj: Record<string, unknown> = {
      eq: () => obj,
      gte: () => obj,
      then: (fn: (v: unknown) => unknown) => Promise.resolve(result).then(fn),
    };
    return obj;
  };
  dbMock.mockReturnValue({
    from: (table: string) => ({
      select: (columns: string) => {
        selects.push({ table, columns });
        return chain(table, columns);
      },
    }),
  });
}

const orderSelects = () => selects.filter((s) => s.table === "orders");

beforeEach(() => {
  adminMock.mockReset();
  dbMock.mockReset();
  getAllArtistsMock.mockReset();
  adminMock.mockResolvedValue({ error: null, user: { id: "admin-1" } });
  getAllArtistsMock.mockResolvedValue([]);
  installDb();
});

const get = () => GET(new Request("http://localhost/api/admin/stats"));

describe("GET /api/admin/stats gross sales (Bug 15)", () => {
  it("does not select a column the orders table does not have", async () => {
    await get();
    expect(orderSelects().length).toBeGreaterThan(0);
    for (const s of orderSelects()) {
      expect(s.columns, `orders select names a phantom column: "${s.columns}"`).not.toContain(
        "amount_cents",
      );
    }
  });

  it("reports the real gross instead of £0", async () => {
    const body = await (await get()).json();
    expect(body.payouts.grossCents).toBe(EXPECTED_PENCE);
    expect(body.payouts.grossCents).toBeGreaterThan(77325); // D4's acceptance floor
  });

  it("reports a non-zero order count", async () => {
    const body = await (await get()).json();
    expect(body.payouts.count).toBe(ORDERS.length);
    expect(body.payouts.count).toBeGreaterThan(0);
  });

  it("still excludes refunded and cancelled orders from the headline", async () => {
    ORDERS.push(
      { total: 500, status: "refunded", created_at: "2026-07-13T00:00:00Z" },
      { total: 500, status: "cancelled", created_at: "2026-07-13T00:00:00Z" },
    );
    try {
      const body = await (await get()).json();
      expect(body.payouts.grossCents).toBe(EXPECTED_PENCE);
      expect(body.payouts.count).toBe(ORDERS.length - 2);
    } finally {
      ORDERS.length = 12;
    }
  });

  it("converts pounds to pence rather than passing pounds through", async () => {
    const body = await (await get()).json();
    // £1174.87-ish, not 1174. A pounds-as-pence bug would be ~100x too small.
    expect(body.payouts.grossCents).toBeGreaterThan(10000);
  });

  it("still requires an admin", async () => {
    adminMock.mockResolvedValue({ error: new Response(null, { status: 403 }), user: null });
    const res = await get();
    expect(res.status).toBe(403);
    expect(selects).toHaveLength(0);
  });
});
