// T3 / E6, the taking-the-money half.
//
// The route created a plain platform charge and put nothing about the split in
// the session, so the webhook had no way to know what the artist was owed. It
// also never checked whether the artist could be paid at all, so Wallplace could
// capture money for an artist with no usable Connect account.
//
// The fee percent is computed from `subscription_plan` only. Naming `free_until`
// in the select, as the plan's proposed fix does, would make PostgREST reject the
// whole statement and null the profile, and platformFeePercentForArtist defaults a
// null profile to 15%, so every artist would be silently overcharged. That exact
// bug is live on the cart path (webhooks/stripe/route.ts:203) and is recorded in
// PROGRESS.md as its own finding.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { sessionsCreateMock, fromMock, canAcceptMock, getUserMock } = vi.hoisted(() => ({
  sessionsCreateMock: vi.fn(async () => ({ url: "https://stripe.example/pay", id: "cs_1" })),
  fromMock: vi.fn(),
  canAcceptMock: vi.fn(async (): Promise<{ ok: boolean; reason?: string }> => ({ ok: true })),
  getUserMock: vi.fn(async () => ({ user: { id: "u-buyer", email: "venue@example.com" }, error: null })),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: sessionsCreateMock } } },
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/payouts/capability", () => ({ canReceivePayout: canAcceptMock }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getUserMock }));

import { POST } from "./route";

const OFFER = {
  id: "off_1",
  buyer_user_id: "u-buyer",
  buyer_email: "venue@example.com",
  artist_user_id: "u-artist",
  artist_slug: "fin-coles",
  work_ids: ["w-1"],
  collection_id: null,
  amount_pence: 3300,
  currency: "GBP",
  status: "accepted",
};

/** Columns the profile select is allowed to name, mirroring the live table. */
const LIVE_PROFILE_COLUMNS = [
  "slug", "subscription_plan", "subscription_status", "user_id", "name",
  "stripe_connect_account_id", "stripe_connect_onboarding_complete",
];

let profileSelects: string[] = [];
/** Every purchase_offers UPDATE: payload plus the .eq() filters it was scoped by. */
let offerUpdates: Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
/** Rows the artist_works `.in()` lookup returns. Default: the offer's work, on sale. */
let workRows: Array<Record<string, unknown>> = [];
/** Row the artist_collections lookup returns. */
let collectionRow: Record<string, unknown> | null = null;
/** Row the placements lookup returns for venue-share resolution (Task 5). */
let placementRow: Record<string, unknown> | null = null;

function setupDb(
  offer: Record<string, unknown> | null = OFFER,
  profile: Record<string, unknown> | null = { slug: "fin-coles", subscription_plan: "core" },
) {
  profileSelects = [];
  offerUpdates = [];
  workRows = [{ id: "w-1", title: "Sand Dunes", available: true, quantity_available: null }];
  collectionRow = null;
  placementRow = null;
  fromMock.mockImplementation((table: string) => {
    if (table === "purchase_offers") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: offer }) }) }),
        update: (payload: Record<string, unknown>) => {
          const filters: Array<[string, unknown]> = [];
          offerUpdates.push({ payload, filters });
          const chain = {
            eq: (col: string, val: unknown) => {
              filters.push([col, val]);
              return chain;
            },
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          };
          return chain;
        },
      };
    }
    if (table === "artist_works") {
      return { select: () => ({ in: async () => ({ data: workRows, error: null }) }) };
    }
    if (table === "artist_collections") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: collectionRow }) }) }),
      };
    }
    if (table === "placements") {
      // Mirrors .select(...).eq("id", …).eq("status", "active").maybeSingle():
      // both .eq() calls are stubbed through to the same fixture, since the
      // mock doesn't model WHERE-clause filtering. A test simulates "no
      // matching active placement" by setting placementRow to null.
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: placementRow }) }),
          }),
        }),
      };
    }
    if (table === "artist_profiles") {
      return {
        select: (columns: string) => {
          profileSelects.push(columns);
          // PostgREST rejects the whole statement when a column does not exist.
          const unknown = columns.split(",").map((c) => c.trim())
            .filter((c) => c && !LIVE_PROFILE_COLUMNS.includes(c));
          return {
            eq: () => ({
              maybeSingle: async () =>
                unknown.length > 0
                  ? { data: null, error: { message: `column artist_profiles.${unknown[0]} does not exist` } }
                  : { data: profile, error: null },
            }),
          };
        },
      };
    }
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
  });
}

