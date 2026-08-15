// 09 §C, item 1.1. One paid order must produce exactly one email per recipient.
//
// Before this: sendOrderConfirmations called recordOrderEvent (which dispatches
// order_placed -> customer_order_placed AND artist_order_received) and THEN sent
// three more templates inline — customer_order_receipt to the buyer,
// artist_work_sold and artist_order_confirmation to the artist. So a single
// checkout put 2 emails in the buyer's inbox and 3 in the artist's, all saying the
// same thing with different subject lines.
//
// The counts here are the contract. If a future change adds a template to the
// order-placed path, this test is where it has to be justified.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

// Count sends at the one place they all funnel through, so the test does not
// care whether a send came from the dispatcher or from inline code.
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/order-tracking-token", () => ({ signOrderToken: async () => "tok" }));
// recordOrderEvent builds its own admin client; without this it throws on the
// missing service-role key, the caller's try/catch swallows it, and the
// dispatcher emails never fire — which would make this test pass for the wrong
// reason (one email each, because the good path was dead).
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: async () => ({ error: null }),
      upsert: () => ({
        select: () => ({ maybeSingle: async () => ({ data: { id: "ev-1" }, error: null }) }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(fn),
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { sendOrderConfirmations } from "@/lib/orders/confirmations";

const BUYER = "buyer@example.com";
const ARTIST = "artist@example.com";

/** Minimal admin client: an artist auth user and an artist profile row. */
function makeDb() {
  return {
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { id: "u-artist", email: ARTIST } } }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { name: "Alice Artist" }, error: null }),
          maybeSingle: async () => ({ data: { name: "Alice Artist" }, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
}

const INPUT = {
  orderId: "ord_1",
  paymentIntentId: "pi_1",
  buyerEmail: BUYER,
  buyerName: "Bob Buyer",
  items: [{ title: "Sunset Study", qty: 1, price: { amount: 20000, currency: "GBP" as const } }],
  subtotal: 200,
  shippingCost: 10,
  total: 210,
  address: {
    line1: "1 Test Street",
    line2: null,
    city: "London",
    postcode: "E1 6AN",
    country: "GB",
  },
  artistUserId: "u-artist",
  artistRevenue: 180,
  firstItemTitle: "Sunset Study",
  stripeSessionId: "cs_1",
  venue: null,
};

/** Recipients of every sendEmail call, in order. */
function recipients() {
  return sendEmailMock.mock.calls.map((c) => (c[0] as { to: string }).to);
}
function templates() {
  return sendEmailMock.mock.calls.map((c) => (c[0] as { template: string }).template);
}

afterEach(() => {
  sendEmailMock.mockClear();
});
beforeEach(() => {
  // mockResolvedValue, not clearAllMocks + re-set: the dispatcher inspects the
  // result, so a mock that resolves undefined makes it throw and swallow sends.
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m" });
});

describe("one paid order, one email per recipient (09 C)", () => {
  it("sends the buyer exactly one email", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDb() as any, INPUT as any);

    const toBuyer = recipients().filter((t) => t === BUYER);
    expect(
      toBuyer,
      `buyer got ${toBuyer.length} emails: ${templates().join(", ")}`,
    ).toHaveLength(1);
  });

  it("sends the artist exactly one email", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDb() as any, INPUT as any);

    const toArtist = recipients().filter((t) => t === ARTIST);
    expect(
      toArtist,
      `artist got ${toArtist.length} emails: ${templates().join(", ")}`,
    ).toHaveLength(1);
  });

  it("uses the dispatcher templates, not the retired ones", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDb() as any, INPUT as any);

    const sent = templates();
    expect(sent).toContain("customer_order_placed");
    expect(sent).toContain("artist_order_received");
    for (const retired of [
      "customer_order_receipt",
      "artist_work_sold",
      "artist_order_confirmation",
    ]) {
      expect(sent, `${retired} is retired and must not fire`).not.toContain(retired);
    }
  });

  it("still carries the buyer's billing address and the artist's sale amount", async () => {
    // The retired templates were the only ones showing these, so consolidating
    // without passing them through would quietly downgrade both emails.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDb() as any, INPUT as any);

    const calls = sendEmailMock.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const buyerCall = calls.find((c) => c.to === BUYER);
    const artistCall = calls.find((c) => c.to === ARTIST);

    const buyerProps = (buyerCall?.react as { props?: Record<string, unknown> })?.props ?? {};
    const artistProps = (artistCall?.react as { props?: Record<string, unknown> })?.props ?? {};

    expect(buyerProps.billingAddress, "billing address dropped").toBeTruthy();
    expect(artistProps.saleAmount, "sale amount dropped").toMatchObject({ amount: 18000 });
  });
});
