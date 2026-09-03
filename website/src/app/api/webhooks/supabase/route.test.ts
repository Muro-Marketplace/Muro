// The Supabase auth webhook receiver. Its `auth.suspicious_login` branch was
// dead code: Supabase emits no such event and nothing else ever produced one,
// so the `account_suspicious_login` template it rendered had no live sender.
// The branch is gone; the route still verifies the signature and acknowledges
// every event without sending anything. These pin both halves.

import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("the webhook must not need a database client");
  },
}));

import { POST } from "./route";

const SECRET = "test-webhook-secret";

function signed(body: string, secret = SECRET): Request {
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return new Request("http://localhost/api/webhooks/supabase", {
    method: "POST",
    headers: { "x-supabase-signature": signature, "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  process.env.SUPABASE_WEBHOOK_SECRET = SECRET;
  sendEmailMock.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST /api/webhooks/supabase", () => {
  it("rejects a request with no signature", async () => {
    const res = await POST(
      new Request("http://localhost/api/webhooks/supabase", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request signed with the wrong secret", async () => {
    const res = await POST(signed('{"type":"auth.signup"}', "not-the-secret"));
    expect(res.status).toBe(401);
  });

  it("refuses everything when no secret is configured, rather than accepting unsigned calls", async () => {
    delete process.env.SUPABASE_WEBHOOK_SECRET;
    const res = await POST(signed('{"type":"auth.signup"}'));
    expect(res.status).toBe(401);
  });

  it("400s on a signed body that is not JSON", async () => {
    const res = await POST(signed("not json"));
    expect(res.status).toBe(400);
  });

  it("acknowledges a signed event without sending anything", async () => {
    const res = await POST(signed('{"type":"auth.signup","user":{"id":"u-1"}}'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("no longer sends the suspicious-login email for the event nothing produces", async () => {
    // Fail-before: this payload rendered account_suspicious_login to whoever
    // the userId named, off an event Supabase never emits.
    const res = await POST(
      signed(
        JSON.stringify({
          type: "auth.suspicious_login",
          suspicious: { userId: "u-1", loginTime: "2026-09-04T09:00:00Z" },
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
