// WS4.7 / audit R2.17. Subscription state was written by webhooks alone, so
// one dropped event left the books wrong forever. These pin: correction
// toward Stripe, the ledger vocabulary mapping, the placements-chip mirror,
// deleted-in-Stripe treated as canceled, and the drift alert.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, subsRetrieve, sendAdminAlertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  subsRetrieve: vi.fn(),
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/stripe", () => ({ stripe: { subscriptions: { retrieve: subsRetrieve } } }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

import { GET } from "./route";

function req(): Request {
  return new Request("http://localhost/api/cron/subscription-reconcile", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

const updates: Array<{ table: string; row: Record<string, unknown> }> = [];

function setupDb(data: {
  profiles?: Array<Record<string, unknown>>;
  billings?: Array<Record<string, unknown>>;
  curations?: Array<Record<string, unknown>>;
}) {
  updates.length = 0;
  fromMock.mockImplementation((table: string) => {
    const rows =
      table === "artist_profiles" ? data.profiles || []
      : table === "placement_recurring_billings" ? data.billings || []
      : table === "curation_requests" ? data.curations || []
      : [];
    const chain: Record<string, unknown> = {
      limit: async () => ({ data: rows, error: null }),
    };
    chain.in = () => chain;
    chain.eq = () => chain;
    chain.not = () => chain;
    return {
      select: () => chain,
      update: (row: Record<string, unknown>) => {
        updates.push({ table, row });
        return { eq: async () => ({ error: null }) };
      },
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
});

describe("GET /api/cron/subscription-reconcile", () => {
  it("corrects an artist profile toward Stripe and alerts", async () => {
    setupDb({
      profiles: [{ id: "ap-1", stripe_subscription_id: "sub_1", subscription_status: "active" }],
    });
    subsRetrieve.mockResolvedValue({ status: "canceled" });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(updates).toContainEqual({
      table: "artist_profiles",
      row: { subscription_status: "canceled" },
    });
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
  });

  it("in-sync rows write nothing and nobody is alerted", async () => {
    setupDb({
      profiles: [{ id: "ap-1", stripe_subscription_id: "sub_1", subscription_status: "active" }],
    });
    subsRetrieve.mockResolvedValue({ status: "active" });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(0);
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });

  it("a cancelled paid-loan subscription maps to ledger 'cancelled' AND mirrors the placements chip", async () => {
    setupDb({
      billings: [{ id: "b-1", placement_id: "p-1", stripe_subscription_id: "sub_loan", status: "active" }],
    });
    subsRetrieve.mockResolvedValue({ status: "canceled" });
    await GET(req());
    const billingWrite = updates.find((u) => u.table === "placement_recurring_billings");
    expect(billingWrite?.row.status).toBe("cancelled");
    const mirror = updates.find((u) => u.table === "placements");
    expect(mirror?.row.subscription_status).toBe("canceled");
  });

  it("a subscription deleted in Stripe (resource missing) counts as canceled", async () => {
    setupDb({
      profiles: [{ id: "ap-1", stripe_subscription_id: "sub_gone", subscription_status: "past_due" }],
    });
    subsRetrieve.mockRejectedValue(new Error("No such subscription: sub_gone"));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(updates).toContainEqual({
      table: "artist_profiles",
      row: { subscription_status: "canceled" },
    });
  });

  it("a Stripe outage on every row answers 500 via the all-failed path", async () => {
    setupDb({
      profiles: [{ id: "ap-1", stripe_subscription_id: "sub_1", subscription_status: "active" }],
    });
    subsRetrieve.mockRejectedValue(new Error("api down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it("rejects without the cron secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/subscription-reconcile"));
    expect(res.status).toBe(401);
  });
});
