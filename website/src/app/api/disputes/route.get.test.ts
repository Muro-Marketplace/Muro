// Row C L988 / Track A4.5. "An open dispute is invisible on the customer's
// orders page." `orders.status` deliberately stays `confirmed` when a dispute
// is opened (the order is still live; the dispute runs alongside it), so no
// off-pipeline badge renders. `/orders/<id>` appeared to know, but only from
// local state after the submit: reload it and the acknowledgement is gone.
//
// The real gap is that `/api/disputes` had a POST and no GET, so nothing could
// read a dispute back at all. `disputes` has existed since migration 060 and
// was write-only from the customer's side.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, authMock } = vi.hoisted(() => ({ fromMock: vi.fn(), authMock: vi.fn() }));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/orders/parties", () => ({ orderParties: vi.fn(async () => ({})) }));
vi.mock("@/lib/orders/lifecycle", () => ({ recordOrderEvent: vi.fn(async () => {}) }));

import { GET } from "./route";

const ROWS = [
  {
    id: "d-1",
    order_id: "WS-1",
    placement_id: null,
    status: "open",
    category: "damaged",
    description: "Arrived with a torn corner",
    resolution: null,
    created_at: "2026-08-30T10:00:00.000Z",
    resolved_at: null,
  },
];

/** Records the filters the list query applied. */
let filters: Array<[string, unknown]> = [];

function setupDb(rows: unknown[] = ROWS) {
  filters = [];
  fromMock.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.eq = (col: string, value: unknown) => {
      filters.push([col, value]);
      return chain;
    };
    chain.order = () => chain;
    chain.limit = async () => ({ data: rows, error: null });
    return { select: () => chain };
  });
}

function req() {
  return new Request("http://localhost/api/disputes", { headers: { authorization: "Bearer x" } });
}

beforeEach(() => {
  fromMock.mockReset();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u-buyer", email: "b@x.com" }, error: null });
  setupDb();
});

describe("GET /api/disputes", () => {
  it("returns the caller's own disputes", async () => {
    const body = await (await GET(req())).json();

    expect(body.disputes).toHaveLength(1);
    expect(body.disputes[0]).toMatchObject({ id: "d-1", order_id: "WS-1", status: "open" });
  });

  it("scopes them to the caller, so one buyer cannot read another's", async () => {
    await GET(req());

    expect(filters).toContainEqual(["opener_user_id", "u-buyer"]);
  });

  it("requires a signed-in caller", async () => {
    authMock.mockResolvedValue({
      user: null,
      error: new Response("no", { status: 401 }),
    });

    const res = await GET(req());

    expect(res.status).toBe(401);
  });

  it("answers an empty list rather than failing the page when the read errors", async () => {
    fromMock.mockImplementation(() => {
      throw new Error("db down");
    });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disputes: [] });
  });
});
