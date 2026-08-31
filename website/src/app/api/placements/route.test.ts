// E20 + E23b (01 Phase D item 10).
//
// E20: PATCH /api/placements consulted existing.status only for two same-state
// no-ops, so declined → active, cancelled → active and completed → active all
// fell through to an unconditional `updates.status = status`. A party who had
// been REJECTED could force their own deal live. Worse, every downstream hook
// keys on `pending → active`, so the forced row went active with no Stripe
// subscription, no inventory decrement and no accepted_at: live to both portals,
// invisible to billing.
//
// E23b: the inventory restore keyed on stage === "collected" rather than on the
// resulting status, so a direct {status:"completed"} write skipped it and left
// the artist's stock decremented and possibly unlisted for good.
//
// These assert on whether the WRITE happened as much as on the status code: the
// security property is that no update reaches placements.

import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, fromMock, isFlagOnMock, cancelBillingMock, getUserByIdMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  fromMock: vi.fn(),
  isFlagOnMock: vi.fn(() => false),
  cancelBillingMock: vi.fn(async () => ({ status: "cancelled" as const })),
  // Defaults to no user, which short-circuits every email branch; the R4.14
  // counter-key tests point it at a real counterparty.
  getUserByIdMock: vi.fn(async () => ({
    data: { user: null as { email?: string; user_metadata?: Record<string, unknown> } | null },
  })),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  }),
}));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
// K1: the legacy @/lib/email is deleted; both directions of the placement
// event go through sendEmail now.
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
const { createNotificationMock } = vi.hoisted(() => ({ createNotificationMock: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications", () => ({ createNotification: createNotificationMock }));

// The route pulls in paid-loan-billing, which constructs a Stripe client at
// module load, so without these the file cannot even be imported in a test env
// with no STRIPE_SECRET_KEY.
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/placements/paid-loan-billing", () => ({
  startPaidLoanBilling: vi.fn(async () => ({ ok: true })),
  cancelPaidLoanBilling: cancelBillingMock,
}));
vi.mock("@/lib/subscriptions", () => ({ isSubscribed: vi.fn(async () => true) }));
vi.mock("@/lib/outreach-cap", () => ({ checkArtistOutreachCap: vi.fn(async () => null) }));

// Email templates are React components; the route only builds them as payloads.
// Written out rather than looped: vi.mock is hoisted above the loop body, so a
// template-literal path inside a for-of resolves before `t` exists.
vi.mock("@/emails/templates/placements/VenueNewPlacementRequest", () => ({ VenueNewPlacementRequest: () => null }));
vi.mock("@/emails/templates/placements/ArtistPlacementAccepted", () => ({ ArtistPlacementAccepted: () => null }));
vi.mock("@/emails/templates/placements/ArtistPlacementDeclined", () => ({ ArtistPlacementDeclined: () => null }));
vi.mock("@/emails/templates/placements/ArtistPlacementRequestSent", () => ({ ArtistPlacementRequestSent: () => null }));
vi.mock("@/emails/templates/placements/VenuePlacementAcceptedConfirmation", () => ({ VenuePlacementAcceptedConfirmation: () => null }));
vi.mock("@/emails/templates/placements/PlacementVenueDeclinedArtistRequest", () => ({ PlacementVenueDeclinedArtistRequest: () => null }));
vi.mock("@/emails/templates/placements/PlacementCancelled", () => ({ PlacementCancelled: () => null }));
vi.mock("@/emails/templates/placements/PlacementCounterOfferReceived", () => ({ PlacementCounterOfferReceived: () => null }));
vi.mock("@/emails/templates/placements/PlacementScheduled", () => ({ PlacementScheduled: () => null }));
vi.mock("@/emails/templates/placements/PlacementArtworkInstalled", () => ({ PlacementArtworkInstalled: () => null }));
vi.mock("@/emails/templates/placements/PlacementEnded", () => ({ PlacementEnded: () => null }));

import { PATCH, POST } from "./route";
// Mocked above; imported so the R4.14 tests can assert on the calls.
import { sendEmail } from "@/lib/email/send";

type Row = {
  artist_user_id: string | null;
  venue_user_id: string | null;
  artist_slug: string | null;
  venue_slug?: string | null;
  venue: string | null;
  status: string;
  proposed_by_user_id?: string | null;
  // Current terms the counter path merges under a partial counter (F32).
  monthly_fee_gbp?: number | null;
  qr_enabled?: boolean | null;
  revenue_share_percent?: number | null;
  /** 3.4: read so a repeated cancel cannot rewrite who did it. */
  cancelled_at?: string | null;
};

const updates: Record<string, unknown>[] = [];

/** Rows the message-trail requester lookup should see. */
type TrailMsg = { sender_id: string | null; metadata: Record<string, unknown> | null };

/** Profile rows for the counter auto-message branch (R4.14 tests). */
type ProfileStub = { slug: string; name: string };

