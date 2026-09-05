// E44: PUT /api/artist-profile spread the whole request body into a service-role
// update, so an artist could self-approve moderation, self-grant Pro, extend
// their own trial and, worst of all, set stripe_connect_account_id, which is the
// payout destination. Chained with E32 that is: steal a listing, point the payout
// at your own Connect account, and the victim's art pays you.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, upsertMock, getProfileMock, geocodeMock, adminMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  upsertMock: vi.fn(),
  getProfileMock: vi.fn(),
  geocodeMock: vi.fn(),
  adminMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/db/artist-profiles", () => ({
  getArtistProfileByUserId: getProfileMock,
  getArtistProfileRowByUserId: vi.fn(),
  upsertArtistProfile: upsertMock,
}));
vi.mock("@/lib/db/artist-works", () => ({ getWorksByArtistProfileId: vi.fn() }));
vi.mock("@/lib/geocode", () => ({ geocodePostcode: geocodeMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: adminMock }));

import { PUT } from "./route";

const USER = { id: "user-1", email: "maya@example.com" };

/** The payload upsertArtistProfile was actually called with. */
const written = (): Record<string, unknown> => upsertMock.mock.calls[0][1];

function put(body: unknown): Request {
  return new Request("http://localhost/api/artist-profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  geocodeMock.mockReset();
  adminMock.mockReset();
  authMock.mockResolvedValue({ user: USER, error: null });
  upsertMock.mockResolvedValue({ error: null });
  geocodeMock.mockResolvedValue({ lat: 51.5, lng: -0.1 });
  // Pro plan, so the theme gate does not strip theme fields.
  adminMock.mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { subscription_plan: "pro" } }) }) }),
    }),
  });
});

describe("PUT /api/artist-profile mass-assignment (E44)", () => {
  it("drops every server-owned field from the body", async () => {
    const res = await PUT(
      put({
        short_bio: "A legitimate edit",
        // moderation
        review_status: "approved",
        approved_at: "2020-01-01",
        reviewed_by: "me",
        // billing
        subscription_plan: "pro",
        subscription_status: "active",
        trial_end: "2099-01-01",
        stripe_customer_id: "cus_attacker",
        stripe_subscription_id: "sub_attacker",
        // payout destination, the one that turns theft into money
        stripe_connect_account_id: "acct_attacker",
        stripe_connect_onboarding_complete: true,
        stripe_charges_enabled: true,
        // identity and counters
        user_id: "someone-else",
        slug: "someone-elses-slug",
        id: "another-profile",
        total_sales: 9999,
        is_founding_artist: true,
      }),
    );

    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledOnce();
    const payload = written();

    expect(payload.short_bio).toBe("A legitimate edit");
    for (const forbidden of [
      "review_status",
      "approved_at",
      "reviewed_by",
      "subscription_plan",
      "subscription_status",
      "trial_end",
      "stripe_customer_id",
      "stripe_subscription_id",
      "stripe_connect_account_id",
      "stripe_connect_onboarding_complete",
      "stripe_charges_enabled",
      "user_id",
      "slug",
      "id",
      "total_sales",
      "is_founding_artist",
    ]) {
      expect(payload, `${forbidden} reached the DB payload`).not.toHaveProperty(forbidden);
    }
  });

  it("ignores an unknown field rather than passing it through", async () => {
    await PUT(put({ name: "Maya", not_a_column: "boom" }));
    expect(written()).not.toHaveProperty("not_a_column");
    expect(written().name).toBe("Maya");
  });

  it("still writes the fields an artist is allowed to change", async () => {
    await PUT(
      put({
        name: "Maya Chen",
        short_bio: "Painter",
        instagram: "@maya",
        open_to_commissions: true,
        revenue_share_percent: 30,
        default_shipping_price: 12,
        message_notifications_enabled: false,
      }),
    );
    expect(written()).toMatchObject({
      name: "Maya Chen",
      short_bio: "Painter",
      instagram: "@maya",
      open_to_commissions: true,
      revenue_share_percent: 30,
      default_shipping_price: 12,
      message_notifications_enabled: false,
    });
  });

  it("omits a field the caller did not send, so a partial edit stays partial", async () => {
    await PUT(put({ name: "Maya" }));
    expect(Object.keys(written())).toEqual(["name"]);
  });

  it("keeps the server-derived lat/lng from geocoding, ignoring any the client sent", async () => {
    await PUT(put({ postcode: "sw1a 1aa", lat: 0, lng: 0 }));
    const payload = written();
    expect(payload.postcode).toBe("SW1A 1AA");
    // Derived server-side from the postcode, not taken from the body.
    expect(payload.lat).toBe(51.5);
    expect(payload.lng).toBe(-0.1);
  });

  it("still rejects an invalid postcode", async () => {
    const res = await PUT(put({ postcode: "NOT A POSTCODE 12345" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_postcode" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("still rejects a negative shipping price", async () => {
    const res = await PUT(put({ default_shipping_price: -5 }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_shipping_price" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects a negative international shipping price too", async () => {
    // Migration 081 put international_shipping_price back on the allowlist, so it
    // reaches updatePayload again and needs the same guard. A negative value here
    // would show the buyer a discount dressed up as a shipping line (G-C / Bug 10).
    const res = await PUT(put({ international_shipping_price: -5 }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_shipping_price" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("persists both shipping-scope fields the artist portal sends", async () => {
    // The toggle PUT these into columns that did not exist, so pickWritable had to
    // drop them and the artist's answer vanished on every save.
    await PUT(put({
      default_shipping_price: 6.5,
      ships_internationally: true,
      international_shipping_price: 19.95,
    }));
    expect(written()).toMatchObject({
      ships_internationally: true,
      international_shipping_price: 19.95,
    });
  });

  it("still strips profile_theme for a plan that cannot customise, but leaves label_theme (2026-09-02: label colour is free for every plan)", async () => {
    adminMock.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { subscription_plan: "core" } }) }) }),
      }),
    });
    await PUT(put({ name: "Maya", profile_theme: "midnight", label_theme: "dark" }));
    const payload = written();
    expect(payload).not.toHaveProperty("profile_theme");
    expect(payload.label_theme).toBe("dark");
    expect(payload.name).toBe("Maya");
  });

  it("does not look up the artist's plan when only label_theme is sent, nothing is gated so there's nothing to check", async () => {
    await PUT(put({ label_theme: "warm" }));
    expect(adminMock).not.toHaveBeenCalled();
    expect(written().label_theme).toBe("warm");
  });

  it("still requires authentication", async () => {
    const denied = new Response(null, { status: 401 });
    authMock.mockResolvedValue({ user: null, error: denied });
    const res = await PUT(put({ name: "Maya" }));
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
