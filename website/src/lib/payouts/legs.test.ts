// E9 (04 §B2). The webhook resolved one fee tier from the first artist's plan,
// pooled every artist's money into one figure, and scheduled one transfer to the
// first artist. In a two-artist cart that pays artist A the money owed to B.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildArtistLegs,
  assertLegsReconcile,
  reconcilePlatformFee,
  penceToGbp,
  type ArtistLeg,
} from "./legs";

/** Rows the artist_profiles `.in("slug", …)` lookup returns. */
let profileRows: Array<Record<string, unknown>> | null = [];
let profileError: { message: string } | null = null;
let selectedColumns = "";

/** Narrow stand-in for the service-role client: buildArtistLegs only calls
 *  .from().select().in(). Cast because SupabaseClient's real surface is huge. */
const db = {
  from: () => ({
    select: (columns: string) => {
      selectedColumns = columns;
      return { in: async () => ({ data: profileRows, error: profileError }) };
    },
  }),
} as unknown as Parameters<typeof buildArtistLegs>[0];

// Active subscriptions: the discount only applies while active/trialing (D40/E52).
const ALICE = { user_id: "u-alice", slug: "alice", subscription_plan: "core", subscription_status: "active", trial_end: null }; // 15%
const BOB = { user_id: "u-bob", slug: "bob", subscription_plan: "pro", subscription_status: "active", trial_end: null }; // 15%

beforeEach(() => {
  profileRows = [ALICE, BOB];
  profileError = null;
  selectedColumns = "";
});

const noPlacements = new Map<string, { id: string; revenue_share_percent: number }>();

function build(
  cartItems: Array<{ artistSlug?: string; workId?: string; price?: number; qty?: number; quantity?: number }>,
  opts: {
    placements?: Map<string, { id: string; revenue_share_percent: number }>;
    workPlacements?: Map<string, { id: string; revenue_share_percent: number }>;
    artistShippingPence?: Record<string, number>;
    shippingTotalPence?: number;
  } = {},
) {
  return buildArtistLegs(db, {
    cartItems,
    placementByArtistSlug: opts.placements ?? noPlacements,
    placementByWorkId: opts.workPlacements,
    artistShippingPence: opts.artistShippingPence ?? {},
    shippingTotalPence: opts.shippingTotalPence ?? 0,
  });
}

const bySlug = (legs: ArtistLeg[], slug: string) => legs.find((l) => l.artistSlug === slug)!;

describe("buildArtistLegs, per-artist fee rates", () => {
  it("charges each artist their own plan rate, not the first artist's", async () => {
    // The whole finding in one assertion. £100 from Alice (core) and £100 from
    // Bob (pro); both resolve to the flat 15% (owner decision 2026-08-28), each
    // computed independently per artist rather than pooled from the first line.
    const legs = await build([
      { artistSlug: "alice", price: 100, quantity: 1 },
      { artistSlug: "bob", price: 100, quantity: 1 },
    ]);
    expect(bySlug(legs, "alice").platformFeePercent).toBe(15);
    expect(bySlug(legs, "alice").platformFeePence).toBe(1500);
    expect(bySlug(legs, "bob").platformFeePercent).toBe(15);
    expect(bySlug(legs, "bob").platformFeePence).toBe(1500);
  });

  it("pays each artist their own net, so nobody receives another's money", async () => {
    const legs = await build([
      { artistSlug: "alice", price: 100, quantity: 1 },
      { artistSlug: "bob", price: 100, quantity: 1 },
    ]);
    expect(bySlug(legs, "alice").netPence).toBe(8500);
    expect(bySlug(legs, "bob").netPence).toBe(8500);
    expect(bySlug(legs, "alice").artistUserId).toBe("u-alice");
    expect(bySlug(legs, "bob").artistUserId).toBe("u-bob");
  });

  it("gives a trialling artist a zero fee", async () => {
    profileRows = [{ ...ALICE, trial_end: new Date(Date.now() + 86_400_000).toISOString() }];
    const legs = await build([{ artistSlug: "alice", price: 50, quantity: 1 }]);
    expect(legs[0].platformFeePercent).toBe(0);
    expect(legs[0].platformFeePence).toBe(0);
    expect(legs[0].netPence).toBe(5000);
  });

  it("falls back to the default rate for an unrecognised plan", async () => {
    // 'none' is a real value in the live table and is not in PLAN_FEE_PERCENT.
    profileRows = [{ ...ALICE, subscription_plan: "none" }];
    const legs = await build([{ artistSlug: "alice", price: 20, quantity: 1 }]);
    expect(legs[0].platformFeePercent).toBe(15);
  });

  it("selects free_until, or the referral reward silently never applies here", async () => {
    // INVERTED 2026-08-28 (owner decision 10). This used to assert the select
    // NEVER names free_until, because the column did not exist and naming it
    // rejected the whole statement. Migration 115 created it as the
    // platform-owned referral window, so the hazard flipped: omitting it hands
    // platformFeePercentForArtist undefined and the 0% reward never applies on
    // the highest-volume path, with nothing failing.
    await build([{ artistSlug: "alice", price: 10, quantity: 1 }]);
    expect(selectedColumns).toContain("free_until");
    expect(selectedColumns).toContain("trial_end");
  });

  it("charges 0% for an artist inside their referral window", async () => {
    profileRows = [{
      ...ALICE,
      free_until: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    }];
    const legs = await build([{ artistSlug: "alice", price: 100, quantity: 1 }]);
    expect(legs[0].platformFeePercent).toBe(0);
    expect(legs[0].platformFeePence).toBe(0);
  });
});

