// D15: collections used to publish live with no subscription gate, so an
// unsubscribed artist could bypass the works paywall via a bundle. These
// tests pin the same B2/C2 semantics as /api/artist-works: 402 on an
// explicit publish attempt, default-to-draft when the flag is omitted, and
// a no-op when GATING_V1 is off.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  authMock,
  isFlagOnMock,
  isSubscribedMock,
  upsertMock,
  updateMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  isFlagOnMock: vi.fn(),
  isSubscribedMock: vi.fn(),
  upsertMock: vi.fn(),
  updateMock: vi.fn(),
}));

// A minimal chainable stand-in for the two query shapes this route uses:
//   from("artist_profiles").select().eq().single()
//   from("artist_collections").upsert().select().single()
//   from("artist_collections").update().eq().eq().select().single()
const PROFILE = { id: "ap_1", slug: "alice" };
const ROW_DEFAULTS = {
  id: "alice-collection-1",
  artist_id: "ap_1",
  artist_slug: "alice",
  description: null,
  bundle_price: null,
  work_ids: [],
  work_sizes: [],
  thumbnail: null,
  banner_image: null,
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: null,
};

function makeDb() {
  return {
    from: (table: string) => {
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: PROFILE, error: null }),
            }),
          }),
        };
      }
      return {
        upsert: (row: Record<string, unknown>, opts: unknown) => {
          upsertMock(row, opts);
          return {
            select: () => ({
              single: async () => ({ data: { ...ROW_DEFAULTS, ...row }, error: null }),
            }),
          };
        },
        update: (row: Record<string, unknown>) => {
          updateMock(row);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { ...ROW_DEFAULTS, ...row }, error: null }),
                }),
              }),
            }),
          };
        },
      };
    },
  };
}

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => makeDb() }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
vi.mock("@/lib/subscriptions", () => ({ isSubscribed: isSubscribedMock }));

import { POST, PATCH } from "./route";

beforeEach(() => {
  authMock.mockReset();
  isFlagOnMock.mockReset();
  isSubscribedMock.mockReset();
  upsertMock.mockReset();
  updateMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u-artist" }, error: null });
});

function req(method: "POST" | "PATCH", body: unknown): Request {
  return new Request("http://localhost/api/collections", {
    method,
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  name: "Landscapes",
  workIds: ["w_1", "w_2"],
  bundlePrice: "300",
  available: true,
};

describe("POST /api/collections — D15 publish gate", () => {
  it("returns 402 with subscription_required when GATING_V1 on + not subscribed + available=true", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: false, plan: null, user_type: "artist" });

    const res = await POST(req("POST", baseBody));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("subscription_required");
    expect(body.upgrade_url).toBe("/artist-portal/billing");
    expect(upsertMock, "the collection was written despite the refusal").not.toHaveBeenCalled();
  });

  it("allows publishing when GATING_V1 on and subscription is active", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: true, plan: "core", user_type: "artist" });

    const res = await POST(req("POST", baseBody));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledOnce();
    expect(upsertMock.mock.calls[0][0].available).toBe(true);
  });

  it("is a no-op when GATING_V1 is off (flag-gated behaviour)", async () => {
    isFlagOnMock.mockReturnValue(false);

    const res = await POST(req("POST", baseBody));
    expect(res.status).toBe(200);
    expect(isSubscribedMock).not.toHaveBeenCalled();
    expect(upsertMock.mock.calls[0][0].available).toBe(true);
  });

  it("defaults an omitted available flag to draft (false) when the artist is not subscribed", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: false, plan: null, user_type: "artist" });

    const { available: _drop, ...bodyNoFlag } = baseBody;
    void _drop;
    const res = await POST(req("POST", bodyNoFlag));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledOnce();
    expect(upsertMock.mock.calls[0][0].available).toBe(false);
  });

  it("still lets a non-subscribed artist save an explicit draft (available=false)", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: false, plan: null, user_type: "artist" });

    const res = await POST(req("POST", { ...baseBody, available: false }));
    expect(res.status).toBe(200);
    expect(upsertMock.mock.calls[0][0].available).toBe(false);
  });
});

describe("PATCH /api/collections — D15 publish gate", () => {
  const patchBody = { id: "alice-collection-1", ...baseBody };

  it("returns 402 when a non-subscribed artist flips a collection to available=true", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: false, plan: null, user_type: "artist" });

    const res = await PATCH(req("PATCH", patchBody));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("subscription_required");
    expect(updateMock, "the collection was updated despite the refusal").not.toHaveBeenCalled();
  });

  it("allows the update when the subscription is active", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: true, plan: "premium", user_type: "artist" });

    const res = await PATCH(req("PATCH", patchBody));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
    expect(updateMock.mock.calls[0][0].available).toBe(true);
  });

  it("forces an omitted available flag to draft for a non-subscribed artist instead of the old publish-by-default", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: false, plan: null, user_type: "artist" });

    const { available: _drop, ...bodyNoFlag } = patchBody;
    void _drop;
    const res = await PATCH(req("PATCH", bodyNoFlag));
    expect(res.status).toBe(200);
    expect(updateMock.mock.calls[0][0].available).toBe(false);
  });

  it("is a no-op when GATING_V1 is off", async () => {
    isFlagOnMock.mockReturnValue(false);

    const res = await PATCH(req("PATCH", patchBody));
    expect(res.status).toBe(200);
    expect(isSubscribedMock).not.toHaveBeenCalled();
    expect(updateMock.mock.calls[0][0].available).toBe(true);
  });
});