function setupDb(
  row: Row | null,
  trail: TrailMsg[] = [],
  profiles: { artist?: ProfileStub; venue?: ProfileStub } = {},
) {
  updates.length = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles" && profiles.artist) {
      const profile = profiles.artist;
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }) }) }),
      };
    }
    if (table === "venue_profiles" && profiles.venue) {
      const profile = profiles.venue;
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }) }) }),
      };
    }
    if (table === "placements") {
      return {
        // Two shapes. The head:true count is the concurrent-placement cap gate
        // (Task 3), which every transition into `active` now runs, undo
        // included; it chains a second .eq() the row-fetch shape does not have,
        // and without it the gate throws and the whole PATCH answers 400.
        // `setupCapDb` in the cap block below drives the count itself; here it
        // answers 0, which is under every plan's cap.
        select: (_cols?: unknown, selectOpts?: { head?: boolean }) => {
          if (selectOpts?.head) {
            const counting = {
              eq: () => counting,
              then: (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: null, count: 0, error: null }).then(resolve),
            };
            return counting;
          }
          return {
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: row, error: row ? null : { code: "PGRST116" } }),
                maybeSingle: async () => ({ data: row, error: null }),
              }),
              single: async () => ({ data: row, error: row ? null : { code: "PGRST116" } }),
              maybeSingle: async () => ({ data: row, error: null }),
              contains: () => ({
                order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          // Awaitable at .eq() for the plain paths, and .select()-able for
          // the counter terms write, which confirms a row actually changed.
          const afterEq = {
            select: async () => ({ data: [{ id: "pl-1" }], error: null }),
            then: (
              onFulfilled: (v: { error: null }) => unknown,
              onRejected?: (e: unknown) => unknown,
            ) => Promise.resolve({ error: null }).then(onFulfilled, onRejected),
          };
          return { eq: () => afterEq };
        },
      };
    }
    if (table === "messages") {
      // isRequester falls back to the message trail because
      // existing.requester_user_id names a column prod does not have (ledger
      // 7c). This IS the working mechanism, so the tests drive it.
      return {
        select: () => ({
          eq: () => ({
            order: () => ({ limit: async () => ({ data: trail, error: null }) }),
          }),
          // The counter auto-message thread lookup: .or(...).order().limit().maybeSingle()
          or: () => ({
            order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          }),
        }),
        insert: async () => ({ error: null }),
      };
    }
    // Everything else answers empty so side paths are inert.
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
          eq: () => ({ maybeSingle: async () => ({ data: null }) }),
          order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
        in: async () => ({ data: [], error: null }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: async () => ({ error: null }),
      // placement_archives is cleaned up fire-and-forget on some paths.
      delete: () => {
        const chain = {
          eq: () => chain,
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(fn),
        };
        return chain;
      },
    };
  });
}

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/placements", {
      method: "PATCH",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const ARTIST = "u-artist";
const VENUE = "u-venue";

beforeEach(() => {
  authMock.mockReset();
  fromMock.mockReset();
  isFlagOnMock.mockReturnValue(false);
  authMock.mockResolvedValue({ user: { id: ARTIST, email: "a@example.com" }, error: null });
  cancelBillingMock.mockClear();
  getUserByIdMock.mockReset();
  getUserByIdMock.mockResolvedValue({ data: { user: null } });
});

describe("PATCH /api/placements state machine (E20)", () => {
  const DECLINED: Row = {
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "declined",
    proposed_by_user_id: null,
  };

  it("refuses to force a declined placement live, and writes nothing", async () => {
    // The exploit: the artist was rejected, then activates the deal themselves.
    setupDb(DECLINED);
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBe(422);
    expect(updates, "a declined row was force-activated").toEqual([]);
  });

  it("refuses cancelled to active", async () => {
    setupDb({ ...DECLINED, status: "cancelled" });
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBe(422);
    expect(updates).toEqual([]);
  });

  it("refuses completed to active, since completed is terminal", async () => {
    setupDb({ ...DECLINED, status: "completed" });
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBe(422);
    expect(updates).toEqual([]);
  });

  it("names the states in the refusal so the client can explain it", async () => {
    setupDb(DECLINED);
    const body = await (await patch({ id: "pl-1", status: "active" })).json();
    expect(body.error).toMatch(/declined/i);
    expect(body.error).toMatch(/active/i);
  });

  it("still allows the legitimate pending to declined response", async () => {
    // The venue declining an artist's request must keep working.
    authMock.mockResolvedValue({ user: { id: VENUE, email: "v@example.com" }, error: null });
    setupDb({ ...DECLINED, status: "pending", proposed_by_user_id: ARTIST });
    const res = await patch({ id: "pl-1", status: "declined" });
    expect(res.status).toBeLessThan(400);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toMatchObject({ status: "declined" });
  });

  it("still allows re-opening a declined placement back to pending", async () => {
    // The counter-offer path depends on this transition existing.
    setupDb(DECLINED);
    const res = await patch({ id: "pl-1", status: "pending" });
    expect(res.status).toBeLessThan(400);
  });
});

describe("PATCH /api/placements requester guard (E20b)", () => {
  it("refuses the requester answering their own pending request", async () => {
    setupDb(
      {
        artist_user_id: ARTIST,
        venue_user_id: VENUE,
        artist_slug: "alice",
        venue_slug: "kings-arms",
        venue: "Kings Arms",
        status: "pending",
        proposed_by_user_id: ARTIST,
      },
      // The artist sent the original request, so the artist may not accept it.
      [{ sender_id: ARTIST, metadata: { placementId: "pl-1" } }],
    );
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/your own/i);
    expect(updates).toEqual([]);
  });

  it("applies the same guard on a declined row, which the pending scope skipped (E20b)", async () => {
    // Before the widening this guard sat inside `existing.status === "pending"`,
    // so it never ran for exactly the rows E20 was exploited on.
    setupDb(
      {
        artist_user_id: ARTIST,
        venue_user_id: VENUE,
        artist_slug: "alice",
        venue_slug: "kings-arms",
        venue: "Kings Arms",
        status: "declined",
        proposed_by_user_id: ARTIST,
      },
      [{ sender_id: ARTIST, metadata: { placementId: "pl-1" } }],
    );
    const res = await patch({ id: "pl-1", status: "declined" });
    // Either refusal is correct: the state machine rejects declined→declined as
    // a no-op-with-guard, or the requester guard fires. What must NOT happen is
    // a write.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(updates).toEqual([]);
  });

  it("refuses a self-placement, where one user is both parties", async () => {
    setupDb({
      artist_user_id: ARTIST,
      venue_user_id: ARTIST,
      artist_slug: "alice",
      venue_slug: "own-venue",
      venue: "Own Venue",
      status: "pending",
      proposed_by_user_id: null,
    });
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
  });
});

