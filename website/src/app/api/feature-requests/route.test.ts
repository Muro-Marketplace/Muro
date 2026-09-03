// POST /api/feature-requests, the public feature-request board.
//
// Email audit, 2026-09-04. A request went into the table and nobody was told:
// no alert, so it waited in /admin/feature-requests until somebody looked, and
// nothing to the person who sent it, so a request that landed and one that
// silently failed looked identical from their side.
//
// The acknowledgement is a REFLECTED send in the anonymous case: `email` on
// the body is free text. The route's own limit is per IP and the attack that
// matters is many IPs aimed at one inbox, so the per-recipient cap applies
// unless the address is the signed-in caller's own, off the token.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, authMock, sendAdminAlertMock, sendEmailMock, unverifiedAllowedMock } = vi.hoisted(
  () => ({
    fromMock: vi.fn(),
    authMock: vi.fn(),
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
  }),
);

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/email/unverified-recipient", () => ({ unverifiedRecipientAllowed: unverifiedAllowedMock }));

import { POST } from "./route";

let inserted: Record<string, unknown> | null = null;

function installDb(result: { id?: string } | null = { id: "fr-1" }, error: unknown = null) {
  inserted = null;
  fromMock.mockImplementation((table: string) => ({
    insert: (row: Record<string, unknown>) => {
      if (table !== "feature_requests") throw new Error(`unexpected table ${table}`);
      inserted = row;
      return { select: () => ({ single: async () => ({ data: result, error }) }) };
    },
  }));
}

const BODY = {
  title: "Calendar sync",
  description: "Add iCal export so I can subscribe to my placements in Google Calendar.",
  email: "jo@example.com",
  role: "venue",
  category: "portal",
};

function req(body: unknown = BODY): Request {
  return new Request("http://localhost/api/feature-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const alert = () => sendAdminAlertMock.mock.calls.at(-1)![0];
const ack = () => sendEmailMock.mock.calls.at(-1)![0];

beforeEach(() => {
  fromMock.mockReset();
  authMock.mockReset();
  sendAdminAlertMock.mockClear();
  sendAdminAlertMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  sendEmailMock.mockClear();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-2" });
  unverifiedAllowedMock.mockClear();
  unverifiedAllowedMock.mockResolvedValue(true);
  authMock.mockResolvedValue({ user: null, error: null });
  installDb();
});

describe("POST /api/feature-requests still records the request", () => {
  it("stores the request and returns its id", async () => {
    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: "fr-1" });
    expect(inserted).toMatchObject({
      title: "Calendar sync",
      email: "jo@example.com",
      role: "venue",
      category: "portal",
    });
  });

  it("rejects a submission that fails validation, before touching the database", async () => {
    const res = await POST(req({ title: "no", description: "short" }));

    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/feature-requests tells the team and the sender", () => {
  it("alerts an admin with the request and who sent it", async () => {
    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    expect(alert().subject).toBe("New feature request: Calendar sync");
    expect(alert().idempotencyKey).toBe("admin_feature_request:fr-1");
    const values = (alert().fields ?? []).map((f) => `${f.label}: ${f.value}`).join(" | ");
    expect(values).toContain("Reference: fr-1");
    expect(values).toContain("jo@example.com");
    expect(values).toContain("Role: venue");
    expect(values).toContain("iCal export");
    expect(alert().actionPath).toBe("/admin/feature-requests");
  });

  it("acknowledges the sender, keyed on the stored row", async () => {
    await POST(req());

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(ack().template).toBe("feedback_received");
    expect(ack().to).toBe("jo@example.com");
    expect(ack().category).toBe("orders_and_payouts");
    expect(ack().subject).toBe("Thanks for your feature request");
    expect(ack().idempotencyKey).toBe("feedback_ack:feature_request:fr-1");
  });

  it("caps the acknowledgement per recipient for an address nobody has verified", async () => {
    unverifiedAllowedMock.mockResolvedValue(false);

    const res = await POST(req());

    // Still stored, still alerted: someone being flooded must not also lose
    // the ability to file a request.
    expect(res.status).toBe(200);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("attaches no user id to an address that is not the caller's own", async () => {
    authMock.mockResolvedValue({
      user: { id: "u-1", email: "someone-else@example.com", user_metadata: {} },
      error: null,
    });

    await POST(req());

    expect(ack().userId).toBeUndefined();
    expect(unverifiedAllowedMock).toHaveBeenCalled();
  });

  it("skips the cap and attaches the user id when the address is the caller's own", async () => {
    authMock.mockResolvedValue({
      user: { id: "u-1", email: "Jo@Example.com", user_metadata: { display_name: "Jo Bell" } },
      error: null,
    });

    await POST(req());

    expect(unverifiedAllowedMock).not.toHaveBeenCalled();
    expect(ack().userId).toBe("u-1");
  });

  it("sends no acknowledgement when no address was given", async () => {
    await POST(req({ title: BODY.title, description: BODY.description }));

    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("tells nobody when the row was not stored", async () => {
    installDb(null, { message: "boom" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("still answers ok when the mail fails, because the request is stored", async () => {
    sendAdminAlertMock.mockRejectedValueOnce(new Error("resend down"));
    sendEmailMock.mockRejectedValueOnce(new Error("resend down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    errSpy.mockRestore();
  });
});
