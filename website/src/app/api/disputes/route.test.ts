// 09 §D.1 / item 3.7. POST /api/disputes, the route that did not exist.
//
// `disputes` shipped in migration 060 with an admin panel that could list and
// resolve rows, two finished email templates registered against it, and NOTHING
// anywhere that could create one. So the table was permanently empty, both
// templates were unreachable, and a buyer with a damaged painting had no path
// that was not an email to support.
//
// The tests that matter here are the two the doc names: both parties get told,
// exactly once each, and someone who is not a party cannot open a dispute on a
// stranger's order.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ user: { id: "u-buyer", email: "b@x.com" }, error: null })),
}));
import { getAuthenticatedUser } from "@/lib/api-auth";

const fromMock = vi.fn();
const getUserByIdMock = vi.fn(async () => ({ data: { user: { email: "artist@x.com" } } }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { getUserById: getUserByIdMock } } }),
}));

// The in-memory limiter is keyed on IP + path and every test here shares both,
// so the real one would start returning 429 partway through the file and the
// failures would look like route bugs.
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, skipped: false })) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn(async () => ({ ok: true })) }));

import { POST } from "./route";
import { sendEmail } from "@/lib/email/send";
import { sendAdminAlert } from "@/lib/email/admin-alert";

const ORDER = {
  id: "ord_1",
  status: "delivered",
  artist_user_id: "u-artist",
  artist_slug: "maya-chen",
  buyer_user_id: "u-buyer",
  buyer_email: "buyer@x.com",
  venue_slug: null,
  shipping: { fullName: "Jo Bloggs" },
};

const inserted: Record<string, unknown>[] = [];
const upserted: Record<string, unknown>[] = [];

/**
 * `visible` is what the party-filtered order read returns. null models "the
 * caller is not a party to this order", which is the only way authz signals it.
 */
function installDb(opts: { visible?: unknown; insertError?: unknown } = {}) {
  const visible = "visible" in opts ? opts.visible : ORDER;
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "maya-chen", name: "Maya Chen" } }) }) }),
      };
    }
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({ or: () => ({ maybeSingle: async () => ({ data: visible }) }) }),
        }),
      };
    }
    if (table === "disputes") {
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return {
            select: () => ({
              maybeSingle: async () =>
                opts.insertError
                  ? { data: null, error: opts.insertError }
                  : { data: { id: "dsp_1" }, error: null },
            }),
          };
        },
      };
    }
    if (table === "order_events") {
      return { upsert: async (row: Record<string, unknown>) => { upserted.push(row); return { error: null }; } };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

function actAs(who: "buyer" | "artist" | "stranger") {
  const users = {
    buyer: { id: "u-buyer", email: "b@x.com" },
    artist: { id: "u-artist", email: "a@x.com" },
    stranger: { id: "u-nobody", email: "n@x.com" },
  };
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ user: users[who], error: null } as never);
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/disputes", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOD = { orderId: "ord_1", category: "damaged", description: "It arrived with a torn corner." };

beforeEach(() => {
  fromMock.mockReset();
  vi.mocked(sendEmail).mockClear();
  vi.mocked(sendAdminAlert).mockClear();
  inserted.length = 0;
  upserted.length = 0;
  actAs("buyer");
  installDb();
});

