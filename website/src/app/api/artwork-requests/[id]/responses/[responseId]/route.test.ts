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
          },
          error: null,
        };
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
    // 25% rev share takes priority over the £50/mo fee — both proposed
    // means revenue_share is the canonical arrangement.
    expect(row.arrangement_type).toBe("revenue_share");
    expect(row.revenue_share_percent).toBe(25);
    expect(row.monthly_fee_gbp).toBe(50); // 5000p / 100
    expect(row.qr_enabled).toBe(true);
    expect(row.status).toBe("pending");

    // The response row should be updated with linked_placement_id.
    const respUpdate = updates.find((u) => u.table === "artwork_request_responses");
    expect(respUpdate).toBeTruthy();
    expect(respUpdate!.patch.status).toBe("accepted");
    expect(respUpdate!.patch.linked_placement_id).toEqual(expect.stringMatching(/^pl_/));

    // nextStepLink should deep-link straight to the placement.
    expect(json.nextStepLink).toMatch(/^\/venue-portal\/placements\/pl_/);
  });
});
