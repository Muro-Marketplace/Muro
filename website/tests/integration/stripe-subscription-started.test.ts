// 09 §D.5 / item 3.3. The first paid moment produced no email at all.
//
// Six `subscription_*` templates were registered and five were wired. There was
// no "started", so an artist who began paying got nothing in writing: no amount,
// no billing date, no record. And the comment on the invoice.paid branch said
// the signup invoice was "covered by subscription_created or the checkout
// receipt", which is exactly why nobody noticed. Neither existed.
//
// The existing stripe-webhook.test.ts pins `constructEvent` to one hardcoded
// event, so it cannot drive a subscription event. This file gives the fake a
// controllable one and mocks the same surface.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, getUserByIdMock, nextEvent, paidLoanDeletedMock, curationDeletedMock, rpcMock } =
  vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  nextEvent: { value: null as unknown },
  paidLoanDeletedMock: vi.fn(async () => {}),
  curationDeletedMock: vi.fn(async () => {}),
  rpcMock: vi.fn(
    async (): Promise<{ data: unknown; error: { message: string } | null }> => ({
      data: [{ credited: true, referrer_id: "u-ref", new_free_until: "2026-09-27" }],
      error: null,
    }),
  ),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    rpc: rpcMock,
    auth: { admin: { getUserById: getUserByIdMock } },
    storage: { from: () => ({ createSignedUrl: () => ({ data: null, error: null }) }) },
  }),
}));
vi.mock("@/lib/placements/paid-loan-billing", () => ({
  recordPaidLoanSubscription: vi.fn(async () => {}),
  handleInvoicePaid: vi.fn(async () => false),
  handleInvoicePaymentFailed: vi.fn(async () => false),
  handleSubscriptionDeleted: paidLoanDeletedMock,
}));
vi.mock("@/lib/curation/billing", () => ({
  handleCurationInvoicePaid: vi.fn(async () => false),
  handleCurationInvoiceFailed: vi.fn(async () => false),
  handleCurationSubscriptionDeleted: curationDeletedMock,
}));
vi.mock("@/lib/stripe-connect", () => ({
  scheduleTransfer: vi.fn(async () => ({ ok: true })),
  recordBlockedLeg: vi.fn(async () => {}),
}));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, skipped: false })) }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: () => nextEvent.value },
    subscriptions: { cancel: vi.fn() },
    refunds: { create: vi.fn() },
    transfers: { createReversal: vi.fn() },
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";
import { sendEmail } from "@/lib/email/send";
import { sendAdminAlert } from "@/lib/email/admin-alert";

const CUSTOMER = "cus_123";
const PRICE_PREMIUM = "price_premium_monthly";

/** Minutes from now, in Stripe's epoch seconds. */
function epoch(daysFromNow: number): number {
  return Math.floor((Date.now() + daysFromNow * 86_400_000) / 1000);
}

function subscription(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    customer: CUSTOMER,
    status: "active",
    metadata: {},
    trial_end: null,
    current_period_start: epoch(0),
    current_period_end: epoch(30),
    items: {
      data: [
        {
          price: {
            id: PRICE_PREMIUM,
            unit_amount: 999,
            currency: "gbp",
            recurring: { interval: "month" },
          },
          current_period_start: epoch(0),
          current_period_end: epoch(30),
        },
      ],
    },
    ...over,
  };
}

/** The format epochToUkDate produces. */
function ukDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function event(type: string, object: unknown) {
  return { id: `evt_${type}`, type, data: { object } };
}

/** Table router. Only what this branch touches needs to be real. */
function installDb(opts: { profile?: unknown } = {}) {
  const profile = "profile" in opts ? opts.profile : { id: "u-artist", user_id: "u-artist", name: "Maya Chen" };
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: profile }),
        single: async () => ({ data: profile }),
      }),
    }),
    update: () => ({ eq: async () => ({ error: null }) }),
    upsert: async () => ({ error: null }),
    insert: async () => ({ error: null, data: null }),
  }));
}

