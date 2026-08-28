// E36b — open redirect in /api/demo/login.
//
// `destinationFor` accepted any `next` starting with "/". That includes
// protocol-relative URLs: `new URL("//evil.example/x", "https://wallplace.co.uk/…")`
// resolves to https://evil.example/x. "/\evil.example" is also accepted and is
// read as a host by several browsers.
//
// It mattered more than a bare open redirect because the route sets the
// `sb-*-auth-token` cookie on the same response, so the bounce is
// credential-adjacent and starts on a wallplace.co.uk URL.
//
// This was the only redirect construction in the app not going through
// `@/lib/safe-redirect`; these tests pin that it does now.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createClientMock, signInMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  signInMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

import { GET } from "./route";

const ORIGIN = "https://www.wallplace.co.uk";

function get(query: string): Request {
  return new Request(`${ORIGIN}/api/demo/login${query}`);
}

/** Where the 303 actually points, resolved the same way a browser would. */
function destination(res: Response): string {
  return new URL(res.headers.get("location")!, ORIGIN).href;
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

describe("GET /api/demo/login: the redirect cannot leave the site", () => {
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
      const res = await GET(get(`?role=artist&next=${encodeURIComponent(next)}`));

      expect(res.status).toBe(303);
      expect(destination(res)).toBe(`${ORIGIN}/artist-portal`);
      expect(destination(res).startsWith(ORIGIN + "/")).toBe(true);
    });
  }

  it("uses the venue default for role=venue", async () => {
    const res = await GET(get("?role=venue&next=" + encodeURIComponent("//evil.example")));
    expect(destination(res)).toBe(`${ORIGIN}/venue-portal`);
  });

  it("sets the auth cookie on the very response that redirects, which is why this matters", async () => {
    const res = await GET(get("?role=artist&next=" + encodeURIComponent("//evil.example")));
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("sb-proj-auth-token");
    // ...and it is still going somewhere on this site.
    expect(destination(res)).toBe(`${ORIGIN}/artist-portal`);
  });
});

describe("GET /api/demo/login: legitimate in-app destinations still work", () => {
  it("preserves an in-app path", async () => {
    const res = await GET(get("?role=venue&next=" + encodeURIComponent("/venue-portal/settings")));
    expect(destination(res)).toBe(`${ORIGIN}/venue-portal/settings`);
  });

  it("preserves a path with a query string", async () => {
    const res = await GET(get("?role=artist&next=" + encodeURIComponent("/artist-portal?tab=works")));
    expect(destination(res)).toBe(`${ORIGIN}/artist-portal?tab=works`);
  });

  it("defaults by role when next is absent", async () => {
    expect(destination(await GET(get("?role=artist")))).toBe(`${ORIGIN}/artist-portal`);
    expect(destination(await GET(get("?role=venue")))).toBe(`${ORIGIN}/venue-portal`);
  });
});

describe("GET /api/demo/login: unchanged behaviour", () => {
  it("still 503s when the demo account is not configured", async () => {
    delete process.env.DEMO_ARTIST_EMAIL;
    const res = await GET(get("?role=artist"));
    expect(res.status).toBe(503);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("still 500s when the sign-in fails", async () => {
    signInMock.mockResolvedValue({ data: { session: null }, error: { message: "nope" } });
    const res = await GET(get("?role=artist"));
    expect(res.status).toBe(500);
  });
});
