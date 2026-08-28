// 09 §C.5 matrix (item 1.1, generalised per item 4.3).
//
// One paid order must produce exactly one email per recipient. The §C.5 table
// is the contract, and it is declared below rather than described in prose, so
// a row naming a template nobody built, or a template nobody sends, fails here.
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
import { render } from "@react-email/components";
import type React from "react";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

// Count sends at the one place they all funnel through, so the test does not
// care whether a send came from the dispatcher or from inline code.
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/order-tracking-token", () => ({ signOrderToken: async () => "tok" }));
vi.mock("@/lib/notifications", () => ({ createNotification: async () => {} }));
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

const VENUE_EMAIL = "venue@example.com";

/** Same order, but the placement earned the venue a share. */
const INPUT_WITH_VENUE = {
  ...INPUT,
  venue: { slug: "the-copper-kettle", revenue: 21, artistSlug: "alice" },
};

/**
 * A placement that earned the venue NOTHING. This is the case §C.5's "+1 venue
 * email only when a revenue share exists" is actually about: a venue is
 * attached, and there is still no share. Passing `venue: null` instead would
 * test "no venue", which any implementation passes.
 */
const INPUT_VENUE_NO_SHARE = {
  ...INPUT,
  venue: { slug: "the-copper-kettle", revenue: 0, artistSlug: "alice" },
};

/**
 * Admin client that also resolves a venue profile and its auth user, which the
 * default `makeDb()` does not, because the original fixture never exercised the
 * venue branch.
 */