describe("buildArtistLegs, aggregation", () => {
  it("merges two lines from the same artist into ONE leg", async () => {
    // stripe_transfers is UNIQUE on (order_id, recipient_user_id), so a second
    // leg for the same artist would be swallowed by the index and that artist
    // would be paid for only one of their two works.
    const legs = await build([
      { artistSlug: "alice", price: 30, quantity: 1 },
      { artistSlug: "alice", price: 20, quantity: 2 },
    ]);
    expect(legs).toHaveLength(1);
    expect(legs[0].grossPence).toBe(7000);
  });

  it("is case-insensitive on the slug", async () => {
    const legs = await build([
      { artistSlug: "Alice", price: 10, quantity: 1 },
      { artistSlug: "alice", price: 10, quantity: 1 },
    ]);
    expect(legs).toHaveLength(1);
    expect(legs[0].grossPence).toBe(2000);
  });

  it("honours qty as well as quantity", async () => {
    const legs = await build([{ artistSlug: "alice", price: 10, qty: 3 }]);
    expect(legs[0].grossPence).toBe(3000);
  });

  it("returns no legs for a cart with no artist slugs", async () => {
    expect(await build([{ price: 10, quantity: 1 }])).toEqual([]);
  });

  it("throws rather than pooling when an artist's profile is missing", async () => {
    // Silently dropping the leg would hand that artist's money to nobody, or
    // worse, leave it looking like platform revenue.
    profileRows = [ALICE];
    await expect(
      build([
        { artistSlug: "alice", price: 10, quantity: 1 },
        { artistSlug: "bob", price: 10, quantity: 1 },
      ]),
    ).rejects.toThrow(/no artist_profiles rows for bob/);
  });

  it("throws when the profile lookup itself fails", async () => {
    profileError = { message: "boom" };
    profileRows = null;
    await expect(build([{ artistSlug: "alice", price: 10, quantity: 1 }])).rejects.toThrow(
      /profile lookup failed: boom/,
    );
  });
});

describe("buildArtistLegs, venue revenue share", () => {
  it("applies each artist's own placement rate to their own lines", async () => {
    const placements = new Map([
      ["alice", { id: "p1", revenue_share_percent: 20 }],
      ["bob", { id: "p2", revenue_share_percent: 10 }],
    ]);
    const legs = await build(
      [
        { artistSlug: "alice", price: 100, quantity: 1 },
        { artistSlug: "bob", price: 100, quantity: 1 },
      ],
      { placements },
    );
    expect(bySlug(legs, "alice").venueCutPence).toBe(2000);
    expect(bySlug(legs, "bob").venueCutPence).toBe(1000);
    // Alice: 10000 - 2000 - 1500. Bob: 10000 - 1000 - 1500.
    expect(bySlug(legs, "alice").netPence).toBe(6500);
    expect(bySlug(legs, "bob").netPence).toBe(7500);
  });

  it("takes no venue cut from an artist with no placement at the venue", async () => {
    const placements = new Map([["alice", { id: "p1", revenue_share_percent: 20 }]]);
    const legs = await build(
      [
        { artistSlug: "alice", price: 100, quantity: 1 },
        { artistSlug: "bob", price: 100, quantity: 1 },
      ],
      { placements },
    );
    expect(bySlug(legs, "bob").venueCutPence).toBe(0);
  });
});

