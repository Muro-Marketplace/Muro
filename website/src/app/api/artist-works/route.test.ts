// Phase 2.5 B2 + C2 gating tests. Verifies that the publish gate
// returns 402 for non-subscribed artists with GATING_V1 on, and that
// the flag-off path stays a no-op.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  authMock,
  getProfileMock,
  getWorksMock,
  upsertWorkMock,
  isFlagOnMock,
  isSubscribedMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getProfileMock: vi.fn(),
  getWorksMock: vi.fn(),
  upsertWorkMock: vi.fn(),
  isFlagOnMock: vi.fn(),
  isSubscribedMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/db/artist-profiles", () => ({ getArtistProfileByUserId: getProfileMock }));
vi.mock("@/lib/db/artist-works", () => ({
  getWorksByArtistProfileId: getWorksMock,
  upsertWork: upsertWorkMock,
  deleteWork: vi.fn(),
}));
vi.mock("@/lib/slugify", () => ({ slugify: (s: string) => s }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
vi.mock("@/lib/subscriptions", () => ({ isSubscribed: isSubscribedMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { POST } from "./route";

beforeEach(() => {
  authMock.mockReset();
  getProfileMock.mockReset();
  getWorksMock.mockReset();
  upsertWorkMock.mockReset();
  isFlagOnMock.mockReset();
  isSubscribedMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u-artist" }, error: null });
  getProfileMock.mockResolvedValue({ profile: { id: "ap_1", subscription_plan: "core" } });
  getWorksMock.mockResolvedValue([]);
  upsertWorkMock.mockResolvedValue({ error: null, droppedColumns: [], savedRow: {}, fallbackErrors: [] });
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/artist-works", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  id: "w_1",
  title: "Untitled",
  image: "https://example.com/x.jpg",
  available: true,
};

describe("POST /api/artist-works — B2 publish gate", () => {
  it("returns 402 with subscription_required code when GATING_V1 on + not subscribed + available=true", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: false, plan: null, user_type: "artist" });

    const res = await POST(req(baseBody));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("subscription_required");
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });

  it("allows publishing when GATING_V1 on and subscription is active", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: true, plan: "core", user_type: "artist" });

    const res = await POST(req(baseBody));
    expect(res.status).toBe(200);
    expect(upsertWorkMock).toHaveBeenCalledOnce();
    expect(upsertWorkMock.mock.calls[0][1].available).toBe(true);
  });

  it("is a no-op when GATING_V1 is off (flag-gated behaviour)", async () => {
    isFlagOnMock.mockReturnValue(false);

    const res = await POST(req(baseBody));
    expect(res.status).toBe(200);
    expect(isSubscribedMock).not.toHaveBeenCalled();
    expect(upsertWorkMock).toHaveBeenCalledOnce();
    expect(upsertWorkMock.mock.calls[0][1].available).toBe(true);
  });
});

describe("POST /api/artist-works — C2 default-draft", () => {
  it("defaults new works to available=false when artist is not subscribed", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: false, plan: null, user_type: "artist" });

    // Caller omits `available` — server must infer false (draft).
    const { available: _drop, ...bodyNoFlag } = baseBody;
    void _drop;

    const res = await POST(req(bodyNoFlag));
    expect(res.status).toBe(200);
    expect(upsertWorkMock).toHaveBeenCalledOnce();
    expect(upsertWorkMock.mock.calls[0][1].available).toBe(false);
  });

  it("defaults new works to available=true when artist IS subscribed", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: true, plan: "premium", user_type: "artist" });

    const { available: _drop, ...bodyNoFlag } = baseBody;
    void _drop;
    const res = await POST(req(bodyNoFlag));
    expect(res.status).toBe(200);
    expect(upsertWorkMock.mock.calls[0][1].available).toBe(true);
  });
});
