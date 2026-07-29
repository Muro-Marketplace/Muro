import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthzError,
  handleAuthzError,
  withAuthz,
  assertOwnsArtistProfile,
  assertApprovedArtist,
  assertOwnsWork,
  assertConversationParticipant,
  assertPlacementParty,
  assertOrderParty,
  assertVenueOwner,
  assertArtworkRequestOwner,
  assertCanViewArtworkRequest,
} from "./authz";
import { NextResponse } from "next/server";

// 01-authz-idor.md Phase A task 1.
//
// Every helper takes its db client as the last argument, so these tests inject a
// chainable fake rather than touching Supabase. Each table gets a QUEUE of
// results, because several helpers query the same table more than once (e.g.
// assertCanViewArtworkRequest tries owner, then semi_public, then invited).

type Queues = Record<string, unknown[]>;

function fakeDb(queues: Queues): SupabaseClient {
  const remaining: Queues = Object.fromEntries(
    Object.entries(queues).map(([k, v]) => [k, [...v]]),
  );

  const next = (table: string): unknown => {
    const queue = remaining[table];
    if (!queue || queue.length === 0) return null;
    return queue.shift() ?? null;
  };

  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.or = self;
    chain.contains = self;
    chain.maybeSingle = () => Promise.resolve({ data: next(table) });
    // Row-existence probes use .limit(n) and read .data.length.
    chain.limit = () => {
      const value = next(table);
      return Promise.resolve({ data: value === null ? [] : [value] });
    };
    return chain;
  };

  return { from } as unknown as SupabaseClient;
}

const ACTOR = { id: "user-1", email: "maya@example.com" };
const APPROVED = {
  id: "artist-1",
  slug: "maya-chen",
  user_id: "user-1",
  review_status: "approved",
};

/** Assert a rejection is an AuthzError with the given status, and return it. */
async function expectDenied(p: Promise<unknown>, status: 403 | 404): Promise<AuthzError> {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught, "expected the helper to throw").toBeInstanceOf(AuthzError);
  const err = caught as AuthzError;
  expect(err.status).toBe(status);
  return err;
}

describe("AuthzError", () => {
  it("survives transpilation for instanceof", () => {
    const err = new AuthzError(404, "nope", "Not found.");
    expect(err).toBeInstanceOf(AuthzError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AuthzError");
  });

  it("renders its own response with the code and message", async () => {
    const res = new AuthzError(403, "artist_profile_required", "You need one.").toResponse();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "artist_profile_required",
      message: "You need one.",
    });
  });
});

describe("handleAuthzError", () => {
  it("returns a response for an AuthzError", () => {
    const res = handleAuthzError(new AuthzError(404, "order_not_found", "Order not found."));
    expect(res?.status).toBe(404);
  });

  it("returns null for anything else, so ordinary errors keep their own handling", () => {
    expect(handleAuthzError(new Error("boom"))).toBeNull();
    expect(handleAuthzError("boom")).toBeNull();
    expect(handleAuthzError(null)).toBeNull();
    expect(handleAuthzError(undefined)).toBeNull();
  });
});

