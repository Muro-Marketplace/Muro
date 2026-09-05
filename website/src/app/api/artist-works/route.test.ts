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
  rpcMock,
  deleteWorkMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getProfileMock: vi.fn(),
  getWorksMock: vi.fn(),
  upsertWorkMock: vi.fn(),
  isFlagOnMock: vi.fn(),
  isSubscribedMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  // Row 21 / migration 104: the tier cap is an atomic RPC now, not a
  // read-then-check in this route.
  rpcMock: vi.fn(),
  deleteWorkMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ rpc: rpcMock }) }));
vi.mock("@/lib/db/artist-profiles", () => ({ getArtistProfileByUserId: getProfileMock }));
vi.mock("@/lib/db/artist-works", () => ({
  getWorksByArtistProfileId: getWorksMock,
  upsertWork: upsertWorkMock,
  deleteWork: deleteWorkMock,
}));
vi.mock("@/lib/slugify", () => ({ slugify: (s: string) => s }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
vi.mock("@/lib/subscriptions", () => ({ isSubscribed: isSubscribedMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { POST } from "./route";

beforeEach(() => {
  rpcMock.mockReset();
  deleteWorkMock.mockReset();
  deleteWorkMock.mockResolvedValue({ error: null });
  // Default: the slot is granted and this is a brand-new work, which is what
  // every pre-row-21 test implicitly assumed.
  rpcMock.mockResolvedValue({
    data: [{ claimed: true, created: true, current_count: 1 }],
    error: null,
  });
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

describe("POST /api/artist-works saves regardless of membership (owner decision 2 September 2026)", () => {
  it("saves a work marked available for an unsubscribed artist and explains the marketplace rule in warnings", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: false, plan: null, user_type: "artist" });

    const res = await POST(req(baseBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(upsertWorkMock).toHaveBeenCalledOnce();
    expect(upsertWorkMock.mock.calls[0][1].available).toBe(true);
    expect(body.warnings.some((w: string) => /marketplace/.test(w))).toBe(true);
  });

  it("saves without the marketplace note when the artist is subscribed", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: true, plan: "core", user_type: "artist" });

    const res = await POST(req(baseBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(upsertWorkMock.mock.calls[0][1].available).toBe(true);
    expect((body.warnings as string[]).some((w) => /marketplace/.test(w))).toBe(false);
  });

  it("never forces a new work into a draft: an omitted flag means available", async () => {
    isFlagOnMock.mockImplementation((f: string) => f === "GATING_V1");
    isSubscribedMock.mockResolvedValue({ active: false, plan: null, user_type: "artist" });
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

describe("POST /api/artist-works: the in-store TICK BOX (migration 120)", () => {
  const row = () =>
    (upsertWorkMock.mock.calls as unknown as Array<[string, Record<string, unknown>]>)[0]?.[1];

  // Third state of this block's lifecycle. First it pinned the OMISSION of
  // in_store_price (phantom column), then decision 14 / migration 118 made it
  // pin the write, and on 2026-08-28 the owner retired the price model for a
  // tick box: availableInStore -> available_in_store, and in_store_price is
  // parsed but never forwarded again (the column keeps whatever it held).
  it("forwards availableInStore and refuses to forward the retired price", async () => {
    const res = await POST(req({ ...baseBody, availableInStore: true, inStorePrice: 250 }));
    expect(res.status).toBe(200);
    expect(row()).toMatchObject({ available_in_store: true });
    expect(row()).not.toHaveProperty("in_store_price");
  });

  it("defaults the tick box to false when the client omits it", async () => {
    await POST(req(baseBody));
    expect(row()).toMatchObject({ available_in_store: false });
    expect(row()).not.toHaveProperty("in_store_price");
  });

  it("rejects a negative price the same way the size prices are rejected", async () => {
    const res = await POST(req({ ...baseBody, inStorePrice: -1 }));
    expect(res.status).toBe(400);
  });
});

// Row 21 (supervisor D64). The artwork post-limit was a TOCTOU.
//
// The route counted the artist's works, compared to the tier cap, and inserted
// later through upsertWork. Two concurrent POSTs both read the count before
// either insert landed, so both passed a cap they should not have, and this is a
// public API: the window is reachable by anyone with a session, not just a fast
// client. Migration 104 serialises the check and the claim per artist with an
// advisory transaction lock.
describe("POST /api/artist-works post-limit is claimed atomically (row 21)", () => {
  beforeEach(() => {
    isFlagOnMock.mockReturnValue(false);
    isSubscribedMock.mockResolvedValue({ active: true });
  });

  it("decides the cap through the RPC, not by counting in the route", async () => {
    // THE regression. The count and the check now happen inside one locked
    // transaction; a route that counts for itself is racy however careful the
    // comparison is.
    await POST(req(baseBody));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe("claim_artist_work_slot");
    expect(args).toMatchObject({
      p_artist_id: "ap_1",
      p_work_id: "w_1",
      p_limit: 8, // Core tier.
    });
  });

  it("passes the caller's real tier limit, not the default", async () => {
    getProfileMock.mockResolvedValue({ profile: { id: "ap_1", subscription_plan: "pro" } });
    await POST(req(baseBody));
    expect(rpcMock.mock.calls[0][1].p_limit).toBe(50);
  });

  it("refuses with 403 when the RPC declines the slot", async () => {
    rpcMock.mockResolvedValue({
      data: [{ claimed: false, created: false, current_count: 8 }],
      error: null,
    });

    const res = await POST(req(baseBody));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("post_limit_reached");
    // The count comes from the same locked read that made the decision, so the
    // number the artist is shown cannot disagree with the one that refused them.
    expect(body.current).toBe(8);
    expect(body.limit).toBe(8);
    expect(upsertWorkMock, "the work was written despite the refusal").not.toHaveBeenCalled();
  });

  it("releases the claimed slot when the save afterwards fails", async () => {
    // The RPC claims by inserting a placeholder. Without this, a failed upload
    // would permanently consume a tier slot with a row the artist cannot see or
    // remove.
    upsertWorkMock.mockResolvedValue({
      error: { message: "boom" }, droppedColumns: [], savedRow: null, fallbackErrors: [],
    });

    const res = await POST(req(baseBody));

    expect(res.status).toBe(500);
    expect(deleteWorkMock).toHaveBeenCalledWith("w_1", "ap_1");
  });

  it("does NOT release a slot it did not claim, so an edit that fails is not deleted", async () => {
    // `created: false` means the row already existed: this is an edit. Deleting
    // it because a save failed would destroy the artist's existing work.
    rpcMock.mockResolvedValue({
      data: [{ claimed: true, created: false, current_count: 3 }],
      error: null,
    });
    upsertWorkMock.mockResolvedValue({
      error: { message: "boom" }, droppedColumns: [], savedRow: null, fallbackErrors: [],
    });

    const res = await POST(req(baseBody));

    expect(res.status).toBe(500);
    expect(deleteWorkMock, "an edit that failed to save was deleted").not.toHaveBeenCalled();
  });

  it("fails closed when the RPC itself errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    const res = await POST(req(baseBody));

    expect(res.status).toBe(500);
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });

  it("fails closed when the RPC returns nothing at all", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const res = await POST(req(baseBody));

    expect(res.status).toBe(403);
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });
});

// Regression from E46a (e53630d8). `sizePricingSchema` was declared as a bare
// {label, price}, and Zod 4 strips unknown keys, so every save dropped the
// per-size fields the portfolio form puts on each tier: `quantityAvailable`
// ("Different quantity per size"), `shippingPrice` (per-size shipping) and the
// legacy `inStorePrice`. Live rows written before E46a still carry them and the
// artwork page, cart and checkout read them, so re-saving a work silently wiped
// its per-size stock caps and delivery prices.
describe("POST /api/artist-works keeps the per-size fields on each pricing tier", () => {
  const row = () =>
    (upsertWorkMock.mock.calls as unknown as Array<[string, Record<string, unknown>]>)[0]?.[1];

  it("saves per-size stock and shipping exactly as the form sent them", async () => {
    const pricing = [
      { label: "A3", price: 120, quantityAvailable: 1, shippingPrice: 4.95 },
      { label: "A2", price: 240, quantityAvailable: 3, shippingPrice: 7.5 },
    ];
    const res = await POST(req({ ...baseBody, pricing }));
    expect(res.status).toBe(200);
    expect(row()?.pricing).toEqual(pricing);
  });

  it("keeps a legacy per-size inStorePrice so a re-save does not wipe it", async () => {
    const pricing = [{ label: "Original", price: 900, inStorePrice: 850 }];
    const res = await POST(req({ ...baseBody, pricing }));
    expect(res.status).toBe(200);
    expect(row()?.pricing).toEqual(pricing);
  });

  it("rejects negative per-size stock, which the artwork page reads as sold out", async () => {
    const res = await POST(
      req({ ...baseBody, pricing: [{ label: "A3", price: 120, quantityAvailable: -1 }] }),
    );
    expect(res.status).toBe(400);
    expect(upsertWorkMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.message).toMatch(/pricing\.0\.quantityAvailable/);
  });

  it("rejects a negative per-size shipping price, which feeds resolveLineShipping", async () => {
    const res = await POST(req({ ...baseBody, pricing: [{ label: "A3", price: 120, shippingPrice: -5 }] }));
    expect(res.status).toBe(400);
    expect(upsertWorkMock).not.toHaveBeenCalled();
  });
});