describe("buildArtistLegs, work-level placement rates (2026-08-28)", () => {
  // The owner's live find: fin-coles had 40+ placements at one venue, and a
  // sale of a work on a 3% placement paid the venue the oldest-active
  // placement's 5%. The WORK's own placement decides the rate.
  it("the sold work's own placement rate beats the artist-level fallback", async () => {
    const placements = new Map([["alice", { id: "p-old", revenue_share_percent: 5 }]]);
    const workPlacements = new Map([["w-guanaco", { id: "p-work", revenue_share_percent: 3 }]]);
    const legs = await build(
      [{ artistSlug: "alice", workId: "w-guanaco", price: 100, quantity: 1 }],
      { placements, workPlacements },
    );
    expect(bySlug(legs, "alice").venueCutPence).toBe(300);
  });

  it("two works by one artist each pay their own placement's rate", async () => {
    const placements = new Map([["alice", { id: "p-old", revenue_share_percent: 5 }]]);
    const workPlacements = new Map([
      ["w-a", { id: "p-a", revenue_share_percent: 3 }],
      ["w-b", { id: "p-b", revenue_share_percent: 30 }],
    ]);
    const legs = await build(
      [
        { artistSlug: "alice", workId: "w-a", price: 100, quantity: 1 },
        { artistSlug: "alice", workId: "w-b", price: 100, quantity: 1 },
      ],
      { placements, workPlacements },
    );
    // 3% of 10000 + 30% of 10000, aggregated on the single alice leg.
    expect(bySlug(legs, "alice").venueCutPence).toBe(300 + 3000);
  });

  it("a line whose work has no placement link falls back to the artist-level rate", async () => {
    const placements = new Map([["alice", { id: "p-old", revenue_share_percent: 5 }]]);
    const workPlacements = new Map([["w-known", { id: "p-w", revenue_share_percent: 3 }]]);
    const legs = await build(
      [
        { artistSlug: "alice", workId: "w-known", price: 100, quantity: 1 },
        { artistSlug: "alice", workId: "w-unlinked", price: 100, quantity: 1 },
      ],
      { placements, workPlacements },
    );
    expect(bySlug(legs, "alice").venueCutPence).toBe(300 + 500);
  });

  it("still reconciles to the penny with mixed per-line rates", async () => {
    const placements = new Map([["alice", { id: "p-old", revenue_share_percent: 7 }]]);
    const workPlacements = new Map([["w-a", { id: "p-a", revenue_share_percent: 13 }]]);
    const legs = await build(
      [
        { artistSlug: "alice", workId: "w-a", price: 33.33, quantity: 1 },
        { artistSlug: "alice", price: 66.67, quantity: 1 },
      ],
      { placements, workPlacements },
    );
    const leg = bySlug(legs, "alice");
    // 13% of 3333 = 433 (rounded), 7% of 6667 = 467 (rounded); per-line rounding.
    expect(leg.venueCutPence).toBe(Math.round(3333 * 0.13) + Math.round(6667 * 0.07));
    expect(leg.netPence).toBe(leg.grossPence - leg.venueCutPence - leg.platformFeePence + leg.shippingPence);
  });
});

describe("buildArtistLegs, shipping attribution", () => {
  it("gives each artist the postage for their own group", async () => {
    const legs = await build(
      [
        { artistSlug: "alice", price: 100, quantity: 1 },
        { artistSlug: "bob", price: 100, quantity: 1 },
      ],
      { artistShippingPence: { alice: 950, bob: 450 }, shippingTotalPence: 1400 },
    );
    expect(bySlug(legs, "alice").shippingPence).toBe(950);
    expect(bySlug(legs, "bob").shippingPence).toBe(450);
    // Shipping is not fee-bearing: the fee is still 15% of artwork value only.
    expect(bySlug(legs, "alice").platformFeePence).toBe(1500);
    expect(bySlug(legs, "alice").netPence).toBe(8500 + 950);
  });

  it("splits pro rata when the session predates migration 082", async () => {
    // Rows written before 082 have artist_shipping_pence '{}'. Attributing zero
    // would quietly hand the buyer's postage to the platform.
    const legs = await build(
      [
        { artistSlug: "alice", price: 300, quantity: 1 },
        { artistSlug: "bob", price: 100, quantity: 1 },
      ],
      { artistShippingPence: {}, shippingTotalPence: 1000 },
    );
    expect(bySlug(legs, "alice").shippingPence).toBe(750);
    expect(bySlug(legs, "bob").shippingPence).toBe(250);
  });

  it("scales down when no shipping was charged, as on a collection order", async () => {
    // A collection order charges no postage (amount_total - subtotal is 0) but the
    // saved map still holds what it would have cost. Paying it out would hand the
    // artists money the buyer never paid.
    const legs = await build(
      [
        { artistSlug: "alice", price: 100, quantity: 1 },
        { artistSlug: "bob", price: 100, quantity: 1 },
      ],
      { artistShippingPence: { alice: 950, bob: 450 }, shippingTotalPence: 0 },
    );
    expect(bySlug(legs, "alice").shippingPence).toBe(0);
    expect(bySlug(legs, "bob").shippingPence).toBe(0);
  });

  it("scales proportionally when the map exceeds what was charged", async () => {
    const legs = await build(
      [
        { artistSlug: "alice", price: 100, quantity: 1 },
        { artistSlug: "bob", price: 100, quantity: 1 },
      ],
      { artistShippingPence: { alice: 1000, bob: 1000 }, shippingTotalPence: 1000 },
    );
    const sum = legs.reduce((s, l) => s + l.shippingPence, 0);
    expect(sum).toBe(1000);
    expect(bySlug(legs, "alice").shippingPence).toBe(500);
  });

  it("attributes every penny of shipping, remainder included", async () => {
    // 1000p across three equal artists is 333.33 each. The remainder must land
    // somewhere deterministic rather than evaporating.
    profileRows = [ALICE, BOB, { user_id: "u-cat", slug: "cat", subscription_plan: "core", subscription_status: "active", trial_end: null }];
    const legs = await build(
      [
        { artistSlug: "alice", price: 100, quantity: 1 },
        { artistSlug: "bob", price: 100, quantity: 1 },
        { artistSlug: "cat", price: 100, quantity: 1 },
      ],
      { shippingTotalPence: 1000 },
    );
    expect(legs.reduce((s, l) => s + l.shippingPence, 0)).toBe(1000);
  });

  it("ignores a negative figure in the map", async () => {
    const legs = await build([{ artistSlug: "alice", price: 100, quantity: 1 }], {
      artistShippingPence: { alice: -500 },
      shippingTotalPence: 500,
    });
    expect(legs[0].shippingPence).toBe(500);
  });
});

