// Two regressions pinned here.
//
// E36b — open redirect in /api/demo/login. `destinationFor` accepted any
// `next` starting with "/". That includes protocol-relative URLs:
// `new URL("//evil.example/x", "https://wallplace.co.uk/…")` resolves to
// https://evil.example/x. "/\evil.example" is also accepted and is read as a
// host by several browsers. It mattered more than a bare open redirect
// because the same response carries the demo session's tokens, so the bounce
// is credential-adjacent and starts on a wallplace.co.uk URL. This was the
// only redirect construction in the app not going through
// `@/lib/safe-redirect`; these tests pin that it does now, via the JSON
// `redirectTo` the client navigates to.
//
// A37/H10 — the demo tour could not sign anyone in. The route used to set
// httpOnly @supabase/ssr-style `sb-*` cookies, but the app has no
// @supabase/ssr dependency and no middleware; the client is plain
// supabase-js with localStorage sessions, so the cookies were never read and
// the demo visitor bounced to /login. The route now returns the session's
// access/refresh tokens as JSON for the /demo page to feed into
// `supabase.auth.setSession(...)`. These tests pin the token-bearing
// response shape and that no Set-Cookie header carries the session.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createClientMock, signInMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  signInMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

import { POST } from "./route";

const ORIGIN = "https://www.wallplace.co.uk";

function post(query: string): Request {
  return new Request(`${ORIGIN}/api/demo/login${query}`, { method: "POST" });
}

/** Where the client will navigate, straight from the JSON body. */
async function destination(res: Response): Promise<string> {
  const body = await res.clone().json();
  return body.redirectTo;
}

const ENV_KEYS = [
  "DEMO_ARTIST_EMAIL",
  "DEMO_ARTIST_PASSWORD",
  "DEMO_VENUE_EMAIL",
  "DEMO_VENUE_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.DEMO_ARTIST_EMAIL = "demo-artist@example.com";
  process.env.DEMO_ARTIST_PASSWORD = "pw";
  process.env.DEMO_VENUE_EMAIL = "demo-venue@example.com";
  process.env.DEMO_VENUE_PASSWORD = "pw";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  createClientMock.mockReset();
  signInMock.mockReset();
  signInMock.mockResolvedValue({
    data: {
      session: { access_token: "at", refresh_token: "rt", expires_in: 3600 },
    },
    error: null,
  });
  createClientMock.mockReturnValue({ auth: { signInWithPassword: signInMock } });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("POST /api/demo/login: the token-bearing response shape (A37/H10)", () => {
  it("returns the session tokens and vetted destination as JSON", async () => {
    const res = await POST(post("?role=artist"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      configured: true,
      role: "artist",
      redirectTo: "/artist-portal",
      access_token: "at",
      refresh_token: "rt",
    });
  });

  it("signs in with the venue creds for role=venue", async () => {
    const res = await POST(post("?role=venue"));
    const body = await res.json();
    expect(body.role).toBe("venue");
    expect(body.redirectTo).toBe("/venue-portal");
    expect(signInMock).toHaveBeenCalledWith({
      email: "demo-venue@example.com",
      password: "pw",
    });
  });

  it("sets NO cookies: nothing in this app reads a server-set session", async () => {
    const res = await POST(post("?role=artist"));
    // res.headers.getSetCookie() is the spec-accurate check; fall back to
    // the plain header for older runtimes.
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie")].filter(Boolean);
    expect(setCookies).toEqual([]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does not redirect; the client owns the navigation", async () => {
    const res = await POST(post("?role=artist"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("POST /api/demo/login: redirectTo cannot leave the site (E36b)", () => {
  const OFF_SITE = [
    ["protocol-relative", "//evil.example/login"],
    ["protocol-relative, triple slash", "///evil.example/login"],
    ["backslash host trick", "/\\evil.example"],
    ["absolute https", "https://evil.example/login"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>1</script>"],
    ["embedded control character", "/artist-portal\r\nLocation: https://evil.example"],
    ["relative, no leading slash", "evil.example"],
  ] as const;

  for (const [label, next] of OFF_SITE) {
    it(`refuses ${label} and falls back to the role default`, async () => {
      const res = await POST(post(`?role=artist&next=${encodeURIComponent(next)}`));

      expect(res.status).toBe(200);
      expect(await destination(res)).toBe("/artist-portal");
    });
  }

  it("uses the venue default for role=venue", async () => {
    const res = await POST(post("?role=venue&next=" + encodeURIComponent("//evil.example")));
    expect(await destination(res)).toBe("/venue-portal");
  });

  it("carries the session tokens on the very response that names the destination, which is why this matters", async () => {
    const res = await POST(post("?role=artist&next=" + encodeURIComponent("//evil.example")));
    const body = await res.json();
    expect(body.access_token).toBe("at");
    // ...and it is still pointing somewhere on this site.
    expect(body.redirectTo).toBe("/artist-portal");
  });
});

describe("POST /api/demo/login: legitimate in-app destinations still work", () => {
  it("preserves an in-app path", async () => {
    const res = await POST(post("?role=venue&next=" + encodeURIComponent("/venue-portal/settings")));
    expect(await destination(res)).toBe("/venue-portal/settings");
  });

  it("preserves a path with a query string", async () => {
    const res = await POST(post("?role=artist&next=" + encodeURIComponent("/artist-portal?tab=works")));
    expect(await destination(res)).toBe("/artist-portal?tab=works");
  });

  it("defaults by role when next is absent", async () => {
    expect(await destination(await POST(post("?role=artist")))).toBe("/artist-portal");
    expect(await destination(await POST(post("?role=venue")))).toBe("/venue-portal");
  });
});

describe("POST /api/demo/login: unchanged behaviour", () => {
  it("still 503s when the demo account is not configured", async () => {
    delete process.env.DEMO_ARTIST_EMAIL;
    const res = await POST(post("?role=artist"));
    expect(res.status).toBe(503);
    expect((await res.json()).configured).toBe(false);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("still 500s when the sign-in fails, without leaking tokens", async () => {
    signInMock.mockResolvedValue({ data: { session: null }, error: { message: "nope" } });
    const res = await POST(post("?role=artist"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.access_token).toBeUndefined();
    expect(body.refresh_token).toBeUndefined();
  });
});
