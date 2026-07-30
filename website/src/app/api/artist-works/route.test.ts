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

// ── E46a (06 B5): numeric validation at the write boundary ────────────────────
//
// The body used to be destructured raw and passed straight to upsertWork. No
// array cap on `pricing`, no per-tier price check, no lower bound on
// `quantity_available`, and an unbounded stored `shipping_price`.
//
// `pricing` is the one that reaches money: checkout recomputes unit_amount from
// the stored tier. It is defended there too (a non-positive tier falls back to
// the client price), so this was a correctness and trust problem rather than
// direct theft. Fixed at the write boundary regardless.
describe("POST /api/artist-works input validation (E46a)", () => {
  const row = () =>
    (upsertWorkMock.mock.calls as unknown as Array<[string, Record<string, unknown>]>)[0]?.[1];

  it("rejects a negative tier price instead of storing it", async () => {
    const res = await POST(req({ ...baseBody, pricing: [{ label: "A3", price: -50 }] }));
    expect(res.status).toBe(400);
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });

  it("rejects an absurd tier price", async () => {
    const res = await POST(req({ ...baseBody, pricing: [{ label: "A3", price: 5_000_000 }] }));
    expect(res.status).toBe(400);
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });

  it("caps the pricing array, so one work cannot carry hundreds of tiers", async () => {
    const pricing = Array.from({ length: 40 }, (_, i) => ({ label: `S${i}`, price: 10 }));
    const res = await POST(req({ ...baseBody, pricing }));
    expect(res.status).toBe(400);
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });

  it("rejects negative stock, which checkout would read as permanently sold", async () => {
    // checkout treats quantity_available <= 0 as sold, so a negative value makes
    // the work unbuyable forever rather than merely wrong.
    const res = await POST(req({ ...baseBody, quantityAvailable: -5 }));
    expect(res.status).toBe(400);
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });

  it("rejects a negative shipping price, which feeds calculateOrderShipping", async () => {
    const res = await POST(req({ ...baseBody, shippingPrice: -10 }));
    expect(res.status).toBe(400);
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });

  it("rejects a non-integer sort order", async () => {
    const res = await POST(req({ ...baseBody, sortOrder: 1.5 }));
    expect(res.status).toBe(400);
  });

  it("names the offending field so the portal can point at it", async () => {
    const res = await POST(req({ ...baseBody, pricing: [{ label: "A3", price: -1 }] }));
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toMatch(/pricing/);
  });

  it("still accepts a well-formed work", async () => {
    const res = await POST(
      req({
        ...baseBody,
        pricing: [{ label: "A3", price: 120 }],
        quantityAvailable: 3,
        shippingPrice: 6.5,
        sortOrder: 2,
      }),
    );
    expect(res.status).toBe(200);
    expect(row()).toMatchObject({ quantity_available: 3, shipping_price: 6.5, sort_order: 2 });
  });
});

describe("POST /api/artist-works frame options now come from the schema (E46a)", () => {
  const row = () =>
    (upsertWorkMock.mock.calls as unknown as Array<[string, Record<string, unknown>]>)[0]?.[1];

  it("rejects a negative frame uplift rather than silently flooring it", async () => {
    // The deleted sanitiser did Math.max(0, ...), which quietly turned -50 into
    // 0. Refusing is better: the artist finds out they typed a negative.
    const res = await POST(req({ ...baseBody, frameOptions: [{ label: "Oak", priceUplift: -50 }] }));
    expect(res.status).toBe(400);
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });

  it("rejects a frame with no label, which the sanitiser silently dropped", async () => {
    const res = await POST(req({ ...baseBody, frameOptions: [{ label: "   ", priceUplift: 10 }] }));
    expect(res.status).toBe(400);
  });

  it("caps frames at 20, preserving the old slice semantics", async () => {
    const frameOptions = Array.from({ length: 25 }, (_, i) => ({
      label: `F${i}`,
      priceUplift: 5,
    }));
    const res = await POST(req({ ...baseBody, frameOptions }));
    expect(res.status).toBe(400);
  });

  it("passes a valid frame through, including pricesBySize", async () => {
    const res = await POST(
      req({
        ...baseBody,
        frameOptions: [
          { label: "Oak", priceUplift: 25, pricesBySize: { A3: 30, A2: 45 } },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(row()!.frame_options).toEqual([
      { label: "Oak", priceUplift: 25, pricesBySize: { A3: 30, A2: 45 } },
    ]);
  });

  it("rejects a negative pricesBySize override", async () => {
    const res = await POST(
      req({
        ...baseBody,
        frameOptions: [{ label: "Oak", priceUplift: 25, pricesBySize: { A3: -30 } }],
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/artist-works no longer writes the phantom in_store_price (E46a / A8)", () => {
  const row = () =>
    (upsertWorkMock.mock.calls as unknown as Array<[string, Record<string, unknown>]>)[0]?.[1];

  it("omits in_store_price from the write", async () => {
    // The column exists in no migration and not in the live table, so
    // upsertWork's strip-and-retry dropped it on EVERY save: a guaranteed-failing
    // column write per request. It is absent from ARTIST_WORK_WRITABLE too.
    await POST(req(baseBody));
    expect(row()).not.toHaveProperty("in_store_price");
  });

  it("ignores a client-supplied inStorePrice rather than 400ing on it", async () => {
    // The artist portal still sends it, so rejecting the request would break
    // saving a work entirely. Accept and drop, and escalate the UI mismatch.
    const res = await POST(req({ ...baseBody, inStorePrice: 250 }));
    expect(res.status).toBe(200);
    expect(row()).not.toHaveProperty("in_store_price");
  });
});