describe("PATCH /api/placements completion path (E23b)", () => {
  it("rejects a direct status:completed write at the schema", async () => {
    // It was a second route to completed that skipped collected_at AND the
    // inventory restore. stage:"collected" is the only supported path.
    setupDb({
      artist_user_id: ARTIST,
      venue_user_id: VENUE,
      artist_slug: "alice",
      venue_slug: "kings-arms",
      venue: "Kings Arms",
      status: "active",
      proposed_by_user_id: null,
    });
    const res = await patch({ id: "pl-1", status: "completed" });
    expect(res.status).toBe(400);
    expect(updates, "a direct completed write reached the database").toEqual([]);
  });

  it("still completes through stage:collected, stamping the status and the date", async () => {
    setupDb({
      artist_user_id: ARTIST,
      venue_user_id: VENUE,
      artist_slug: "alice",
      venue_slug: "kings-arms",
      venue: "Kings Arms",
      status: "active",
      proposed_by_user_id: null,
    });
    const res = await patch({ id: "pl-1", stage: "collected" });
    expect(res.status).toBeLessThan(400);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toMatchObject({ status: "completed" });
    expect(updates[0].collected_at).toBeTruthy();
  });

  it("keys the stage bells so a re-PATCH of the same stage cannot double-bell (WS6.3 / R6.F6a)", async () => {
    // Fail-before: the comment above the bell block claimed id+stage+user
    // idempotency that did not exist, so re-PATCHing stage:"collected"
    // inserted a second identical bell for both parties.
    createNotificationMock.mockClear();
    setupDb({
      artist_user_id: ARTIST,
      venue_user_id: VENUE,
      artist_slug: "alice",
      venue_slug: "kings-arms",
      venue: "Kings Arms",
      status: "active",
      proposed_by_user_id: null,
    });
    const res = await patch({ id: "pl-1", stage: "collected" });
    expect(res.status).toBeLessThan(400);
    for (const uid of [ARTIST, VENUE]) {
      expect(createNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: uid,
          kind: "placement_collected",
          idempotencyKey: `placement_collected:pl-1:${uid}`,
        }),
      );
    }
  });

  it("still supports undoing collected back to active", async () => {
    // The undo path writes updates.status directly rather than through the
    // caller-supplied `status` field, so the E20 gate must not catch it.
    // completed has no outgoing transition, so gating it would break undo.
    setupDb({
      artist_user_id: ARTIST,
      venue_user_id: VENUE,
      artist_slug: "alice",
      venue_slug: "kings-arms",
      venue: "Kings Arms",
      status: "completed",
      proposed_by_user_id: null,
    });
    const res = await patch({ id: "pl-1", unsetStage: "collected" });
    expect(res.status).toBeLessThan(400);
    expect(updates[0]).toMatchObject({ status: "active", collected_at: null });
  });
});

// ── D8: billing stops when a placement leaves 'active', not only on cancel ────
//
// cancelPaidLoanBilling fired only on active → cancelled. A collection arrives as
// stage: "collected", which sets updates.status = "completed" (not the body
// `status`), so the plan's fix, which widened the body `status` comparison, would
// have missed the real collection path. The venue would keep paying a monthly fee
// for a piece off the wall.
describe("PATCH /api/placements stops billing on a terminal transition (D8)", () => {
  const ACTIVE = {
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "active",
    proposed_by_user_id: null,
  };

  it("cancels billing when the work is collected via stage:collected", async () => {
    setupDb(ACTIVE);
    const res = await patch({ id: "pl-1", stage: "collected" });
    expect(res.status).toBeLessThan(400);
    expect(cancelBillingMock).toHaveBeenCalledWith("pl-1");
  });

  it("still cancels billing on a direct status:cancelled (unchanged)", async () => {
    setupDb(ACTIVE);
    const res = await patch({ id: "pl-1", status: "cancelled" });
    expect(res.status).toBeLessThan(400);
    expect(cancelBillingMock).toHaveBeenCalledWith("pl-1");
  });

  it("does NOT cancel billing on a non-terminal stage advance (installed)", async () => {
    // The placement is still on the wall; billing must continue.
    setupDb(ACTIVE);
    const res = await patch({ id: "pl-1", stage: "installed" });
    expect(res.status).toBeLessThan(400);
    expect(cancelBillingMock).not.toHaveBeenCalled();
  });

  it("does NOT cancel billing when undoing a collection back to active", async () => {
    // updates.status becomes "active" here, which must not trip the terminal check.
    setupDb({ ...ACTIVE, status: "completed" });
    const res = await patch({ id: "pl-1", unsetStage: "collected" });
    expect(res.status).toBeLessThan(400);
    expect(cancelBillingMock).not.toHaveBeenCalled();
  });
});