function post(): Request {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "sig" },
  });
}

/** The subscription_started sends only, ignoring anything else the route fires. */
function startedSends() {
  return vi.mocked(sendEmail).mock.calls
    .map((c) => c[0])
    .filter((c) => c.template === "subscription_started");
}

beforeEach(() => {
  fromMock.mockReset();
  getUserByIdMock.mockReset();
  vi.mocked(sendEmail).mockClear();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.STRIPE_PRICE_PREMIUM = PRICE_PREMIUM;
  getUserByIdMock.mockResolvedValue({ data: { user: { email: "maya@example.com" } } });
  installDb();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("customer.subscription.created sends subscription_started", () => {
  it("sends exactly one, to the artist", async () => {
    nextEvent.value = event("customer.subscription.created", subscription());

    const res = await POST(post());

    expect(res.status).toBe(200);
    const sends = startedSends();
    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe("maya@example.com");
    expect(sends[0].userId).toBe("u-artist");
  });

  it("keys the send on the subscription, so a Stripe redelivery cannot double it", async () => {
    // Stripe redelivers on any non-2xx and on its own schedule. Without a
    // stable key an artist gets "you're on Premium" twice.
    nextEvent.value = event("customer.subscription.created", subscription());

    await POST(post());

    expect(startedSends()[0].idempotencyKey).toBe("subscription_started:sub_1");
  });

  it("quotes the real price off the subscription item", async () => {
    nextEvent.value = event("customer.subscription.created", subscription());

    await POST(post());

    // £9.99, not a hardcoded plan table that drifts from Stripe.
    expect(JSON.stringify(startedSends()[0].react)).toContain("9.99");
  });

  it("says Premium, from the price id, not a guess", async () => {
    nextEvent.value = event("customer.subscription.created", subscription());
    await POST(post());
    expect(startedSends()[0].subject).toBe("You're on Wallplace Premium");
  });

  it("puts the FIRST charge at the trial end when there is a trial", async () => {
    // Otherwise the email tells someone they were billed today for a plan they
    // have not paid for yet.
    nextEvent.value = event(
      "customer.subscription.created",
      subscription({ status: "trialing", trial_end: epoch(14) }),
    );

    await POST(post());

    const rendered = JSON.stringify(startedSends()[0].react);
    expect(rendered).toContain(ukDate(epoch(14)));
    expect(rendered).toContain("trial");
    // And the period START must appear NOWHERE, or `firstBillingDate: cpStart`
    // passes the assertion above purely because `trialEndsAt` renders the same
    // date elsewhere in the body. It did.
    expect(rendered).not.toContain(ukDate(epoch(0)));
  });

  it("sends nothing for an UPDATED subscription", async () => {
    // customer.subscription.updated fires on renewals, status ticks and
    // cancel-at-period-end. A "you're on Premium" email on any of those is
    // noise at best and a lie at worst.
    nextEvent.value = event("customer.subscription.updated", subscription());

    await POST(post());

    expect(startedSends()).toHaveLength(0);
  });

  it("sends nothing when no artist profile matches the customer", async () => {
    installDb({ profile: null });
    nextEvent.value = event("customer.subscription.created", subscription());

    await POST(post());

    expect(startedSends()).toHaveLength(0);
  });

  it("sends nothing when the artist has no email address", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { email: null } } });
    nextEvent.value = event("customer.subscription.created", subscription());

    await POST(post());

    expect(startedSends()).toHaveLength(0);
  });

  it("sends nothing for an unrecognised price, rather than guessing a plan", async () => {
    // D12: the old code defaulted to "core" on an unknown price and charged Pro
    // artists 15%. The same rule applies to what we tell them they bought.
    nextEvent.value = event(
      "customer.subscription.created",
      subscription({
        items: { data: [{ price: { id: "price_unknown", unit_amount: 999, currency: "gbp" } }] },
      }),
    );

    await POST(post());

    expect(startedSends()).toHaveLength(0);
  });

  it("still returns 200 when the email throws, so Stripe does not retry a done job", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend down"));
    nextEvent.value = event("customer.subscription.created", subscription());

    const res = await POST(post());

    expect(res.status).toBe(200);
  });
});

