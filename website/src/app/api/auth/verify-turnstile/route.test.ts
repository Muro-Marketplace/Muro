// The CAPTCHA route fails OPEN when its key is missing, and in production it
// used to do that silently.
//
// That is the shape of E1: a missing RESEND_API_KEY dropped every email for a
// week with no signal, and 09 §A.6 answered it with three layers. The equivalent
// here is deliberately NOT a hard fail — refusing every signup because a CAPTCHA
// key is missing trades a spam problem for a total outage of the signup funnel,
// and nothing in this repo can see whether the key is set in production. So the
// bypass stays, and it is now loud and externally observable. Whether to make it
// a hard fail is owner decision 21, and these tests pin the current answer so
// the decision is visible rather than implied.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/client-ip", () => ({ getClientIp: () => "1.2.3.4", UNKNOWN_IP: "unknown" }));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/auth/verify-turnstile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let errors: string[] = [];

beforeEach(() => {
  errors = [];
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.VERCEL_ENV;
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(" "));
  });
});

describe("POST /api/auth/verify-turnstile with no key", () => {
  it("waves the request through, so dev and preview still work", async () => {
    const res = await POST(req({ token: "anything" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, bypass: true });
  });

  it("says nothing outside production", async () => {
    await POST(req({ token: "anything" }));
    expect(errors).toEqual([]);
  });

  it("logs an ERROR in production, because bot protection is then OFF", async () => {
    // THE regression. This used to be indistinguishable from a working CAPTCHA:
    // same 200, same body, no log line.
    process.env.VERCEL_ENV = "production";

    await POST(req({ token: "anything" }));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/TURNSTILE_SECRET_KEY is UNSET IN PRODUCTION/);
  });

  it("flags the bypass in the RESPONSE, so a monitor can see it from outside", async () => {
    // A log line only helps someone reading logs. E1's lesson is that nobody is.
    process.env.VERCEL_ENV = "production";
    const body = await (await POST(req({ token: "anything" }))).json();
    expect(body.bypass).toBe(true);
  });

  it("still rejects a malformed body", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/verify-turnstile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("still requires a token", async () => {
    expect((await POST(req({}))).status).toBe(400);
  });
});

describe("POST /api/auth/verify-turnstile with a key", () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
  });

  it("rejects the dev bypass token, which is the whole point of having one", async () => {
    // The client widget emits "dev-bypass" when it has no site key. Accepting it
    // once a real secret is configured would make the CAPTCHA opt-out.
    const res = await POST(req({ token: "dev-bypass" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bypass/i);
  });

  it("does not report a bypass when the key is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }))));

    const body = await (await POST(req({ token: "real-token" }))).json();

    expect(body.bypass).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
