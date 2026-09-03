// Phase 2.6 audit follow-up. Locks the /api/moderation POST contract:
// validates entity_type, enforces rate limit, validates payload shape
// per type, writes to moderation_queue.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  withRateLimitMock,
  authMock,
  fromMock,
  sendAdminAlertMock,
  sendEmailMock,
  unverifiedAllowedMock,
} = vi.hoisted(() => ({
  withRateLimitMock: vi.fn(),
  authMock: vi.fn(),
  fromMock: vi.fn(),
  sendAdminAlertMock: vi.fn(async (_input: {
    idempotencyKey: string;
    subject: string;
    summary: string;
    fields?: { label: string; value: string }[];
    actionPath?: string;
    actionLabel?: string;
  }) => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
  sendEmailMock: vi.fn(async (_input: {
    idempotencyKey: string;
    template: string;
    category: string;
    to: string;
    subject: string;
    userId?: string;
    react: unknown;
    metadata?: Record<string, unknown>;
  }) => ({ ok: true as const, skipped: false as const, messageId: "m-2" })),
  unverifiedAllowedMock: vi.fn(async () => true),
}));

vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/email/unverified-recipient", () => ({
  unverifiedRecipientAllowed: unverifiedAllowedMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: withRateLimitMock,
  getIP: () => "1.2.3.4",
}));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { POST } from "./route";

beforeEach(() => {
  withRateLimitMock.mockReset();
  authMock.mockReset();
  fromMock.mockReset();
  sendAdminAlertMock.mockClear();
  sendAdminAlertMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  sendEmailMock.mockClear();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-2" });
  unverifiedAllowedMock.mockClear();
  unverifiedAllowedMock.mockResolvedValue(true);
  withRateLimitMock.mockResolvedValue(null); // allow by default
  authMock.mockResolvedValue({ user: null, error: null });
});