describe("the invoice that follows does not send a second time", () => {
  it("ignores the signup invoice (billing_reason subscription_create)", async () => {
    // The renewal receipt must not fire on the first invoice, because
    // subscription_started already covers it. That was the claim the old
    // comment made about code that did not exist.
    nextEvent.value = event("invoice.paid", {
      id: "in_1",
      customer: CUSTOMER,
      billing_reason: "subscription_create",
      amount_paid: 999,
      currency: "gbp",
      subscription: "sub_1",
      lines: { data: [] },
    });

    await POST(post());

    const receipts = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "subscription_renewal_receipt");
    expect(receipts).toHaveLength(0);
  });
});


// 04 D1 / item 0.2. `checkout.session.completed` does not mean paid.
//
// It fires when the customer finishes the flow. A delayed payment method (BACS
// Direct Debit, SEPA, bank transfer, some cards under SCA) fires it with
// `payment_status: "unpaid"` and settles days later, or never. Every branch
// behind it books something: an order row, a stock decrement, an artist
// transfer, a curation request marked paid.
describe("checkout.session.completed is gated on settlement", () => {
  function completed(paymentStatus: string | undefined, over: Record<string, unknown> = {}) {
    return event("checkout.session.completed", {
      id: "cs_1",
      mode: "payment",
      payment_status: paymentStatus,
      metadata: {},
      amount_total: 5000,
      ...over,
    });
  }

  it("does nothing at all for an UNPAID session", async () => {
    nextEvent.value = completed("unpaid");

    const res = await POST(post());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ awaiting_payment: true });
    // Nothing beyond the event-dedup claim, which runs before the gate and is
    // meant to: no order row, no stock decrement, no transfer, no curation row
    // marked paid.
    const tables = fromMock.mock.calls.map((c) => c[0]);
    expect(tables.filter((t) => t !== "stripe_webhook_events")).toEqual([]);
  });

  it("answers 200 so Stripe does not retry a session that is merely waiting", async () => {
    // A non-2xx would make Stripe redeliver on a schedule, forever, for a
    // payment that is simply in flight. async_payment_succeeded is the event
    // that says it landed.
    nextEvent.value = completed("unpaid");
    expect((await POST(post())).status).toBe(200);
  });

  /** Tables the handler touched, excluding the event-dedup claim. */
  function tablesTouched(): string[] {
    return fromMock.mock.calls.map((c) => c[0]).filter((t) => t !== "stripe_webhook_events");
  }

  it("lets a PAID session through to the branches below", async () => {
    installDb();
    nextEvent.value = completed("paid", {
      metadata: { kind: "curation_request", curation_request_id: "cr_1" },
    });

    await POST(post());

    expect(tablesTouched()).toContain("curation_requests");
  });

  it("lets a zero-total session through", async () => {
    // `no_payment_required` is a 100% discount or a trial billing nothing today.
    // Nothing is owed, so it is settled, and gating on `=== "paid"` alone would
    // refuse a legitimate free order. Asserting a real table is reached, not
    // merely that the mock saw something: the dedup claim runs before the gate,
    // so `toHaveBeenCalled()` is true either way and the test would pass on the
    // mutation it exists to catch.
    installDb();
    nextEvent.value = completed("no_payment_required", {
      metadata: { kind: "curation_request", curation_request_id: "cr_1" },
    });

    await POST(post());

    expect(tablesTouched()).toContain("curation_requests");
  });

  it("does not gate a subscription event, which carries no payment_status", async () => {
    nextEvent.value = event("customer.subscription.created", subscription());

    const res = await POST(post());

    expect(res.status).toBe(200);
    expect(await res.json()).not.toMatchObject({ awaiting_payment: true });
  });
});


