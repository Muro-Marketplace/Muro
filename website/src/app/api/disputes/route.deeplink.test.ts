// Regression test for the B29 companion fix: the dispute-opened email used to
// deep-link /orders/<id>/dispute, a route that has never existed, so both
// parties' "View dispute" buttons 404ed. The link now points at the order page
// itself, which hosts the dispute surface.
//
// Leaner mocks than route.test.ts on purpose: authz, parties and lifecycle are
// stubbed because the only behaviour under test is the URL handed to the
// email template.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ user: { id: "u-buyer", email: "b@x.com" }, error: null })),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/demo-guard", () => ({ assertNotDemo: vi.fn(() => null) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, skipped: false })) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn(async () => ({ ok: true })) }));

const ORDER = { id: "ord_1", buyer_user_id: "u-buyer", artist_user_id: "u-artist" };

vi.mock("@/lib/authz", () => ({
  assertOrderParty: vi.fn(async () => ORDER),
  assertPlacementParty: vi.fn(async () => null),
  handleAuthzError: vi.fn(() => null),
}));

vi.mock("@/lib/orders/parties", () => ({
  orderParties: vi.fn(async () => [
    { role: "buyer", email: "buyer@x.com", userId: "u-buyer", firstName: "Jo" },
  ]),
}));

vi.mock("@/lib/orders/lifecycle", () => ({
  recordOrderEvent: vi.fn(async () => undefined),
}));

const { templateMock } = vi.hoisted(() => ({ templateMock: vi.fn((_props: unknown) => null) }));
vi.mock("@/emails/templates/orders/OrderDisputeOpened", () => ({
  OrderDisputeOpened: templateMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "disputes") throw new Error(`unexpected table ${table}`);
      return {
        insert: () => ({
          select: () => ({ maybeSingle: async () => ({ data: { id: "dsp_1" }, error: null }) }),
        }),
      };
    },
  }),
}));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/disputes", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  templateMock.mockClear();
});

describe("dispute-opened email deep link", () => {
  it("links the order page, not the nonexistent /orders/<id>/dispute route", async () => {
    const res = await POST(req({
      orderId: "ord_1",
      category: "Damaged in transit",
      description: "It arrived with a torn corner.",
    }));
    expect(res.status).toBe(201);

    expect(templateMock).toHaveBeenCalled();
    const props = templateMock.mock.calls[0][0] as { disputeUrl: string };
    expect(props.disputeUrl).toMatch(/\/orders\/ord_1$/);
    expect(props.disputeUrl).not.toContain("/dispute");
  });
});