describe("withAuthz", () => {
  it("passes a successful handler through", async () => {
    const res = await withAuthz(async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });

  it("converts an AuthzError into its response", async () => {
    const res = await withAuthz(async () => {
      throw new AuthzError(404, "work_not_found", "Not yours.");
    });
    expect(res.status).toBe(404);
  });

  it("rethrows a non-AuthzError so real failures are not masked as 404s", async () => {
    await expect(
      withAuthz(async () => {
        throw new Error("db exploded");
      }),
    ).rejects.toThrow("db exploded");
  });
});

describe("assertOwnsArtistProfile", () => {
  it("returns the caller's profile", async () => {
    const db = fakeDb({ artist_profiles: [APPROVED] });
    await expect(assertOwnsArtistProfile(ACTOR, db)).resolves.toEqual(APPROVED);
  });

  it("throws 403 when the caller has no artist profile", async () => {
    // 403 not 404: the caller already knows whether they have a profile, so
    // there is nothing to enumerate.
    const db = fakeDb({ artist_profiles: [null] });
    const err = await expectDenied(assertOwnsArtistProfile(ACTOR, db), 403);
    expect(err.code).toBe("artist_profile_required");
  });
});

describe("assertApprovedArtist", () => {
  it("passes an approved artist through", async () => {
    const db = fakeDb({ artist_profiles: [APPROVED] });
    await expect(assertApprovedArtist(ACTOR, db)).resolves.toEqual(APPROVED);
  });

  it("throws 403 for pending and for rejected alike", async () => {
    for (const status of ["pending", "rejected", null]) {
      const db = fakeDb({ artist_profiles: [{ ...APPROVED, review_status: status }] });
      const err = await expectDenied(assertApprovedArtist(ACTOR, db), 403);
      expect(err.code).toBe("artist_review_pending");
    }
  });
});

describe("assertOwnsWork", () => {
  it("returns the work when it is in the caller's portfolio", async () => {
    const work = { id: "work-1", artist_id: "artist-1", title: "Study" };
    const db = fakeDb({ artist_profiles: [APPROVED], artist_works: [work] });
    await expect(assertOwnsWork(ACTOR, "work-1", db)).resolves.toEqual(work);
  });

  it("throws 404 when the work belongs to another artist (E32)", async () => {
    // The artist_id predicate is in the same query, so a non-owner sees no rows
    // rather than someone else's row.
    const db = fakeDb({ artist_profiles: [APPROVED], artist_works: [null] });
    const err = await expectDenied(assertOwnsWork(ACTOR, "victim-work", db), 404);
    expect(err.code).toBe("work_not_found");
  });
});

describe("assertConversationParticipant", () => {
  it("accepts a participant matched by user id", async () => {
    const db = fakeDb({ artist_profiles: [APPROVED], venue_profiles: [null], messages: [{ id: "m1" }] });
    await expect(
      assertConversationParticipant(ACTOR, "dm-maya-chen__the-kettle", db),
    ).resolves.toMatchObject({ conversationId: "dm-maya-chen__the-kettle" });
  });

  it("accepts a legacy row matched only by slug", async () => {
    const db = fakeDb({
      artist_profiles: [APPROVED],
      venue_profiles: [null],
      messages: [null, { id: "legacy" }],
    });
    await expect(
      assertConversationParticipant(ACTOR, "dm-maya-chen__the-kettle", db),
    ).resolves.toMatchObject({ slugs: ["maya-chen"] });
  });

  it("throws 404 for a conversation the caller is not in (E31)", async () => {
    // Ids are `dm-<slugA>__<slugB>` from public slugs, so they are guessable.
    // Participation must be proved against the message rows.
    const db = fakeDb({
      artist_profiles: [APPROVED],
      venue_profiles: [null],
      messages: [null, null],
    });
    const err = await expectDenied(
      assertConversationParticipant(ACTOR, "dm-someone__else", db),
      404,
    );
    expect(err.code).toBe("conversation_not_found");
  });

  it("rejects an empty or absurdly long id without querying", async () => {
    const db = fakeDb({});
    await expectDenied(assertConversationParticipant(ACTOR, "", db), 404);
    await expectDenied(assertConversationParticipant(ACTOR, "x".repeat(201), db), 404);
  });
});

describe("assertPlacementParty", () => {
  it("reports the artist role", async () => {
    const db = fakeDb({
      placements: [{ id: "p1", artist_user_id: "user-1", venue_user_id: "user-2", status: "pending" }],
    });
    await expect(assertPlacementParty(ACTOR, "p1", db)).resolves.toMatchObject({ role: "artist" });
  });

  it("reports the venue role", async () => {
    const db = fakeDb({
      placements: [{ id: "p1", artist_user_id: "user-9", venue_user_id: "user-1", status: "pending" }],
    });
    await expect(assertPlacementParty(ACTOR, "p1", db)).resolves.toMatchObject({ role: "venue" });
  });

  it("throws 404 for a placement the caller is not party to (E33)", async () => {
    const db = fakeDb({ placements: [null] });
    const err = await expectDenied(assertPlacementParty(ACTOR, "p-other", db), 404);
    expect(err.code).toBe("placement_not_found");
  });
});

describe("assertOrderParty", () => {
  it("reports the seller role, including a legacy slug-only order", async () => {
    const db = fakeDb({
      artist_profiles: [{ slug: "maya-chen" }],
      orders: [{ id: "o1", artist_user_id: null, artist_slug: "maya-chen", status: "paid" }],
    });
    await expect(assertOrderParty(ACTOR, "o1", {}, db)).resolves.toMatchObject({ role: "seller" });
  });

  it("reports the buyer role", async () => {
    const db = fakeDb({
      artist_profiles: [{ slug: "maya-chen" }],
      orders: [{ id: "o1", artist_user_id: "user-9", buyer_user_id: "user-1", status: "paid" }],
    });
    await expect(assertOrderParty(ACTOR, "o1", {}, db)).resolves.toMatchObject({ role: "buyer" });
  });

  it("throws 404 for someone else's order", async () => {
    const db = fakeDb({ artist_profiles: [{ slug: "maya-chen" }], orders: [null] });
    const err = await expectDenied(assertOrderParty(ACTOR, "o-other", {}, db), 404);
    expect(err.code).toBe("order_not_found");
  });

  it("does not query the artist profile when asked for buyer only", async () => {
    // as:"buyer" must not need a seller lookup, so an empty artist_profiles
    // queue is fine here.
    const db = fakeDb({ orders: [{ id: "o1", buyer_user_id: "user-1" }] });
    await expect(assertOrderParty(ACTOR, "o1", { as: "buyer" }, db)).resolves.toMatchObject({
      role: "buyer",
    });
  });
});

describe("assertVenueOwner", () => {
  const venue = { id: "v1", slug: "the-kettle", user_id: "user-1", name: "The Kettle" };

  it("returns the caller's venue", async () => {
    const db = fakeDb({ venue_profiles: [venue] });
    await expect(assertVenueOwner(ACTOR, {}, db)).resolves.toEqual(venue);
  });

  it("throws 403 when the caller has no venue profile at all", async () => {
    const db = fakeDb({ venue_profiles: [null] });
    const err = await expectDenied(assertVenueOwner(ACTOR, {}, db), 403);
    expect(err.code).toBe("venue_profile_required");
  });

  it("throws 404 when a specific slug was asked for, so the slug is not confirmed", async () => {
    const db = fakeDb({ venue_profiles: [null] });
    const err = await expectDenied(assertVenueOwner(ACTOR, { venueSlug: "someone-else" }, db), 404);
    expect(err.code).toBe("venue_not_found");
  });
});

describe("assertArtworkRequestOwner", () => {
  it("returns the request for its owning venue", async () => {
    const req = { id: "r1", venue_user_id: "user-1", status: "open", visibility: "private" };
    const db = fakeDb({ artwork_requests: [req] });
    await expect(assertArtworkRequestOwner(ACTOR, "r1", db)).resolves.toEqual(req);
  });

  it("throws 404 for a request the caller does not own", async () => {
    const db = fakeDb({ artwork_requests: [null] });
    const err = await expectDenied(assertArtworkRequestOwner(ACTOR, "r-other", db), 404);
    expect(err.code).toBe("artwork_request_not_found");
  });
});

describe("assertCanViewArtworkRequest", () => {
  it("gives the owner the owner role", async () => {
    const req = { id: "r1", venue_user_id: "user-1" };
    const db = fakeDb({ artwork_requests: [req] });
    await expect(assertCanViewArtworkRequest(ACTOR, "r1", db)).resolves.toMatchObject({
      role: "owner",
    });
  });

  it("lets an approved artist see a semi_public request", async () => {
    const db = fakeDb({
      artwork_requests: [null, { id: "r1", visibility: "semi_public" }],
      artist_profiles: [{ slug: "maya-chen", review_status: "approved" }],
    });
    await expect(assertCanViewArtworkRequest(ACTOR, "r1", db)).resolves.toMatchObject({
      role: "browsing_artist",
    });
  });

  it("lets a named artist see a private request", async () => {
    const db = fakeDb({
      artwork_requests: [null, null, { id: "r1", visibility: "private" }],
      artist_profiles: [{ slug: "maya-chen", review_status: "approved" }],
    });
    await expect(assertCanViewArtworkRequest(ACTOR, "r1", db)).resolves.toMatchObject({
      role: "invited_artist",
    });
  });

  it("throws 404 for an artist who is neither approved nor invited (E17)", async () => {
    const db = fakeDb({
      artwork_requests: [null, null, null],
      artist_profiles: [{ slug: "maya-chen", review_status: "pending" }],
    });
    const err = await expectDenied(assertCanViewArtworkRequest(ACTOR, "r1", db), 404);
    expect(err.code).toBe("artwork_request_not_found");
  });

  it("throws 404 for a caller with no artist profile", async () => {
    const db = fakeDb({ artwork_requests: [null], artist_profiles: [null] });
    await expectDenied(assertCanViewArtworkRequest(ACTOR, "r1", db), 404);
  });
});
