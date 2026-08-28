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

vi.mock("@/lib/supabase-admin", () => {
  // The route reads:
  //   artwork_requests   .select("id, venue_user_id, venue_slug, title").eq.eq.maybeSingle
  //   artwork_request_responses .select("*").eq.eq.maybeSingle
  // and writes to:
  //   placements .insert
  //   artwork_request_responses .update.eq
  function makeChainable(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => {
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
    }),
  };
});

beforeEach(() => {
  vi.resetModules();
  inserts = [];
  updates = [];
  venueProfileRow = { name: "Copper Kettle" };
  responseOverride = {};
});

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
});