// 04 D13 / item 0.5. Three separate `customer.subscription.deleted` branches.
//
// The SaaS one, the paid-loan one and the curation one are three top-level `if`
// blocks in one handler, and every one of them must run for a single event:
// an artist upgrading a plan produces a "stale" SaaS deletion, and the paid-loan
// and curation reconcilers still need to see it.
//
// D13 is what happens when they do not. The SaaS block used to `return` on the
// stale case, which exited the WHOLE handler, so an artist changing plan could
// leave a paid-loan billing row stuck `active` after Stripe had cancelled it.
// That specific `return` is now a scoped `if`, but the SHAPE still invites the
// bug: a `return` added to any of the three silently skips its siblings.
//
// 0.5 asks for the three to be consolidated into one branch. That is a large
// mechanical edit inside the money webhook, whose current behaviour is correct,
// so this pins the invariant behaviourally instead: all three run, for one
// event, whatever the SaaS half decides. A reintroduced early return fails here.
describe("customer.subscription.deleted reaches all three reconcilers (D13)", () => {
  beforeEach(() => {
    paidLoanDeletedMock.mockClear();
    curationDeletedMock.mockClear();
  });

  function deleted(profile: unknown) {
    fromMock.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null, data: null }),
    }));
    nextEvent.value = event("customer.subscription.deleted", subscription({ id: "sub_old" }));
  }

  it("runs the paid-loan and curation reconcilers on a normal cancellation", async () => {
    deleted({ user_id: "u-artist", name: "Maya", subscription_plan: "premium", stripe_subscription_id: "sub_old" });

    await POST(post());

    expect(paidLoanDeletedMock).toHaveBeenCalledTimes(1);
    expect(curationDeletedMock).toHaveBeenCalledTimes(1);
  });

  it("STILL runs them when the SaaS half decides the deletion is stale", async () => {
    // THE D13 regression. The profile already points at a newer subscription,
    // which is what an upgrade looks like, so the SaaS half correctly does
    // nothing. The other two must not be skipped with it.
    deleted({ user_id: "u-artist", name: "Maya", subscription_plan: "premium", stripe_subscription_id: "sub_new" });

    await POST(post());

    expect(paidLoanDeletedMock).toHaveBeenCalledTimes(1);
    expect(curationDeletedMock).toHaveBeenCalledTimes(1);
  });

  it("still runs them when no artist profile matches the customer", async () => {
    deleted(null);

    await POST(post());

    expect(paidLoanDeletedMock).toHaveBeenCalledTimes(1);
    expect(curationDeletedMock).toHaveBeenCalledTimes(1);
  });

  it("returns 200 so Stripe does not redeliver a cancellation it handled", async () => {
    deleted({ user_id: "u-artist", name: "Maya", subscription_plan: "premium", stripe_subscription_id: "sub_old" });
    expect((await POST(post())).status).toBe(200);
  });
});


