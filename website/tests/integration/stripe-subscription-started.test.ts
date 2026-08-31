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

const { fromMock, getUserByIdMock, nextEvent, paidLoanDeletedMock, curationDeletedMock, rpcMock, cancelPaidLoanMock } =
  vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  nextEvent: { value: null as unknown },
  paidLoanDeletedMock: vi.fn(async () => {}),
  cancelPaidLoanMock: vi.fn(async () => ({ status: "cancelled" })),
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
  cancelPaidLoanBilling: cancelPaidLoanMock,
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
    // The 500 path releases the webhook dedup claim.
    delete: () => ({ eq: async () => ({ error: null }) }),
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
describe("past_due recovery tells the artist (WS4.4 return half)", () => {
  it("an invoice.paid that recovers past_due sends subscription_recovered, keyed on the invoice", async () => {
    installDb({ profile: { id: "ap-1", user_id: "u-artist", name: "Maya Chen", subscription_status: "past_due", subscription_plan: "pro" } });
    nextEvent.value = event("invoice.paid", { id: "in_rec_1", customer: "cus_1", billing_reason: "subscription_cycle", amount_paid: 0 });
    const res = await POST(post());
    expect(res.status).toBe(200);
    const sends = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "subscription_recovered");
    expect(sends).toHaveLength(1);
    expect(sends[0].idempotencyKey).toBe("subscription_recovered:in_rec_1");
  });

  it("an already-active subscriber gets no recovery email", async () => {
    installDb({ profile: { id: "ap-1", user_id: "u-artist", name: "Maya Chen", subscription_status: "active", subscription_plan: "pro" } });
    nextEvent.value = event("invoice.paid", { id: "in_rec_2", customer: "cus_1", billing_reason: "subscription_cycle", amount_paid: 0 });
    await POST(post());
    const sends = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "subscription_recovered");
    expect(sends).toHaveLength(0);
  });
});

describe("async payment failure tells the buyer (WS1.5)", () => {
  it("emails the buyer once, keyed on the session; no order is touched", async () => {
    installDb();
    nextEvent.value = event("checkout.session.async_payment_failed", {
      id: "cs_async_1",
      mode: "payment",
      customer_email: "jo@x.com",
      customer_details: { email: "jo@x.com", name: "Jo Buyer" },
      metadata: { kind: "cart_checkout" },
    });
    const res = await POST(post());
    expect(res.status).toBe(200);
    const sends = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "customer_payment_failed");
    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe("jo@x.com");
    expect(sends[0].idempotencyKey).toBe("async_payment_failed:cs_async_1");
  });

  it("a non-cart kind (curation, offer) is not the cart's business", async () => {
    installDb();
    nextEvent.value = event("checkout.session.async_payment_failed", {
      id: "cs_async_2",
      mode: "payment",
      customer_email: "jo@x.com",
      metadata: { kind: "curation_request" },
    });
    await POST(post());
    const sends = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "customer_payment_failed");
    expect(sends).toHaveLength(0);
  });
});