function chainInsertSelect(returned: unknown) {
  return {
    insert: () => ({
      select: () => ({
        maybeSingle: async () => ({ data: returned, error: null }),
      }),
    }),
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/moderation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/moderation", () => {
  it("accepts a well-formed feature_request and returns the row id", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_1" }));
    const res = await POST(
      req({
        entity_type: "feature_request",
        title: "Calendar sync",
        description: "Add iCal export so I can subscribe in Google Calendar.",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.id).toBe("mod_1");
  });

  it("accepts a feedback row with a rating", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_2" }));
    const res = await POST(
      req({
        entity_type: "feedback",
        message: "Loving the new placement panel",
        rating: 5,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects an unknown entity_type with 400", async () => {
    const res = await POST(
      req({ entity_type: "blog", title: "x", description: "y" }),
    );
    // blog is a known type but only feature_request + feedback are
    // accepted via this public endpoint (blogs go through the
    // authored editor + admin queue, not the bubble).
    expect(res.status).toBe(400);
  });

  it("rejects a too-short feedback message", async () => {
    const res = await POST(req({ entity_type: "feedback", message: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects a feature_request missing description", async () => {
    const res = await POST(
      req({ entity_type: "feature_request", title: "Idea" }),
    );
    expect(res.status).toBe(400);
  });

  it("rate-limits when withRateLimit returns a 429 response", async () => {
    const { NextResponse } = await import("next/server");
    withRateLimitMock.mockResolvedValue(
      NextResponse.json({ error: "Too many" }, { status: 429 }),
    );
    const res = await POST(
      req({
        entity_type: "feedback",
        message: "Something",
      }),
    );
    expect(res.status).toBe(429);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// Email audit, 2026-09-04. A submission went into moderation_queue and that
// was the end of it: no alert, so it sat in /admin/feedback until somebody
// thought to look, and nothing to the sender, so a submission that landed and
// one that silently failed looked identical from their side.
describe("POST /api/moderation tells the team and the sender", () => {
  const FEEDBACK = {
    entity_type: "feedback",
    message: "The placement panel is much easier now",
    rating: 5,
    contact_email: "jo@example.com",
    source_url: "https://wallplace.co.uk/venue-portal",
  };
  const REQUEST = {
    entity_type: "feature_request",
    title: "Calendar sync",
    description: "Add iCal export so I can subscribe in Google Calendar.",
    contact_email: "jo@example.com",
  };

  const alert = () => sendAdminAlertMock.mock.calls.at(-1)![0];
  const ack = () => sendEmailMock.mock.calls.at(-1)![0];

  it("alerts an admin about feedback, with the message and the page it came from", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_1" }));

    const res = await POST(req(FEEDBACK));

    expect(res.status).toBe(200);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    expect(alert().subject).toBe("New feedback (5/5)");
    expect(alert().idempotencyKey).toBe("admin_moderation_submission:mod_1");
    const values = (alert().fields ?? []).map((f) => `${f.label}: ${f.value}`).join(" | ");
    expect(values).toContain("Reference: mod_1");
    expect(values).toContain("jo@example.com");
    expect(values).toContain("much easier now");
    expect(values).toContain("venue-portal");
    expect(alert().actionPath).toBe("/admin/feedback");
  });

  it("routes a feature request to the feature-requests queue instead", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_2" }));

    await POST(req(REQUEST));

    expect(alert().subject).toBe("New feature request: Calendar sync");
    expect(alert().actionPath).toBe("/admin/feature-requests");
  });

  it("acknowledges the sender when they left an address", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_3" }));

    await POST(req(REQUEST));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(ack().template).toBe("feedback_received");
    expect(ack().to).toBe("jo@example.com");
    expect(ack().subject).toBe("Thanks for your feature request");
    expect(ack().idempotencyKey).toBe("feedback_ack:moderation:mod_3");
  });

  it("caps the acknowledgement per recipient, because an anonymous caller names the address", async () => {
    // The route's own limit is per IP; the attack this covers is many IPs
    // aimed at one inbox, the same way the contact form is protected.
    unverifiedAllowedMock.mockResolvedValue(false);
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_4" }));

    const res = await POST(req(FEEDBACK));

    // The submission is still stored and the team still told: someone being
    // flooded must not also lose the ability to send feedback.
    expect(res.status).toBe(200);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("attaches no user id to an address it has not verified", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_5" }));
    authMock.mockResolvedValue({
      user: { id: "u-1", email: "someone-else@example.com", user_metadata: {} },
      error: null,
    });

    await POST(req(FEEDBACK));

    // contact_email is free text; applying this signed-in user's preferences
    // to it would be applying them to somebody else's address.
    expect(ack().userId).toBeUndefined();
    expect(unverifiedAllowedMock).toHaveBeenCalled();
  });

  it("skips the per-recipient cap and attaches the user id for the caller's own address", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_6" }));
    authMock.mockResolvedValue({
      user: { id: "u-1", email: "Jo@Example.com", user_metadata: { display_name: "Jo Bell" } },
      error: null,
    });

    await POST(req(REQUEST));

    expect(unverifiedAllowedMock).not.toHaveBeenCalled();
    expect(ack().userId).toBe("u-1");
  });

  it("sends no acknowledgement when nobody left an address", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_7" }));

    await POST(req({ entity_type: "feedback", message: "Anonymous but useful" }));

    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("tells nobody when the row was not stored", async () => {
    fromMock.mockReturnValue({
      insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }) }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req(FEEDBACK));

    expect(res.status).toBe(500);
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("still answers ok when the mail fails, because the submission is stored", async () => {
    sendAdminAlertMock.mockRejectedValueOnce(new Error("resend down"));
    sendEmailMock.mockRejectedValueOnce(new Error("resend down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_8" }));

    const res = await POST(req(FEEDBACK));

    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("mod_8");
    errSpy.mockRestore();
  });
});
