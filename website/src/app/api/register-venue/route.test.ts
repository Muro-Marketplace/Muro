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
// K1: the admin ping goes through the one pipeline now.
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: notifyMock }));
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


/**
 * Let the afterResponse task run. The handler deliberately does not await it
 * (E36d: awaiting the send is what made the two branches distinguishable by
 * latency), so without this the "not called" assertions would pass vacuously.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  anonFrom.mockReset();
  insertMock.mockReset();
  adminMock.mockReset();
  notifyMock.mockReset();
  sendEmailMock.mockReset();
  rateLimitMock.mockReset();

  rateLimitMock.mockResolvedValue(null);
  // The insert now ends `.select("id").maybeSingle()` so the sends can be
  // keyed on the registration row rather than on the bare email address
  // (email audit fix 5). insertMock still records the written row and still
  // decides the outcome, so every assertion above it is unchanged.
  insertMock.mockResolvedValue({ data: { id: "reg-1" }, error: null });
  anonFrom.mockReturnValue({
    insert: (row: unknown) => {
      const result = insertMock(row);
      return { select: () => ({ maybeSingle: async () => await result }) };
    },
  });
  notifyMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m" });
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

describe("POST /api/register-venue is not an account-existence oracle (E36d)", () => {
  it("answers a duplicate email byte-identically to a fresh registration", async () => {
    const freshRes = await POST(post(VALID));
    const fresh = { status: freshRes.status, body: await freshRes.text() };

    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const dupRes = await POST(post(VALID));
    const duplicate = { status: dupRes.status, body: await dupRes.text() };

    expect(duplicate).toEqual(fresh);
    expect(duplicate.status).toBe(200);
  });

  it("never answers 409 on a unique-constraint violation", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const res = await POST(post(VALID));
    expect(res.status).not.toBe(409);
    expect(await res.text()).not.toContain("already exists");
  });

  it("does not re-notify or re-send on a duplicate", async () => {
    // Otherwise the endpoint mails anyone whose address you can guess, and
    // spams the admin inbox on demand.
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    await POST(post(VALID));
    await flush();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("still sends both on a fresh registration", async () => {
    await POST(post(VALID));
    await flush();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
      to: "stranger@evil.example",
      template: "venue_registration_confirmation",
      // A44: registration is open, so the email is a welcome, not an
      // "application under review".
      subject: "Your venue is registered on Wallplace",
    });
  });

  it("still surfaces a genuine database failure as a 500", async () => {
    insertMock.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    const res = await POST(post(VALID));
    await flush();
    expect(res.status).toBe(500);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // Email audit 2026-09-03 (fix 5). Both sends were keyed on the bare email
  // address, so a person registering a SECOND venue with the same contact
  // address was swallowed by the idempotency guard for ever: no confirmation
  // to them, no alert to the team, and no record that anything was dropped.
  it("keys both sends on the registration row, not on the email address", async () => {
    await POST(post(VALID));
    await flush();

    expect(notifyMock.mock.calls[0][0].idempotencyKey).toBe("admin_new_venue:reg-1");
    expect(sendEmailMock.mock.calls[0][0].idempotencyKey).toBe(
      "venue_registration_confirmation:reg-1",
    );
  });

  it("gives a second registration from the same address its own keys", async () => {
    await POST(post(VALID));
    await flush();
    insertMock.mockResolvedValue({ data: { id: "reg-2" }, error: null });
    await POST(post({ ...VALID, venueName: "Their Second Pub" }));
    await flush();

    const keys = sendEmailMock.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toEqual([
      "venue_registration_confirmation:reg-1",
      "venue_registration_confirmation:reg-2",
    ]);
  });

  it("falls back to a unique key when the insert returns no row", async () => {
    // Unreachable in practice (the insert succeeded), but a shared key here
    // would silently reinstate the swallowing this fix removes.
    insertMock.mockResolvedValue({ data: null, error: null });
    await POST(post(VALID));
    await flush();

    const key = String(sendEmailMock.mock.calls[0][0].idempotencyKey);
    expect(key).not.toBe("venue_registration_confirmation:");
    expect(key).not.toContain(VALID.email);
  });
});

describe("POST /api/register-venue keeps the 'Other' free text (A43)", () => {
  // The form's "Other" venue type has a free-text description. The schema
  // used to strip it, so the venue's own words were silently discarded.
  // There is no venue_registrations column for it, so it is folded into the
  // stored message instead.
  it("folds the typed venue-type description into the stored message", async () => {
    await POST(
      post({
        ...VALID,
        venueType: "Other",
        customVenueType: "Coffee roastery",
        message: "We have three walls.",
      }),
    );

    const written = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(written.venue_type).toBe("Other");
    expect(written.message).toBe("Venue type: Coffee roastery.\n\nWe have three walls.");
  });

  it("stores the description alone when no message was written", async () => {
    await POST(post({ ...VALID, venueType: "Other", customVenueType: "Coffee roastery" }));

    const written = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(written.message).toBe("Venue type: Coffee roastery.");
  });

  it("ignores a custom description when the type is not Other", async () => {
    await POST(post({ ...VALID, customVenueType: "smuggled", message: "Hello" }));

    const written = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(written.venue_type).toBe("Pub");
    expect(written.message).toBe("Hello");
  });

  it("names the described type in the admin alert", async () => {
    await POST(post({ ...VALID, venueType: "Other", customVenueType: "Coffee roastery" }));
    await flush();

    const fields = notifyMock.mock.calls[0][0].fields as { label: string; value: string }[];
    expect(fields).toContainEqual({ label: "Type", value: "Other (Coffee roastery)" });
  });
});
