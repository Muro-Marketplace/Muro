// G9. The venues admin surface had exactly one button, the expand chevron. No
// PATCH or POST existed anywhere on the page or the route, so approve, suspend,
// edit and remove were all absent and the panel was a read-only CRM.
//
// `venue_profiles` carries no review or suspension column (unlike
// artist_profiles.review_status), so publish state is not fixable here: that
// needs a migration. What an admin can do without one is correct the record,
// which is the case that actually comes up, a venue emails to say the contact
// or the address is wrong.
//
// The allowlist is the security property under test. Everything money- or
// identity-shaped (slug, user_id, the stripe_* and subscription_* columns) must
// be unreachable from this endpoint however the body is shaped.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, fromMock, recordMock, updateMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromMock: vi.fn(),
  recordMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));

import { PATCH } from "./route";

const VENUE = { id: "vp-1", slug: "copper-kettle", name: "Copper Kettle", user_id: "u-venue" };

function adminUsersChain() {
  return {
    select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
  };
}

function venuesTable(row: unknown = VENUE) {
  return {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
    update: (payload: Record<string, unknown>) => ({
      eq: async () => updateMock(payload),
    }),
  };
}

function req(body: unknown, token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/venues", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  updateMock.mockReset();

  process.env.ADMIN_EMAILS = "boss@example.com";
  updateMock.mockResolvedValue({ error: null });
  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") return adminUsersChain();
    return venuesTable();
  });
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
});

describe("G9: an admin can correct a venue record", () => {
  it("writes the allowlisted fields", async () => {
    const res = await PATCH(
      req({
        id: "vp-1",
        fields: {
          contact_name: "Sam Reed",
          email: "sam@copperkettle.co.uk",
          phone: "020 7000 0000",
          postcode: "E8 1AA",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      contact_name: "Sam Reed",
      email: "sam@copperkettle.co.uk",
      phone: "020 7000 0000",
      postcode: "E8 1AA",
    });
  });

  it("stamps updated_at so the row does not look untouched", async () => {
    await PATCH(req({ id: "vp-1", fields: { contact_name: "Sam Reed" } }));
    expect(updateMock.mock.calls[0][0].updated_at).toBeTruthy();
  });

  it("audits which fields changed, not what they now say", async () => {
    await PATCH(
      req({ id: "vp-1", fields: { contact_name: "Sam Reed", phone: "020 7000 0000" } }),
    );

    expect(recordMock).toHaveBeenCalledTimes(1);
    const { action, context } = recordMock.mock.calls[0][0];
    expect(action).toBe("venue.edit");
    expect(context.fields.sort()).toEqual(["contact_name", "phone"]);
    expect(JSON.stringify(context)).not.toContain("Sam Reed");
  });

  it("takes the arrangement booleans", async () => {
    await PATCH(
      req({ id: "vp-1", fields: { interested_in_free_loan: false, interested_in_revenue_share: true } }),
    );
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      interested_in_free_loan: false,
      interested_in_revenue_share: true,
    });
  });
});

describe("G9: what the endpoint must never let through", () => {
  it("refuses the slug, which is the venue's public identity", async () => {
    const res = await PATCH(req({ id: "vp-1", fields: { slug: "someone-elses-venue" } }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses the owning user_id", async () => {
    const res = await PATCH(req({ id: "vp-1", fields: { user_id: "u-attacker" } }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses the Stripe and subscription columns", async () => {
    for (const field of [
      "stripe_connect_account_id",
      "stripe_customer_id",
      "stripe_subscription_id",
      "subscription_plan",
      "subscription_status",
      "stripe_payouts_enabled",
    ]) {
      updateMock.mockClear();
      const res = await PATCH(req({ id: "vp-1", fields: { [field]: "anything" } }));
      expect(res.status, field).toBe(400);
      expect(updateMock, field).not.toHaveBeenCalled();
    }
  });

  it("refuses a body with nothing to change", async () => {
    const res = await PATCH(req({ id: "vp-1", fields: {} }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("404s on a venue that does not exist", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_users") return adminUsersChain();
      return venuesTable(null);
    });
    const res = await PATCH(req({ id: "vp-1", fields: { contact_name: "Sam Reed" } }));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("never runs for a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });
    const res = await PATCH(req({ id: "vp-1", fields: { contact_name: "Sam Reed" } }));
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("records nothing when the write fails", async () => {
    updateMock.mockResolvedValue({ error: { message: "permission denied" } });
    const res = await PATCH(req({ id: "vp-1", fields: { contact_name: "Sam Reed" } }));
    expect(res.status).toBe(500);
    expect(recordMock).not.toHaveBeenCalled();
  });
});
