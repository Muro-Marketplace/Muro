// The one place "who is this order's buyer and artist" is answered.
//
// Both dispute paths (09 §D.1 and §D.2) need it, and the failure mode if they
// each rolled their own is quiet: one side gets told, the other does not, and
// nothing errors.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { orderParties } from "./parties";

const getUserByIdMock = vi.fn(async () => ({ data: { user: { email: "artist@x.com" } } }));
const profileMock = vi.fn(async () => ({ data: { name: "Maya Chen" } }));

function db() {
  return {
    auth: { admin: { getUserById: getUserByIdMock } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: profileMock }) }) }),
  } as never;
}

const ORDER = {
  id: "ord_1",
  buyer_email: "buyer@x.com",
  buyer_user_id: "u-buyer",
  artist_user_id: "u-artist",
  artist_slug: "maya-chen",
  shipping: { fullName: "Jo Bloggs" },
};

beforeEach(() => {
  getUserByIdMock.mockClear();
  getUserByIdMock.mockResolvedValue({ data: { user: { email: "artist@x.com" } } } as never);
  profileMock.mockClear();
  profileMock.mockResolvedValue({ data: { name: "Maya Chen" } } as never);
});

describe("orderParties", () => {
  it("returns both parties, buyer first", async () => {
    const parties = await orderParties(db(), ORDER);

    expect(parties.map((p) => p.role)).toEqual(["buyer", "artist"]);
    expect(parties.map((p) => p.email)).toEqual(["buyer@x.com", "artist@x.com"]);
  });

  it("carries each party's own user id, so preference and throttle checks apply to the right person", async () => {
    const parties = await orderParties(db(), ORDER);
    expect(parties.map((p) => p.userId)).toEqual(["u-buyer", "u-artist"]);
  });

  it("takes the buyer's first name from the shipping name", async () => {
    const [buyer] = await orderParties(db(), ORDER);
    expect(buyer.firstName).toBe("Jo");
  });

  it("takes the artist's first name from their profile, not their slug", async () => {
    const [, artist] = await orderParties(db(), ORDER);
    expect(artist.firstName).toBe("Maya");
  });

  it("falls back to the local part of the buyer's address when there is no shipping name", async () => {
    const [buyer] = await orderParties(db(), { ...ORDER, shipping: null });
    expect(buyer.firstName).toBe("buyer");
  });

  it("de-slugs rather than greeting the artist by their slug", async () => {
    // Owner-reported 2026-08-30: slugs were reaching customer-facing email.
    // This previously asserted "maya-chen", so the test had pinned the leak.
    profileMock.mockResolvedValue({ data: { name: null } } as never);
    const [, artist] = await orderParties(db(), ORDER);
    expect(artist.firstName).toBe("Maya");
    expect(artist.firstName).not.toContain("-");
  });

  it("never emits a blank first name from a whitespace-only shipping name", async () => {
    // `"  ".split(" ")[0]` is "", which reads as "Hi ," in the email body.
    const [buyer] = await orderParties(db(), { ...ORDER, shipping: { fullName: "   " } });
    expect(buyer.firstName).toBe("buyer");
  });

  it("DROPS a party with no address rather than inventing one", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { email: null } } } as never);

    const parties = await orderParties(db(), ORDER);

    expect(parties).toHaveLength(1);
    expect(parties[0].role).toBe("buyer");
    // The caller can see the length, which is the point: a dispute where only
    // one side is reachable is a fact the route should be able to notice, not
    // one papered over with a placeholder address that bounces.
  });

  it("returns just the buyer for an order with no artist attributed", async () => {
    const parties = await orderParties(db(), { ...ORDER, artist_user_id: null });

    expect(parties.map((p) => p.role)).toEqual(["buyer"]);
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });

  it("returns nothing at all rather than a half-formed party when the order has neither", async () => {
    const parties = await orderParties(db(), { id: "ord_1", buyer_email: null, artist_user_id: null });
    expect(parties).toEqual([]);
  });
});
