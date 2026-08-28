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

import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, fromMock, isFlagOnMock, cancelBillingMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  fromMock: vi.fn(),
  isFlagOnMock: vi.fn(() => false),
  cancelBillingMock: vi.fn(async () => ({ status: "cancelled" as const })),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  }),
}));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
// K1: the legacy @/lib/email is deleted; both directions of the placement
// event go through sendEmail now.
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => {}) }));

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

import { PATCH } from "./route";

type Row = {
  artist_user_id: string | null;
  venue_user_id: string | null;
  artist_slug: string | null;
  venue_slug?: string | null;
  venue: string | null;
  status: string;
  proposed_by_user_id?: string | null;
};

const updates: Record<string, unknown>[] = [];

/** Rows the message-trail requester lookup should see. */
type TrailMsg = { sender_id: string | null; metadata: Record<string, unknown> | null };

function setupDb(row: Row | null, trail: TrailMsg[] = []) {
  updates.length = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === "placements") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: row, error: row ? null : { code: "PGRST116" } }),
            maybeSingle: async () => ({ data: row, error: null }),
            order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
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
          select: () => ({
            eq: () => ({
              single: async () => ({ data: row, error: null }),
              maybeSingle: async () => ({ data: row, error: null }),
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            }),
          }),
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
});
