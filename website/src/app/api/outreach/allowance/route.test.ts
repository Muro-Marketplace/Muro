// GET /api/outreach/allowance — the number the request form shows before an
// artist types anything. The cap itself is tested in src/lib/outreach-cap.test.ts;
// this covers the endpoint's own contract: auth, the non-artist case, and the
// JSON shape (Infinity is not representable, so unlimited is null + a flag).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, fromMock, usageMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  fromMock: vi.fn(),
  usageMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/outreach-cap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/outreach-cap")>();
  return { ...actual, getArtistOutreachUsage: usageMock };
});

import { GET } from "./route";

/** artist_profiles lookup returning (or not) a profile row. */
function mockProfile(row: { user_id: string } | null) {
  fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
  });
}

function usage(over: Partial<Awaited<ReturnType<typeof import("@/lib/outreach-cap").getArtistOutreachUsage>>> = {}) {
  return {
    plan: "core",
    planName: "Core",
    limit: 3,
    used: 1,
    remaining: 2,
    nextSlotAt: null,
    conversationsInWindow: new Set<string>(),
    spentAt: [],
    ...over,
  };
}

const req = () => new Request("http://localhost/api/outreach/allowance");

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u-art" }, error: null });
});

describe("GET /api/outreach/allowance", () => {
  it("returns the artist's remaining allowance", async () => {
    mockProfile({ user_id: "u-art" });
    usageMock.mockResolvedValue(usage({ used: 1, remaining: 2 }));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      applicable: true,
      plan: "core",
      planName: "Core",
      limit: 3,
      used: 1,
      remaining: 2,
      unlimited: false,
      windowDays: 7,
    });
  });

  it("passes nextSlotAt through for a spent artist", async () => {
    mockProfile({ user_id: "u-art" });
    const at = new Date(Date.now() + 86_400_000).toISOString();
    usageMock.mockResolvedValue(usage({ used: 3, remaining: 0, nextSlotAt: at }));

    const body = await (await GET(req())).json();
    expect(body.remaining).toBe(0);
    expect(body.nextSlotAt).toBe(at);
  });

  it("reports applicable:false for a viewer with no artist profile", async () => {
    // Venues aren't capped. The form hides the line rather than erroring.
    mockProfile(null);

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applicable: false });
    expect(usageMock).not.toHaveBeenCalled();
  });

  it("expresses an unlimited plan as null + the flag, since JSON has no Infinity", async () => {
    mockProfile({ user_id: "u-art" });
    usageMock.mockResolvedValue(
      usage({ limit: -1, used: 40, remaining: Number.POSITIVE_INFINITY }),
    );

    const body = await (await GET(req())).json();
    expect(body.unlimited).toBe(true);
    expect(body.limit).toBeNull();
    expect(body.remaining).toBeNull();
  });

  it("refuses an unauthenticated caller", async () => {
    authMock.mockResolvedValue({
      user: null,
      error: new Response(null, { status: 401 }),
    });

    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
