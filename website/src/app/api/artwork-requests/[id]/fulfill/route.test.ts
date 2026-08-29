// E22 (01 Phase D item 12).
//
// The fulfil route had no idempotency gate at all. req.status was selected and
// never tested; resp.status stayed "accepted" after a successful fulfil, so the
// only gate passed again; and linked_placement_id / linked_offer_id were read as
// routing hints rather than as "already done" markers.
//
// Every replay therefore minted a fresh artifact. With action:"order" that is
// another purchase_offers row at status "accepted", i.e. independently payable,
// so N replays give the venue N identical payable offers. With
// action:"placement" the artist receives N placement requests for one agreement
// and the earlier placement ids are orphaned when linked_placement_id is
// overwritten. The ids embed Date.now(), so replays never collide and no
// pre-existing constraint caught them.
//
// A double-click on a flaky connection is enough. This does not need an attacker.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, fromMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

import { POST } from "./route";

const VENUE = "u-venue";
// A real RFC 4122 v4 UUID: zod 4's .uuid() enforces the version nibble (3rd
// group starts 1-8) and the variant nibble (4th group starts 8/9/a/b). Prod ids
// come from gen_random_uuid() so they always satisfy it; a lazily-typed test
// constant does not.
const RESPONSE_ID = "11111111-2222-4333-8444-555555555555";

type Req = { id: string; venue_user_id: string; status: string; title: string };
type Resp = {
  id: string;
  request_id: string;
  response_type: string;
  status: string;
  artist_user_id: string;
  artist_slug: string | null;
  work_ids: string[] | null;
  proposed_offer_amount_pence: number | null;
  proposed_commission_amount_pence: number | null;
  proposed_monthly_fee_pence: number | null;
  proposed_revenue_share_percent: number | null;
  proposed_qr_enabled: boolean | null;
  linked_placement_id: string | null;
  linked_offer_id: string | null;
  linked_commission_id: string | null;
};

const inserts: { table: string; row: Record<string, unknown> }[] = [];
const updates: { table: string; row: Record<string, unknown>; filters: Record<string, string> }[] = [];

function baseResp(over: Partial<Resp> = {}): Resp {
  return {
    id: RESPONSE_ID,
    request_id: "req-1",
    response_type: "existing_works",
    status: "accepted",
    artist_user_id: "u-artist",
    artist_slug: "alice",
    work_ids: ["w-1"],
    proposed_offer_amount_pence: 5000,
    proposed_commission_amount_pence: null,
    proposed_monthly_fee_pence: null,
    proposed_revenue_share_percent: null,
    proposed_qr_enabled: false,
    linked_placement_id: null,
    linked_offer_id: null,
    linked_commission_id: null,
    ...over,
  };
}

function setupDb(req: Req | null, resp: Resp | null) {
  inserts.length = 0;
  updates.length = 0;
  fromMock.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: table === "artwork_requests" ? req : table === "artwork_request_responses" ? resp : null,
        }),
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "artwork_request_responses" ? resp : null,
          }),
        }),
      }),
    }),
    insert: async (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return { error: null };
    },
    update: (row: Record<string, unknown>) => {
      const filters: Record<string, string> = {};
      const chain = {
        eq: (col: string, val: string) => {
          filters[col] = val;
          return chain;
        },
        then: (fn: (v: unknown) => unknown) => {
          updates.push({ table, row, filters });
          return Promise.resolve({ error: null }).then(fn);
        },
      };
      return chain;
    },
  }));
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/artwork-requests/req-1/fulfill", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "req-1" }) },
  );
}

const PENDING_REQ: Req = { id: "req-1", venue_user_id: VENUE, status: "open", title: "Blue prints" };

beforeEach(() => {
  authMock.mockReset();
  fromMock.mockReset();
  authMock.mockResolvedValue({ user: { id: VENUE, email: "v@example.com" }, error: null });
});

