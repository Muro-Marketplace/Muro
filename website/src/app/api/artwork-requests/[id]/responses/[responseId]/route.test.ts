// PATCH /api/artwork-requests/[id]/responses/[responseId]
//
// Plan G2 coverage: accepting a placement-type response inserts a
// placements row pre-populated with the artist's proposed terms, and
// links the placement back to the response via linked_placement_id.

import { describe, expect, it, vi, beforeEach } from "vitest";

// ---- Captured call shapes -------------------------------------------

type Insert = { table: string; row: Record<string, unknown> };
type Update = { table: string; patch: Record<string, unknown> };

let inserts: Insert[] = [];
let updates: Update[] = [];
// Per-test override: when set to null the venue_profiles.single() lookup
// returns no row, exercising the auto-create fallback path. Default
// shape is the seeded Copper Kettle name used by the happy-path test.
let venueProfileRow: { name: string } | null = { name: "Copper Kettle" };
// Per-test override: shallow patch applied over the default
// artwork_request_responses row. Lets a test pin
// proposed_qr_enabled: null without rewriting the whole fixture.
let responseOverride: Record<string, unknown> = {};
// Finding 1 (final whole-branch review): the two knobs the concurrent-
// placement cap gate reads. Defaults model an artist safely under any real
// cap (no profile row → Core cap via activePlacementCapForProfile(null);
// count 0), so every existing test above, none of which exercises the cap
// gate, is unaffected.
let capProfileRow: Record<string, unknown> | null = null;
let capActiveCount = 0;
// F47: the artist's own profile, which the acceptance gates read.
let artistProfileRow: { review_status: string | null } | null = { review_status: "approved" };
let gatingV1On = false;
let artistSubscribed = true;
// F47: the venue profile row the collection-address stamp composes from.
let venueAddressRow: Record<string, unknown> | null = {
  name: "Copper Kettle",
  address_line1: "1 High Street",
  address_line2: null,
  city: "Hampton",
  postcode: "TW12 2TH",
};
// F47: the artist_works row behind the first pinned work id.
let firstWorkRow: { title: string | null; image: string | null } | null = {
  title: "Last Light",
  image: "https://img.test/last-light.jpg",
};

// ---- Mocks -----------------------------------------------------------

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (auth === "Bearer venue") return { user: { id: "u-venue", email: "v@x.test" }, error: null };
    return { user: null, error: new Response(null, { status: 401 }) };
  }),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async () => undefined),
}));

// F47 gates + F48 fan-out. Defaults: flag off (so the subscription gate is
// dormant, matching the placements PATCH) and the artist approved.
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: vi.fn(() => gatingV1On) }));
vi.mock("@/lib/subscriptions", () => ({ isSubscribed: vi.fn(async () => ({ active: artistSubscribed })) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => undefined) }));

vi.mock("@/lib/supabase-admin", () => {
  // The route reads:
  //   artwork_requests   .select("id, venue_user_id, venue_slug, title").eq.eq.maybeSingle
  //   artwork_request_responses .select("*").eq.eq.maybeSingle
  // and writes to:
  //   placements .insert
  //   artwork_request_responses .update.eq
  function makeChainable(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = (_columns?: unknown, selectOpts?: { head?: boolean }) => {
      // Finding 1 (final whole-branch review): the cap gate's head:true
      // count query against placements is a distinct shape from the rest
      // of this mock (which is a self-referential chain resolving via
      // .maybeSingle()/.single()), so it needs its own thenable chain.
      if (table === "placements" && selectOpts?.head) {
        const headChain: Record<string, unknown> = {};
        headChain.eq = () => headChain;
        headChain.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, count: capActiveCount, error: null }).then(resolve);
        return headChain;
      }
      return chain;
    };
    chain.eq = () => chain;
    chain.maybeSingle = async () => {
      if (table === "artist_profiles") {
        // Two gates read this table with different columns: F47's review-status
        // gate (`review_status`) and Task 3's concurrent-placement cap
        // (`subscription_plan`, `subscription_status`). One mock row serves
        // both; `capProfileRow` defaults to null, which is an artist safely
        // under the Core cap, and `artistProfileRow` to approved.
        if (artistProfileRow === null && capProfileRow === null) {
          return { data: null, error: null };
        }
        return { data: { ...artistProfileRow, ...capProfileRow }, error: null };
      }
      if (table === "artwork_requests") {
        return {
          data: {
            id: "arq_1",
            venue_user_id: "u-venue",
            venue_slug: "copper-kettle",
            title: "Coffee shop wall",
          },
          error: null,
        };
      }
      if (table === "venue_profiles") return { data: venueAddressRow, error: null };
      if (table === "artist_works") return { data: firstWorkRow, error: null };
      if (table === "artwork_request_responses") {
        return {
          data: {
            id: "resp_1",
            request_id: "arq_1",
            artist_user_id: "u-artist",
            artist_slug: "the-artist",
            response_type: "placement",
            message: "Happy to lend three pieces",
            work_ids: ["w-1", "w-2"],
            proposed_monthly_fee_pence: 5000,
            proposed_qr_enabled: true,
            proposed_revenue_share_percent: 25,
            proposed_offer_amount_pence: null,
            proposed_commission_amount_pence: null,
            proposed_commission_timeline: null,
            status: "sent",
            ...responseOverride,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    };
    // The placements auto-create path also calls
    //   db.from("venue_profiles").select("name").eq(...).single()
    // to pull the venue display name for the NOT NULL `venue` column.
    chain.single = async () => {
      if (table === "venue_profiles") {
        return { data: venueProfileRow, error: null };
      }
      return { data: null, error: null };
    };
    chain.insert = (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return { error: null };
    };
    chain.update = (patch: Record<string, unknown>) => {
      updates.push({ table, patch });
      // .update returns a thenable when chained .eq()
      return { eq: () => Promise.resolve({ error: null }) };
    };
    return chain;
  }
  return {
    getSupabaseAdmin: () => ({
      from: (table: string) => makeChainable(table),
      // F48: the fan-out resolves the artist's email through the admin API.
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: { email: "artist@example.test", user_metadata: { first_name: "Maya" } } },
          }),
        },
      },
    }),
  };
});