// ─── Row 22 (D65): the strip-and-retry paths are gone ───
//
// Five (in fact seven) places in this route reacted to a failed write by
// re-running it with columns removed. Every one of those columns exists in prod
// (verified against tests/integration/schema-columns.json), so the fallback could
// never do what its comment claimed. What it COULD do is turn a real failure into
// a false success: the broadest one fired on ANY error and stripped all ten
// lifecycle columns, so a stage advance could return 200 having written nothing
// the caller asked for.
//
// These pin the property that matters: an unrelated failure surfaces, and the
// route does not quietly try again with less data.
describe("PATCH /api/placements surfaces write failures (row 22)", () => {
  const ACTIVE_ROW: Row = {
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "active",
    proposed_by_user_id: null,
  };

  /** Same as setupDb, but every placements UPDATE fails with a non-column error. */
  function setupFailingUpdate(row: Row) {
    updates.length = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "placements") {
        return {
          // The head:true branch is the concurrent-placement cap count, which
          // runs on every transition into `active` (undo included). Answers 0,
          // under every plan's cap, so the write failure below is what the
          // test actually observes.
          select: (_cols?: unknown, selectOpts?: { head?: boolean }) => {
            if (selectOpts?.head) {
              const counting = {
                eq: () => counting,
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({ data: null, count: 0, error: null }).then(resolve),
              };
              return counting;
            }
            return {
              eq: () => ({
                single: async () => ({ data: row, error: null }),
                maybeSingle: async () => ({ data: row, error: null }),
                order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            // Deliberately NOT a "column does not exist" message: this is the
            // unrelated failure the old fallback would have masked.
            return {
              eq: async () => ({ error: { message: "permission denied for table placements" } }),
            };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
          in: async () => ({ data: [], error: null }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
        delete: () => {
          const chain = {
            eq: () => chain,
            then: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(fn),
          };
          return chain;
        },
      };
    });
  }

  it("returns 500 on a stage advance whose write fails, and does not retry with fewer columns", async () => {
    setupFailingUpdate(ACTIVE_ROW);
    const res = await patch({ id: "pl-1", stage: "installed" });

    // Fail-before: the blanket retry stripped installed_at (and nine others) and
    // let the route fall through to a 200 having written nothing.
    expect(res.status).toBe(500);
    // Exactly one attempt: no second, smaller write.
    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveProperty("installed_at");
  });

  it("returns 500 on an unsetStage whose write fails, keeping the requested columns in the single attempt", async () => {
    setupFailingUpdate({ ...ACTIVE_ROW, status: "completed" });
    const res = await patch({ id: "pl-1", unsetStage: "collected" });

    expect(res.status).toBe(500);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveProperty("collected_at", null);
  });
});

// ── 121: the buy-off-the-wall offer lives on the placement ──────────────────
//
// The artist prices THIS physical piece at live-on-wall; a venue cannot set a
// price on someone else's work, and an explicit null clears the frame flag
// with the offer so a stale "frame included" cannot outlive it.
describe("PATCH /api/placements in-store offer (121)", () => {
  const ROW: Row = {
    artist_user_id: "u-artist",
    venue_user_id: "u-venue",
    artist_slug: "fin-coles",
    venue_slug: "testing-venue",
    venue: "Testing Venue",
    status: "active",
  };

  it("lets the artist set the offer, persisting price and frame flag", async () => {
    setupDb({ ...ROW });
    authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@example.com" }, error: null });
    const res = await patch({ id: "p1", inStorePrice: 120, inStoreFrameIncluded: true });
    expect(res.status).toBe(200);
    const update = updates.find((u) => "in_store_price" in u);
    expect(update).toMatchObject({ in_store_price: 120, in_store_frame_included: true });
  });

  it("an explicit null clears the offer AND the frame flag", async () => {
    setupDb({ ...ROW });
    authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@example.com" }, error: null });
    const res = await patch({ id: "p1", inStorePrice: null });
    expect(res.status).toBe(200);
    const update = updates.find((u) => "in_store_price" in u);
    expect(update).toMatchObject({ in_store_price: null, in_store_frame_included: false });
  });

  it("403s a venue trying to price the artist's piece", async () => {
    setupDb({ ...ROW });
    authMock.mockResolvedValue({ user: { id: "u-venue", email: "v@example.com" }, error: null });
    const res = await patch({ id: "p1", inStorePrice: 120 });
    expect(res.status).toBe(403);
    expect(updates.find((u) => "in_store_price" in u)).toBeUndefined();
  });

  it("refuses a non-positive price at the schema", async () => {
    setupDb({ ...ROW });
    authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@example.com" }, error: null });
    const res = await patch({ id: "p1", inStorePrice: 0 });
    expect(res.status).toBe(400);
  });
});

// F32 + D26 (WS8 item 2). The counter path stored the client's arrangementType
// verbatim, so a counter claiming "paid_loan" while enabling QR (the dialog's
// old mapping) or the legacy "free_loan" for a paid loan (the panel's old
// mapping) wrote a label that disagreed with the economics. The share also
// passed through unclamped up to the schema's 100 while every UI caps at 50.
describe("PATCH /api/placements counter derives arrangement_type + clamps share (F32/D26)", () => {
  // The venue proposed; the artist (the authenticated default) counters.
  const PENDING: Row = {
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "pending",
    proposed_by_user_id: VENUE,
    monthly_fee_gbp: null,
    qr_enabled: true,
    revenue_share_percent: 10,
  };

  it("derives mixed for a paid-loan counter with QR on, whatever the client claims", async () => {
    setupDb({ ...PENDING });
    const res = await patch({
      id: "pl-1",
      counter: { arrangementType: "paid_loan", monthlyFeeGbp: 80, qrEnabled: true, revenueSharePercent: 15 },
    });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({
      arrangement_type: "mixed",
      monthly_fee_gbp: 80,
      qr_enabled: true,
      revenue_share_percent: 15,
    });
  });

  it("derives paid_loan from the legacy free_loan claim when a fee is attached and QR is off", async () => {
    // The context panel used to send "free_loan" for paid loans (F27).
    setupDb({ ...PENDING });
    const res = await patch({
      id: "pl-1",
      counter: { arrangementType: "free_loan", monthlyFeeGbp: 60, qrEnabled: false },
    });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ arrangement_type: "paid_loan", monthly_fee_gbp: 60 });
  });

  it("clamps revenueSharePercent to the product's 50 cap before writing", async () => {
    setupDb({ ...PENDING });
    const res = await patch({
      id: "pl-1",
      counter: { arrangementType: "revenue_share", qrEnabled: true, revenueSharePercent: 100 },
    });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ revenue_share_percent: 50, arrangement_type: "revenue_share" });
  });

  it("merges a partial counter over the row's current terms before deriving", async () => {
    // The row already carries a monthly fee; the counter only flips QR on.
    // Fee (kept) + QR (new) is canonically mixed.
    setupDb({ ...PENDING, monthly_fee_gbp: 45, qr_enabled: false, revenue_share_percent: null });
    const res = await patch({ id: "pl-1", counter: { qrEnabled: true } });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ arrangement_type: "mixed", qr_enabled: true });
    // The fee itself was not part of the counter, so it is not rewritten.
    expect(updates[0]).not.toHaveProperty("monthly_fee_gbp");
  });

  it("still refuses the requester countering their own pending request", async () => {
    setupDb({ ...PENDING, proposed_by_user_id: ARTIST });
    const res = await patch({ id: "pl-1", counter: { qrEnabled: false } });
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});