const post = () =>
  POST(
    new Request("http://localhost/api/offers/off_1/checkout", {
      method: "POST",
      headers: { authorization: "Bearer buyer", origin: "http://localhost:3000" },
    }),
    { params: Promise.resolve({ id: "off_1" }) },
  );

/** The metadata the created session carried. */
function metadata(): Record<string, string> {
  const calls = sessionsCreateMock.mock.calls as unknown as Array<[{ metadata: Record<string, string> }]>;
  return calls[0]?.[0]?.metadata ?? {};
}

beforeEach(() => {
  sessionsCreateMock.mockClear();
  fromMock.mockReset();
  canAcceptMock.mockReset();
  canAcceptMock.mockResolvedValue({ ok: true });
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ user: { id: "u-buyer", email: "venue@example.com" }, error: null });
  setupDb();
});

describe("POST /api/offers/[id]/checkout split (E6)", () => {
  it("carries the split on the session so the webhook can write a complete order", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(metadata()).toMatchObject({
      offer_platform_fee_pence: "495",
      offer_artist_net_pence: "2805",
      offer_platform_fee_percent: "15",
    });
  });

  it("splits to the penny: fee plus net equals the amount charged", async () => {
    await post();
    const m = metadata();
    expect(Number(m.offer_platform_fee_pence) + Number(m.offer_artist_net_pence)).toBe(OFFER.amount_pence);
  });

  it("charges the flat 15% for a pro artist too, now that the ladder is gone", async () => {
    // Pro AND active — same shape as the old plan-discount check (D40/E52), but
    // the flat fee (owner decision 2026-08-28) means pro resolves to 15% like
    // every other plan rather than a lower ladder rate.
    setupDb(OFFER, { slug: "fin-coles", subscription_plan: "pro", subscription_status: "active" });
    await post();
    expect(metadata()).toMatchObject({
      offer_platform_fee_percent: "15",
      offer_platform_fee_pence: "495",
      offer_artist_net_pence: "2805",
    });
  });

  it("charges a cancelled artist the 15% default, not their old plan rate (D40/E52)", async () => {
    setupDb(OFFER, { slug: "fin-coles", subscription_plan: "pro", subscription_status: "canceled" });
    await post();
    expect(metadata()).toMatchObject({
      offer_platform_fee_percent: "15",
      // 3300 * 0.15 = 495; net 3300 - 495 = 2805.
      offer_platform_fee_pence: "495",
      offer_artist_net_pence: "2805",
    });
  });

  it("never names a column the artist_profiles table does not have", async () => {
    await post();
    expect(profileSelects.length).toBeGreaterThan(0);
    for (const columns of profileSelects) {
      expect(columns, `select names a phantom column: "${columns}"`).not.toContain("free_until");
    }
  });

  it("splits an odd amount without losing or inventing a penny", async () => {
    // 2505p at 15% is 375.75p, which must round once and leave the rest as net.
    setupDb({ ...OFFER, amount_pence: 2505 });
    await post();
    const m = metadata();
    expect(m.offer_platform_fee_pence).toBe("376");
    expect(m.offer_artist_net_pence).toBe("2129");
    expect(Number(m.offer_platform_fee_pence) + Number(m.offer_artist_net_pence)).toBe(2505);
  });

  it("puts a real email in the metadata for the NOT NULL buyer_email column", async () => {
    await post();
    expect(metadata().offer_buyer_email).toBe("venue@example.com");
  });
});

