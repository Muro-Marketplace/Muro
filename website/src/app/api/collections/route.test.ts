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

// Size tiers (2026-09-05). A collection can optionally be sold in several
// sizes, each with its own price and its own pinned size per work. The route
// is the gate: a tier set that reaches the column has already been validated,
// because the tier LABEL is what checkout re-prices against.
describe("collection size tiers", () => {
  beforeEach(() => {
    isFlagOnMock.mockReturnValue(false);
  });

  const tiers = [
    {
      label: "Small",
      price: 120,
      description: "A4 prints",
      workSizes: [
        { workId: "w_1", sizeLabel: "A4" },
        { workId: "w_2", sizeLabel: "A4" },
      ],
    },
    {
      label: "Large",
      price: 480,
      workSizes: [
        { workId: "w_1", sizeLabel: "A2" },
        { workId: "w_2", sizeLabel: "50x70cm" },
      ],
    },
  ];

  it("persists the tiers to size_tiers on create", async () => {
    const res = await POST(req("POST", { ...baseBody, sizeTiers: tiers }));
    expect(res.status).toBe(200);
    expect(upsertMock.mock.calls[0][0].size_tiers).toEqual(tiers);
  });

  it("persists the tiers on update", async () => {
    const res = await PATCH(req("PATCH", { id: "alice-collection-1", ...baseBody, sizeTiers: tiers }));
    expect(res.status).toBe(200);
    expect(updateMock.mock.calls[0][0].size_tiers).toEqual(tiers);
  });

  it("writes an empty array when no tiers are sent, keeping the collection untiered", async () => {
    const res = await POST(req("POST", baseBody));
    expect(res.status).toBe(200);
    expect(upsertMock.mock.calls[0][0].size_tiers).toEqual([]);
  });

  it("returns the tiers to the client so the editor can round-trip them", async () => {
    const res = await POST(req("POST", { ...baseBody, sizeTiers: tiers }));
    const body = await res.json();
    expect(body.collection.sizeTiers).toEqual(tiers);
  });

  it("rejects two tiers sharing a name, and writes nothing", async () => {
    const res = await POST(
      req("POST", {
        ...baseBody,
        sizeTiers: [
          { label: "Small", price: 120, workSizes: [] },
          { label: "small", price: 480, workSizes: [] },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(upsertMock, "a rejected tier set still reached the database").not.toHaveBeenCalled();
  });

  it("rejects a tier with no price, and writes nothing", async () => {
    const res = await POST(
      req("POST", { ...baseBody, sizeTiers: [{ label: "Small", workSizes: [] }] }),
    );
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid tier set on update too", async () => {
    const res = await PATCH(
      req("PATCH", {
        id: "alice-collection-1",
        ...baseBody,
        sizeTiers: [{ label: "", price: 120, workSizes: [] }],
      }),
    );
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("drops a pinned size naming a work that is not in the collection", async () => {
    const res = await POST(
      req("POST", {
        ...baseBody,
        sizeTiers: [
          {
            label: "Small",
            price: 120,
            workSizes: [
              { workId: "w_1", sizeLabel: "A4" },
              { workId: "w_gone", sizeLabel: "A4" },
            ],
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertMock.mock.calls[0][0].size_tiers[0].workSizes).toEqual([
      { workId: "w_1", sizeLabel: "A4" },
    ]);
  });

  it("leaves bundle_price for the database trigger rather than computing it here", async () => {
    // AGENTS.md bans a derived column written only by application code. The
    // cheapest-tier sync lives in the migration 138 trigger, so this route must
    // not also compute it, or the two can disagree.
    const res = await POST(req("POST", { ...baseBody, bundlePrice: "", sizeTiers: tiers }));
    expect(res.status).toBe(200);
    expect(upsertMock.mock.calls[0][0].bundle_price).toBeNull();
  });
});
