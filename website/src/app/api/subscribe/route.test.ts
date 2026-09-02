// WS4.1/WS4.2 (audit R2.1 CRITICAL, R2.5). Re-subscribing while past_due used
// to mint a SECOND concurrent subscription with no cancel_previous, and a
// double-submit minted two checkout sessions. These pin: live-status widening,
// cancel_previous carriage, and the deterministic session idempotency key.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getAuthMock, fromMock, sessionsCreate, subsList, customersCreate } = vi.hoisted(() => {
  // PRICE_MAP is read at module load, so the env must exist before the
  // route imports.
  process.env.STRIPE_PRICE_PRO = "price_pro";
  return {
  getAuthMock: vi.fn(),
  fromMock: vi.fn(),
  sessionsCreate: vi.fn(),
  subsList: vi.fn(),
  customersCreate: vi.fn(),
  };
});

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getAuthMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: sessionsCreate } },
    subscriptions: { list: subsList },
    customers: { create: customersCreate },
  },
}));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/subscribe", {
    method: "POST",
    headers: { authorization: "Bearer x" },
    body: JSON.stringify(body),
  });
}

function installProfile(profile: Record<string, unknown>) {
  fromMock.mockImplementation(() => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }) }) }),
    update: () => ({ eq: async () => ({ error: null }) }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthMock.mockResolvedValue({ user: { id: "u-1", email: "a@x.com" }, error: null });
  sessionsCreate.mockResolvedValue({ id: "cs_1", url: "https://stripe/session" });
  subsList.mockResolvedValue({ data: [] });
});

describe("live-subscription detection (WS4.1)", () => {
  it("treats past_due as LIVE: finds the existing subscription and carries cancel_previous", async () => {
    installProfile({ id: "p-1", stripe_customer_id: "cus_1", subscription_status: "past_due", subscription_plan: "core", name: "Fin", is_founding_artist: false });
    subsList.mockImplementation(async ({ status }: { status: string }) =>
      status === "past_due" ? { data: [{ id: "sub_old" }] } : { data: [] });

    const res = await POST(req({ plan: "pro" }));
    expect(res.status).toBe(200);
    const params = sessionsCreate.mock.calls[0][0] as {
      metadata: { cancel_previous: string };
      subscription_data?: { metadata?: { cancel_previous?: string } };
    };
    expect(params.metadata.cancel_previous).toBe("sub_old");
  });

  it("incomplete also counts as live", async () => {
    installProfile({ id: "p-1", stripe_customer_id: "cus_1", subscription_status: "incomplete", subscription_plan: "core", name: "Fin", is_founding_artist: false });
    subsList.mockImplementation(async ({ status }: { status: string }) =>
      status === "incomplete" ? { data: [{ id: "sub_stuck" }] } : { data: [] });

    await POST(req({ plan: "pro" }));
    const params = sessionsCreate.mock.calls[0][0] as { metadata: { cancel_previous: string } };
    expect(params.metadata.cancel_previous).toBe("sub_stuck");
  });

  it("a cleanly canceled subscriber carries no cancel_previous", async () => {
    installProfile({ id: "p-1", stripe_customer_id: "cus_1", subscription_status: "canceled", subscription_plan: "core", name: "Fin", is_founding_artist: false });
    await POST(req({ plan: "pro" }));
    expect(subsList).not.toHaveBeenCalled();
    const params = sessionsCreate.mock.calls[0][0] as { metadata: { cancel_previous: string } };
    expect(params.metadata.cancel_previous).toBe("");
  });
});

describe("session idempotency (WS4.2)", () => {
  it("passes a deterministic idempotency key so a double-submit reuses the first session", async () => {
    installProfile({ id: "p-1", stripe_customer_id: "cus_1", subscription_status: "none", subscription_plan: null, name: "Fin", is_founding_artist: false });
    await POST(req({ plan: "pro" }));
    await POST(req({ plan: "pro" }));
    const key1 = (sessionsCreate.mock.calls[0][1] as { idempotencyKey: string }).idempotencyKey;
    const key2 = (sessionsCreate.mock.calls[1][1] as { idempotencyKey: string }).idempotencyKey;
    expect(key1).toMatch(/^subscribe:p-1:pro:monthly:none:\d+$/);
    expect(key2).toBe(key1);
  });
});
