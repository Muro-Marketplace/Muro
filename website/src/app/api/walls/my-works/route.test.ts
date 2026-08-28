// row 19 #4. The route joined placements -> artist_works on a phantom
// placements.work_id, so the placements select was rejected whole and my-works
// always returned []. placements has no work_id; the real link is the reverse FK
// artist_works.current_placement_id. This test drives the resolved-work path.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => true }));
vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: async () => ({ user: { id: "venue-1" }, error: null }),
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

import { GET } from "./route";

function req() {
  return new Request("http://localhost/api/walls/my-works");
}

const PLACEMENTS = [
  { id: "P1", work_title: "Denorm Title", work_image: "denorm.jpg", status: "active", artist_user_id: "A1", artist_slug: "alice" },
];
const WORKS = [
  { id: "W1", title: "Real Title", image: "real.jpg", dimensions: "50x50", pricing: { price: 100 }, orientation: "portrait", current_placement_id: "P1" },
];
const PROFILES = [{ user_id: "A1", name: "Alice" }];

beforeEach(() => {
  fromMock.mockReset();
  fromMock.mockImplementation((table: string) => {
    if (table === "placements") {
      return { select: () => ({ eq: () => ({ eq: async () => ({ data: PLACEMENTS, error: null }) }) }) };
    }
    if (table === "artist_works") {
      return { select: () => ({ in: async () => ({ data: WORKS, error: null }) }) };
    }
    if (table === "artist_profiles") {
      return { select: () => ({ in: async () => ({ data: PROFILES, error: null }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
});

describe("GET /api/walls/my-works (row 19 #4)", () => {
  it("resolves the placed work via artist_works.current_placement_id, with full pricing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Fail-before: the old work_id join left work undefined, so the response fell
    // back to the denormalised placement fields (id "P1", "Denorm Title", no pricing).
    expect(body.works).toHaveLength(1);
    expect(body.works[0]).toMatchObject({
      id: "W1",
      title: "Real Title",
      image: "real.jpg",
      pricing: { price: 100 },
      artistName: "Alice",
    });
  });
});
