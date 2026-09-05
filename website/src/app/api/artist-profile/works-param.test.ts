/**
 * GET /api/artist-profile?works=0 answers with the profile row alone.
 *
 * Every response used to carry every artist_works row (30 columns each),
 * including for the two callers that only read the avatar, review_status and
 * subscription_status, and one of those blocks the artist portal's first paint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, getProfileMock, getProfileRowMock, appliedPlanMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getProfileMock: vi.fn(),
  getProfileRowMock: vi.fn(),
  appliedPlanMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/db/artist-profiles", () => ({
  getArtistProfileByUserId: getProfileMock,
  getArtistProfileRowByUserId: getProfileRowMock,
  upsertArtistProfile: vi.fn(),
}));
vi.mock("@/lib/db/artist-works", () => ({ getWorksByArtistProfileId: vi.fn() }));
vi.mock("@/lib/geocode", () => ({ geocodePostcode: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/db/artist-applications", () => ({ getAppliedPlanByEmail: appliedPlanMock }));

import { GET } from "./route";

const PROFILE = { id: "p1", subscription_status: "none", profile_image: "avatar.png" };
const get = (qs = "") => new Request(`http://localhost/api/artist-profile${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1", email: "artist@example.com" } });
  getProfileMock.mockResolvedValue({ profile: PROFILE, works: [{ id: "w1" }, { id: "w2" }] });
  getProfileRowMock.mockResolvedValue(PROFILE);
  appliedPlanMock.mockResolvedValue("core");
});

describe("GET /api/artist-profile ?works=0", () => {
  it("skips the works query and the appliedPlan lookup", async () => {
    const json = await (await GET(get("?works=0"))).json();

    expect(getProfileRowMock).toHaveBeenCalledWith("u1");
    expect(getProfileMock).not.toHaveBeenCalled();
    expect(appliedPlanMock).not.toHaveBeenCalled();
    expect(json.profile.id).toBe("p1");
  });

  it("keeps the response shape, so works is an empty array and not missing", async () => {
    const json = await (await GET(get("?works=0"))).json();
    expect(json).toEqual({ profile: PROFILE, works: [], appliedPlan: null });
  });

  it("answers profile: null for an account with no artist_profiles row", async () => {
    getProfileRowMock.mockResolvedValue(null);
    const json = await (await GET(get("?works=0"))).json();
    expect(json.profile).toBeNull();
  });

  it("still returns the works by default", async () => {
    const json = await (await GET(get())).json();
    expect(getProfileMock).toHaveBeenCalledWith("u1");
    expect(getProfileRowMock).not.toHaveBeenCalled();
    expect(json.works).toHaveLength(2);
    expect(json.appliedPlan).toBe("core");
  });

  it("only treats the exact value 0 as opting out", async () => {
    await GET(get("?works=1"));
    expect(getProfileMock).toHaveBeenCalled();
    expect(getProfileRowMock).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller before touching the database", async () => {
    authMock.mockResolvedValue({
      user: null,
      error: new Response(null, { status: 401 }),
    });
    const res = await GET(get("?works=0"));
    expect(res.status).toBe(401);
    expect(getProfileRowMock).not.toHaveBeenCalled();
  });
});