function makeDbWithVenue() {
  return {
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user:
              id === "u-venue"
                ? { id: "u-venue", email: VENUE_EMAIL }
                : { id: "u-artist", email: ARTIST },
          },
        }),
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data:
              table === "venue_profiles"
                ? { user_id: "u-venue", name: "The Copper Kettle" }
                : { name: "Alice Artist" },
            error: null,
          }),
          maybeSingle: async () => ({ data: { name: "Alice Artist" }, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
}

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


// 09 item 4.3. The §C.5 matrix, declared rather than described.
//
// Three of its rows name templates that shipped under a different id from the
// one the doc proposed, and the difference is recorded here rather than left for
// someone to trip over:
//
//   doc `venue_placement_sale`      -> `venue_sale_from_placement`
//   doc `customer_order_cancelled`  -> `customer_order_status_update`
//   doc `operational_admin_alert`   -> `admin_alert`
//
// The first two because the shipped templates cover a wider case than the doc's
// name implies (a per-sale venue notice distinct from the periodic statement; a
// status template covering cancelled/refunded/disputed rather than cancelled
// alone), and the third because K1 collapsed eight admin notifiers into one
// generic alert.
const C5_MATRIX = [
  { event: "order.placed", recipient: "customer", template: "customer_order_placed" },
  { event: "order.placed", recipient: "artist", template: "artist_order_received" },
  { event: "order.placed (revenue share)", recipient: "venue", template: "venue_sale_from_placement" },
  { event: "order.processing", recipient: "customer", template: "customer_order_processing" },
  { event: "order.out_for_delivery", recipient: "customer", template: "customer_order_out_for_delivery" },
  { event: "order.delivered", recipient: "customer", template: "customer_order_delivered" },
  { event: "48h after delivery", recipient: "customer", template: "customer_confirm_delivery_48h" },
  { event: "order.cancelled", recipient: "customer", template: "customer_order_status_update" },
  { event: "refund requested", recipient: "admin", template: "admin_alert" },
  { event: "refund requested", recipient: "artist", template: "artist_refund_requested" },
  { event: "refund approved", recipient: "customer", template: "customer_refund_confirmation" },
  { event: "refund approved", recipient: "artist", template: "artist_refund_notification" },
  { event: "refund rejected", recipient: "customer", template: "customer_refund_rejected" },
  { event: "payout sent", recipient: "artist", template: "artist_payout_sent" },
  { event: "payout failed", recipient: "artist", template: "artist_payout_failed" },
] as const;

/** Templates §C.5 explicitly retires. None may fire on the order-placed path. */
const RETIRED = [
  "customer_order_receipt",
  "artist_work_sold",
  "artist_order_confirmation",
  "customer_shipping_confirmation",
  "customer_delivery_confirmation",
] as const;

describe("the §C.5 matrix matches what is actually wired (09 item 4.3)", () => {
  it("names a template the registry carries, on every row", async () => {
    // Catches a matrix row for a template nobody built.
    const { EMAIL_REGISTRY } = await import("@/emails/registry");
    const ids = new Set(EMAIL_REGISTRY.map((t) => t.id));
    for (const row of C5_MATRIX) {
      expect(ids.has(row.template), `${row.event} -> ${row.template} is not in EMAIL_REGISTRY`).toBe(true);
    }
  });

  it("names a template something actually sends, on every row", async () => {
    // Catches the other direction: a matrix row that is documentation only. The
    // dispatcher rows arrive through TEMPLATE_BINDINGS rather than by literal
    // id, so they resolve through it.
    const { readFileSync } = await import("node:fs");
    const { readdir } = await import("node:fs/promises");
    const path = (await import("node:path")).default;
    const { DISPATCHER_NAME_TO_REGISTRY_ID } = await import("@/lib/email/dispatcher-ids");

    async function walk(dir: string): Promise<string[]> {
      const out: string[] = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
      }
      return out;
    }

    const referenced = new Set<string>();
    for (const file of await walk(path.join(process.cwd(), "src"))) {
      for (const m of readFileSync(file, "utf8").matchAll(/template:\s*["']([a-z0-9_]+)["']/g)) {
        const id = m[1];
        referenced.add(DISPATCHER_NAME_TO_REGISTRY_ID[id] ?? id);
      }
    }

    const unsent = C5_MATRIX.filter((r) => !referenced.has(r.template));
    expect(unsent.map((r) => `${r.event} -> ${r.template}`)).toEqual([]);
  });

  it("has no retired template still referenced by a send", async () => {
    // §C.5 retires five. They stay in the registry for the preview library, but
    // nothing may send them: each was a second email saying what another already
    // said, which is what made one checkout produce 2 buyer and 3 artist emails.
    const { readFileSync } = await import("node:fs");
    const { readdir } = await import("node:fs/promises");
    const path = (await import("node:path")).default;

    async function walk(dir: string): Promise<string[]> {
      const out: string[] = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
      }
      return out;
    }

    const offenders: string[] = [];
    for (const file of await walk(path.join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      for (const retired of RETIRED) {
        if (new RegExp(`template:\\s*["']${retired}["']`).test(source)) {
          offenders.push(`${path.relative(process.cwd(), file)} sends ${retired}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the venue row of the matrix: +1 email ONLY when a revenue share exists", () => {
  // The clause the original item-1.1 test could not check, because its fixture
  // had `venue: null`. It is the difference between a venue being told about a
  // sale from their wall and never hearing about it.
  it("sends the venue nothing when the placement earned them nothing", async () => {
    // A venue IS attached here, with a zero share. Written with `venue: null`
    // first, which was a weaker test than it looked: every implementation passes
    // that, including one with the revenue check removed. Verified by removing
    // it, watching this stay green, and rewriting it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDbWithVenue() as any, INPUT_VENUE_NO_SHARE as any);

    expect(recipients()).not.toContain(VENUE_EMAIL);
    expect(templates()).not.toContain("venue_sale_from_placement");
    // And the other two still go, so a zero share is not a broken order.
    expect(recipients()).toHaveLength(2);
  });

  it("sends the venue nothing when no venue is attached at all", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDbWithVenue() as any, INPUT as any);
    expect(recipients()).not.toContain(VENUE_EMAIL);
  });

  it("sends the venue exactly one email when a share was earned", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDbWithVenue() as any, INPUT_WITH_VENUE as any);

    const toVenue = recipients().filter((t) => t === VENUE_EMAIL);
    expect(toVenue, `venue got ${toVenue.length}: ${templates().join(", ")}`).toHaveLength(1);
    expect(templates()).toContain("venue_sale_from_placement");
  });

  it("still sends the buyer and the artist exactly one each alongside it", async () => {
    // The venue email must be an ADDITION, not a replacement, and must not
    // duplicate either of the other two.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDbWithVenue() as any, INPUT_WITH_VENUE as any);

    expect(recipients().filter((t) => t === BUYER)).toHaveLength(1);
    expect(recipients().filter((t) => t === ARTIST)).toHaveLength(1);
    expect(recipients(), `sent: ${templates().join(", ")}`).toHaveLength(3);
  });

  it("keys the venue email on the order, so a Stripe redelivery cannot double it", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDbWithVenue() as any, INPUT_WITH_VENUE as any);

    const venueCall = sendEmailMock.mock.calls
      .map((c) => c[0] as { to: string; idempotencyKey: string })
      .find((c) => c.to === VENUE_EMAIL);
    expect(venueCall?.idempotencyKey).toContain("ord_1");
  });

  it("tells the venue what it earned, not just that something sold", async () => {
    // Asserted on the RENDERED email, not on props. Every direct sendEmail call
    // in this codebase passes `Template({...})` rather than
    // `createElement(Template, {...})`, so the element carries the shell's props
    // and not the template's, and a props assertion here would be checking the
    // wrong object. Rendering also makes the claim stronger: the venue actually
    // sees the numbers, rather than them merely having been handed over.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendOrderConfirmations(makeDbWithVenue() as any, INPUT_WITH_VENUE as any);

    const venueCall = sendEmailMock.mock.calls
      .map((c) => c[0] as { to: string; react: React.ReactElement })
      .find((c) => c.to === VENUE_EMAIL);
    const html = await render(venueCall!.react);

    expect(html, "the venue's own share is missing from their email").toContain("£21.00");
    expect(html, "the sale total is missing").toContain("£210.00");
    expect(html).toContain("Sunset Study");
  });
});