beforeEach(async () => {
  vi.resetModules();
  inserts = [];
  updates = [];
  venueProfileRow = { name: "Copper Kettle" };
  responseOverride = {};
  capProfileRow = null;
  capActiveCount = 0;
  artistProfileRow = { review_status: "approved" };
  gatingV1On = false;
  artistSubscribed = true;
  venueAddressRow = {
    name: "Copper Kettle",
    address_line1: "1 High Street",
    address_line2: null,
    city: "Hampton",
    postcode: "TW12 2TH",
  };
  firstWorkRow = { title: "Last Light", image: "https://img.test/last-light.jpg" };
  vi.mocked((await import("@/lib/email/send")).sendEmail).mockClear();
});

/** Every messages row the route wrote (F48). */
const messageInserts = () => inserts.filter((i) => i.table === "messages");

function buildRequest(action: "accept" | "decline") {
  return new Request("https://w.local/api/artwork-requests/arq_1/responses/resp_1", {
    method: "PATCH",
    headers: { authorization: "Bearer venue", "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

const ctx = { params: Promise.resolve({ id: "arq_1", responseId: "resp_1" }) };

describe("PATCH /api/artwork-requests/[id]/responses/[responseId]", () => {
  it("on accept of a placement response, inserts a placements row using proposed terms", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(buildRequest("accept"), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("accepted");

    // Find the placements insert.
    const placementInsert = inserts.find((i) => i.table === "placements");
    expect(placementInsert).toBeTruthy();
    const row = placementInsert!.row;

    // Terms come straight from proposed_* on the response row.
    expect(row.artist_user_id).toBe("u-artist");
    expect(row.venue_user_id).toBe("u-venue");
    expect(row.artist_slug).toBe("the-artist");
    expect(row.venue_slug).toBe("copper-kettle");
    // The venue display name is pulled from venue_profiles. The
    // placements table has `venue TEXT NOT NULL`, so without it the
    // insert silently fails and the auto-create never lands.
    expect(row.venue).toBe("Copper Kettle");
    // 25% rev share takes priority over the £50/mo fee — both proposed
    // means revenue_share is the canonical arrangement.
    expect(row.arrangement_type).toBe("revenue_share");
    expect(row.revenue_share_percent).toBe(25);
    expect(row.monthly_fee_gbp).toBe(50); // 5000p / 100
    expect(row.qr_enabled).toBe(true);
    // The route skips the "pending" approval step because both sides
    // have already agreed: the artist proposed terms in the response,
    // the venue accepted here. The placement lands as "active".
    expect(row.status).toBe("active");
    expect(row.accepted_at).toEqual(expect.any(String));

    // The response row should be updated with linked_placement_id.
    const respUpdate = updates.find((u) => u.table === "artwork_request_responses");
    expect(respUpdate).toBeTruthy();
    expect(respUpdate!.patch.status).toBe("accepted");
    expect(respUpdate!.patch.linked_placement_id).toEqual(expect.stringMatching(/^pl_/));

    // nextStepLink should deep-link straight to the placement detail
    // page at /placements/[id] (NOT /venue-portal/placements/[id], which
    // doesn't exist as a route — the detail page infers viewer role).
    expect(json.nextStepLink).toMatch(/^\/placements\/pl_/);
    expect(json.nextStepLink).not.toMatch(/^\/venue-portal\/placements\/pl_/);
  });

  it("falls back to legacy placements link when venue profile is missing", async () => {
    // Force the venue_profiles lookup to return no row, mirroring a
    // venue that hasn't completed their profile. We cannot satisfy
    // placements.venue NOT NULL, so the auto-create must be skipped
    // and the response should still flip to "accepted" with the
    // legacy nextStepLink.
    venueProfileRow = null;

    const { PATCH } = await import("./route");
    const res = await PATCH(buildRequest("accept"), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("accepted");

    // No placements row should have been inserted.
    expect(inserts.find((i) => i.table === "placements")).toBeUndefined();

    // Response is still accepted, just without a linked placement id.
    const respUpdate = updates.find((u) => u.table === "artwork_request_responses");
    expect(respUpdate).toBeTruthy();
    expect(respUpdate!.patch.status).toBe("accepted");
    expect(respUpdate!.patch.linked_placement_id).toBeNull();

    // Legacy fallback link routes the venue back to the placements
    // page filtered by artist so they can finish manually.
    expect(json.linkedPlacementId).toBeNull();
    expect(json.nextStepLink).toBe("/venue-portal/placements?artist=the-artist");
  });

  it("passes the artist's proposed venue share into the placement unchanged (E23)", async () => {
    // proposed_revenue_share_percent is the VENUE'S cut (the respond form
    // caps it at "max 50% to the venue"), and placements.revenue_share_percent
    // means exactly that (payout legs deduct it from the artist's gross as
    // venueCutPence). The mint must copy it through without inverting.
    responseOverride = { proposed_revenue_share_percent: 30 };
    const { PATCH } = await import("./route");
    const res = await PATCH(buildRequest("accept"), ctx);
    expect(res.status).toBe(200);

    const placementInsert = inserts.find((i) => i.table === "placements");
    expect(placementInsert).toBeTruthy();
    expect(placementInsert!.row.revenue_share_percent).toBe(30);
    // Inverting to the artist's remainder (70) would silently flip the split.
    expect(placementInsert!.row.revenue_share_percent).not.toBe(70);
  });

  it("on accept of a commission response, keeps the venue on the request detail page (E24)", async () => {
    // /venue-portal/commissions does not exist, so the old nextStepLink
    // navigated the venue to a 404 straight after a successful accept.
    responseOverride = {
      response_type: "commission",
      proposed_commission_amount_pence: 120000,
      proposed_commission_timeline: "6 to 8 weeks",
      proposed_monthly_fee_pence: null,
      proposed_qr_enabled: null,
      proposed_revenue_share_percent: null,
    };
    const { PATCH } = await import("./route");
    const res = await PATCH(buildRequest("accept"), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("accepted");

    // A commissions row is still minted from the proposed terms.
    const commissionInsert = inserts.find((i) => i.table === "commissions");
    expect(commissionInsert).toBeTruthy();
    expect(commissionInsert!.row.amount_pence).toBe(120000);
    expect(commissionInsert!.row.status).toBe("accepted");

    // The venue stays on the request detail page rather than 404ing.
    expect(json.nextStepLink).toBe("/venue-portal/artwork-requests/arq_1");
    expect(json.nextStepLink).not.toBe("/venue-portal/commissions");

    // The artist notification also points at a real route —
    // /artist-portal/commissions does not exist either. The mock
    // accumulates calls across tests (vi.resetModules does not remint
    // the factory result), so assert on this test's call: the latest.
    const { createNotification } = await import("@/lib/notifications");
    const notifyCalls = (createNotification as ReturnType<typeof vi.fn>).mock.calls;
    expect(notifyCalls.length).toBeGreaterThan(0);
    expect(notifyCalls[notifyCalls.length - 1][0].link).toBe("/artist-portal/artwork-requests");
  });

  it("defaults qr_enabled to true for revenue_share when proposed_qr_enabled is null", async () => {
    // QR is how customers buy off the venue's wall, so a rev-share
    // placement without QR is broken-by-default. The artwork-request
    // accept path must mirror /api/placements POST, which defaults
    // qr_enabled to true unless the artist explicitly opted out.
    responseOverride = { proposed_qr_enabled: null };
    const { PATCH } = await import("./route");
    const res = await PATCH(buildRequest("accept"), ctx);
    expect(res.status).toBe(200);

    const placementInsert = inserts.find((i) => i.table === "placements");
    expect(placementInsert).toBeTruthy();
    expect(placementInsert!.row.arrangement_type).toBe("revenue_share");
    expect(placementInsert!.row.qr_enabled).toBe(true);
  });

  // ─── Finding 1 (final whole-branch review): this accept inserts a
  // placements row directly with status: "active" (line ~202), a third
  // unguarded door into an artist's capacity alongside PATCH /api/placements
  // and POST /api/messages. The feature is UI-parked but the API is live.
  // Same decision helper, same 402 payload shape.
  describe("concurrent placement cap (Finding 1)", () => {
    it("blocks the accept with 402 when the artist is at their Core cap, and inserts no placement", async () => {
      capProfileRow = { subscription_plan: "core", subscription_status: "active" };
      capActiveCount = 2;
      const { PATCH } = await import("./route");
      const res = await PATCH(buildRequest("accept"), ctx);
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.error).toBe("placement_limit_reached");

      expect(inserts.find((i) => i.table === "placements")).toBeUndefined();
      // The response itself must stay "sent", not flip to "accepted": a
      // blocked accept is not an accept.
      expect(updates.find((u) => u.table === "artwork_request_responses")).toBeUndefined();
    });

    it("allows the accept when the artist is under their Core cap", async () => {
      capProfileRow = { subscription_plan: "core", subscription_status: "active" };
      capActiveCount = 1;
      const { PATCH } = await import("./route");
      const res = await PATCH(buildRequest("accept"), ctx);
      expect(res.status).toBe(200);

      const placementInsert = inserts.find((i) => i.table === "placements");
      expect(placementInsert).toBeTruthy();
      expect(placementInsert!.row.status).toBe("active");
    });

    it("never blocks a Pro artist, however high the active count", async () => {
      capProfileRow = { subscription_plan: "pro", subscription_status: "active" };
      capActiveCount = 40;
      const { PATCH } = await import("./route");
      const res = await PATCH(buildRequest("accept"), ctx);
      expect(res.status).toBe(200);
      expect(inserts.find((i) => i.table === "placements")).toBeTruthy();
    });

    it("does not gate a non-placement response type (offer)", async () => {
      // The cap only means anything for the placement path, an accepted
      // offer response never inserts a placements row.
      capProfileRow = { subscription_plan: "core", subscription_status: "active" };
      capActiveCount = 2;
      responseOverride = {
        response_type: "offer",
        proposed_offer_amount_pence: 5000,
        proposed_monthly_fee_pence: null,
        proposed_qr_enabled: null,
        proposed_revenue_share_percent: null,
      };
      const { PATCH } = await import("./route");
      const res = await PATCH(buildRequest("accept"), ctx);
      expect(res.status).toBe(200);
      expect(inserts.find((i) => i.table === "purchase_offers")).toBeTruthy();
    });
  });
});

describe("accept forces QR on for a revenue share (F44)", () => {
  it("overrides an explicit proposed_qr_enabled=false", async () => {
    // The old default was `resp.proposed_qr_enabled ?? (arrangementType ===
    // "revenue_share")`, and `??` only covers null, so an explicit false went
    // straight through and produced a revenue_share placement with no QR code:
    // a venue cut of QR sales that can never be earned.
    responseOverride = { proposed_qr_enabled: false, proposed_revenue_share_percent: 25 };
    const { PATCH } = await import("./route");
    const res = await PATCH(buildRequest("accept"), ctx);
    expect(res.status).toBe(200);

    const placement = inserts.find((i) => i.table === "placements");
    expect(placement!.row.arrangement_type).toBe("revenue_share");
    expect(placement!.row.qr_enabled, "a revenue share was created without QR").toBe(true);
  });

  it("leaves QR off on a non-revenue-share arrangement", async () => {
    responseOverride = {
      proposed_qr_enabled: false,
      proposed_revenue_share_percent: null,
      proposed_monthly_fee_pence: 5000,
    };
    const { PATCH } = await import("./route");
    await PATCH(buildRequest("accept"), ctx);

    const placement = inserts.find((i) => i.table === "placements");
    expect(placement!.row.arrangement_type).toBe("paid_loan");
    expect(placement!.row.qr_enabled).toBe(false);
  });
});

describe("accept stamps the address and applies the acceptance gates (F47)", () => {
  it("stamps the venue's collection address onto the placement", async () => {
    const { PATCH } = await import("./route");
    await PATCH(buildRequest("accept"), ctx);

    const placement = inserts.find((i) => i.table === "placements");
    // Fail-before: neither this route nor anything downstream wrote it, so a
    // work placed through a brief had no collection address on the row that the
    // buyer's confirmation reads.
    expect(placement!.row.collection_address).toBe(
      "Copper Kettle, 1 High Street, Hampton, TW12 2TH",
    );
  });

  it("leaves the address null rather than inventing one", async () => {
    venueAddressRow = null;
    const { PATCH } = await import("./route");
    await PATCH(buildRequest("accept"), ctx);

    const placement = inserts.find((i) => i.table === "placements");
    expect(placement!.row.collection_address).toBeNull();
  });

  it("names the placement after the pinned work, not the brief", async () => {
    const { PATCH } = await import("./route");
    await PATCH(buildRequest("accept"), ctx);

    const placement = inserts.find((i) => i.table === "placements");
    // Fail-before: work_title was always req.title, so a placement created from
    // "Coffee shop wall" was called that on the wall, in the record and in the
    // collection flow.
    expect(placement!.row.work_title).toBe("Last Light");
    expect(placement!.row.work_image).toBe("https://img.test/last-light.jpg");
  });

  it("falls back to the brief title when the artist pinned no works", async () => {
    responseOverride = { work_ids: [] };
    const { PATCH } = await import("./route");
    await PATCH(buildRequest("accept"), ctx);

    const placement = inserts.find((i) => i.table === "placements");
    expect(placement!.row.work_title).toBe("Coffee shop wall");
  });

  it("refuses to activate a placement for a pending-review artist", async () => {
    artistProfileRow = { review_status: "pending" };
    const { PATCH } = await import("./route");
    const res = await PATCH(buildRequest("accept"), ctx);

    // Fail-before: /api/placements PATCH refuses exactly this, and this route
    // was a second path to the same active state with no gate at all.
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "artist_application_pending" });
    expect(inserts.find((i) => i.table === "placements")).toBeUndefined();
    expect(updates.find((u) => u.table === "artwork_request_responses")).toBeUndefined();
  });

  it("refuses to activate for an unsubscribed artist when GATING_V1 is on", async () => {
    gatingV1On = true;
    artistSubscribed = false;
    const { PATCH } = await import("./route");
    const res = await PATCH(buildRequest("accept"), ctx);

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({ error: "subscription_required" });
    expect(inserts.find((i) => i.table === "placements")).toBeUndefined();
  });

  it("does not apply the placement gates to an offer acceptance", async () => {
    // Offer / commission / message acceptances create no placement, so the
    // gates that protect an active placement have nothing to protect.
    artistProfileRow = { review_status: "pending" };
    responseOverride = {
      response_type: "offer",
      proposed_offer_amount_pence: 25000,
      proposed_revenue_share_percent: null,
      proposed_monthly_fee_pence: null,
    };
    const { PATCH } = await import("./route");
    const res = await PATCH(buildRequest("accept"), ctx);

    expect(res.status).toBe(200);
    expect(inserts.find((i) => i.table === "purchase_offers")).toBeTruthy();
  });
});

describe("accept and decline reach the artist beyond the bell (F48)", () => {
  it("writes the acceptance into the dm thread", async () => {
    const { PATCH } = await import("./route");
    await PATCH(buildRequest("accept"), ctx);

    // Fail-before: createNotification was the only signal on either branch,
    // while placements and offers mirror every state change into the thread.
    const msg = messageInserts()[0];
    expect(msg, "no thread message was written").toBeTruthy();
    expect(msg.row.conversation_id).toBe("dm-copper-kettle__the-artist");
    expect(msg.row.message_type).toBe("artwork_response_status");
    expect(msg.row.recipient_user_id).toBe("u-artist");
    expect(String(msg.row.content)).toContain("Accepted your response");
  });

  it("emails the artist on accept, with the outcome that drives the next step", async () => {
    const { PATCH } = await import("./route");
    const { sendEmail } = await import("@/lib/email/send");
    await PATCH(buildRequest("accept"), ctx);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "artist_artwork_response_accepted",
        to: "artist@example.test",
        userId: "u-artist",
        // Keyed on the response, so a retried accept dedupes rather than
        // double-sending.
        idempotencyKey: "artwork_response_accepted:resp_1",
      }),
    );
  });

  it("writes the decline into the thread and emails it too", async () => {
    const { PATCH } = await import("./route");
    const { sendEmail } = await import("@/lib/email/send");
    const res = await PATCH(buildRequest("decline"), ctx);
    expect(res.status).toBe(200);

    const msg = messageInserts()[0];
    expect(msg).toBeTruthy();
    expect(String(msg.row.content)).toContain("Passed on your response");
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "artist_artwork_response_declined",
        idempotencyKey: "artwork_response_declined:resp_1",
      }),
    );
  });
});
