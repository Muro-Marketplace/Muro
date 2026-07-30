// D19, the orphan-payment half.
//
// The route wrapped stripe.checkout.sessions.create AND the follow-up
// curation_requests.update({ stripe_checkout_session_id }) in one try whose
// catch deleted the row. If the link update threw after the session was
// created, the buyer could still pay a live Stripe session while the row was
// gone. The webhook attributes a curation payment by
// session.metadata.curation_request_id (the row id), so a deleted row means
// money taken with no record, no email and no refund trail.
//
// The fix splits the two: the row is deleted ONLY when session creation itself
// fails (nothing is payable yet), and is RETAINED once a session exists (a link
// failure is logged, never fatal). These tests pin both directions on the
// one-off and the managed branches.

import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  sessionsCreateMock,
  pricesRetrieveMock,
  fromMock,
  getUserMock,
  notifyAdminMock,
  notifyEnquiryMock,
} = vi.hoisted(() => ({
  sessionsCreateMock: vi.fn(async () => ({ id: "cs_test_1", url: "https://stripe.example/pay" })),
  pricesRetrieveMock: vi.fn(),
  fromMock: vi.fn(),
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
  notifyAdminMock: vi.fn(async () => {}),
  notifyEnquiryMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: sessionsCreateMock } },
    prices: { retrieve: pricesRetrieveMock },
  },
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));
vi.mock("@/lib/email", () => ({
  notifyAdminCurationRequest: notifyAdminMock,
  notifyCurationCustomerEnquiry: notifyEnquiryMock,
}));

import { POST } from "./route";

/** How the `stripe_checkout_session_id` link update behaves in the current test. */
let linkBehaviour: "ok" | "throw" | "error" = "ok";
/** Every delete().eq() the route runs, as [column, value]. */
let deletes: Array<[string, unknown]> = [];
/** Every update() payload the route runs. */
let updates: Array<Record<string, unknown>> = [];

function setupDb() {
  linkBehaviour = "ok";
  deletes = [];
  updates = [];
  fromMock.mockImplementation((table: string) => {
    if (table !== "curation_requests") throw new Error(`unexpected table ${table}`);
    return {
      insert: (_payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => ({ data: { id: "cr_1" }, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return {
          eq: (_col: string, _val: unknown) => {
            if (linkBehaviour === "throw") return Promise.reject(new Error("connection reset"));
            if (linkBehaviour === "error") return Promise.resolve({ error: { message: "boom" } });
            return Promise.resolve({ error: null });
          },
        };
      },
      delete: () => ({
        eq: async (col: string, val: unknown) => {
          deletes.push([col, val]);
          return { error: null };
        },
      }),
    };
  });
}

function req(body: unknown): Request {
  return new Request("https://wallplace.co.uk/api/curation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ONE_OFF_BODY = {
  tier: "single_wall",
  venueName: "The Copper Kettle",
  contactName: "Maya Chen",
  contactEmail: "maya@example.com",
};

const MANAGED_BODY = {
  tier: "managed_monthly",
  venueName: "The Copper Kettle",
  contactName: "Maya Chen",
  contactEmail: "maya@example.com",
};

// D22: Stripe price fixtures keyed by price id. An id not in the map defaults to
// a price that matches managed_monthly, so the D19 managed cases proceed to
// session creation. A fixture value of "THROW" makes the retrieve reject. Tests
// that need a specific outcome use a UNIQUE price id, because the route caches
// prices in module scope for 5 minutes and that cache is not cleared between tests.
const MATCHING_MONTHLY = {
  recurring: { interval: "month", interval_count: 1 },
  unit_amount: 7999,
  currency: "gbp",
};
let priceFixtures: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
  setupDb();
  sessionsCreateMock.mockResolvedValue({ id: "cs_test_1", url: "https://stripe.example/pay" });
  priceFixtures = {};
  pricesRetrieveMock.mockImplementation(async (id: string) => {
    const fixture = priceFixtures[id];
    if (fixture === "THROW") throw new Error("stripe prices retrieve down");
    return fixture ?? MATCHING_MONTHLY;
  });
});

describe("POST /api/curation, D19 orphan-payment guard", () => {
  it("one-off: retains the row and returns the checkout url when the session link update throws", async () => {
    linkBehaviour = "throw";

    const res = await POST(req(ONE_OFF_BODY));

    // A live session exists, so the buyer must be able to pay and be attributable.
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ mode: "checkout", url: "https://stripe.example/pay", id: "cr_1" });
    expect(sessionsCreateMock).toHaveBeenCalledOnce();
    // The crux: the row is NEVER deleted once a session can be paid.
    expect(deletes).toHaveLength(0);
  });

  it("one-off: retains the row when the link update returns an error", async () => {
    linkBehaviour = "error";

    const res = await POST(req(ONE_OFF_BODY));

    expect(res.status).toBe(200);
    expect(deletes).toHaveLength(0);
  });

  it("one-off: deletes the pending row when Stripe session creation itself fails", async () => {
    sessionsCreateMock.mockRejectedValueOnce(new Error("stripe down"));

    const res = await POST(req(ONE_OFF_BODY));

    // Nothing is payable, so removing the pending row is the correct cleanup.
    expect(res.status).toBe(500);
    expect(deletes).toContainEqual(["id", "cr_1"]);
  });

  it("managed: retains the row and returns the checkout url when the session link update throws", async () => {
    process.env.STRIPE_PRICE_CURATION_MONTHLY = "price_test_123";
    linkBehaviour = "throw";

    const res = await POST(req(MANAGED_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ mode: "checkout", url: "https://stripe.example/pay", id: "cr_1" });
    expect(deletes).toHaveLength(0);
  });

  it("managed: deletes the pending row when Stripe session creation itself fails", async () => {
    process.env.STRIPE_PRICE_CURATION_MONTHLY = "price_test_123";
    sessionsCreateMock.mockRejectedValueOnce(new Error("stripe down"));

    const res = await POST(req(MANAGED_BODY));

    expect(res.status).toBe(500);
    expect(deletes).toContainEqual(["id", "cr_1"]);
  });
});