describe("recurring-invoice handler throws answer 500 (WS1.1 second half)", () => {
  it("a paid-loan invoice.paid throw releases the claim via 500 so Stripe redelivers", async () => {
    // Swallowing this used to keep the dedup claim: a transient DB fault
    // during the artist-share leg silently lost a month's share forever.
    installDb();
    const { handleInvoicePaid } = await import("@/lib/placements/paid-loan-billing");
    vi.mocked(handleInvoicePaid).mockRejectedValueOnce(new Error("db blink"));
    nextEvent.value = event("invoice.paid", { id: "in_1", customer: "cus_1" });
    const res = await POST(post());
    expect(res.status).toBe(500);
  });

  it("a curation invoice.payment_failed throw answers 500 too", async () => {
    installDb();
    const { handleCurationInvoiceFailed } = await import("@/lib/curation/billing");
    vi.mocked(handleCurationInvoiceFailed).mockRejectedValueOnce(new Error("db blink"));
    nextEvent.value = event("invoice.payment_failed", { id: "in_2", customer: "cus_1" });
    const res = await POST(post());
    expect(res.status).toBe(500);
  });
});

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

  it("WS3.5: the referrer is emailed when the credit lands, keyed per referred artist", async () => {
    nextEvent.value = event("customer.subscription.created", subscription());
    await POST(post());
    const sends = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "referral_credit_granted");
    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe("maya@example.com");
    // referred.id: the RPC guard credits each referred artist exactly once.
    expect(sends[0].idempotencyKey).toBe("referral_credit:u-artist");
  });

  it("WS3.5: no grant email when the RPC says nothing was credited", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ credited: false }], error: null });
    nextEvent.value = event("customer.subscription.created", subscription());
    await POST(post());
    const sends = vi.mocked(sendEmail).mock.calls
      .map((c) => c[0])
      .filter((c) => c.template === "referral_credit_granted");
    expect(sends).toHaveLength(0);
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

  it("a THROW inside the cart branch answers 500 and releases the claim (WS1.1, audit F1)", async () => {
    // The audit's worst shape: money taken, an exception between the
    // settlement gate and completion (here: the profile lookup that feeds
    // buildArtistLegs rejects), and the old catch swallowed it into a 200
    // that kept the dedup claim, so Stripe never retried.
    const released: string[] = [];
    setupCartDb();
    nextEvent.value = completedSession();
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") {
        return {
          insert: async () => ({ error: null }),
          delete: () => ({ eq: async (_c: string, id: string) => { released.push(id); return { error: null }; } }),
        };
      }
      if (table === "artist_profiles") {
        return { select: () => ({ in: async () => { throw new Error("transient db fault"); }, eq: () => ({ maybeSingle: async () => ({ data: { user_id: "u" } }) }) }) };
      }
      return base(table);
    });

    const res = await POST(post());
    expect(res.status).toBe(500);
    expect(released).toHaveLength(1);
    expect(orderInsert).toBeNull();
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

  it("bug 20: an empty artist_slugs falls back to the cart line, so the order is not orphaned", async () => {
    // Production holds one order booked with a NULL artist: money taken, the
    // print on nobody's Orders queue, nobody told to post it. The cart LINES
    // named the artist the whole time.
    setupCartDb();
    nextEvent.value = completedSession();
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "cart_sessions") {
        const c: Record<string, unknown> = {
          maybeSingle: async () => ({
            data: {
              stripe_session_id: "cs_1",
              cart: CART_ROW.cart,
              shipping: CART_ROW.shipping,
              source: CART_ROW.source,
              venue_slug: CART_ROW.venue_slug,
              artist_slugs: [],
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
      return base(table);
    });

    await POST(post());
    expect(orderInsert).toBeTruthy();
    expect(orderInsert!.artist_slug).toBe("fin-coles");
  });

  it("WS3.3: an off-wall sale ENDS the placement - sold, billing cancelled, stamps cleared", async () => {
    // Before this, nothing ever set a placement to "sold": an off-wall sale
    // left the placement active forever, and a paid-loan venue kept paying a
    // monthly display fee for a piece that had left the arrangement.
    setupCartDb();
    nextEvent.value = completedSession();
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "placements") {
        const chain: Record<string, unknown> = {
          maybeSingle: async () => ({ data: null, error: null }),
          order: async () => ({ data: [], error: null }),
          limit: async () => ({ data: [{ venue_slug: "the-copper-kettle" }], error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: [{ id: "p-wall", status: "active" }], error: null }),
        };
        chain.eq = () => chain;
        chain.in = () => chain;
        return {
          select: () => chain,
          update: (row: Record<string, unknown>) => {
            placementUpdates.push(row);
            return { eq: async () => ({ error: null }), in: async () => ({ error: null }) };
          },
        };
      }
      return base(table);
    });

    await POST(post());
    expect(placementUpdates).toContainEqual({ status: "sold" });
    expect(cancelPaidLoanMock).toHaveBeenCalledWith("p-wall", expect.anything());
    expect(workFlagUpdates).toContainEqual({ placed_at_venue: null, current_placement_id: null });
  });

  it("books it with zero shipping cost", async () => {
    await POST(post());
    expect(orderInsert!.shipping_cost).toBe(0);
  });

  beforeEach(() => {
    nextEvent.value = completedSession();
  });
});