// Owner decision 10 / 04 item 5.3 / D14. The referral credit goes through ONE
// atomic RPC. The old shape was read-modify-write across two rows in two
// statements, so a Stripe redelivery could double a 30-day credit, and — the
// half that actually happened — its select named `free_until` before migration
// 115 created it, so the whole statement was rejected and the programme never
// credited anyone.
describe("customer.subscription.created credits the referrer atomically", () => {
  beforeEach(() => {
    rpcMock.mockClear();
    installDb();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("calls extend_free_until for the referred artist, 30 days", async () => {
    nextEvent.value = event("customer.subscription.created", subscription());

    await POST(post());

    expect(rpcMock).toHaveBeenCalledWith("extend_free_until", {
      p_referred_id: "u-artist",
      p_days: 30,
    });
  });

  it("calls it ONCE per event: idempotency lives in the RPC, not in a re-read", async () => {
    nextEvent.value = event("customer.subscription.created", subscription());
    await POST(post());
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("does not credit on customer.subscription.updated", async () => {
    // A plan change or a status tick is not a first payment.
    nextEvent.value = event("customer.subscription.updated", subscription());
    await POST(post());
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("does not credit an unpaid status", async () => {
    nextEvent.value = event("customer.subscription.created", subscription({ status: "incomplete" }));
    await POST(post());
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("still answers 200 when the credit RPC fails", async () => {
    // The subscription is recorded; a credit failure must not make Stripe
    // redeliver an event whose real work is done.
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    nextEvent.value = event("customer.subscription.created", subscription());

    expect((await POST(post())).status).toBe(200);
  });
});


// The event-dedup claim must be RELEASED when processing crashes, or Stripe's
// retry hits the 23505 and is waved through as a duplicate with the work never
// done - a transient fault becomes a permanently dropped event. The release-on-
// returned-500 path existed; this pins the 2026-08-28 audit's addition, the
// try/catch that routes a THROWN error (Stripe SDK, email render) into the
// same release.
describe("a branch that throws releases the event-dedup claim", () => {
  const releasedIds: string[] = [];

  beforeEach(() => {
    releasedIds.length = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") {
        return {
          insert: async () => ({ error: null }),
          delete: () => ({
            eq: async (_col: string, id: string) => {
              releasedIds.push(id);
              return { error: null };
            },
          }),
        };
      }
      if (table === "curation_requests") {
        const row = { id: "cr_1", tier: "single_wall", venue_name: "Kettle", contact_name: "Sam", contact_email: null, status: "awaiting_quote" };
        const c: Record<string, unknown> = {
          maybeSingle: async () => ({ data: row, error: null }),
          single: async () => ({ data: row, error: null }),
        };
        c.eq = () => c;
        return { select: () => c, update: () => ({ eq: async () => ({ error: null }) }) };
      }
      return installDbShape();
    });
    // The curation branch calls sendAdminAlert OUTSIDE any try: the crash site.
    vi.mocked(sendAdminAlert).mockRejectedValueOnce(new Error("smtp exploded"));
    nextEvent.value = event("checkout.session.completed", {
      id: "cs_boom",
      mode: "payment",
      payment_status: "paid",
      amount_total: 49900,
      metadata: { kind: "curation_request", curation_request_id: "cr_1" },
    });
  });

  function installDbShape() {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
          single: async () => ({ data: null }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null, data: null }),
    };
  }

  it("answers 500 so Stripe retries, and deletes the claim so the retry is processed", async () => {
    const res = await POST(post());
    expect(res.status).toBe(500);
    expect(releasedIds).toEqual(["evt_checkout.session.completed"]);
  });
});

// T9 (04 Phase 8, items 8.5 + 8.6). A collect-from-venue order books like a
// collection order — delivered immediately, no shipping lifecycle, immediate
// payout — and the venue is TOLD, because a stranger will present an order
// number at their counter.
describe("checkout.session.completed books a collect_venue order", () => {
  const CART_ROW = {
    cart: [{ workId: "w-1", title: "Vietnamese Village", artistSlug: "fin-coles", price: 100, quantity: 1, collectPlacementId: "p-wall" }],
    shipping: {
      fullName: "Jo Bloggs",
      email: "jo@x.com",
      fulfilmentMethod: "collect_venue",
      collectionAddress: "The Copper Kettle, 1 High St, Hampton",
    },
    source: "qr",
    venue_slug: "the-copper-kettle",
    artist_slugs: ["fin-coles"],
    expected_subtotal_pence: 10000,
    expected_shipping_pence: 0,
  };

  let orderInsert: Record<string, unknown> | null = null;
  const workFlagUpdates: Array<Record<string, unknown>> = [];
  const placementUpdates: Array<Record<string, unknown>> = [];

  function setupCartDb(shippingOverride?: Record<string, unknown>) {
    orderInsert = null;
    workFlagUpdates.length = 0;
    placementUpdates.length = 0;
    const shippingRow = shippingOverride ?? CART_ROW.shipping;
    fromMock.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        order: async () => ({ data: [], error: null }),
        limit: async () => ({ data: [], error: null }),
        // Awaiting the chain itself (a filter with no terminal) resolves empty.
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      };
      chain.eq = () => chain;
      chain.or = () => chain;
      chain.in = () => chain;

      if (table === "cart_sessions") {
        const c: Record<string, unknown> = {
          maybeSingle: async () => ({
            data: {
              stripe_session_id: "cs_1",
              cart: CART_ROW.cart,
              shipping: shippingRow,
              source: CART_ROW.source,
              venue_slug: CART_ROW.venue_slug,
              artist_slugs: CART_ROW.artist_slugs,
              expected_subtotal_pence: CART_ROW.expected_subtotal_pence,
              expected_shipping_pence: CART_ROW.expected_shipping_pence,
              artist_shipping_pence: {},
            },
            error: null,
          }),
        };
        c.eq = () => c;
        c.gt = () => c;
        return { select: () => c, update: () => ({ eq: async () => ({ error: null }) }) };
      }
      if (table === "orders") {
        return {
          select: () => chain,
          insert: (row: Record<string, unknown>) => {
            orderInsert = row;
            return {
              select: () => ({ maybeSingle: async () => ({ data: { id: row.id }, error: null }) }),
              then: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(fn),
            };
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "artist_works") {
        return {
          select: () => chain,
          update: (row: Record<string, unknown>) => {
            workFlagUpdates.push(row);
            return {
              eq: async () => ({ error: null }),
              in: async () => ({ error: null }),
            };
          },
        };
      }
      if (table === "artist_profiles") {
        const c: Record<string, unknown> = {
          maybeSingle: async () => ({ data: { user_id: "u-fin" }, error: null }),
          single: async () => ({ data: { user_id: "u-fin" }, error: null }),
          in: async () => ({
            data: [{ user_id: "u-fin", slug: "fin-coles", name: "Fin Coles", subscription_plan: "core", subscription_status: "active", trial_end: null, free_until: null }],
            error: null,
          }),
        };
        c.eq = () => c;
        return { select: () => c };
      }
      if (table === "venue_profiles") {
        const c: Record<string, unknown> = {
          maybeSingle: async () => ({ data: { user_id: "u-venue", name: "The Copper Kettle" }, error: null }),
        };
        c.eq = () => c;
        return { select: () => c };
      }
      if (table === "placements") {
        return {
          select: () => chain,
          update: (row: Record<string, unknown>) => {
            placementUpdates.push(row);
            return {
              eq: async () => ({ error: null }),
              in: async () => ({ error: null }),
            };
          },
        };
      }
      return {
        select: () => chain,
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    });
  }

  function completedSession() {
    return event("checkout.session.completed", {
      id: "cs_1",
      mode: "payment",
      payment_status: "paid",
      customer_email: "jo@x.com",
      payment_intent: "pi_1",
      amount_total: 10000,
      metadata: { kind: "cart_checkout", fulfilment_method: "collect_venue" },
    });
  }

  beforeEach(() => {
    setupCartDb();
    getUserByIdMock.mockResolvedValue({ data: { user: { email: "venue@x.com" } } });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("books the order delivered immediately, with the collection address on it", async () => {
    await POST(post());

    expect(orderInsert).toBeTruthy();
    expect(orderInsert!).toMatchObject({
      fulfilment_method: "collect_venue",
      status: "delivered",
      collection_address: "The Copper Kettle, 1 High St, Hampton",
    });
    expect(orderInsert!.delivered_at).toEqual(expect.any(String));
  });

  it("tells the venue: one email keyed on the order, so a redelivery cannot double it", async () => {
    await POST(post());

    const venueSends = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "venue_collection_pending");
    expect(venueSends).toHaveLength(1);
    expect(venueSends[0].to).toBe("venue@x.com");
    expect(venueSends[0].idempotencyKey).toMatch(/^venue_collection_pending:/);
    expect(JSON.stringify(venueSends[0].react)).toContain("Vietnamese Village");
  });

  it("sends the venue nothing on a plain SHIP order", async () => {
    // The cart row is the data-of-record (metadata is only the fallback), so
    // the control varies the ROW, not the event.
    setupCartDb({
      fullName: "Jo Bloggs",
      email: "jo@x.com",
      fulfilmentMethod: "ship",
      addressLine1: "2 Low St",
      city: "London",
      postcode: "SW1A 1AA",
      country: "GB",
    });
    nextEvent.value = event("checkout.session.completed", {
      id: "cs_1",
      mode: "payment",
      payment_status: "paid",
      customer_email: "jo@x.com",
      payment_intent: "pi_1",
      amount_total: 10000,
      metadata: { kind: "cart_checkout", fulfilment_method: "ship" },
    });

    await POST(post());

    const venueSends = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "venue_collection_pending");
    expect(venueSends).toHaveLength(0);
  });

  it("without a QR scan: venue gets the notice and the offer clears, but NO revenue share (owner ruling)", async () => {
    // The 24h attribution token is the ONLY road to a venue share; a buyer
    // who never scanned still triggers the physical-world consequences.
    setupCartDb();
    nextEvent.value = completedSession();
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "cart_sessions") {
        const c: Record<string, unknown> = {
          maybeSingle: async () => ({
            data: {
              stripe_session_id: "cs_1",
              cart: CART_ROW.cart.map((l) => ({ ...l, lineFulfilment: "collect_venue", collectPlacementId: "p-1" })),
              shipping: CART_ROW.shipping,
              source: "direct",
              venue_slug: null,
              artist_slugs: ["fin-coles"],
              expected_subtotal_pence: 10000,
              expected_shipping_pence: 0,
              artist_shipping_pence: {},
            },
            error: null,
          }),
        };
        c.eq = () => c;
        c.gt = () => c;
        return { select: () => c, update: () => ({ eq: async () => ({ error: null }) }) };
      }
      if (table === "placements") {
        const chain: Record<string, unknown> = {
          maybeSingle: async () => ({ data: null, error: null }),
          order: async () => ({ data: [], error: null }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
          limit: async () => ({ data: [{ venue_slug: "the-copper-kettle" }], error: null }),
        };
        chain.eq = () => chain;
        chain.in = () => chain;
        return {
          select: () => chain,
          update: () => ({ eq: async () => ({ error: null }), in: async () => ({ error: null }) }),
        };
      }
      return base(table);
    });

    await POST(post());

    expect(orderInsert).toBeTruthy();
    expect(Number(orderInsert!.venue_revenue)).toBe(0);
    const venueSends = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "venue_collection_pending");
    expect(venueSends).toHaveLength(1);
    expect(venueSends[0].to).toBe("venue@x.com");
  });

  it("clears the placement's off-the-wall offer AND the legacy work flag on sale", async () => {
    await POST(post());
    // The wall piece sold: the placement's offer (121) comes down so the CTA
    // disappears, the legacy tick box (120) is cleared, and online
    // availability follows the normal stock decrement untouched.
    expect(placementUpdates).toContainEqual({ in_store_price: null, in_store_frame_included: false });
    expect(workFlagUpdates).toEqual([{ available_in_store: false }]);
  });

  it("books it with zero shipping cost", async () => {
    await POST(post());
    expect(orderInsert!.shipping_cost).toBe(0);
  });

  beforeEach(() => {
    nextEvent.value = completedSession();
  });
});