describe("reconcilePlatformFee and assertLegsReconcile", () => {
  const leg = (over: Partial<ArtistLeg> = {}): ArtistLeg => ({
    artistSlug: "alice",
    artistUserId: "u-alice",
    grossPence: 10000,
    venueCutPence: 0,
    platformFeePercent: 15,
    platformFeePence: 1500,
    shippingPence: 0,
    netPence: 8500,
    ...over,
  });

  it("leaves the fee alone when the split already reconciles", () => {
    expect(
      reconcilePlatformFee({ totalPence: 10000, venuePence: 0, legs: [leg()], intendedFeePence: 1500 }),
    ).toBe(1500);
  });

  it("absorbs a residual into the platform fee, never into a leg", () => {
    // A cart line with no artistSlug contributes to the total but to no leg.
    const fee = reconcilePlatformFee({
      totalPence: 11000,
      venuePence: 0,
      legs: [leg()],
      intendedFeePence: 1500,
    });
    expect(fee).toBe(2500);
    expect(() =>
      assertLegsReconcile({ totalPence: 11000, venuePence: 0, platformFeePence: fee, legs: [leg()] }),
    ).not.toThrow();
  });

  it("logs when the residual is bigger than rounding", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reconcilePlatformFee({ totalPence: 11000, venuePence: 0, legs: [leg()], intendedFeePence: 1500 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("residual"), expect.anything());
    warn.mockRestore();
  });

  it("does not log for a one-penny rounding residual", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reconcilePlatformFee({ totalPence: 10001, venuePence: 0, legs: [leg()], intendedFeePence: 1500 });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws when the split does not reconcile", () => {
    expect(() =>
      assertLegsReconcile({ totalPence: 10000, venuePence: 0, platformFeePence: 1400, legs: [leg()] }),
    ).toThrow(/does not reconcile/);
  });

  it("reconciles a real two-artist cart with venue share and shipping, to the penny", async () => {
    const placements = new Map([["alice", { id: "p1", revenue_share_percent: 20 }]]);
    const legs = await build(
      [
        { artistSlug: "alice", price: 127.5, quantity: 1 },
        { artistSlug: "bob", price: 18.02, quantity: 3 },
      ],
      { placements, artistShippingPence: { alice: 950, bob: 675 }, shippingTotalPence: 1625 },
    );
    const subtotalPence = 12750 + 5406;
    const totalPence = subtotalPence + 1625;
    const venuePence = legs.reduce((s, l) => s + l.venueCutPence, 0);
    const fee = reconcilePlatformFee({
      totalPence,
      venuePence,
      legs,
      intendedFeePence: legs.reduce((s, l) => s + l.platformFeePence, 0),
    });
    expect(() => assertLegsReconcile({ totalPence, venuePence, platformFeePence: fee, legs })).not.toThrow();
    expect(venuePence + fee + legs.reduce((s, l) => s + l.netPence, 0)).toBe(totalPence);
  });
});

describe("penceToGbp", () => {
  it("converts exactly at two decimal places", () => {
    expect(penceToGbp(8500)).toBe(85);
    expect(penceToGbp(1)).toBe(0.01);
    expect(penceToGbp(12345)).toBe(123.45);
  });
});