// WS2.1 (audit R3.1 CRITICAL). transfer.reversed used to write the RETRYABLE
// `failed` status, and the daily sweep then re-executed the full transfer once
// Stripe's 24h idempotency key lapsed: every reversal became a scheduled
// double payment. A reversal is terminal.
describe("transfer.reversed is terminal", () => {
  it("writes status reversed, never failed", async () => {
    const writes: Array<Record<string, unknown>> = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") {
        return { insert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) };
      }
      if (table === "stripe_transfers") {
        return { update: (row: Record<string, unknown>) => { writes.push(row); return { eq: async () => ({ error: null }) }; } };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
      };
    });
    nextEvent.value = event("transfer.reversed", { id: "tr_1", amount: 1000 });
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(writes).toEqual([{ status: "reversed" }]);
  });
});

// ─── WS1.2/1.3/1.4: chargebacks and dashboard refunds reach the books ───
//
// Before 2026-08-28 charge.dispute.* and charge.refunded fell through to the
// default 200: the platform ate chargebacks while still paying artists, and a
// dashboard refund left legs paying, stock sold and the order lying.
import { stripe as stripeMockedModule } from "@/lib/stripe";
import { sendAdminAlert as adminAlertMock } from "@/lib/email/admin-alert";

describe("chargebacks and dashboard refunds (WS1.2/1.3/1.4)", () => {
  const ORDER = { id: "WS-DISPUTED1", status: "delivered", delivered_at: "2026-08-20T00:00:00Z", buyer_email: "buyer@x.com", artist_slug: "fin-coles", items: [{ workId: "w-1", quantity: 2 }], total: 100 };
  let transferUpdates: Array<{ row: Record<string, unknown>; filters: string[] }>;
  let orderUpdates: Array<Record<string, unknown>>;
  let paidLegs: Array<{ id: string; stripe_transfer_id: string | null }>;
  let orderRow: Record<string, unknown> | null;

  function installMoneyDb() {
    transferUpdates = [];
    orderUpdates = [];
    paidLegs = [];
    orderRow = { ...ORDER };
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") {
        return { insert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) };
      }
      if (table === "orders") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: orderRow, error: null }) }) }),
          update: (row: Record<string, unknown>) => { orderUpdates.push(row); return { eq: async () => ({ error: null }) }; },
        };
      }
      if (table === "stripe_transfers") {
        const filters: string[] = [];
        const updChain = (row: Record<string, unknown>) => {
          const c: Record<string, unknown> = {};
          const push = (name: string) => (...args: unknown[]) => { filters.push(`${name}:${JSON.stringify(args)}`); return c; };
          c.eq = push("eq");
          c.in = push("in");
          c.like = push("like");
          c.then = (resolve: (v: unknown) => unknown) => { transferUpdates.push({ row, filters: [...filters] }); return Promise.resolve({ error: null }).then(resolve); };
          return c;
        };
        return {
          update: (row: Record<string, unknown>) => updChain(row),
          select: () => ({ eq: () => ({ eq: async () => ({ data: paidLegs, error: null }) }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
      };
    });
  }

  beforeEach(() => {
    installMoneyDb();
    vi.mocked(adminAlertMock).mockClear();
    vi.mocked(stripeMockedModule.transfers.createReversal).mockClear();
    vi.mocked(stripeMockedModule.transfers.createReversal).mockResolvedValue({ id: "trr_1" } as never);
  });

  it("dispute.created holds unpaid legs, marks the order disputed, and alerts admin", async () => {
    nextEvent.value = event("charge.dispute.created", {
      id: "dp_1", amount: 10000, reason: "fraudulent", payment_intent: "pi_1",
      evidence_details: { due_by: 1790000000 },
    });
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(transferUpdates).toHaveLength(1);
    expect(transferUpdates[0].row).toMatchObject({ status: "blocked" });
    expect(orderUpdates).toEqual([{ status: "disputed" }]);
    expect(vi.mocked(adminAlertMock)).toHaveBeenCalledTimes(1);
    const alert = vi.mocked(adminAlertMock).mock.calls[0][0] as { idempotencyKey: string };
    expect(alert.idempotencyKey).toBe("chargeback_opened:dp_1");
  });

  it("dispute lost: unpaid legs cancelled, paid legs reversed, order refunded", async () => {
    paidLegs = [{ id: "leg-1", stripe_transfer_id: "tr_9" }];
    nextEvent.value = event("charge.dispute.closed", { id: "dp_1", amount: 10000, status: "lost", payment_intent: "pi_1" });
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(vi.mocked(stripeMockedModule.transfers.createReversal)).toHaveBeenCalledWith(
      "tr_9", {}, { idempotencyKey: "chargeback:dp_1:reversal:leg-1" },
    );
    expect(orderUpdates).toEqual([{ status: "refunded" }]);
    // First transfers write cancels the unpaid set, second marks the reversed leg.
    expect(transferUpdates[0].row).toMatchObject({ status: "cancelled" });
    expect(transferUpdates[1].row).toMatchObject({ status: "reversed" });
  });

  it("dispute won: held legs go back to pending and the order status is restored", async () => {
    nextEvent.value = event("charge.dispute.closed", { id: "dp_1", amount: 10000, status: "won", payment_intent: "pi_1" });
    await POST(post());
    expect(transferUpdates[0].row).toMatchObject({ status: "pending", last_error: null });
    expect(orderUpdates).toEqual([{ status: "delivered" }]);
  });

  it("dashboard FULL refund: legs handled, stock restocked, order refunded, buyer emailed once", async () => {
    paidLegs = [{ id: "leg-1", stripe_transfer_id: "tr_9" }];
    nextEvent.value = event("charge.refunded", { id: "ch_1", refunded: true, amount: 10000, amount_refunded: 10000, payment_intent: "pi_1" });
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("restock_work", { p_work_id: "w-1", p_qty: 2 });
    expect(orderUpdates).toEqual([{ status: "refunded" }]);
    const refundEmails = vi.mocked(sendEmail).mock.calls.map((c) => c[0]).filter((c) => c.template === "customer_refund_confirmation");
    expect(refundEmails).toHaveLength(1);
    expect(refundEmails[0].idempotencyKey).toBe("refund:WS-DISPUTED1:dashboard");
  });

  it("charge.refunded on an already-refunded order is a no-op (the in-app flow owns it)", async () => {
    orderRow = { ...ORDER, status: "refunded" };
    nextEvent.value = event("charge.refunded", { id: "ch_1", refunded: true, amount: 10000, amount_refunded: 10000, payment_intent: "pi_1" });
    const res = await POST(post());
    expect((await res.json()).ignored).toBe("already_refunded");
    expect(transferUpdates).toHaveLength(0);
    expect(orderUpdates).toHaveLength(0);
  });

  it("PARTIAL dashboard refund alerts a human and touches no money rows", async () => {
    nextEvent.value = event("charge.refunded", { id: "ch_1", refunded: false, amount: 10000, amount_refunded: 2500, payment_intent: "pi_1" });
    await POST(post());
    expect(transferUpdates).toHaveLength(0);
    expect(orderUpdates).toHaveLength(0);
    expect(vi.mocked(adminAlertMock).mock.calls[0][0]).toMatchObject({ idempotencyKey: "dashboard_partial_refund:ch_1:2500" });
  });

  it("refund.failed alerts admin with the reason", async () => {
    nextEvent.value = event("refund.failed", { id: "re_1", amount: 5000, payment_intent: "pi_1", failure_reason: "expired_or_canceled_card" });
    await POST(post());
    expect(vi.mocked(adminAlertMock).mock.calls[0][0]).toMatchObject({ idempotencyKey: "refund_failed:re_1" });
  });
});