describe("POST /api/disputes creates the dispute and tells both sides", () => {
  it("creates the row as the buyer", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ success: true, disputeId: "dsp_1" });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      opener_user_id: "u-buyer",
      order_id: "ord_1",
      placement_id: null,
      category: "damaged",
      description: "It arrived with a torn corner.",
    });
  });

  it("emails BOTH parties, exactly once each, at their own addresses", async () => {
    // THE regression this route exists to prevent. A dispute that only tells the
    // person who opened it is a complaint the other side never hears.
    await POST(req(GOOD));

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(sendEmail).mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.to).sort()).toEqual(["artist@x.com", "buyer@x.com"]);
    expect(calls.every((c) => c.template === "order_dispute_opened")).toBe(true);
  });

  it("gives each party a DISTINCT idempotency key, so neither send dedupes the other away", async () => {
    // Both emails are about one dispute. Keyed on the dispute id alone they
    // would collide, the second would be dropped as a duplicate, and exactly one
    // party would be told — silently, with an `email_events` row claiming
    // success.
    await POST(req(GOOD));

    const keys = vi.mocked(sendEmail).mock.calls.map((c) => c[0].idempotencyKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys.sort()).toEqual(["dispute_opened:dsp_1:artist", "dispute_opened:dsp_1:buyer"]);
  });

  it("logs order.disputed on the order's lifecycle, and sends no third email for it", async () => {
    await POST(req(GOOD));

    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toMatchObject({
      order_id: "ord_1",
      event_type: "order.disputed",
      idempotency_key: "ord_1:order.disputed",
    });
    // `disputed` used to map to null, so no row was written at all. It maps to a
    // real event now, and emailsForEvent still returns [] for it: still two.
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("alerts an admin, keyed on the dispute", async () => {
    await POST(req(GOOD));
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendAdminAlert).mock.calls[0][0].idempotencyKey).toBe("admin_dispute_opened:dsp_1");
  });

  it("works the same opened by the artist", async () => {
    actAs("artist");
    const res = await POST(req(GOOD));
    expect(res.status).toBe(201);
    expect(inserted[0]).toMatchObject({ opener_user_id: "u-artist" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/disputes refuses a non-party", () => {
  it("does not create a dispute on a stranger's order", async () => {
    // The party filter is in the query, so a non-party's read returns nothing.
    actAs("stranger");
    installDb({ visible: null });

    const res = await POST(req(GOOD));

    // 404, not the 403 the plan text suggested: authz.ts denies with 404 by
    // design so the status cannot be used to confirm an order id exists. What
    // matters is that it is not a 2xx and nothing was written.
    expect(res.status).toBe(404);
    expect(inserted).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });

  it("gives a non-party the same answer for a real order and an imaginary one", async () => {
    // No enumeration oracle: the response must not distinguish "not yours" from
    // "does not exist".
    actAs("stranger");
    installDb({ visible: null });

    const real = await POST(req(GOOD));
    const imaginary = await POST(req({ ...GOOD, orderId: "ord_does_not_exist" }));

    expect(real.status).toBe(imaginary.status);
    expect(await real.json()).toEqual(await imaginary.json());
  });
});

describe("POST /api/disputes validation", () => {
  it("rejects an unauthenticated caller before touching the database", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      error: new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 }),
    } as never);

    const res = await POST(req(GOOD));

    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a body naming both an order and a placement", async () => {
    // Exactly one, or the row points at two different things and the emails go
    // to whichever set the code happens to resolve first.
    const res = await POST(req({ ...GOOD, placementId: "plc_1" }));
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it("rejects a body naming neither", async () => {
    const res = await POST(req({ category: "other", description: "Something went wrong here." }));
    expect(res.status).toBe(400);
  });

  it("rejects a description too short to act on", async () => {
    const res = await POST(req({ ...GOOD, description: "bad" }));
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it("rejects a description over the 2000-character column budget", async () => {
    const res = await POST(req({ ...GOOD, description: "x".repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-JSON body without throwing", async () => {
    const res = await POST(
      new Request("http://localhost/api/disputes", {
        method: "POST",
        headers: { authorization: "Bearer valid", "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("reports a failed insert as a 500 and sends nothing", async () => {
    installDb({ insertError: { message: "constraint" } });
    const res = await POST(req(GOOD));
    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });
});

describe("POST /api/disputes with a party missing an address", () => {
  it("still tells the one party it can reach rather than failing the whole dispute", async () => {
    // A guest-checkout order with no artist attributed. Dropping the dispute
    // because one side is unreachable would lose a real complaint.
    getUserByIdMock.mockResolvedValueOnce({ data: { user: { email: null } } } as never);

    const res = await POST(req(GOOD));

    expect(res.status).toBe(201);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("buyer@x.com");
  });
});
