// E34 — the orphan factory.
//
// This unauthenticated route used to seed a venue_profiles row with
// `user_id` omitted, on a slug read straight off the RAW body
// (`body.venueSlug`). That field is not in registerVenueSchema, so it was
// never validated and never slugified: an anonymous caller could name any
// slug they liked and manufacture the ownerless row that venue-profile's
// adopt-by-slug branch would then hand to whoever claimed it in their own
// user_metadata.
//
// The seed could never actually succeed — venue_profiles.user_id is NOT NULL
// in prod, so every insert hit a 23502 that was logged and swallowed (9 live
// venues, 0 ownerless rows) — but it was the entry point for the takeover and
// it is gone. The profile is created on first verified login instead.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { anonFrom, insertMock, adminMock, notifyMock, sendEmailMock, rateLimitMock } = vi.hoisted(
  () => ({
    anonFrom: vi.fn(),
    insertMock: vi.fn(),
    adminMock: vi.fn(),
    notifyMock: vi.fn(),
    sendEmailMock: vi.fn(),
    rateLimitMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase", () => ({ supabase: { from: anonFrom } }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: adminMock }));
vi.mock("@/lib/email", () => ({ notifyAdminNewVenue: notifyMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: rateLimitMock }));
vi.mock("@/emails/templates/venue-lifecycle/VenueRegistrationConfirmation", () => ({
  VenueRegistrationConfirmation: () => null,
}));

import { POST } from "./route";

const VALID = {
  venueName: "Evil Pub",
  venueType: "Pub",
  contactName: "A Stranger",
  email: "stranger@evil.example",
  phone: "0123",
  addressLine1: "1 Nowhere Lane",
  city: "Hampton",
  postcode: "TW12 2TH",
  wallSpace: "3m x 2m",
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/register-venue", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  anonFrom.mockReset();
  insertMock.mockReset();
  adminMock.mockReset();
  notifyMock.mockReset();
  sendEmailMock.mockReset();
  rateLimitMock.mockReset();

  rateLimitMock.mockResolvedValue(null);
  insertMock.mockResolvedValue({ error: null });
  anonFrom.mockReturnValue({ insert: insertMock });
  notifyMock.mockResolvedValue(undefined);
  sendEmailMock.mockResolvedValue(undefined);
  adminMock.mockImplementation(() => {
    throw new Error("register-venue must not touch the service-role client");
  });
});

describe("POST /api/register-venue (E34: no orphan factory)", () => {
  it("never opens a service-role client", async () => {
    const res = await POST(post(VALID));

    expect(res.status).toBe(200);
    expect(adminMock, "the service-role client is the orphan factory").not.toHaveBeenCalled();
  });

  it("writes only the registration record, never venue_profiles", async () => {
    await POST(post(VALID));

    const tables = anonFrom.mock.calls.map((c) => c[0]);
    expect(tables).toEqual(["venue_registrations"]);
    expect(tables).not.toContain("venue_profiles");
  });

  it("ignores a venueSlug smuggled in on the raw body", async () => {
    // The exploit input: a slug belonging to somebody else, on a field the
    // schema does not know about.
    const res = await POST(post({ ...VALID, venueSlug: "the-copper-kettle" }));

    expect(res.status).toBe(200);
    expect(adminMock).not.toHaveBeenCalled();
    const written = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(written).not.toHaveProperty("slug");
    expect(JSON.stringify(written)).not.toContain("the-copper-kettle");
  });

  it("still records the registration the venue submitted", async () => {
    await POST(post(VALID));

    expect(insertMock.mock.calls[0][0]).toMatchObject({
      venue_name: "Evil Pub",
      venue_type: "Pub",
      contact_name: "A Stranger",
      email: "stranger@evil.example",
      city: "Hampton",
      postcode: "TW12 2TH",
      status: "pending",
    });
  });

  it("still rejects a body that fails the schema", async () => {
    const res = await POST(post({ venueName: "Only a name" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("still honours the rate limiter", async () => {
    rateLimitMock.mockResolvedValue(new Response(null, { status: 429 }));
    const res = await POST(post(VALID));
    expect(res.status).toBe(429);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
