// Wallplace Programmes, Task 4. The requester's half of quoted checkout: once
// an admin has priced an awaiting_quote programme row (../../../admin/curation
// /quote/route.ts), this is where the emailed link lands. There is no fixed
// Stripe price for a programme (every deal is quoted), so the session is built
// from price_data at the quoted amount, mirroring
// src/app/api/placements/[id]/payment/setup/route.ts.
//
// GET is the entry point an email Button can link to directly (a plain <a
// href>, no client JS): it redirects straight to Stripe's hosted checkout.
// POST returns the same session as JSON, for a programmatic caller. Curation
// requests are anonymous-friendly by design (see src/app/api/curation/route.ts),
// so unlike payment/setup this route requires no signed-in user: the row's
// unguessable id is the only credential, the same trust model this codebase
// already gives every other UUID-addressed resource link.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { sessionsCreateMock, fromMock } = vi.hoisted(() => ({
  sessionsCreateMock: vi.fn(async () => ({ id: "cs_prog_1", url: "https://stripe.example/pay/cs_prog_1" })),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: sessionsCreateMock } } },
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

import { GET, POST } from "./route";

const REQUEST_ID = "11111111-2222-4333-8444-555555555555";

const QUOTED_ROW = {
  id: REQUEST_ID,
  tier: "programme",
  venue_name: "The Copper Kettle",
  contact_email: "maya@example.com",
  quoted_amount_gbp: 150,
  billing_interval: "month" as const,
};

let rowForLookup: Record<string, unknown> | null = { ...QUOTED_ROW };
let fetchError: { message: string } | null = null;
let linkUpdateError: { message: string } | null = null;
/** Every update() payload the route runs, so the session-link write is assertable. */
let updates: Array<Record<string, unknown>> = [];

function setupDb() {
  updates = [];
  fromMock.mockImplementation((table: string) => {
    if (table !== "curation_requests") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: rowForLookup, error: fetchError }) }),
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return { eq: async () => ({ error: linkUpdateError }) };
      },
    };
  });
}

const params = (id: string = REQUEST_ID) => Promise.resolve({ id });
const req = (method: "GET" | "POST" = "GET") =>
  new Request(`http://localhost/api/curation/${REQUEST_ID}/checkout`, { method });

const get = (id = REQUEST_ID) => GET(req("GET"), { params: params(id) });
const post = (id = REQUEST_ID) => POST(req("POST"), { params: params(id) });

beforeEach(() => {
  sessionsCreateMock.mockClear();
  sessionsCreateMock.mockResolvedValue({ id: "cs_prog_1", url: "https://stripe.example/pay/cs_prog_1" });
  fromMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});

  rowForLookup = { ...QUOTED_ROW };
  fetchError = null;
  linkUpdateError = null;
  setupDb();
});

describe("POST /api/curation/[id]/checkout — happy path session shape", () => {
  it("builds a subscription session with the quote in pence and the request id in metadata", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe("https://stripe.example/pay/cs_prog_1");

    expect(sessionsCreateMock).toHaveBeenCalledTimes(1);
    const [params_] = sessionsCreateMock.mock.calls[0] as unknown as [
      {
        mode: string;
        line_items: Array<{ price_data: { unit_amount: number; recurring: { interval: string; interval_count: number } } }>;
        metadata: Record<string, string>;
        subscription_data: { metadata: Record<string, string> };
      },
    ];
    expect(params_.mode).toBe("subscription");
    expect(params_.line_items[0].price_data.unit_amount).toBe(15000);
    expect(params_.line_items[0].price_data.recurring.interval).toBe("month");
    expect(params_.line_items[0].price_data.recurring.interval_count).toBe(1);
    expect(params_.metadata).toMatchObject({ curation_request_id: REQUEST_ID, tier: "programme" });
    expect(params_.subscription_data.metadata).toMatchObject({
      curation_request_id: REQUEST_ID,
      tier: "programme",
    });
  });

  it("expresses a quarterly billing interval as month x 3, per Stripe's own convention", async () => {
    rowForLookup = { ...QUOTED_ROW, billing_interval: "quarter", quoted_amount_gbp: 240 };
    await post();
    const [params_] = sessionsCreateMock.mock.calls[0] as unknown as [
      { line_items: Array<{ price_data: { unit_amount: number; recurring: { interval: string; interval_count: number } } }> },
    ];
    expect(params_.line_items[0].price_data.unit_amount).toBe(24000);
    expect(params_.line_items[0].price_data.recurring).toEqual({ interval: "month", interval_count: 3 });
  });

  it("rounds a fractional quote (e.g. the £79.99 anchor) to the nearest penny", async () => {
    rowForLookup = { ...QUOTED_ROW, quoted_amount_gbp: 79.99 };
    await post();
    const [params_] = sessionsCreateMock.mock.calls[0] as unknown as [
      { line_items: Array<{ price_data: { unit_amount: number } }> },
    ];
    expect(params_.line_items[0].price_data.unit_amount).toBe(7999);
  });

  it("carries an idempotency key scoped to the row, so a repeat click cannot mint a second session", async () => {
    await post();
    const [, opts] = sessionsCreateMock.mock.calls[0] as unknown as [unknown, { idempotencyKey?: string }];
    expect(opts?.idempotencyKey).toContain(REQUEST_ID);
  });

  it("uses the same idempotency key for two attempts in the same window", async () => {
    await post();
    await post();
    const keys = (sessionsCreateMock.mock.calls as unknown as Array<[unknown, { idempotencyKey: string }]>).map(
      (c) => c[1].idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it("links the resulting session id back onto the row, best-effort", async () => {
    await post();
    expect(updates).toContainEqual({ stripe_checkout_session_id: "cs_prog_1" });
  });

  it("still returns the session url when the link-back write fails", async () => {
    linkUpdateError = { message: "boom" };
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe("https://stripe.example/pay/cs_prog_1");
  });
});

describe("checkout on a row with no quote is 409", () => {
  it("409s when quoted_amount_gbp is null (never quoted)", async () => {
    rowForLookup = { ...QUOTED_ROW, quoted_amount_gbp: null, billing_interval: null };
    const res = await post();
    expect(res.status).toBe(409);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("409s a one-off tier row, which never carries a quote", async () => {
    rowForLookup = { ...QUOTED_ROW, tier: "bespoke", quoted_amount_gbp: null, billing_interval: null };
    const res = await post();
    expect(res.status).toBe(409);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});

describe("other guards", () => {
  it("404s an unknown request id", async () => {
    rowForLookup = null;
    const res = await post();
    expect(res.status).toBe(404);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("500s and creates no session when the row lookup errors", async () => {
    fetchError = { message: "db down" };
    const res = await post();
    expect(res.status).toBe(500);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("500s when Stripe refuses to create the session", async () => {
    sessionsCreateMock.mockRejectedValueOnce(new Error("stripe down"));
    const res = await post();
    expect(res.status).toBe(500);
  });
});

describe("GET redirects straight to Stripe, for a plain email link", () => {
  it("303s to the session url on success", async () => {
    const res = await get();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://stripe.example/pay/cs_prog_1");
  });

  it("returns JSON (not a redirect) for the same 409 an unquoted row gets on POST", async () => {
    rowForLookup = { ...QUOTED_ROW, quoted_amount_gbp: null, billing_interval: null };
    const res = await get();
    expect(res.status).toBe(409);
    expect(res.headers.get("location")).toBeNull();
  });

  it("404s an unknown request id", async () => {
    rowForLookup = null;
    const res = await get();
    expect(res.status).toBe(404);
  });
});