describe("POST /api/offers/[id]/checkout payout pre-flight (E6)", () => {
  it("refuses with 422 and takes no money when the artist cannot be paid out", async () => {
    canAcceptMock.mockResolvedValue({ ok: false, reason: "payouts_disabled" });
    const res = await post();
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ reason: "payouts_unavailable" });
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("refuses with 500 and takes no money when the artist profile is missing", async () => {
    setupDb(OFFER, null);
    const res = await post();
    expect(res.status).toBe(500);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("still refuses a non-buyer and a non-accepted offer before any of this", async () => {
    getUserMock.mockResolvedValue({ user: { id: "u-someone-else", email: "x@y.z" }, error: null });
    expect((await post()).status).toBe(403);

    getUserMock.mockResolvedValue({ user: { id: "u-buyer", email: "venue@example.com" }, error: null });
    setupDb({ ...OFFER, status: "pending" });
    expect((await post()).status).toBe(409);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});

// ── D7: re-validate stock before taking the money ────────────────────────────
//
// purchase_offers has no link to stock. An offer accepted on Monday could be paid
// on Friday for a work that sold through the cart on Wednesday, so the buyer paid
// for something the artist no longer had.
describe("POST /api/offers/[id]/checkout stock re-validation (D7)", () => {
  it("takes the money when every work on the offer is still on sale", async () => {
    // The guard must not close live offers: all 35 works in the live table are
    // available today, so this is the case that runs in production.
    const res = await post();
    expect(res.status).toBe(200);
    expect(offerUpdates).toHaveLength(0);
  });

  it("refuses with 409 work_sold and takes no money when a work is withdrawn", async () => {
    setupDb();
    workRows = [{ id: "w-1", title: "Sand Dunes", available: false, quantity_available: null }];
    const res = await post();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "work_sold" });
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("refuses when a work is out of stock", async () => {
    setupDb();
    workRows = [{ id: "w-1", title: "Sand Dunes", available: true, quantity_available: 0 }];
    expect((await post()).status).toBe(409);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("refuses when a work has been deleted since the offer was accepted", async () => {
    setupDb();
    workRows = []; // the .in() lookup finds nothing
    expect((await post()).status).toBe(409);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("refuses when only one work of several has sold", async () => {
    setupDb({ ...OFFER, work_ids: ["w-1", "w-2"] });
    workRows = [
      { id: "w-1", title: "A", available: true, quantity_available: null },
      { id: "w-2", title: "B", available: false, quantity_available: null },
    ];
    expect((await post()).status).toBe(409);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("treats a null quantity_available as on sale, not as zero", async () => {
    // 23 of the 35 works in the live table have it null, meaning untracked. If
    // this read null as sold out, two thirds of the catalogue would be unbuyable.
    setupDb();
    workRows = [{ id: "w-1", title: "Sand Dunes", available: true, quantity_available: null }];
    expect((await post()).status).toBe(200);
  });

  it("does not mistake a duplicated work id for a missing work", async () => {
    // work_ids is de-duplicated before the length comparison. Without that, one
    // repeated id makes found.length short and closes a perfectly live offer.
    setupDb({ ...OFFER, work_ids: ["w-1", "w-1"] });
    workRows = [{ id: "w-1", title: "Sand Dunes", available: true, quantity_available: null }];
    expect((await post()).status).toBe(200);
    expect(offerUpdates).toHaveLength(0);
  });

  it("closes the offer, and only while it is still accepted", async () => {
    setupDb();
    workRows = [{ id: "w-1", title: "Sand Dunes", available: false, quantity_available: null }];
    await post();
    expect(offerUpdates).toHaveLength(1);
    expect(offerUpdates[0].payload).toMatchObject({ status: "expired" });
    expect(offerUpdates[0].payload.updated_at).toBeTruthy();
    // The compare-and-set matters: a buyer paying in another tab has the webhook
    // set 'paid', and an unscoped update here would stamp 'expired' over it, so a
    // paid offer would stop looking paid.
    expect(offerUpdates[0].filters).toEqual([
      ["id", "off_1"],
      ["status", "accepted"],
    ]);
  });

  it("runs before the payout pre-flight, so a dead offer never reaches Stripe", async () => {
    setupDb();
    workRows = [{ id: "w-1", title: "Sand Dunes", available: false, quantity_available: null }];
    await post();
    expect(canAcceptMock).not.toHaveBeenCalled();
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  describe("collection offers, which the plan's snippet skipped entirely", () => {
    // chk_target_shape in the live table is
    //   (cardinality(work_ids) > 0 AND collection_id IS NULL)
    //   OR (cardinality(work_ids) = 0 AND collection_id IS NOT NULL)
    // so a collection offer always has an EMPTY work_ids, and the plan's
    // `if (offer.work_ids.length > 0)` guard never fired for one.
    const COLLECTION_OFFER = { ...OFFER, work_ids: [], collection_id: "col_1" };

    it("resolves the collection's works and takes the money when they are on sale", async () => {
      setupDb(COLLECTION_OFFER);
      collectionRow = { work_ids: ["w-1", "w-2"], available: true };
      workRows = [
        { id: "w-1", title: "A", available: true, quantity_available: null },
        { id: "w-2", title: "B", available: true, quantity_available: 3 },
      ];
      expect((await post()).status).toBe(200);
    });

    it("refuses when a work inside the collection has sold", async () => {
      setupDb(COLLECTION_OFFER);
      collectionRow = { work_ids: ["w-1", "w-2"], available: true };
      workRows = [
        { id: "w-1", title: "A", available: true, quantity_available: null },
        { id: "w-2", title: "B", available: true, quantity_available: 0 },
      ];
      expect((await post()).status).toBe(409);
      expect(sessionsCreateMock).not.toHaveBeenCalled();
    });

    it("refuses when the collection itself was withdrawn", async () => {
      setupDb(COLLECTION_OFFER);
      collectionRow = { work_ids: ["w-1"], available: false };
      expect((await post()).status).toBe(409);
      expect(sessionsCreateMock).not.toHaveBeenCalled();
    });

    it("refuses when the collection has been deleted", async () => {
      setupDb(COLLECTION_OFFER);
      collectionRow = null;
      expect((await post()).status).toBe(409);
      expect(sessionsCreateMock).not.toHaveBeenCalled();
    });
  });
});

// ── Task 5: venue share on offer sales (work-on-wall rule) ───────────────────
//
// A work hanging on a venue's wall earns that venue its placement share on ANY
// platform sale of the work, offers included. Resolved from the works' own
// placements (artist_works.current_placement_id), the same source of truth the
// cart path uses (payouts/legs.ts). Applies only when every offered work sits
// on ONE single ACTIVE placement with a positive share and a venue user;
// anything else (no placement, mixed placements, inactive, zero share) pays no
// venue share, matching the long-standing offer behaviour.
describe("POST /api/offers/[id]/checkout venue share (Task 5)", () => {
  it("carries the venue share in metadata when every offered work hangs on one active placement", async () => {
    setupDb({ ...OFFER, work_ids: ["w-1", "w-2"], amount_pence: 30000 });
    workRows = [
      { id: "w-1", title: "A", available: true, quantity_available: null, current_placement_id: "plc-1" },
      { id: "w-2", title: "B", available: true, quantity_available: null, current_placement_id: "plc-1" },
    ];
    placementRow = {
      id: "plc-1",
      venue_slug: "copper-kettle",
      venue_user_id: "venue-user-1",
      revenue_share_percent: 10,
      status: "active",
    };
    const res = await post();
    expect(res.status).toBe(200);
    const m = metadata();
    expect(m.offer_venue_slug).toBe("copper-kettle");
    expect(m.offer_venue_user_id).toBe("venue-user-1");
    expect(m.offer_venue_cut_pence).toBe("3000"); // 10% of 30000
    expect(m.offer_platform_fee_pence).toBe("4500"); // 15% of 30000
    expect(m.offer_artist_net_pence).toBe("22500"); // 30000 - 4500 - 3000
    expect(m.offer_venue_share_percent).toBe("10");
    // Finding 3 (final review): the resolved placement id travels with the
    // share so the webhook can stamp orders.placement_id, which is how the
    // placements list sums venue earnings onto the right placement card.
    expect(m.offer_placement_id).toBe("plc-1");
  });

  it("pays no venue share when works span two placements or none", async () => {
    setupDb({ ...OFFER, work_ids: ["w-1", "w-2"], amount_pence: 30000 });
    workRows = [
      { id: "w-1", title: "A", available: true, quantity_available: null, current_placement_id: "plc-1" },
      { id: "w-2", title: "B", available: true, quantity_available: null, current_placement_id: "plc-2" },
    ];
    const res = await post();
    expect(res.status).toBe(200);
    const m = metadata();
    expect(m.offer_venue_cut_pence).toBe("0");
    expect(m.offer_venue_slug).toBe("");
    expect(m.offer_placement_id).toBe("");
  });

  it("pays no venue share when the offered work has no placement at all", async () => {
    setupDb({ ...OFFER, work_ids: ["w-1"], amount_pence: 30000 });
    workRows = [
      { id: "w-1", title: "A", available: true, quantity_available: null, current_placement_id: null },
    ];
    const res = await post();
    expect(res.status).toBe(200);
    const m = metadata();
    expect(m.offer_venue_cut_pence).toBe("0");
    expect(m.offer_venue_slug).toBe("");
    expect(m.offer_venue_share_percent).toBe("0");
    expect(m.offer_placement_id).toBe("");
  });

  it("pays no venue share when the single shared placement is not active", async () => {
    setupDb({ ...OFFER, work_ids: ["w-1"], amount_pence: 30000 });
    workRows = [
      { id: "w-1", title: "A", available: true, quantity_available: null, current_placement_id: "plc-1" },
    ];
    // The real query filters .eq("status", "active"); a pending placement
    // never matches it, which is what this null return simulates.
    placementRow = null;
    const res = await post();
    expect(res.status).toBe(200);
    const m = metadata();
    expect(m.offer_venue_cut_pence).toBe("0");
    expect(m.offer_venue_slug).toBe("");
    expect(m.offer_placement_id).toBe("");
  });

  it("pays no venue share when the placement's revenue share is zero", async () => {
    setupDb({ ...OFFER, work_ids: ["w-1"], amount_pence: 30000 });
    workRows = [
      { id: "w-1", title: "A", available: true, quantity_available: null, current_placement_id: "plc-1" },
    ];
    placementRow = {
      id: "plc-1",
      venue_slug: "copper-kettle",
      venue_user_id: "venue-user-1",
      revenue_share_percent: 0,
      status: "active",
    };
    const res = await post();
    expect(res.status).toBe(200);
    const m = metadata();
    expect(m.offer_venue_cut_pence).toBe("0");
    expect(m.offer_venue_slug).toBe("");
    // No share (0%) means no venue earning, so no placement id either, even
    // though every work still sits on one single active placement.
    expect(m.offer_placement_id).toBe("");
  });

  it("takes the venue cut and the platform fee both from the artist's side, exactly", async () => {
    // Sum invariant: gross = fee + venueCut + artistNet, no residual penny,
    // even on an amount that does not divide evenly.
    setupDb({ ...OFFER, work_ids: ["w-1"], amount_pence: 2505 });
    workRows = [
      { id: "w-1", title: "A", available: true, quantity_available: null, current_placement_id: "plc-1" },
    ];
    placementRow = {
      id: "plc-1",
      venue_slug: "copper-kettle",
      venue_user_id: "venue-user-1",
      revenue_share_percent: 10,
      status: "active",
    };
    await post();
    const m = metadata();
    const fee = Number(m.offer_platform_fee_pence);
    const cut = Number(m.offer_venue_cut_pence);
    const net = Number(m.offer_artist_net_pence);
    expect(fee + cut + net).toBe(2505);
  });
});
