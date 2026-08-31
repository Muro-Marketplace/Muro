// D19, the orphan-payment half.
//
// The route wrapped stripe.checkout.sessions.create AND the follow-up
// curation_requests.update({ stripe_checkout_session_id }) in one try whose
// catch deleted the row. If the link update threw after the session was
// created, the buyer could still pay a live Stripe session while the row was
// gone. The webhook attributes a curation payment by
// session.metadata.curation_request_id (the row id), so a deleted row means
// money taken with no record, no email and no refund trail.
//
// The fix splits the two: the row is deleted ONLY when session creation itself
// fails (nothing is payable yet), and is RETAINED once a session exists (a link
// failure is logged, never fatal). These tests pin both directions on the
// one-off and the managed branches.

import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  sessionsCreateMock,
  fromMock,
  getUserMock,
  notifyAdminMock,
  notifyEnquiryMock,
} = vi.hoisted(() => ({
  sessionsCreateMock: vi.fn(async () => ({ id: "cs_test_1", url: "https://stripe.example/pay" })),
  fromMock: vi.fn(),
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
  notifyAdminMock: vi.fn(async () => {}),
  notifyEnquiryMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: sessionsCreateMock } },
  },
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));
// K1: the legacy @/lib/email is deleted. The admin ping is an operational
// alert; the customer acknowledgement is a template through the pipeline.
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: notifyAdminMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: notifyEnquiryMock }));

import { POST } from "./route";

/** How the `stripe_checkout_session_id` link update behaves in the current test. */
let linkBehaviour: "ok" | "throw" | "error" = "ok";
/** Every delete().eq() the route runs, as [column, value]. */
let deletes: Array<[string, unknown]> = [];
/** Every update() payload the route runs. */
let updates: Array<Record<string, unknown>> = [];
/** Every insert() payload the route runs. */
let inserts: Array<Record<string, unknown>> = [];