// R4.14 (WS5.5). The counter-offer email was keyed on Date.now(), which is not
// an idempotency key: a platform retry or a double-submit of the same counter
// sent the email twice. notifications.ts's own docstring names this exact
// anti-pattern. The key is now derived from the recipient plus the countered
// terms, so a retried identical request dedupes while a genuinely new counter
// still sends.
describe("PATCH /api/placements counter-offer email idempotency key (R4.14)", () => {
  const PENDING: Row = {
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "pending",
    proposed_by_user_id: VENUE,
    monthly_fee_gbp: null,
    qr_enabled: true,
    revenue_share_percent: 10,
  };

  const PROFILES = {
    artist: { slug: "alice", name: "Alice" },
    venue: { slug: "kings-arms", name: "Kings Arms" },
  };

  const sendEmailSpy = vi.mocked(sendEmail);

  beforeEach(() => {
    sendEmailSpy.mockClear();
    getUserByIdMock.mockResolvedValue({
      data: { user: { email: "venue@example.com", user_metadata: {} } },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const COUNTER = {
    id: "pl-1",
    counter: { arrangementType: "paid_loan", monthlyFeeGbp: 80, qrEnabled: false },
  };

  it("keys the email deterministically, so a retried request dedupes", async () => {
    // Fake only Date: with the old Date.now() key, two attempts seconds apart
    // produced two distinct keys and therefore two emails (fail-before).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-29T10:00:00.000Z"));

    setupDb({ ...PENDING }, [], PROFILES);
    expect((await patch(COUNTER)).status).toBe(200);

    vi.setSystemTime(new Date("2026-08-29T10:00:05.000Z"));
    setupDb({ ...PENDING }, [], PROFILES);
    expect((await patch(COUNTER)).status).toBe(200);

    expect(sendEmailSpy).toHaveBeenCalledTimes(2);
    const keys = sendEmailSpy.mock.calls.map(
      (c) => (c[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);
    // Scoped to the recipient, so A countering B and B countering back with
    // identical terms do not collide.
    expect(keys[0]).toContain(`:to:${VENUE}:`);
    expect(keys[0]).toMatch(/^placement_counter:pl-1:/);
  });

  it("gives a counter with different terms its own key", async () => {
    setupDb({ ...PENDING }, [], PROFILES);
    expect((await patch(COUNTER)).status).toBe(200);

    setupDb({ ...PENDING }, [], PROFILES);
    expect(
      (await patch({ id: "pl-1", counter: { ...COUNTER.counter, monthlyFeeGbp: 95 } })).status,
    ).toBe(200);

    expect(sendEmailSpy).toHaveBeenCalledTimes(2);
    const keys = sendEmailSpy.mock.calls.map(
      (c) => (c[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).not.toBe(keys[1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E21. The venue and artist placement forms both mint the row id client-side
// (`p-${Date.now()}-…`) and then link the optimistic row at /placements/<id>.
// That is only safe because the id travels in the POST body and the route
// persists it verbatim; if the route ever minted its own the links would 404
// until a refresh. This pins the invariant those links depend on.
// ─────────────────────────────────────────────────────────────────────────────

/** Rows the POST asked the DB to insert into `placements`. */
let placementInserts: Record<string, unknown>[][] = [];

function setupPostDb() {
  placementInserts = [];
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return {
        select: () => ({
          eq: (col: string, val: string) => ({
            single: async () =>
              // getUserRole asks by user_id (the caller is a venue, so: no row);
              // the fromVenue branch asks by slug for the target artist.
              col === "slug"
                ? { data: { user_id: "u-artist", slug: val, name: "Maya Chen" }, error: null }
                : { data: null, error: { code: "PGRST116" } },
          }),
        }),
      };
    }
    if (table === "venue_profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { user_id: VENUE, slug: "copper-kettle", name: "The Copper Kettle" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "placements") {
      return {
        insert: async (rows: Record<string, unknown>[]) => {
          placementInserts.push(rows);
          return { error: null };
        },
      };
    }
    if (table === "messages") {
      return {
        select: () => ({
          or: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
        }),
        insert: async () => ({ error: null }),
      };
    }
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      insert: async () => ({ error: null }),
    };
  });
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/placements", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const CLIENT_ID = "p-1756000000000-ab12";

describe("POST /api/placements persists the caller's row id (E21)", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: VENUE, email: "v@example.com" }, error: null });
    setupPostDb();
  });

  it("stores the id the client generated, so /placements/<id> resolves", async () => {
    const res = await post({
      fromVenue: true,
      artistSlug: "maya-chen",
      placements: [{
        id: CLIENT_ID,
        workTitle: "Last Light",
        venueSlug: "self",
        type: "revenue_share",
        qrEnabled: true,
        revenueSharePercent: 20,
      }],
    });

    expect(res.status).toBe(200);
    expect(placementInserts).toHaveLength(1);
    // The optimistic row in the portal renders Open / QR-label links at
    // /placements/<this id>. If the route minted its own id instead, every one
    // of those links would 404 until the next full list refresh.
    expect(placementInserts[0][0].id).toBe(CLIENT_ID);
  });

  it("keeps every id in a multi-row submit", async () => {
    const ids = [`${CLIENT_ID}-a`, `${CLIENT_ID}-b`];
    await post({
      fromVenue: true,
      artistSlug: "maya-chen",
      placements: ids.map((id) => ({
        id,
        workTitle: `Work ${id}`,
        venueSlug: "self",
        type: "revenue_share",
        qrEnabled: true,
      })),
    });

    expect(placementInserts[0].map((r) => r.id)).toEqual(ids);
  });
});

// ─── Task 3: concurrent placement cap on the pending → active transition ───
//
// The gate keys on the placement's ARTIST (existing.artist_user_id), not the
// caller, because whichever party clicks accept, the wall-slot being consumed
// is the artist's. These tests use a dedicated DB mock rather than the shared
// setupDb above, because the cap check needs two query shapes setupDb doesn't
// model: a configurable artist_profiles row (plan/status) and a head:true
// COUNT query against placements, alongside the existing "fetch by id" shape
// the rest of the accept path also needs.
describe("PATCH /api/placements concurrent placement cap (Task 3)", () => {
  const CORE_PROFILE = { subscription_plan: "core", subscription_status: "active" };
  const PRO_PROFILE = { subscription_plan: "pro", subscription_status: "active" };

  /** Head-query args captured so a test can assert the count check is head:true (no row fetch). */
  let headQueryCalls: Array<{ columns: unknown; opts: unknown }>;

  function setupCapDb(
    row: Row,
    opts: {
      profile?: { subscription_plan: string; subscription_status: string } | null;
      activeCount?: number;
      trail?: TrailMsg[];
    } = {},
  ) {
    const { profile = null, activeCount = 0, trail = [] } = opts;
    updates.length = 0;
    headQueryCalls = [];

    fromMock.mockImplementation((table: string) => {
      if (table === "placements") {
        return {
          select: (columns: unknown, selectOpts?: { head?: boolean }) => {
            if (selectOpts?.head) {
              // The concurrent-count query: head:true, no rows, count only.
              headQueryCalls.push({ columns, opts: selectOpts });
              const chain = {
                eq: () => chain,
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({ data: null, count: activeCount, error: null }).then(resolve),
              };
              return chain;
            }
            // The normal "fetch the placement by id" shape used everywhere else.
            return {
              eq: () => ({
                single: async () => ({ data: row, error: row ? null : { code: "PGRST116" } }),
                maybeSingle: async () => ({ data: row, error: null }),
                order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "artist_profiles") {
        // Serves both the pending-review gate (review_status, absent here so
        // it never blocks) and the cap gate (subscription_plan/status).
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: profile, error: profile ? null : { code: "PGRST116" } }),
              maybeSingle: async () => ({ data: profile, error: null }),
            }),
          }),
        };
      }
      if (table === "messages") {
        return {
          select: () => ({
            // Two shapes fork off the same .eq("message_type", ...): the F39
            // requester-trail lookup goes straight to order/limit, the
            // accept/decline auto-message goes via .contains() first to find
            // the original placement_request thread.
            eq: () => ({
              order: () => ({ limit: async () => ({ data: trail, error: null }) }),
              contains: () => ({
                order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              }),
            }),
          }),
          insert: async () => ({ error: null }),
        };
      }
      // Everything else (venue_profiles, artist_works, placement_archives, ...)
      // answers empty so side paths (notifications, emails, inventory) are inert.
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          }),
          in: async () => ({ data: [], error: null }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
        delete: () => {
          const chain = {
            eq: () => chain,
            then: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(fn),
          };
          return chain;
        },
      };
    });
  }

  /** The venue proposed this placement, so the ARTIST is the one who may accept it. */
  const PENDING_ARTIST_ACCEPTS: Row = {
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "pending",
    proposed_by_user_id: VENUE,
  };

  /** The artist proposed this placement, so the VENUE is the one who may accept it. */
  const PENDING_VENUE_ACCEPTS: Row = {
    ...PENDING_ARTIST_ACCEPTS,
    proposed_by_user_id: ARTIST,
  };

  it("blocks the accept with 402 placement_limit_reached when the accepting artist is at their Core cap", async () => {
    // auth defaults to ARTIST in the top-level beforeEach.
    setupCapDb(PENDING_ARTIST_ACCEPTS, { profile: CORE_PROFILE, activeCount: 2 });
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("placement_limit_reached");
    expect(body.message).toMatch(/2 active placements/);
    expect(body.upgrade_url).toBe("/artist-portal/billing");
    expect(updates, "a capacity-blocked accept must not write").toEqual([]);
  });

  it("blocks the accept with the other-party payload when the VENUE clicks accept and the artist is at cap", async () => {
    authMock.mockResolvedValue({ user: { id: VENUE, email: "v@example.com" }, error: null });
    setupCapDb(PENDING_VENUE_ACCEPTS, { profile: CORE_PROFILE, activeCount: 2 });
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("placement_limit_reached");
    expect(body.message).toMatch(/this artist/i);
    expect(body.message).not.toMatch(/your plan/i);
    expect(body.upgrade_url).toBeUndefined();
    expect(updates).toEqual([]);
  });

  it("allows the accept when the artist is under their Core cap, using a head:true count (no row fetch)", async () => {
    setupCapDb(PENDING_ARTIST_ACCEPTS, { profile: CORE_PROFILE, activeCount: 1 });
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBeLessThan(400);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toMatchObject({ status: "active" });
    expect(headQueryCalls).toHaveLength(1);
    expect(headQueryCalls[0].opts).toMatchObject({ count: "exact", head: true });
  });

  it("never blocks a Pro artist, however high the active count", async () => {
    setupCapDb(PENDING_ARTIST_ACCEPTS, { profile: PRO_PROFILE, activeCount: 40 });
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBeLessThan(400);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toMatchObject({ status: "active" });
  });

  it("does not gate a decline, even when the artist is at cap", async () => {
    setupCapDb(PENDING_ARTIST_ACCEPTS, { profile: CORE_PROFILE, activeCount: 2 });
    const res = await patch({ id: "pl-1", status: "declined" });
    expect(res.status).toBeLessThan(400);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toMatchObject({ status: "declined" });
  });

  it("runs after the self-placement guard: a blocked self-placement gets its own 400, not the cap's 402", async () => {
    setupCapDb(
      {
        artist_user_id: ARTIST,
        venue_user_id: ARTIST,
        artist_slug: "alice",
        venue_slug: "own-venue",
        venue: "Own Venue",
        status: "pending",
        proposed_by_user_id: null,
      },
      { profile: CORE_PROFILE, activeCount: 2 },
    );
    const res = await patch({ id: "pl-1", status: "active" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/yourself/i);
    expect(updates).toEqual([]);
  });

  // ─── Finding 1 (final whole-branch review): the gate above only fired on
  // pending → active. Task 3's own notes-for-final-review flagged the first
  // gap directly: "paused->active would bypass the cap gate but no code path
  // resumes paused today" — a resume is now live. The unsetStage:"collected"
  // undo is the second door: it sets updates.status = "active" directly
  // (completed → active is server-chosen, bypassing canPlacementTransition,
  // see the comment by the E20 gate), so the caller-supplied `status` gate
  // above never sees it either. Both must clear the same capacity check,
  // same decision helper, same 402 payloads, same setupCapDb harness.
  describe("extended to paused → active and the collected-stage undo (Finding 1)", () => {
    const PAUSED_ARTIST_ACCEPTS: Row = { ...PENDING_ARTIST_ACCEPTS, status: "paused" };
    const COMPLETED_ARTIST_UNDO: Row = { ...PENDING_ARTIST_ACCEPTS, status: "completed" };

    it("blocks resuming a paused placement with 402 when the artist is at their Core cap", async () => {
      setupCapDb(PAUSED_ARTIST_ACCEPTS, { profile: CORE_PROFILE, activeCount: 2 });
      const res = await patch({ id: "pl-1", status: "active" });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.error).toBe("placement_limit_reached");
      expect(body.message).toMatch(/2 active placements/);
      expect(body.upgrade_url).toBe("/artist-portal/billing");
      expect(updates, "a capacity-blocked resume must not write").toEqual([]);
    });

    it("allows resuming a paused placement when the artist is under their Core cap", async () => {
      setupCapDb(PAUSED_ARTIST_ACCEPTS, { profile: CORE_PROFILE, activeCount: 1 });
      const res = await patch({ id: "pl-1", status: "active" });
      expect(res.status).toBeLessThan(400);
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0]).toMatchObject({ status: "active" });
      expect(headQueryCalls).toHaveLength(1);
      expect(headQueryCalls[0].opts).toMatchObject({ count: "exact", head: true });
    });

    it("never blocks a Pro artist resuming from paused, however high the active count", async () => {
      setupCapDb(PAUSED_ARTIST_ACCEPTS, { profile: PRO_PROFILE, activeCount: 40 });
      const res = await patch({ id: "pl-1", status: "active" });
      expect(res.status).toBeLessThan(400);
      expect(updates[0]).toMatchObject({ status: "active" });
    });

    it("blocks the collected-stage undo (completed -> active) with 402 when the artist is at cap", async () => {
      setupCapDb(COMPLETED_ARTIST_UNDO, { profile: CORE_PROFILE, activeCount: 2 });
      const res = await patch({ id: "pl-1", unsetStage: "collected" });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.error).toBe("placement_limit_reached");
      expect(updates, "a capacity-blocked undo must not write").toEqual([]);
    });

    it("still allows the collected-stage undo when the artist is under cap, stamping the same fields as before", async () => {
      setupCapDb(COMPLETED_ARTIST_UNDO, { profile: CORE_PROFILE, activeCount: 0 });
      const res = await patch({ id: "pl-1", unsetStage: "collected" });
      expect(res.status).toBeLessThan(400);
      expect(updates[0]).toMatchObject({ status: "active", collected_at: null });
    });

    it("never blocks a Pro artist's collected-stage undo, however high the active count", async () => {
      setupCapDb(COMPLETED_ARTIST_UNDO, { profile: PRO_PROFILE, activeCount: 40 });
      const res = await patch({ id: "pl-1", unsetStage: "collected" });
      expect(res.status).toBeLessThan(400);
      expect(updates[0]).toMatchObject({ status: "active", collected_at: null });
    });
  });
});