const offerInserts = () => inserts.filter((i) => i.table === "purchase_offers");
const placementInserts = () => inserts.filter((i) => i.table === "placements");

describe("POST fulfill idempotency (E22)", () => {
  it("mints exactly one payable offer across two identical calls", async () => {
    // The replay. First call succeeds; the second must not mint a second
    // independently payable offer.
    setupDb(PENDING_REQ, baseResp());
    const first = await post({ response_id: RESPONSE_ID, action: "order" });
    expect(first.status).toBe(200);
    expect(offerInserts()).toHaveLength(1);

    // Second call sees the state the first one left: response consumed and the
    // linked id set.
    setupDb(
      { ...PENDING_REQ, status: "fulfilled" },
      baseResp({ status: "fulfilled", linked_offer_id: "off_1" }),
    );
    const second = await post({ response_id: RESPONSE_ID, action: "order" });
    // Refused, and which refusal depends on which marker the first call landed:
    // 422 because the response is consumed, or 409 because the request is
    // fulfilled / the linked id is set. Both are correct; the property that
    // matters is that no second payable offer exists. The specific codes are
    // pinned one marker at a time in the tests below.
    expect([409, 422]).toContain(second.status);
    expect(offerInserts(), "a replay minted a second payable offer").toHaveLength(0);
  });

  it("refuses when the request is already fulfilled", async () => {
    setupDb({ ...PENDING_REQ, status: "fulfilled" }, baseResp());
    const res = await post({ response_id: RESPONSE_ID, action: "order" });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "already_fulfilled" });
    expect(inserts).toEqual([]);
  });

  it("refuses when the response already carries a linked offer", async () => {
    setupDb(PENDING_REQ, baseResp({ linked_offer_id: "off_existing" }));
    const res = await post({ response_id: RESPONSE_ID, action: "order" });
    expect(res.status).toBe(409);
    expect(offerInserts()).toEqual([]);
  });

  it("refuses when the response already carries a linked placement", async () => {
    setupDb(PENDING_REQ, baseResp({ linked_placement_id: "pl_existing" }));
    const res = await post({ response_id: RESPONSE_ID, action: "placement" });
    expect(res.status).toBe(409);
    expect(placementInserts()).toEqual([]);
  });

  it("refuses when the response already carries a linked commission", async () => {
    setupDb(PENDING_REQ, baseResp({ linked_commission_id: "cm_existing" }));
    const res = await post({ response_id: RESPONSE_ID, action: "order" });
    expect(res.status).toBe(409);
    expect(inserts).toEqual([]);
  });

  it("keeps the 422 for a response that was never accepted", async () => {
    setupDb(PENDING_REQ, baseResp({ status: "sent" }));
    const res = await post({ response_id: RESPONSE_ID, action: "order" });
    expect(res.status).toBe(422);
    expect(inserts).toEqual([]);
  });
});

describe("POST fulfill provenance and consumption (E22)", () => {
  it("stamps source_response_id on the offer so the DB can reject a duplicate", async () => {
    // The read-side gate cannot stop two concurrent requests; only
    // uniq_purchase_offers_from_response (migration 098) can.
    setupDb(PENDING_REQ, baseResp());
    await post({ response_id: RESPONSE_ID, action: "order" });
    expect(offerInserts()[0].row.source_response_id).toBe(RESPONSE_ID);
  });

  it("stamps source_response_id on the placement too", async () => {
    setupDb(PENDING_REQ, baseResp());
    await post({ response_id: RESPONSE_ID, action: "placement" });
    expect(placementInserts()[0].row.source_response_id).toBe(RESPONSE_ID);
  });

  it("consumes the response with a compare-and-set on accepted", async () => {
    setupDb(PENDING_REQ, baseResp());
    await post({ response_id: RESPONSE_ID, action: "order" });
    const consume = updates.find(
      (u) => u.table === "artwork_request_responses" && u.row.status === "fulfilled",
    );
    expect(consume, "the response was never marked fulfilled").toBeTruthy();
    // Compare-and-set: a concurrent second request updates 0 rows.
    expect(consume!.filters).toMatchObject({ id: RESPONSE_ID, status: "accepted" });
  });

  it("still flips the request to fulfilled", async () => {
    setupDb(PENDING_REQ, baseResp());
    await post({ response_id: RESPONSE_ID, action: "order" });
    const flip = updates.find(
      (u) => u.table === "artwork_requests" && u.row.status === "fulfilled",
    );
    expect(flip).toBeTruthy();
  });
});

