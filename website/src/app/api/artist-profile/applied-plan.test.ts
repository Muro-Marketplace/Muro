/**
 * GET /api/artist-profile carries the plan chosen at application
 * (appliedPlan) so the billing page can open with it preselected, but only
 * while there is no live subscription.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, getProfileMock, appliedPlanMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getProfileMock: vi.fn(),
  appliedPlanMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/db/artist-profiles", () => ({
  getArtistProfileByUserId: getProfileMock,
  upsertArtistProfile: vi.fn(),
}));
vi.mock("@/lib/db/artist-works", () => ({ getWorksByArtistProfileId: vi.fn() }));
vi.mock("@/lib/geocode", () => ({ geocodePostcode: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/db/artist-applications", () => ({ getAppliedPlanByEmail: appliedPlanMock }));

import { GET } from "./route";

const req = () => new Request("http://localhost/api/artist-profile");

describe("GET /api/artist-profile appliedPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "u1", email: "Artist@Example.com" } });
  });

  it("returns the applied plan when the artist has no subscription yet", async () => {
    getProfileMock.mockResolvedValue({ profile: { id: "p1", subscription_status: "none" }, works: [] });
    appliedPlanMock.mockResolvedValue("core");
    const res = await GET(req());
    const json = await res.json();
    expect(json.appliedPlan).toBe("core");
    expect(appliedPlanMock).toHaveBeenCalledWith("Artist@Example.com");
  });

  it("does not look it up once a subscription is live", async () => {
    getProfileMock.mockResolvedValue({ profile: { id: "p1", subscription_status: "trialing" }, works: [] });
    const res = await GET(req());
    const json = await res.json();
    expect(json.appliedPlan).toBeNull();
    expect(appliedPlanMock).not.toHaveBeenCalled();
  });

  it("is null when nothing is on file", async () => {
    getProfileMock.mockResolvedValue({ profile: { id: "p1", subscription_status: null }, works: [] });
    appliedPlanMock.mockResolvedValue(null);
    const res = await GET(req());
    expect((await res.json()).appliedPlan).toBeNull();
  });
});