const MANAGED_QUARTERLY_BODY = {
  tier: "managed_quarterly",
  venueName: "The Copper Kettle",
  contactName: "Maya Chen",
  contactEmail: "maya@example.com",
};

describe("POST /api/curation, D22 managed price validation", () => {
  it("proceeds to checkout when the Stripe price matches the advertised tier", async () => {
    process.env.STRIPE_PRICE_CURATION_MONTHLY = "price_d22_match";
    priceFixtures["price_d22_match"] = MATCHING_MONTHLY;

    const res = await POST(req(MANAGED_BODY));

    expect(pricesRetrieveMock).toHaveBeenCalledWith("price_d22_match");
    expect(sessionsCreateMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(deletes).toHaveLength(0);
  });

  it("503s and deletes the row when the price bills the wrong cadence", async () => {
    process.env.STRIPE_PRICE_CURATION_QUARTERLY = "price_d22_cadence";
    // Quarterly tier, but the price is configured monthly (interval_count 1).
    priceFixtures["price_d22_cadence"] = {
      recurring: { interval: "month", interval_count: 1 },
      unit_amount: 19999,
      currency: "gbp",
    };

    const res = await POST(req(MANAGED_QUARTERLY_BODY));

    expect(res.status).toBe(503);
    // No payable session must be created against a mispriced tier.
    expect(sessionsCreateMock).not.toHaveBeenCalled();
    expect(deletes).toContainEqual(["id", "cr_1"]);
  });

  it("503s and deletes the row when the price amount is wrong", async () => {
    process.env.STRIPE_PRICE_CURATION_MONTHLY = "price_d22_amount";
    // Right cadence, wrong amount (£99.99 instead of £79.99).
    priceFixtures["price_d22_amount"] = {
      recurring: { interval: "month", interval_count: 1 },
      unit_amount: 9999,
      currency: "gbp",
    };

    const res = await POST(req(MANAGED_BODY));

    expect(res.status).toBe(503);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
    expect(deletes).toContainEqual(["id", "cr_1"]);
  });

  it("503s and deletes the row when the price retrieve fails", async () => {
    process.env.STRIPE_PRICE_CURATION_MONTHLY = "price_d22_throw";
    priceFixtures["price_d22_throw"] = "THROW";

    const res = await POST(req(MANAGED_BODY));

    expect(res.status).toBe(503);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
    expect(deletes).toContainEqual(["id", "cr_1"]);
  });
});