describe("POST fulfill ownership (E22 regression guard)", () => {
  it("refuses a venue that does not own the request", async () => {
    authMock.mockResolvedValue({ user: { id: "u-someone-else", email: "x@y.z" }, error: null });
    setupDb(PENDING_REQ, baseResp());
    const res = await post({ response_id: RESPONSE_ID, action: "order" });
    expect(res.status).toBe(403);
    expect(inserts).toEqual([]);
  });

  it("404s an unknown request", async () => {
    setupDb(null, null);
    const res = await post({ response_id: RESPONSE_ID, action: "order" });
    expect(res.status).toBe(404);
  });
});

describe("POST fulfill refuses a zero-priced order (F49)", () => {
  it("does not mint a payable offer when the response carries no amount", async () => {
    // The legacy existing_works "order" branch priced the offer as
    //   proposed_offer_amount_pence ?? proposed_commission_amount_pence ?? 0
    // and the offer checkout builds its Stripe line straight from
    // offer.amount_pence with no positive-amount guard. Stripe would very
    // likely reject the £0.00 session, but the accepted, payable offer row
    // persists either way and the venue portal shows it as owed.
    setupDb(
      PENDING_REQ,
      baseResp({ proposed_offer_amount_pence: null, proposed_commission_amount_pence: null }),
    );

    const res = await post({ response_id: RESPONSE_ID, action: "order" });

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "no_price_on_response" });
    expect(offerInserts(), "a £0.00 offer was minted").toEqual([]);
  });

  it("refuses a zero amount as firmly as a missing one", async () => {
    setupDb(PENDING_REQ, baseResp({ proposed_offer_amount_pence: 0 }));

    const res = await post({ response_id: RESPONSE_ID, action: "order" });

    expect(res.status).toBe(422);
    expect(offerInserts()).toEqual([]);
  });

  it("leaves the request open when it refuses, so the venue can still act", async () => {
    setupDb(
      PENDING_REQ,
      baseResp({ proposed_offer_amount_pence: null, proposed_commission_amount_pence: null }),
    );

    await post({ response_id: RESPONSE_ID, action: "order" });

    expect(
      updates.filter((u) => u.table === "artwork_requests"),
      "the brief was closed on a refused fulfilment",
    ).toEqual([]);
  });

  it("still fulfils an order that has a real price", async () => {
    setupDb(PENDING_REQ, baseResp({ proposed_offer_amount_pence: 12_500 }));

    const res = await post({ response_id: RESPONSE_ID, action: "order" });

    expect(res.status).toBe(200);
    expect(offerInserts()[0].row.amount_pence).toBe(12_500);
  });

  it("falls back to the commission amount when that is the only price", async () => {
    setupDb(
      PENDING_REQ,
      baseResp({ proposed_offer_amount_pence: null, proposed_commission_amount_pence: 9_900 }),
    );

    const res = await post({ response_id: RESPONSE_ID, action: "order" });

    expect(res.status).toBe(200);
    expect(offerInserts()[0].row.amount_pence).toBe(9_900);
  });

  it("does not gate the placement branch, which has no price at all", async () => {
    setupDb(
      PENDING_REQ,
      baseResp({ proposed_offer_amount_pence: null, proposed_commission_amount_pence: null }),
    );

    const res = await post({ response_id: RESPONSE_ID, action: "placement" });

    expect(res.status).toBe(200);
    expect(placementInserts()).toHaveLength(1);
  });
});