// Row 727 / PASS2-placement-lifecycle-log. After a GBP 120 off-the-wall sale
// the placement went to `status: sold`, every stage control disappeared for
// both parties, and the progress bar sat at 5 of 6 with "Collected"
// permanently unreachable. There was no way for either side to close the loan.
//
// `sold` IS a terminal outcome (billing is cancelled, the work is unlinked,
// reviews open), but the piece has still physically left the wall and the
// record should say when. Two routes to that, and both are wired:
//
//   automatic  the buyer confirming collection of the collect order stamps
//              collected_at on the placement (see /api/orders)
//   manual     either party can still mark Collected on a sold placement,
//              which is this block
describe("PATCH /api/placements can still close a SOLD placement (row 727)", () => {
  const SOLD: Row = {
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "sold",
  };

  it("accepts stage: collected and lands the placement at completed", async () => {
    setupDb(SOLD);

    const res = await patch({ id: "pl-1", stage: "collected" });

    expect(res.status).toBeLessThan(400);
    expect(updates[0]).toMatchObject({ status: "completed" });
    expect(updates[0].collected_at).toEqual(expect.any(String));
  });

  it("still refuses an earlier stage on a sold placement", async () => {
    // Scheduling or installing a piece that has been sold off the wall is
    // meaningless; only the closing stage is reachable from here.
    setupDb(SOLD);

    const res = await patch({ id: "pl-1", stage: "installed" });

    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("still refuses a stage on a cancelled placement", async () => {
    setupDb({ ...SOLD, status: "cancelled" });

    const res = await patch({ id: "pl-1", stage: "collected" });

    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});

// Pass 2 item 3.4. `placements.cancelled_at` and `cancelled_by_user_id` exist
// and nothing had ever written them, so a cancelled placement carried no record
// of who ended it or when. Verified NULL on both for p-1788192191293-7xdf,
// which a venue cancelled during the pass.
describe("PATCH /api/placements records who cancelled and when (3.4)", () => {
  const ACTIVE: Row = {
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "active",
  };

  it("stamps both columns on the transition into cancelled", async () => {
    setupDb(ACTIVE);

    const res = await patch({ id: "pl-1", status: "cancelled" });

    expect(res.status).toBeLessThan(400);
    expect(updates[0].cancelled_at).toEqual(expect.any(String));
    expect(updates[0].cancelled_by_user_id).toBe(ARTIST);
  });

  it("stamps nothing on any other transition", async () => {
    setupDb(ACTIVE);

    await patch({ id: "pl-1", stage: "installed" });

    expect(updates[0]).not.toHaveProperty("cancelled_at");
    expect(updates[0]).not.toHaveProperty("cancelled_by_user_id");
  });

  it("does not rewrite who cancelled on a repeated PATCH", async () => {
    setupDb({ ...ACTIVE, status: "cancelled", cancelled_at: "2026-08-01T00:00:00.000Z" });

    await patch({ id: "pl-1", status: "cancelled" });

    expect(updates[0] ?? {}).not.toHaveProperty("cancelled_by_user_id");
  });
});

// Pass 2 item 3.3 (rows 2168, 2170). Undoing a collection correctly returned
// the placement to active and cleared collected_at, but left the WORK unlinked:
// placed_at_venue and current_placement_id both stayed null while an active
// placement pointed at it, so the artwork page said the piece was on no wall
// and the stock the collection restored was never taken back.
//
// The inventory hook keyed on pending → active only, and an undo is
// completed → active.
/** artist_works UPDATE payloads captured by setupInventoryDb. */
const workWrites: Record<string, unknown>[] = [];

/**
 * A DB mock that models the inventory hook's four reads: the placement's own
 * row, the placement's titles, the artist's profile id, and the artist_works
 * rows matched by title. Separate from setupDb because that one answers every
 * non-placements table with nothing, which makes the hook a no-op.
 */
function setupInventoryDb(row: Row, works: Array<Record<string, unknown>>) {
  updates.length = 0;
  workWrites.length = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === "placements") {
      return {
        select: (_cols?: unknown, selectOpts?: { head?: boolean }) => {
          if (selectOpts?.head) {
            const counting = {
              eq: () => counting,
              then: (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: null, count: 0, error: null }).then(resolve),
            };
            return counting;
          }
          return {
            eq: () => ({
              single: async () => ({ data: row, error: null }),
              maybeSingle: async () => ({
                data: { ...row, work_title: "Sunset", extra_works: [] },
                error: null,
              }),
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
    }
    if (table === "artist_profiles") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "ap-1" }, error: null }) }) }),
      };
    }
    if (table === "venue_profiles") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { name: "Kings Arms" }, error: null }) }),
        }),
      };
    }
    if (table === "artist_works") {
      return {
        select: () => ({ eq: () => ({ in: async () => ({ data: works, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          workWrites.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
    }
    const chain: Record<string, unknown> = {
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    };
    chain.eq = () => chain;
    chain.or = () => chain;
    chain.in = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.contains = () => chain;
    return {
      select: () => chain,
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    };
  });
}

describe("PATCH /api/placements re-links the work when a collection is undone (3.3)", () => {
  const COMPLETED: Row = {
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    artist_slug: "alice",
    venue_slug: "kings-arms",
    venue: "Kings Arms",
    status: "completed",
  };

  /** Every artist_works UPDATE the request made. */
  function workUpdates(): Record<string, unknown>[] {
    return workWrites;
  }

  it("stamps the work back onto the placement", async () => {
    setupInventoryDb(COMPLETED, [
      { id: "w-1", quantity_available: 2, current_placement_id: null },
    ]);

    const res = await patch({ id: "pl-1", unsetStage: "collected" });

    expect(res.status).toBeLessThan(400);
    expect(workUpdates()).toHaveLength(1);
    expect(workUpdates()[0]).toMatchObject({
      current_placement_id: "pl-1",
      placed_at_venue: "Kings Arms",
    });
  });

  it("takes the stock back that the collection restored", async () => {
    setupInventoryDb(COMPLETED, [
      { id: "w-1", quantity_available: 2, current_placement_id: null },
    ]);

    await patch({ id: "pl-1", unsetStage: "collected" });

    expect(workUpdates()[0]).toMatchObject({ quantity_available: 1, available: true });
  });

  it("still clears the timestamp and returns the placement to active", async () => {
    setupInventoryDb(COMPLETED, []);

    await patch({ id: "pl-1", unsetStage: "collected" });

    expect(updates[0]).toMatchObject({ status: "active", collected_at: null });
  });
});
