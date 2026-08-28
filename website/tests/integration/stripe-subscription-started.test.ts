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

const { fromMock, getUserByIdMock, nextEvent } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  nextEvent: { value: null as unknown },
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
    storage: { from: () => ({ createSignedUrl: () => ({ data: null, error: null }) }) },
  }),
}));
vi.mock("@/lib/stripe-connect", () => ({
  scheduleTransfer: vi.fn(async () => ({ ok: true })),
  recordBlockedLeg: vi.fn(async () => {}),
}));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
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
  const profile = "profile" in opts ? opts.profile : { user_id: "u-artist", name: "Maya Chen" };
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