function setupDb() {
  linkBehaviour = "ok";
  deletes = [];
  updates = [];
  inserts = [];
  fromMock.mockImplementation((table: string) => {
    if (table !== "curation_requests") throw new Error(`unexpected table ${table}`);
    return {
      insert: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return {
          select: () => ({
            single: async () => ({ data: { id: "cr_1" }, error: null }),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return {
          eq: (_col: string, _val: unknown) => {
            if (linkBehaviour === "throw") return Promise.reject(new Error("connection reset"));
            if (linkBehaviour === "error") return Promise.resolve({ error: { message: "boom" } });
            return Promise.resolve({ error: null });
          },
        };
      },
      delete: () => ({
        eq: async (col: string, val: unknown) => {
          deletes.push([col, val]);
          return { error: null };
        },
      }),
    };
  });
}

function req(body: unknown): Request {
  return new Request("https://wallplace.co.uk/api/curation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ONE_OFF_BODY = {
  tier: "single_wall",
  venueName: "The Copper Kettle",
  contactName: "Maya Chen",
  contactEmail: "maya@example.com",
};

// Wallplace Programmes, Task 2.
const PROGRAMME_BODY = {
  tier: "programme",
  venueName: "The Copper Kettle",
  contactName: "Maya Chen",
  contactEmail: "maya@example.com",
  siteCount: 1,
  piecesEstimate: 8,
  rotationCadence: "biannual",
  sector: "office",
};

// Wallplace Programmes plan, Task 1: the managed_monthly / managed_quarterly
// tiers the D22 Stripe-price-fixture scaffolding and tests here were written
// against are retired (CURATION_TIER_KEYS no longer contains them, so a
// request naming either now 400s before reaching any Stripe-price logic).
// The tests that exercised them are removed rather than rewritten, because
// there is no live tier of kind "managed" left to exercise; Task 2 covers the
// retired tiers now 400ing, and Task 4 covers price validation for the new
// quoted `programme` tier's dynamic price_data checkout (its own route,
// src/app/api/curation/[id]/checkout/route.test.ts, not this file).

beforeEach(() => {
  vi.clearAllMocks();
  setupDb();
  sessionsCreateMock.mockResolvedValue({ id: "cs_test_1", url: "https://stripe.example/pay" });
});

describe("POST /api/curation, D19 orphan-payment guard", () => {
  it("one-off: retains the row and returns the checkout url when the session link update throws", async () => {
    linkBehaviour = "throw";

    const res = await POST(req(ONE_OFF_BODY));

    // A live session exists, so the buyer must be able to pay and be attributable.
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ mode: "checkout", url: "https://stripe.example/pay", id: "cr_1" });
    expect(sessionsCreateMock).toHaveBeenCalledOnce();
    // The crux: the row is NEVER deleted once a session can be paid.
    expect(deletes).toHaveLength(0);
  });

  it("one-off: retains the row when the link update returns an error", async () => {
    linkBehaviour = "error";

    const res = await POST(req(ONE_OFF_BODY));

    expect(res.status).toBe(200);
    expect(deletes).toHaveLength(0);
  });

  it("one-off: deletes the pending row when Stripe session creation itself fails", async () => {
    sessionsCreateMock.mockRejectedValueOnce(new Error("stripe down"));

    const res = await POST(req(ONE_OFF_BODY));

    // Nothing is payable, so removing the pending row is the correct cleanup.
    expect(res.status).toBe(500);
    expect(deletes).toContainEqual(["id", "cr_1"]);
  });
});

// Wallplace Programmes plan, Task 1: this describe block used to hold four
// "managed: ..." / D22 tests exercising managed_monthly / managed_quarterly
// checkout and Stripe price validation. Both tiers are retired (removed from
// CURATION_TIERS, so CURATION_TIER_KEYS / the zod schema reject them with a
// 400 before any of this route's Stripe logic runs), and there is currently
// no live tier of kind "managed" to exercise this way, so those tests are
// removed rather than rewritten. See also src/lib/curation-tiers.test.ts
// ("retires the fixed-price managed tiers").

// Wallplace Programmes plan, Task 2. Before this change, `programme` matched
// neither the bespoke quote-first guard (`tier.kind === "one_off"`) nor the
// (dead) managed branch, so it fell through to the pay-first one-off Stripe
// Checkout at the bottom of the route: a quote-only tier would have charged
// £79.99 immediately. These tests pin the fix: programme is quote-first, like
// bespoke, with no Stripe session and no charge.
describe("POST /api/curation, programme tier (Task 2)", () => {
  it("creates an awaiting_quote row, no Stripe session, and sends the quote-request email", async () => {
    const res = await POST(req(PROGRAMME_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ mode: "enquiry", id: "cr_1" });

    // No charge: this is the whole point of the fix.
    expect(sessionsCreateMock).not.toHaveBeenCalled();

    // The row is created quote-first, with the new intake fields mapped through.
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      tier: "programme",
      status: "awaiting_quote",
      amount_paid_gbp: null,
      site_count: 1,
      pieces_estimate: 8,
      rotation_cadence: "biannual",
      sector: "office",
    });

    // The existing quote-request email, same template bespoke uses.
    expect(notifyEnquiryMock).toHaveBeenCalledOnce();
    const [emailArgs] = notifyEnquiryMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(emailArgs).toMatchObject({
      template: "curation_enquiry_received",
      to: "maya@example.com",
    });
  });

  it("rejects a non-positive piecesEstimate with 400", async () => {
    const res = await POST(req({ ...PROGRAMME_BODY, piecesEstimate: 0 }));

    expect(res.status).toBe(400);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("rejects an out-of-enum rotationCadence with 400", async () => {
    const res = await POST(req({ ...PROGRAMME_BODY, rotationCadence: "monthly" }));

    expect(res.status).toBe(400);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("rejects a retired tier with 400, not 500", async () => {
    // managed_monthly/managed_quarterly were dropped from CURATION_TIERS in
    // Task 1. A submission naming one must fail validation (400), not reach
    // the DB and trip the tier CHECK constraint (which would 500).
    const res = await POST(req({ ...ONE_OFF_BODY, tier: "managed_monthly" }));

    expect(res.status).toBe(400);
    expect(inserts).toHaveLength(0);
  });
});
