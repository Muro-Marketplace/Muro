// 09 item 3.2. There was no resend-verification path anywhere — `.resend(` had
// zero hits in src/. A user who lost the confirmation mail could not log in,
// could not sign up again (the address is taken), and had nothing to click. That
// kills signups silently, which is the worst way for it to happen: nothing about
// it surfaces as an error.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resendMock, rateLimitMock } = vi.hoisted(() => ({
  resendMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: { resend: resendMock } } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: rateLimitMock }));

import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function fingerprint(res: Response) {
  return { status: res.status, body: await res.text() };
}

beforeEach(() => {
  resendMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue(null);
  resendMock.mockResolvedValue({ data: {}, error: null });
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.wallplace.co.uk";
});

describe("POST /api/auth/resend-verification", () => {
  it("asks Supabase to resend the signup confirmation", async () => {
    const res = await POST(post({ email: "Sam@Example.com" }));

    expect(res.status).toBe(200);
    expect(resendMock).toHaveBeenCalledTimes(1);
    expect(resendMock.mock.calls[0][0]).toMatchObject({
      type: "signup",
      email: "Sam@Example.com",
    });
  });

  it("builds the redirect from our own origin, not from the caller", async () => {
    await POST(post({ email: "sam@example.com", next: "//evil.example/steal" }));

    const { options } = resendMock.mock.calls[0][0];
    expect(options.emailRedirectTo.startsWith("https://www.wallplace.co.uk/login")).toBe(true);
    expect(options.emailRedirectTo).not.toContain("evil.example");
  });

  it("keeps a legitimate in-app next", async () => {
    await POST(post({ email: "sam@example.com", next: "/artist-portal" }));
    expect(resendMock.mock.calls[0][0].options.emailRedirectTo).toBe(
      "https://www.wallplace.co.uk/login?next=%2Fartist-portal",
    );
  });
});

describe("the endpoint is not an account-existence oracle", () => {
  it("answers identically for an unknown address and a real one", async () => {
    const real = await fingerprint(await POST(post({ email: "real@example.com" })));

    resendMock.mockResolvedValue({ data: null, error: { message: "User not found" } });
    const unknown = await fingerprint(await POST(post({ email: "nobody@example.com" })));

    expect(unknown).toEqual(real);
    expect(unknown.status).toBe(200);
  });

  it("answers identically for an already-confirmed account", async () => {
    const unconfirmed = await fingerprint(await POST(post({ email: "a@example.com" })));

    resendMock.mockResolvedValue({
      data: null,
      error: { message: "Email address already confirmed" },
    });
    const confirmed = await fingerprint(await POST(post({ email: "b@example.com" })));

    expect(confirmed).toEqual(unconfirmed);
  });

  it("never leaks Supabase's message into the response", async () => {
    resendMock.mockResolvedValue({ data: null, error: { message: "User not found" } });
    const body = await (await POST(post({ email: "nobody@example.com" }))).text();
    expect(body).not.toContain("User not found");
    expect(body).not.toContain("not found");
  });
});

describe("guard rails", () => {
  it("is rate limited, because it mails an address the caller names", async () => {
    // Without a limit this is a mail-bombing tool pointed at anyone.
    rateLimitMock.mockResolvedValue(new Response(null, { status: 429 }));

    const res = await POST(post({ email: "victim@example.com" }));

    expect(res.status).toBe(429);
    expect(resendMock).not.toHaveBeenCalled();
  });

  it("uses a tighter limit than the ordinary auth forms", async () => {
    await POST(post({ email: "sam@example.com" }));
    const [, limit, windowMs] = rateLimitMock.mock.calls[0];
    expect(limit).toBeLessThanOrEqual(3);
    expect(windowMs).toBeGreaterThanOrEqual(300_000);
  });

  it("rejects a malformed address without sending anything", async () => {
    const res = await POST(post({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(resendMock).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const bad = new Request("http://localhost/api/auth/resend-verification", {
      method: "POST",
      body: "nonsense",
    });
    expect((await POST(bad)).status).toBe(400);
    expect(resendMock).not.toHaveBeenCalled();
  });
});
