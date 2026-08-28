// E45: PUT and PATCH /api/venue-profile passed the raw request body straight to
// upsertVenueProfile, which spreads it into a service-role update. A venue could
// therefore set slug (squat another venue's handle), subscription_plan/status
// (self-grant a paid tier), the stripe_* columns, or user_id, which the update
// writes into SET while the WHERE matches the caller, i.e. hand your own row to
// another account.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, upsertMock, getProfileMock, adminMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  upsertMock: vi.fn(),
  getProfileMock: vi.fn(),
  adminMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/db/venue-profiles", () => ({
  getVenueProfileByUserId: getProfileMock,
  upsertVenueProfile: upsertMock,
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: adminMock }));

import { PUT, PATCH } from "./route";

const USER = { id: "user-1", email: "kettle@example.com", user_metadata: {} };

const written = (): Record<string, unknown> => upsertMock.mock.calls[0][1];

function req(method: string, body: unknown): Request {
  return new Request("http://localhost/api/venue-profile", {
    method,
    body: JSON.stringify(body),
  });
}

const SERVER_OWNED_BODY = {
  description: "A legitimate edit",
  id: "another-profile",
  user_id: "someone-else",
  slug: "someone-elses-venue",
  created_at: "2020-01-01",
  updated_at: "2020-01-01",
  welcomed_at: "2020-01-01",
  subscription_plan: "premium",
  subscription_status: "active",
  stripe_customer_id: "cus_attacker",
  stripe_subscription_id: "sub_attacker",
  stripe_connect_account_id: "acct_attacker",
  stripe_connect_onboarding_complete: true,
};

const FORBIDDEN = Object.keys(SERVER_OWNED_BODY).filter((k) => k !== "description");

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  adminMock.mockReset();
  authMock.mockResolvedValue({ user: USER, error: null });
  upsertMock.mockResolvedValue({ error: null });
});

describe("PUT /api/venue-profile mass-assignment (E45)", () => {
  it("drops every server-owned field from the body", async () => {
    const res = await PUT(req("PUT", SERVER_OWNED_BODY));

    expect(res.status).toBe(200);
    const payload = written();
    expect(payload.description).toBe("A legitimate edit");
    for (const key of FORBIDDEN) {
      expect(payload, `${key} reached the DB payload`).not.toHaveProperty(key);
    }
  });

  it("still writes the fields a venue is allowed to change", async () => {
    await PUT(
      req("PUT", {
        name: "The Copper Kettle",
        type: "cafe",
        location: "Hampton",
        contact_name: "Sam",
        email: "sam@example.com",
        phone: "0123",
        postcode: "TW12 2TH",
        wall_space: "3m x 2m",
        interested_in_free_loan: true,
        display_lighting: "spotlights",
        message_notifications_enabled: false,
      }),
    );
    expect(written()).toMatchObject({
      name: "The Copper Kettle",
      type: "cafe",
      location: "Hampton",
      contact_name: "Sam",
      email: "sam@example.com",
      phone: "0123",
      postcode: "TW12 2TH",
      wall_space: "3m x 2m",
      interested_in_free_loan: true,
      display_lighting: "spotlights",
      message_notifications_enabled: false,
    });
  });

  it("drops a column that exists in no schema", async () => {
    // `preferred_sizes` is vestigial (row 23b): nothing collects, reads or
    // stores it, and `preferred_styles` exists alongside, so it was an
    // incomplete migration rather than a design decision. The allowlist is what
    // keeps it out.
    await PUT(req("PUT", { name: "Kettle", preferred_sizes: ["a"] }));
    expect(written()).not.toHaveProperty("preferred_sizes");
  });

  it("now WRITES interested_in_local_artists, which it used to drop (row 23a)", async () => {
    // FLIPPED. This assertion used to be `not.toHaveProperty`, with a comment
    // saying it was the one to flip when row 23a landed. Migration 103 added the
    // column; before it, the control shipped on venue-portal/profile, the save
    // dropped the value here, and the transform hardcoded `true` on the way
    // back, so a venue could untick the box, save, reload and see it ticked.
    await PUT(req("PUT", { name: "Kettle", interested_in_local_artists: false }));
    expect(written()).toHaveProperty("interested_in_local_artists", false);

    upsertMock.mockClear();
    await PUT(req("PUT", { name: "Kettle", interested_in_local_artists: true }));
    expect(written()).toHaveProperty("interested_in_local_artists", true);
  });

  it("omits a field the caller did not send", async () => {
    await PUT(req("PUT", { name: "Kettle" }));
    expect(Object.keys(written())).toEqual(["name"]);
  });

  it("still requires authentication", async () => {
    authMock.mockResolvedValue({ user: null, error: new Response(null, { status: 401 }) });
    const res = await PUT(req("PUT", { name: "Kettle" }));
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/venue-profile mass-assignment (E45)", () => {
  it("drops every server-owned field on the general-update branch", async () => {
    const res = await PATCH(req("PATCH", SERVER_OWNED_BODY));

    expect(res.status).toBe(200);
    const payload = written();
    expect(payload.description).toBe("A legitimate edit");
    for (const key of FORBIDDEN) {
      expect(payload, `${key} reached the DB payload`).not.toHaveProperty(key);
    }
  });

  it("leaves the ensureProfile self-heal branch alone", async () => {
    // A6 says explicitly to leave ensureVenueProfile untouched. It has its own
    // queries and legitimately writes user_id and slug, so it must not be routed
    // through the allowlist.
    adminMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "v1", slug: "kettle" } }) }),
        }),
      }),
    });

    await PATCH(req("PATCH", { ensureProfile: true }));

    expect(upsertMock, "the self-heal path must not go through upsertVenueProfile").not.toHaveBeenCalled();
  });

  it("treats the legacy adoptIfOrphan alias the same way", async () => {
    adminMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "v1", slug: "kettle" } }) }),
        }),
      }),
    });
    await PATCH(req("PATCH", { adoptIfOrphan: true }));
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
