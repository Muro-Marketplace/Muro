import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoisted mocks so the `vi.mock()` factories below can close over them.
const {
  constructEventMock,
  fromMock,
  authGetUserByIdMock,
  loadCartSessionMock,
  scheduleTransferMock,
  signOrderTokenMock,
  createNotificationMock,
  subscriptionsRetrieveMock,
  customersUpdateMock,
  startPaidLoanBillingMock,
  notifyAdminBillingStalledMock,
  sendEmailMock,
  resolveArtistNamesBulkMock,
  receiptPropsMock,
} = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  fromMock: vi.fn(),
  // Explicit return type: inferred from the default it would be `user: null` and
  // every mockResolvedValue carrying an email would fail typecheck.
  authGetUserByIdMock: vi.fn(
    async (): Promise<{ data: { user: { email: string } | null } }> => ({ data: { user: null } }),
  ),
  loadCartSessionMock: vi.fn(),
  scheduleTransferMock: vi.fn(async () => {}),
  signOrderTokenMock: vi.fn(async () => "token-abc"),
  createNotificationMock: vi.fn(async () => {}),
  subscriptionsRetrieveMock: vi.fn(),
  customersUpdateMock: vi.fn(),
  startPaidLoanBillingMock: vi.fn(),
  notifyAdminBillingStalledMock: vi.fn(),
  sendEmailMock: vi.fn(async () => {}),
  resolveArtistNamesBulkMock: vi.fn(async () => new Map<string, string>()),
  receiptPropsMock: vi.fn(() => null),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: subscriptionsRetrieveMock },
    customers: { update: customersUpdateMock },
  },
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: authGetUserByIdMock } },
  }),
}));

vi.mock("@/lib/stripe-connect", () => ({
  scheduleTransfer: scheduleTransferMock,
}));

vi.mock("@/lib/email", () => ({
  notifyArtistNewOrder: vi.fn(async () => {}),
  notifyVenueOrderFromPlacement: vi.fn(async () => {}),
  notifyCurationCustomerPaid: vi.fn(async () => {}),
  notifyAdminBillingStalled: notifyAdminBillingStalledMock,
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: createNotificationMock,
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/emails/_helpers/resolve-artist-name", () => ({
  resolveArtistNamesBulk: resolveArtistNamesBulkMock,
}));

// @/lib/platform-fee is deliberately NOT mocked. It is a pure function over
// { subscription_plan, trial_end } with no I/O, and the stub here returned a flat
// 15 for every artist, which is exactly the behaviour E9 removes: it made a
// two-artist cart with two different plans look correct at one rate.
vi.mock("@/lib/cart-sessions", () => ({
  loadCartSession: loadCartSessionMock,
}));

vi.mock("@/lib/order-tracking-token", () => ({
  signOrderToken: signOrderTokenMock,
}));

// Email templates are React components, the route only constructs them
// for the `sendEmail` payload. Returning null keeps the templates inert
// without pulling in @react-email at test time.
// Recording spy, not an inert stub: the receipt's totals are worth asserting.
vi.mock("@/emails/templates/orders/CustomerOrderReceipt", () => ({ CustomerOrderReceipt: receiptPropsMock }));
vi.mock("@/emails/templates/orders/ArtistOrderConfirmation", () => ({ ArtistOrderConfirmation: () => null }));
vi.mock("@/emails/templates/orders/ArtistWorkSold", () => ({ ArtistWorkSold: () => null }));
vi.mock("@/emails/templates/payments/ArtistPayoutSent", () => ({ ArtistPayoutSent: () => null }));
vi.mock("@/emails/templates/payments/ArtistPayoutFailed", () => ({ ArtistPayoutFailed: () => null }));
vi.mock("@/emails/templates/payments/SubscriptionPaymentFailed", () => ({ SubscriptionPaymentFailed: () => null }));
vi.mock("@/emails/templates/payments/SubscriptionTrialEnding", () => ({ SubscriptionTrialEnding: () => null }));
vi.mock("@/emails/templates/payments/SubscriptionUpgraded", () => ({ SubscriptionUpgraded: () => null }));
vi.mock("@/emails/templates/payments/SubscriptionCancelled", () => ({ SubscriptionCancelled: () => null }));
vi.mock("@/emails/templates/payments/SubscriptionRenewalReceipt", () => ({ SubscriptionRenewalReceipt: () => null }));
vi.mock("@/emails/templates/artist-additions/ArtistStripeKycNeeded", () => ({ ArtistStripeKycNeeded: () => null }));

// Phase 2.3 + 2.2 imports get stubbed so the heavy dispatcher
// registry isn't loaded during webhook tests.
vi.mock("@/lib/orders/lifecycle", () => ({
  recordOrderEvent: vi.fn(async () => ({ eventType: null, sent: 0, deduped: 0 })),
}));
// The three invoice/subscription handlers stay stubbed (they make their own
// Stripe calls), but recordPaidLoanSubscription and periodFromSubscription are the
// REAL ones: E7a is about whether the ledger row and the placements mirror get
// written, so stubbing them would test nothing.
vi.mock("@/lib/placements/paid-loan-billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/placements/paid-loan-billing")>()),
  startPaidLoanBilling: startPaidLoanBillingMock,
  handleInvoicePaid: vi.fn(async () => false),
  handleInvoicePaymentFailed: vi.fn(async () => false),
  handleSubscriptionDeleted: vi.fn(async () => false),
}));

/** D1: every branch now runs behind a global replay guard that claims event.id in
 *  stripe_webhook_events. The claim insert returns { error: null } here so tests
 *  exercise the branch; the release delete is only hit on a 5xx. */
function webhookEventsStub() {
  return {
    insert: async () => ({ error: null }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  };
}

import { POST } from "./route";

type Placement = { id: string; artist_slug: string; revenue_share_percent: number };
type ArtistProfile = {
  user_id: string;
  subscription_plan: string;
  free_until?: string | null;
  trial_end?: string | null;
  name?: string;
  slug?: string;
  stripe_connect_account_id?: string | null;
  stripe_connect_onboarding_complete?: boolean;
};

interface DbState {
  artistProfile?: ArtistProfile | null;
  /**
   * Slug-keyed profiles, which buildArtistLegs looks up with .in("slug", …) (E9).
   * A cart artist missing from here makes buildArtistLegs throw, which is the
   * intended behaviour: we must not pool an unknown artist's money.
   */
  artistProfiles?: ArtistProfile[];
  placements?: Placement[];
  insertCaptured: { row: Record<string, unknown> | null };
  existingOrderId?: string | null;
}

function setupDbMock(state: DbState) {
  const placements = state.placements || [];
  const profiles: ArtistProfile[] =
    state.artistProfiles ?? (state.artistProfile ? [state.artistProfile] : []);
  fromMock.mockImplementation((table: string) => {
    if (table === "stripe_webhook_events") return webhookEventsStub();
    if (table === "artist_profiles") {
      return {
        select: () => ({
          // buildArtistLegs: one round trip for every artist in the cart.
          in: async (_col: string, slugs: string[]) => ({
            data: profiles.filter((p) => slugs.includes((p.slug || "").toLowerCase())),
            error: null,
          }),
          // The firstArtistSlug user_id lookup and the per-leg Connect lookup.
          // Filtered by the actual column so a two-artist transfer test gets each
          // artist's own Connect row rather than one shared answer.
          eq: (col: string, val: string) => ({
            single: async () => ({
              data:
                profiles.find((p) =>
                  col === "user_id" ? p.user_id === val : (p.slug || "") === val,
                ) ?? null,
            }),
          }),
        }),
      };
    }
    if (table === "placements") {
      return {
        select: () => ({
          // Per-line lookup (new): .in("artist_slug", slugs).eq("venue_slug").eq("status")
          in: (_col: string, slugs: string[]) => ({
            eq: () => ({
              eq: async () => ({
                data: placements.filter((p) => slugs.includes(p.artist_slug)),
                error: null,
              }),
            }),
          }),
          // First-artist lookup (legacy, the bug): .eq().eq().eq().limit().single()
          eq: (_col: string, val: string) => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  single: async () => {
                    const match = placements.find((p) => p.artist_slug === val);
                    return {
                      data: match || null,
                      error: match ? null : { code: "PGRST116" },
                    };
                  },
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: state.existingOrderId ? { id: state.existingOrderId } : null,
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          state.insertCaptured.row = row;
          return Promise.resolve({ error: null });
        },
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    if (table === "artist_works") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    // venue_profiles + anything else: return empty so notification side-
    // effects are no-ops and the route flows through to the order insert.
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null }),
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    };
  });
}

function buildSession(overrides: Partial<{ id: string; amount_total: number; metadata: Record<string, string>; payment_intent: string; customer_email: string }> = {}) {
  return {
    id: overrides.id ?? "cs_test_multi",
    mode: "payment",
    amount_total: overrides.amount_total ?? 40000,
    customer_email: overrides.customer_email ?? "buyer@example.com",
    payment_intent: overrides.payment_intent ?? "pi_test_1",
    metadata: overrides.metadata ?? {
      kind: "cart_checkout",
      artist_slugs: "alice,bob",
      venue_slug: "kings-arms",
      fulfilment_method: "ship",
      source: "qr",
    },
  };
}

function buildRequest() {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "stripe-signature": "test-sig",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  constructEventMock.mockReset();
  fromMock.mockReset();
  loadCartSessionMock.mockReset();
  scheduleTransferMock.mockClear();
  // mockReset, not mockClear: a mockRejectedValueOnce that no test consumed
  // stays queued and fires in whichever test calls sendEmail next.
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);
  createNotificationMock.mockClear();
  subscriptionsRetrieveMock.mockReset();
  authGetUserByIdMock.mockReset();
  authGetUserByIdMock.mockResolvedValue({ data: { user: null } });
  receiptPropsMock.mockClear();
});

describe("Stripe webhook — venue revenue split", () => {
  it("computes venue_revenue per line for a multi-artist cart with different placement rates", async () => {
    // Alice and Bob both placed at kings-arms with different shares.
    // Cart: 2× £100 (Alice) + 1× £200 (Bob) = £400 subtotal.
    // Expected venue cut: 100×2×0.20 + 200×1×0.30 = £40 + £60 = £100.
    // Blended pct against subtotal: 100/400 = 25%.
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({
      artistProfiles: [
        { user_id: "u-alice", slug: "alice", subscription_plan: "core" },
        { user_id: "u-bob", slug: "bob", subscription_plan: "core" },
      ],
      placements: [
        { id: "place-alice", artist_slug: "alice", revenue_share_percent: 20 },
        { id: "place-bob", artist_slug: "bob", revenue_share_percent: 30 },
      ],
      insertCaptured,
    });
    loadCartSessionMock.mockResolvedValue({
      cart: [
        { workId: "w-a", artistSlug: "alice", title: "Sunset", price: 100, qty: 2, image: "" },
        { workId: "w-b", artistSlug: "bob", title: "Sunrise", price: 200, qty: 1, image: "" },
      ],
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "qr",
      venueSlug: "kings-arms",
      artistSlugs: ["alice", "bob"],
      expectedSubtotalPence: 40000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: buildSession({ amount_total: 40000 }) },
    });

    const res = await POST(buildRequest());
    expect(res.status).toBe(200);

    expect(insertCaptured.row).not.toBeNull();
    const row = insertCaptured.row!;
    expect(row.subtotal).toBe(400);
    expect(row.venue_revenue).toBe(100);
    expect(row.venue_revenue_share_percent).toBe(25);
    // placement_id is preserved as a single id — pick the first matched
    // line's placement deterministically.
    expect(row.placement_id).toBe("place-alice");
  });

  it("credits the venue when the QR was scanned on artist A's page but the cart contains artist B (single-artist case, B has a placement at V)", async () => {
    // The user actually-reported bug scenario: QR scan stamps
    // cart_sessions.venue_slug = "kings-arms" (where Alice has a wall),
    // but the buyer ends up only buying Bob, who's also placed at
    // kings-arms. firstArtistSlug = "bob" here, the venue must still
    // be credited.
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({
      artistProfiles: [{ user_id: "u-bob", slug: "bob", subscription_plan: "core" }],
      placements: [
        { id: "place-bob", artist_slug: "bob", revenue_share_percent: 25 },
      ],
      insertCaptured,
    });
    loadCartSessionMock.mockResolvedValue({
      cart: [
        { workId: "w-b", artistSlug: "bob", title: "Sunrise", price: 300, qty: 1, image: "" },
      ],
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "qr",
      venueSlug: "kings-arms",
      artistSlugs: ["bob"],
      expectedSubtotalPence: 30000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: buildSession({
        id: "cs_test_qr",
        amount_total: 30000,
        metadata: {
          kind: "cart_checkout",
          artist_slugs: "bob",
          venue_slug: "kings-arms",
          fulfilment_method: "ship",
          source: "qr",
        },
      }) },
    });

    const res = await POST(buildRequest());
    expect(res.status).toBe(200);

    const row = insertCaptured.row!;
    expect(row.subtotal).toBe(300);
    expect(row.venue_revenue).toBe(75);
    expect(row.venue_revenue_share_percent).toBe(25);
    expect(row.placement_id).toBe("place-bob");
  });

  it("records venue_revenue = 0 when no artist in the cart has a placement at the venue", async () => {
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({
      artistProfiles: [{ user_id: "u-alice", slug: "alice", subscription_plan: "core" }],
      placements: [], // none for any artist
      insertCaptured,
    });
    loadCartSessionMock.mockResolvedValue({
      cart: [
        { workId: "w-a", artistSlug: "alice", title: "Sunset", price: 150, qty: 1, image: "" },
      ],
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "direct",
      venueSlug: "kings-arms",
      artistSlugs: ["alice"],
      expectedSubtotalPence: 15000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: buildSession({
        id: "cs_test_no_placement",
        amount_total: 15000,
        metadata: {
          kind: "cart_checkout",
          artist_slugs: "alice",
          venue_slug: "kings-arms",
          fulfilment_method: "ship",
          source: "direct",
        },
      }) },
    });

    const res = await POST(buildRequest());
    expect(res.status).toBe(200);

    const row = insertCaptured.row!;
    expect(row.venue_revenue).toBe(0);
    expect(row.venue_revenue_share_percent).toBe(0);
    expect(row.placement_id).toBeNull();
  });
});

// ─── T3 / E6 + E10: purchase-offer payment ───
//
// E6 as the plan described it: "inserts a bare orders row with no artist_revenue,
// platform_fee, venue_revenue or placement_id". Prod is worse. `orders.shipping`
// is NOT NULL with no default and this branch never supplied it, so every
// purchase-offer payment failed with 23502 and the failure was swallowed by
// `.then(() => {}, err => console.warn(...))`. Both real paid offers in the live
// table (£33 and £27) carry a paid_order_id pointing at an orders row that does
// not exist. Money captured, no order, no payout, no ledger row, no email.
//
// The fake below therefore enforces the real NOT NULL set. Without that it cannot
// see the bug at all: an insert fake that accepts anything passes either way.
describe("Stripe webhook — purchase offer (T3 / E6, E10)", () => {
  const ORDERS_NOT_NULL = ["id", "buyer_email", "items", "shipping", "subtotal", "shipping_cost", "total"];

  type OfferDbState = {
    orderInsert: { row: Record<string, unknown> | null; error: { code?: string; message: string } | null };
    offerUpdate: { row: Record<string, unknown> | null };
    stock: Record<string, number | null>;
    titles?: Record<string, string>;
    stockUpdates: Array<{ workId: string; updates: Record<string, unknown> }>;
    connect?: { stripe_connect_account_id: string | null; stripe_connect_onboarding_complete: boolean } | null;
    artistName?: string;
  };

  function setupOfferDb(state: OfferDbState) {
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return webhookEventsStub();
      if (table === "orders") {
        return {
          insert: (row: Record<string, unknown>) => {
            // Postgres, not a permissive stub: a missing NOT NULL column is 23502.
            const missing = ORDERS_NOT_NULL.filter(
              (c) => row[c] === undefined || row[c] === null,
            );
            if (missing.length > 0) {
              return Promise.resolve({
                error: {
                  code: "23502",
                  message: `null value in column "${missing[0]}" of relation "orders" violates not-null constraint`,
                },
              });
            }
            state.orderInsert.row = row;
            return Promise.resolve({ error: state.orderInsert.error });
          },
        };
      }
      if (table === "purchase_offers") {
        return {
          update: (row: Record<string, unknown>) => ({
            eq: async () => {
              state.offerUpdate.row = row;
              return { error: null };
            },
          }),
        };
      }
      if (table === "artist_works") {
        return {
          select: () => ({
            eq: (_c: string, workId: string) => ({
              single: async () => ({
                data: state.stock[workId] === undefined
                  ? null
                  : { quantity_available: state.stock[workId], title: state.titles?.[workId] },
              }),
            }),
          }),
          update: (updates: Record<string, unknown>) => ({
            eq: async (_c: string, workId: string) => {
              state.stockUpdates.push({ workId, updates });
              return { error: null };
            },
          }),
        };
      }
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({
              // Connect columns for the payout guard, name for the emails.
              single: async () => ({ data: { ...state.connect, name: state.artistName } }),
              maybeSingle: async () => ({ data: { ...state.connect, name: state.artistName } }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null }),
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      };
    });
  }

  function freshState(overrides: Partial<OfferDbState> = {}): OfferDbState {
    return {
      orderInsert: { row: null, error: null },
      offerUpdate: { row: null },
      stock: { "w-1": 3 },
      titles: { "w-1": "Harbour Light" },
      stockUpdates: [],
      connect: { stripe_connect_account_id: "acct_artist", stripe_connect_onboarding_complete: true },
      artistName: "Fin Coles",
      ...overrides,
    };
  }

  /** £33.00 offer, 15% platform fee: 495p fee, 2805p net. */
  const OFFER_META = {
    checkout_kind: "purchase_offer",
    offer_id: "off_1778801604152_05slql",
    offer_buyer_user_id: "11111111-2222-3333-4444-555555555555",
    offer_buyer_email: "venue@example.com",
    offer_artist_user_id: "u-artist",
    offer_artist_slug: "fin-coles",
    offer_work_ids: "w-1",
    offer_collection_id: "",
    offer_amount_pence: "3300",
    offer_platform_fee_pence: "495",
    offer_artist_net_pence: "2805",
    offer_platform_fee_percent: "15",
  };

  function fireOffer(metadata: Record<string, string> = OFFER_META, amountTotal = 3300) {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: buildSession({ id: "cs_offer_W45tsGG1", amount_total: amountTotal, metadata, customer_email: "" }) },
    });
    return POST(buildRequest());
  }

  it("writes an order row at all, which is the live E6 defect", async () => {
    const state = freshState();
    setupOfferDb(state);
    const res = await fireOffer();
    expect(res.status).toBe(200);
    expect(state.orderInsert.row, "no orders row was written").not.toBeNull();
  });

  it("supplies shipping, the NOT NULL column that made every offer payment fail", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer();
    const shipping = state.orderInsert.row?.shipping as Record<string, unknown> | undefined;
    expect(shipping).toBeTruthy();
    // Same nine-field shape the cart path writes, so the order views keep working.
    for (const field of ["fullName", "email", "phone", "addressLine1", "addressLine2", "city", "postcode", "country", "notes"]) {
      expect(shipping, `shipping.${field} missing`).toHaveProperty(field);
    }
  });

  it("persists the split, and fee plus net is exactly the amount charged", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer();
    const row = state.orderInsert.row!;
    expect(row.platform_fee).toBe(4.95);
    expect(row.platform_fee_percent).toBe(15);
    expect(row.artist_revenue).toBe(28.05);
    expect(row.total).toBe(33);
    // To the penny, in integer pence, so no rounding leaks a penny either way.
    expect(Math.round((row.platform_fee as number) * 100) + Math.round((row.artist_revenue as number) * 100))
      .toBe(Math.round((row.total as number) * 100));
  });

  it("zeroes the venue columns rather than leaving them null", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer();
    expect(state.orderInsert.row?.venue_revenue).toBe(0);
    expect(state.orderInsert.row?.venue_revenue_share_percent).toBe(0);
  });

  it("puts an email in buyer_email, never the buyer's UUID", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer();
    expect(state.orderInsert.row?.buyer_email).toBe("venue@example.com");
    expect(state.orderInsert.row?.buyer_email).not.toBe(OFFER_META.offer_buyer_user_id);
  });

  it("E10: decrements stock for each work on the offer", async () => {
    const state = freshState({ stock: { "w-1": 3, "w-2": 1 } });
    setupOfferDb(state);
    await fireOffer({ ...OFFER_META, offer_work_ids: "w-1,w-2" });
    expect(state.stockUpdates).toEqual([
      { workId: "w-1", updates: { quantity_available: 2 } },
      // Last one sold: also comes off sale, same rule as the cart path.
      { workId: "w-2", updates: { quantity_available: 0, available: false } },
    ]);
  });

  it("E6: schedules the artist transfer for the net, not the gross", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer();
    expect(scheduleTransferMock).toHaveBeenCalledTimes(1);
    expect(scheduleTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientType: "artist",
        recipientUserId: "u-artist",
        connectAccountId: "acct_artist",
        amountCents: 2805,
      }),
    );
  });

  it("does not pay an artist whose Connect onboarding is incomplete", async () => {
    const state = freshState({
      connect: { stripe_connect_account_id: "acct_artist", stripe_connect_onboarding_complete: false },
    });
    setupOfferDb(state);
    const res = await fireOffer();
    // The order still exists so the sale is recorded and recoverable.
    expect(state.orderInsert.row).not.toBeNull();
    expect(scheduleTransferMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("marks the offer paid only after the order row lands", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer();
    expect(state.offerUpdate.row).toMatchObject({ status: "paid", paid_order_id: "OFR-W45tsGG1" });
  });

  it("leaves the offer unpaid and 500s when the order insert fails, so Stripe retries", async () => {
    // The exact prod failure mode: without this the offer flips to paid with a
    // paid_order_id pointing at nothing, which is the state both live offers are in.
    const state = freshState();
    state.orderInsert.error = { code: "08006", message: "connection failure" };
    setupOfferDb(state);
    const res = await fireOffer();
    expect(res.status).toBe(500);
    expect(state.offerUpdate.row, "offer was marked paid despite no order row").toBeNull();
    expect(scheduleTransferMock).not.toHaveBeenCalled();
  });

  it("treats a duplicate order id as already done, not as a failure", async () => {
    const state = freshState();
    state.orderInsert.error = { code: "23505", message: "duplicate key value violates unique constraint" };
    setupOfferDb(state);
    const res = await fireOffer();
    expect(res.status).toBe(200);
    expect(state.offerUpdate.row).toMatchObject({ status: "paid" });
  });

  // ── E6 part 3: the offer branch used to send nothing at all ──

  function offerSends() {
    return (sendEmailMock.mock.calls as unknown as Array<[{ template: string; to: string; idempotencyKey: string; react: unknown }]>)
      .map(([a]) => a);
  }

  it("sends the buyer a receipt and the artist both emails, which it never did before", async () => {
    authGetUserByIdMock.mockResolvedValue({ data: { user: { email: "artist@example.com" } } });
    setupOfferDb(freshState());
    await fireOffer();
    expect(offerSends().map((s) => s.template)).toEqual([
      "customer_order_receipt",
      "artist_work_sold",
      "artist_order_confirmation",
    ]);
    expect(offerSends()[0].to).toBe("venue@example.com");
    expect(offerSends()[1].to).toBe("artist@example.com");
  });

  it("keys the offer sends on the payment intent, like the cart path", async () => {
    authGetUserByIdMock.mockResolvedValue({ data: { user: { email: "artist@example.com" } } });
    setupOfferDb(freshState());
    await fireOffer();
    expect(offerSends().map((s) => s.idempotencyKey)).toEqual([
      "order_receipt:pi_test_1",
      "artist_work_sold:pi_test_1",
      "artist_order_confirmation:pi_test_1",
    ]);
  });

  it("raises the in-app sale notification for the artist", async () => {
    setupOfferDb(freshState());
    await fireOffer();
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-artist", kind: "sale", link: "/artist-portal/orders" }),
    );
  });

  it("never notifies a venue: an offer has no placement share", async () => {
    setupOfferDb(freshState());
    await fireOffer();
    for (const call of createNotificationMock.mock.calls as unknown as Array<[{ link?: string }]>) {
      expect(call[0].link).not.toBe("/venue-portal/orders");
    }
  });

  it("still returns 200 when the confirmations throw, because the money is already taken", async () => {
    authGetUserByIdMock.mockResolvedValue({ data: { user: { email: "artist@example.com" } } });
    setupOfferDb(freshState());
    sendEmailMock.mockRejectedValueOnce(new Error("provider down"));
    const res = await fireOffer();
    expect(res.status).toBe(200);
  });

  it("bills the receipt as one aggregate line that sums to what was charged", async () => {
    setupOfferDb(freshState());
    await fireOffer();
    const props = (receiptPropsMock.mock.calls as unknown as Array<[{
      items: Array<{ title: string; quantity: number; lineTotal: { amount: number } }>;
      subtotal: { amount: number }; shipping: { amount: number }; total: { amount: number };
    }]>)[0][0];
    // An offer is a single agreed price, so one line, and the line, subtotal and
    // total must all agree or the buyer's receipt does not add up.
    expect(props.items).toHaveLength(1);
    expect(props.items[0].lineTotal.amount).toBe(3300);
    expect(props.subtotal.amount).toBe(3300);
    expect(props.shipping.amount).toBe(0);
    expect(props.total.amount).toBe(3300);
  });

  it("names the piece on the receipt when the offer covers one work", async () => {
    setupOfferDb(freshState());
    await fireOffer();
    const props = (receiptPropsMock.mock.calls as unknown as Array<[{ items: Array<{ title: string; artistName: string }> }]>)[0][0];
    expect(props.items[0].title).toBe("Harbour Light");
    expect(props.items[0].artistName).toBe("Fin Coles");
  });

  it("counts the works when the offer covers several", async () => {
    setupOfferDb(freshState({ stock: { "w-1": 2, "w-2": 2 }, titles: { "w-1": "One", "w-2": "Two" } }));
    await fireOffer({ ...OFFER_META, offer_work_ids: "w-1,w-2" });
    const props = (receiptPropsMock.mock.calls as unknown as Array<[{ items: Array<{ title: string }> }]>)[0][0];
    expect(props.items[0].title).toBe("2 works");
  });

  it("names the collection when the offer is for one", async () => {
    setupOfferDb(freshState());
    await fireOffer({ ...OFFER_META, offer_collection_id: "col_7" });
    const props = (receiptPropsMock.mock.calls as unknown as Array<[{ items: Array<{ title: string }> }]>)[0][0];
    expect(props.items[0].title).toBe("Collection col_7");
  });

  it("charges a pro artist's real rate when the fee percent says 5", async () => {
    // £27.00 at 5%: 135p fee, 2565p net. Guards the arithmetic against a
    // hard-coded 15% creeping back in.
    const state = freshState();
    setupOfferDb(state);
    await fireOffer(
      { ...OFFER_META, offer_amount_pence: "2700", offer_platform_fee_pence: "135", offer_artist_net_pence: "2565", offer_platform_fee_percent: "5" },
      2700,
    );
    const row = state.orderInsert.row!;
    expect(row.platform_fee).toBe(1.35);
    expect(row.artist_revenue).toBe(25.65);
    expect(row.platform_fee_percent).toBe(5);
    expect(scheduleTransferMock).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2565 }));
  });
});

// ─── Characterisation: cart-checkout confirmations ───
//
// Written BEFORE extracting this block into lib/orders/confirmations.ts so the
// extraction is provably behaviour-preserving. Nothing pinned these sends before,
// so a refactor of the highest-consequence path in the app was unverifiable.
//
// This is a pin, not an endorsement. If a send legitimately changes, this file is
// where it shows up.
describe("Stripe webhook — cart confirmations, current behaviour pinned", () => {
  function sends() {
    return (sendEmailMock.mock.calls as unknown as Array<[{ template: string; to: string; idempotencyKey: string; category: string; userId?: string }]>)
      .map(([a]) => a);
  }

  async function runCartCheckout() {
    setupDbMock({
      artistProfiles: [{ user_id: "u-alice", slug: "alice", subscription_plan: "core", name: "Alice Adams" }],
      placements: [],
      insertCaptured: { row: null },
    });
    authGetUserByIdMock.mockResolvedValue({ data: { user: { email: "alice@example.com" } } });
    loadCartSessionMock.mockResolvedValue({
      cart: [{ workId: "w-a", artistSlug: "alice", title: "Sunset", price: 100, qty: 2, image: "" }],
      shipping: {
        fullName: "Bea Buyer", email: "buyer@example.com", country: "GB",
        addressLine1: "1 Test St", city: "London", postcode: "E1 1AA",
        fulfilmentMethod: "ship",
      },
      source: "direct",
      artistSlugs: ["alice"],
      expectedSubtotalPence: 20000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: buildSession({ id: "cs_cart_1", amount_total: 20000, metadata: { kind: "cart_checkout", artist_slugs: "alice", fulfilment_method: "ship", source: "direct" } }) },
    });
    return POST(buildRequest());
  }

  it("sends exactly three emails: buyer receipt, artist sale, artist confirmation", async () => {
    await runCartCheckout();
    expect(sends().map((s) => s.template)).toEqual([
      "customer_order_receipt",
      "artist_work_sold",
      "artist_order_confirmation",
    ]);
  });

  it("keys every send on the payment intent so a Stripe retry cannot double-send", async () => {
    await runCartCheckout();
    expect(sends().map((s) => s.idempotencyKey)).toEqual([
      "order_receipt:pi_test_1",
      "artist_work_sold:pi_test_1",
      "artist_order_confirmation:pi_test_1",
    ]);
  });

  it("routes the receipt to the buyer and both artist emails to the artist", async () => {
    await runCartCheckout();
    const s = sends();
    expect(s[0].to).toBe("buyer@example.com");
    expect(s[1].to).toBe("alice@example.com");
    expect(s[2].to).toBe("alice@example.com");
    // The artist sends carry userId so preference checks can apply; the buyer
    // receipt does not, because a receipt is not opt-out-able.
    expect(s[0].userId).toBeUndefined();
    expect(s[1].userId).toBe("u-alice");
    expect(s[2].userId).toBe("u-alice");
  });

  it("files all three under orders_and_payouts", async () => {
    await runCartCheckout();
    expect(sends().map((s) => s.category)).toEqual([
      "orders_and_payouts", "orders_and_payouts", "orders_and_payouts",
    ]);
  });

  it("raises the in-app sale notification for the artist", async () => {
    await runCartCheckout();
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-alice", kind: "sale", link: "/artist-portal/orders" }),
    );
  });

  it("sends nothing to the artist when the artist has no auth user", async () => {
    authGetUserByIdMock.mockResolvedValue({ data: { user: null } });
    setupDbMock({
      artistProfiles: [{ user_id: "u-alice", slug: "alice", subscription_plan: "core", name: "Alice" }],
      placements: [],
      insertCaptured: { row: null },
    });
    loadCartSessionMock.mockResolvedValue({
      cart: [{ workId: "w-a", artistSlug: "alice", title: "Sunset", price: 100, qty: 1, image: "" }],
      shipping: { fullName: "Bea", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "direct", artistSlugs: ["alice"],
      expectedSubtotalPence: 10000, expectedShippingPence: 0,
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: buildSession({ id: "cs_cart_2", amount_total: 10000, metadata: { kind: "cart_checkout", artist_slugs: "alice", fulfilment_method: "ship", source: "direct" } }) },
    });
    await POST(buildRequest());
    expect(sends().map((s) => s.template)).toEqual(["customer_order_receipt"]);
  });
});

// ── E9: one payout leg per artist (04 §B2) ───────────────────────────────────
//
// The webhook resolved the fee tier from the FIRST artist's plan, pooled every
// artist's money into one `artistRevenue`, and scheduled ONE transfer to the
// first artist. In a two-artist cart, artist A received the money owed to B, and
// B's sale was charged at A's plan rate.
describe("Stripe webhook — per-artist payout legs (E9)", () => {
  /** Both artists payable, on different plans. */
  const TWO_ARTISTS = [
    {
      user_id: "u-alice",
      slug: "alice",
      subscription_plan: "core", // 15%
      stripe_connect_account_id: "acct_alice",
      stripe_connect_onboarding_complete: true,
    },
    {
      user_id: "u-bob",
      slug: "bob",
      subscription_plan: "pro", // 5%
      stripe_connect_account_id: "acct_bob",
      stripe_connect_onboarding_complete: true,
    },
  ];

  /** £100 of Alice + £100 of Bob, no venue, no shipping. */
  function twoArtistCart(overrides: Record<string, unknown> = {}) {
    loadCartSessionMock.mockResolvedValue({
      cart: [
        { workId: "w-a", artistSlug: "alice", title: "Sunset", price: 100, qty: 1, image: "" },
        { workId: "w-b", artistSlug: "bob", title: "Sunrise", price: 100, qty: 1, image: "" },
      ],
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "direct",
      venueSlug: "",
      artistSlugs: ["alice", "bob"],
      expectedSubtotalPence: 20000,
      expectedShippingPence: 0,
      artistShippingPence: {},
      ...overrides,
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: buildSession({
          amount_total: 20000,
          metadata: {
            kind: "cart_checkout",
            artist_slugs: "alice,bob",
            venue_slug: "",
            fulfilment_method: "ship",
            source: "direct",
          },
        }),
      },
    });
  }

  const transfers = () =>
    (scheduleTransferMock.mock.calls as unknown as Array<[Record<string, unknown>]>).map((c) => c[0]);

  it("pays each artist their own net, at their own plan rate", async () => {
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({ artistProfiles: TWO_ARTISTS, insertCaptured });
    twoArtistCart();

    expect((await POST(buildRequest())).status).toBe(200);

    const artistTransfers = transfers().filter((t) => t.recipientType === "artist");
    expect(artistTransfers).toHaveLength(2);
    // Alice: 10000 - 15% = 8500. Bob: 10000 - 5% = 9500.
    expect(artistTransfers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientUserId: "u-alice", connectAccountId: "acct_alice", amountCents: 8500 }),
        expect.objectContaining({ recipientUserId: "u-bob", connectAccountId: "acct_bob", amountCents: 9500 }),
      ]),
    );
  });

  it("does not send the pooled total to the first artist, which was the bug", async () => {
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({ artistProfiles: TWO_ARTISTS, insertCaptured });
    twoArtistCart();

    await POST(buildRequest());

    const artistTransfers = transfers().filter((t) => t.recipientType === "artist");
    // The old code sent one transfer of (subtotal - fee) = 17000 to u-alice.
    expect(artistTransfers.map((t) => t.amountCents)).not.toContain(17000);
    expect(artistTransfers.filter((t) => t.recipientUserId === "u-alice")).toHaveLength(1);
  });

  it("splits to the penny: venue + fee + every leg equals what Stripe collected", async () => {
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({ artistProfiles: TWO_ARTISTS, insertCaptured });
    twoArtistCart();

    await POST(buildRequest());

    const row = insertCaptured.row!;
    const legTotal = transfers()
      .filter((t) => t.recipientType === "artist")
      .reduce((s, t) => s + Number(t.amountCents), 0);
    const venuePence = Math.round(Number(row.venue_revenue) * 100);
    const feePence = Math.round(Number(row.platform_fee) * 100);
    expect(venuePence + feePence + legTotal).toBe(20000);
    // The order row's blended figures are the sum of the legs, so what is
    // reported and what is transferred cannot disagree.
    expect(row.artist_revenue).toBe(180);
    expect(row.platform_fee).toBe(20);
    expect(row.platform_fee_percent).toBe(10); // blended 15% / 5%
  });

  it("attributes shipping to the artist who posts the parcel", async () => {
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({ artistProfiles: TWO_ARTISTS, insertCaptured });
    twoArtistCart({ expectedShippingPence: 1400, artistShippingPence: { alice: 950, bob: 450 } });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: buildSession({
          amount_total: 21400, // 20000 artwork + 1400 shipping
          metadata: {
            kind: "cart_checkout",
            artist_slugs: "alice,bob",
            venue_slug: "",
            fulfilment_method: "ship",
            source: "direct",
          },
        }),
      },
    });

    await POST(buildRequest());

    const artistTransfers = transfers().filter((t) => t.recipientType === "artist");
    // Shipping is not fee-bearing, so it is added on top of each net.
    expect(artistTransfers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientUserId: "u-alice", amountCents: 8500 + 950 }),
        expect.objectContaining({ recipientUserId: "u-bob", amountCents: 9500 + 450 }),
      ]),
    );
  });

  it("pays the other artist when one artist's Connect account has lapsed", async () => {
    // One leg failing must not strand the rest. The old single-transfer shape had
    // nothing to strand, so this behaviour is new and worth pinning.
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({
      artistProfiles: [
        { ...TWO_ARTISTS[0], stripe_connect_onboarding_complete: false },
        TWO_ARTISTS[1],
      ],
      insertCaptured,
    });
    twoArtistCart();

    expect((await POST(buildRequest())).status).toBe(200);

    const artistTransfers = transfers().filter((t) => t.recipientType === "artist");
    expect(artistTransfers).toHaveLength(1);
    expect(artistTransfers[0]).toMatchObject({ recipientUserId: "u-bob", amountCents: 9500 });
    // The order is still booked: the money is collected and owed, and ops need
    // the row to see it.
    expect(insertCaptured.row).not.toBeNull();
  });

  it("sends one transfer, not two, for an artist with two lines in the cart", async () => {
    // stripe_transfers is UNIQUE on (order_id, recipient_user_id): a second leg
    // for the same artist would be dropped by the index, underpaying them.
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({ artistProfiles: TWO_ARTISTS, insertCaptured });
    loadCartSessionMock.mockResolvedValue({
      cart: [
        { workId: "w-a1", artistSlug: "alice", title: "One", price: 100, qty: 1, image: "" },
        { workId: "w-a2", artistSlug: "alice", title: "Two", price: 100, qty: 1, image: "" },
      ],
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "direct",
      venueSlug: "",
      artistSlugs: ["alice"],
      expectedSubtotalPence: 20000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: buildSession({
          amount_total: 20000,
          metadata: {
            kind: "cart_checkout",
            artist_slugs: "alice",
            venue_slug: "",
            fulfilment_method: "ship",
            source: "direct",
          },
        }),
      },
    });

    await POST(buildRequest());

    const artistTransfers = transfers().filter((t) => t.recipientType === "artist");
    expect(artistTransfers).toHaveLength(1);
    expect(artistTransfers[0].amountCents).toBe(17000); // 20000 - 15%
  });

  it("books no order when an artist in the cart has no profile", async () => {
    // buildArtistLegs throws rather than pooling the unknown artist's money into
    // someone else's leg. Better to fail loudly than to pay the wrong person.
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({ artistProfiles: [TWO_ARTISTS[0]], insertCaptured });
    twoArtistCart();

    await POST(buildRequest());

    expect(insertCaptured.row).toBeNull();
    expect(transfers().filter((t) => t.recipientType === "artist")).toHaveLength(0);
  });
});

// ── E7a: the paid-loan subscription was recorded by nothing (04 §B6/§C5) ─────
//
// api/placements/[id]/payment/setup mints a real Stripe subscription, and no
// webhook branch consumed the resulting session. So a venue could complete the
// flow and be billed monthly while placements.stripe_subscription_id stayed null:
// the setup route's "already set up" guard never fired, and cancelPaidLoanBilling
// had no subscription id to cancel. placement_recurring_billings has 0 rows in
// prod, which is what "written by nothing" looks like.
describe("Stripe webhook — paid-loan subscription checkout (E7a)", () => {
  interface PaidLoanState {
    placement?: Record<string, unknown> | null;
    upserts: Array<{ row: Record<string, unknown>; onConflict?: string }>;
    placementUpdates: Array<Record<string, unknown>>;
    orderInserts: Array<Record<string, unknown>>;
  }

  function setupPaidLoanDb(state: PaidLoanState) {
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return webhookEventsStub();
      if (table === "placements") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.placement ?? null, error: null }) }),
          }),
          update: (row: Record<string, unknown>) => {
            state.placementUpdates.push(row);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "placement_recurring_billings") {
        return {
          upsert: async (row: Record<string, unknown>, opts?: { onConflict?: string }) => {
            state.upserts.push({ row, onConflict: opts?.onConflict });
            return { error: null };
          },
        };
      }
      if (table === "orders") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          insert: (row: Record<string, unknown>) => {
            state.orderInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: null }), maybeSingle: async () => ({ data: null }) }),
        }),
      };
    });
  }

  const PLACEMENT = {
    id: "pl-1",
    venue_user_id: "u-venue",
    artist_user_id: "u-artist",
    monthly_fee_gbp: 45,
    stripe_subscription_id: null,
  };

  /** Period bounds live on the first item in SDK 22+, not on the subscription. */
  const SUBSCRIPTION = {
    id: "sub_1",
    customer: "cus_1",
    items: { data: [{ current_period_start: 1_780_000_000, current_period_end: 1_782_678_400 }] },
  };

  function fireSession(
    overrides: {
      type?: string;
      metadata?: Record<string, string>;
      subscription?: string | null;
    } = {},
  ) {
    constructEventMock.mockReturnValue({
      type: overrides.type ?? "checkout.session.completed",
      data: {
        object: {
          id: "cs_paid_loan",
          mode: "subscription",
          subscription: overrides.subscription === undefined ? "sub_1" : overrides.subscription,
          metadata: overrides.metadata ?? { kind: "paid_loan_monthly", placement_id: "pl-1" },
        },
      },
    });
  }

  let state: PaidLoanState;
  beforeEach(() => {
    state = { placement: PLACEMENT, upserts: [], placementUpdates: [], orderInserts: [] };
    setupPaidLoanDb(state);
    subscriptionsRetrieveMock.mockResolvedValue(SUBSCRIPTION);
  });

  it("writes the billing ledger row", async () => {
    fireSession();
    expect((await POST(buildRequest())).status).toBe(200);

    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].row).toMatchObject({
      placement_id: "pl-1",
      stripe_subscription_id: "sub_1",
      stripe_customer_id: "cus_1",
      payer_user_id: "u-venue",
      payee_user_id: "u-artist",
      monthly_amount_pence: 4500,
      status: "active",
    });
    // The UNIQUE index this relies on is on stripe_subscription_id, so a Stripe
    // redelivery updates the row rather than duplicating it.
    expect(state.upserts[0].onConflict).toBe("stripe_subscription_id");
  });

  it("reads the period bounds off the subscription ITEM, not the subscription", async () => {
    // Reading them off the subscription gives undefined, and new Date(undefined *
    // 1000) is how a period end gets stamped 1970-01-01 (E11b).
    fireSession();
    await POST(buildRequest());
    expect(state.upserts[0].row.current_period_end).toBe(
      new Date(1_782_678_400 * 1000).toISOString(),
    );
    expect(String(state.upserts[0].row.current_period_start)).not.toContain("1970");
  });

  it("mirrors the subscription onto the placement, which nothing used to write", async () => {
    fireSession();
    await POST(buildRequest());
    expect(state.placementUpdates).toHaveLength(1);
    expect(state.placementUpdates[0]).toMatchObject({
      stripe_subscription_id: "sub_1",
      subscription_status: "active",
    });
  });

  it("notifies the artist once", async () => {
    fireSession();
    await POST(buildRequest());
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-artist", kind: "paid_loan_started" }),
    );
  });

  it("does not re-notify when Stripe redelivers the same session", async () => {
    // Stripe retries, and both checkout.session.completed and
    // checkout.session.async_payment_succeeded reach this branch for one session,
    // so an unconditional notify tells the artist twice.
    state.placement = { ...PLACEMENT, stripe_subscription_id: "sub_1" };
    fireSession();
    await POST(buildRequest());
    expect(state.upserts).toHaveLength(1); // still idempotently recorded
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("handles async_payment_succeeded as well as completed", async () => {
    fireSession({ type: "checkout.session.async_payment_succeeded" });
    expect((await POST(buildRequest())).status).toBe(200);
    expect(state.upserts).toHaveLength(1);
  });

  it("refuses a session with no subscription id and writes nothing", async () => {
    fireSession({ subscription: null });
    expect((await POST(buildRequest())).status).toBe(400);
    expect(state.upserts).toHaveLength(0);
    expect(state.placementUpdates).toHaveLength(0);
  });

  it("answers 500 on an unknown placement, so Stripe retries", async () => {
    state.placement = null;
    fireSession();
    expect((await POST(buildRequest())).status).toBe(500);
    expect(state.upserts).toHaveLength(0);
  });

  it("refuses a placement with no monthly fee instead of 500-looping", async () => {
    // monthly_amount_pence carries a CHECK (> 0). Writing zero raises 23514, the
    // webhook would answer 500, and Stripe would retry a request that can never
    // succeed. 200 + ignored stops the loop; the log carries the detail.
    state.placement = { ...PLACEMENT, monthly_fee_gbp: null };
    fireSession();
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ignored: "monthly_amount_missing" });
    expect(state.upserts).toHaveLength(0);
  });

  it("does not fall through to the cart-order branch", async () => {
    // The paid-loan session is mode: "subscription", and before this branch
    // existed it reached the art-purchase branch and was dropped there.
    fireSession();
    await POST(buildRequest());
    expect(state.orderInserts).toHaveLength(0);
  });

  it("ignores a subscription session that is not a paid loan", async () => {
    fireSession({ metadata: { kind: "something_else" } });
    await POST(buildRequest());
    expect(state.upserts).toHaveLength(0);
    expect(subscriptionsRetrieveMock).not.toHaveBeenCalled();
  });
});

// ── E7d: no setup_intent.succeeded branch (04 §B6, §C5's second branch) ──────
//
// paid-loan-billing.ts documents that the flow is re-invoked when
// setup_intent.succeeded lands on the webhook. There was no such branch, and the
// client cannot re-invoke by PATCH either (that path needs status 'pending' and the
// placement is already 'active'). So a paid-loan placement whose venue had no card
// on file went live and never billed anyone.
describe("Stripe webhook — setup_intent.succeeded (E7d)", () => {
  interface SetupState {
    placement: Record<string, unknown> | null;
    customerUpdates: Array<[string, Record<string, unknown>]>;
  }
  let sstate: SetupState;

  function fireSetupIntent(
    overrides: { metadata?: Record<string, string> | null; payment_method?: string | null } = {},
  ) {
    constructEventMock.mockReturnValue({
      type: "setup_intent.succeeded",
      data: {
        object: {
          id: "seti_1",
          customer: "cus_venue",
          payment_method: overrides.payment_method === undefined ? "pm_new" : overrides.payment_method,
          metadata:
            overrides.metadata === undefined
              ? {
                  placement_id: "pl-1",
                  venue_user_id: "u-venue",
                  source: "wallplace_paid_loan_billing",
                }
              : overrides.metadata,
        },
      },
    });
  }

  beforeEach(() => {
    sstate = {
      placement: {
        id: "pl-1",
        venue_user_id: "u-venue",
        artist_user_id: "u-artist",
        arrangement_type: "paid_loan",
        monthly_fee_gbp: 45,
      },
      customerUpdates: [],
    };
    customersUpdateMock.mockReset();
    customersUpdateMock.mockImplementation(async (id: string, params: Record<string, unknown>) => {
      sstate.customerUpdates.push([id, params]);
      return {};
    });
    startPaidLoanBillingMock.mockReset();
    startPaidLoanBillingMock.mockResolvedValue({ status: "started", subscriptionId: "sub_1" });
    notifyAdminBillingStalledMock.mockReset();
    notifyAdminBillingStalledMock.mockResolvedValue(undefined);
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return webhookEventsStub();
      if (table === "placements") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sstate.placement }) }) }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: null }), maybeSingle: async () => ({ data: null }) }),
        }),
      };
    });
  });

  it("starts billing for the placement the card was attached for", async () => {
    fireSetupIntent();
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ billing: "started" });
    expect(startPaidLoanBillingMock).toHaveBeenCalledWith({
      placementId: "pl-1",
      venueUserId: "u-venue",
      artistUserId: "u-artist",
      arrangementType: "paid_loan",
      monthlyFeePence: 4500,
    });
  });

  it("makes the new card the customer's default so invoices can charge it", async () => {
    fireSetupIntent();
    await POST(buildRequest());
    expect(sstate.customerUpdates).toEqual([
      ["cus_venue", { invoice_settings: { default_payment_method: "pm_new" } }],
    ]);
  });

  it("ignores a setup intent that is not ours", async () => {
    fireSetupIntent({ metadata: { source: "something_else" } });
    const res = await POST(buildRequest());
    await expect(res.json()).resolves.toMatchObject({ ignored: "not_paid_loan" });
    expect(startPaidLoanBillingMock).not.toHaveBeenCalled();
    expect(customersUpdateMock).not.toHaveBeenCalled();
  });

  it("ignores a setup intent with no metadata at all", async () => {
    fireSetupIntent({ metadata: null });
    await expect((await POST(buildRequest())).json()).resolves.toMatchObject({
      ignored: "not_paid_loan",
    });
  });

  it("reports an unknown placement without retrying forever", async () => {
    sstate.placement = null;
    fireSetupIntent();
    const res = await POST(buildRequest());
    expect(res.status).toBe(200); // a 500 would have Stripe retry a lookup that cannot succeed
    await expect(res.json()).resolves.toMatchObject({ ignored: "unknown_placement" });
    expect(startPaidLoanBillingMock).not.toHaveBeenCalled();
  });

  it("does NOT mail the admin when the helper skipped because the flag is off", async () => {
    // §C5 alerts on anything that is not started/already_started.
    // startPaidLoanBilling short-circuits to "skipped" whenever PAID_LOAN_V2 is
    // off, which is its state in prod, so that would mail the admin on every
    // single card attachment.
    startPaidLoanBillingMock.mockResolvedValue({ status: "skipped" });
    fireSetupIntent();
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(notifyAdminBillingStalledMock).not.toHaveBeenCalled();
  });

  it("mails the admin when the card is attached and billing still did not start", async () => {
    // The genuine revenue hole: the flag is on, the card is there, and billing
    // did not begin. Nothing else in the system notices.
    startPaidLoanBillingMock.mockResolvedValue({ status: "missing_payment_method" });
    fireSetupIntent();
    await POST(buildRequest());
    expect(notifyAdminBillingStalledMock).toHaveBeenCalledWith({
      placementId: "pl-1",
      status: "missing_payment_method",
    });
  });

  it("treats already_started as success, so a redelivery is quiet", async () => {
    startPaidLoanBillingMock.mockResolvedValue({ status: "already_started", subscriptionId: "sub_1" });
    fireSetupIntent();
    // Deliver twice: Stripe redelivers, and the second must be as quiet as the first.
    expect((await POST(buildRequest())).status).toBe(200);
    expect((await POST(buildRequest())).status).toBe(200);
    expect(notifyAdminBillingStalledMock).not.toHaveBeenCalled();
  });

  it("still starts billing when the payment method is missing from the intent", async () => {
    // No pm id means we cannot set a default, but the card attach itself succeeded,
    // so billing must still be attempted rather than abandoned.
    fireSetupIntent({ payment_method: null });
    await POST(buildRequest());
    expect(customersUpdateMock).not.toHaveBeenCalled();
    expect(startPaidLoanBillingMock).toHaveBeenCalled();
  });
});

// ── E11b: the 1970-01-01 subscription (04 §B6) ───────────────────────────────
//
// `new Date((subscription.items.data[0]?.current_period_end ?? 0) * 1000)` stamped
// the Unix epoch whenever Stripe omitted the period, so the artist billing page
// showed a subscription that had expired 56 years ago.
describe("Stripe webhook — subscription period end (E11b)", () => {
  let profileUpdates: Array<Record<string, unknown>>;

  function fireSubscription(item: Record<string, unknown> | null) {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_art_1",
          customer: "cus_art",
          status: "active",
          trial_end: null,
          items: { data: item ? [item] : [] },
        },
      },
    });
  }

  beforeEach(() => {
    profileUpdates = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return webhookEventsStub();
      if (table === "artist_profiles") {
        return {
          update: (row: Record<string, unknown>) => {
            profileUpdates.push(row);
            return { eq: async () => ({ error: null }) };
          },
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    });
  });

  it("writes the real period end when Stripe sends one", async () => {
    fireSubscription({ current_period_end: 1_702_000_000, price: { id: "price_x" } });
    await POST(buildRequest());
    expect(profileUpdates[0].subscription_period_end).toBe(
      new Date(1_702_000_000 * 1000).toISOString(),
    );
  });

  it("writes null, not 1970, when Stripe sends no period", async () => {
    fireSubscription({ price: { id: "price_x" } });
    await POST(buildRequest());
    expect(profileUpdates[0].subscription_period_end).toBeNull();
  });

  it("writes null, not 1970, when the subscription has no items", async () => {
    fireSubscription(null);
    await POST(buildRequest());
    expect(profileUpdates[0].subscription_period_end).toBeNull();
  });

  it("never writes a 1970 date under any of those shapes", async () => {
    for (const item of [{ price: { id: "p" } }, { current_period_end: 0, price: { id: "p" } }, null]) {
      profileUpdates = [];
      fireSubscription(item);
      await POST(buildRequest());
      expect(String(profileUpdates[0].subscription_period_end)).not.toContain("1970");
    }
  });
});

// ── D1: global webhook replay guard (04 §B0) ─────────────────────────────────
//
// The handler had no event-id table; idempotency was per-branch and ad hoc, so a
// redelivery reaching a branch without its own guard could act twice. A single
// claim on event.id at the top makes every branch replay-safe. The subtlety is
// release-on-failure: claiming and never releasing turns a transient 500 into a
// permanent drop, because Stripe's retry then hits 23505 and is waved through.
describe("Stripe webhook — global replay guard (D1)", () => {
  /** Records what the guard did to stripe_webhook_events. */
  interface GuardState {
    claimError: { code?: string; message?: string } | null;
    inserted: Array<Record<string, unknown>>;
    deleted: string[];
    /** Forces the wrapped handler to a given status via an unknown event type. */
  }
  let g: GuardState;

  function guardTable() {
    return {
      insert: async (row: Record<string, unknown>) => {
        g.inserted.push(row);
        return { error: g.claimError };
      },
      delete: () => ({
        eq: async (_col: string, val: string) => {
          g.deleted.push(val);
          return { error: null };
        },
      }),
    };
  }

  beforeEach(() => {
    g = { claimError: null, inserted: [], deleted: [] };
    // The curation branch is the simplest money branch to drive to a 500: an
    // update error. Everything else falls through to the guard table.
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return guardTable();
      if (table === "curation_requests") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "cr1", tier: "single_wall", venue_name: "V", contact_name: "C", contact_email: "c@e.com", status: "pending" },
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: { message: "boom" } }) }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
    });
  });

  function fireCuration() {
    constructEventMock.mockReturnValue({
      id: "evt_cur_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", mode: "payment", metadata: { kind: "curation_request", curation_request_id: "cr1" } } },
    });
  }

  it("claims the event id before processing", async () => {
    fireCuration();
    // Curation update fails → 500, but the claim must have been attempted first.
    await POST(buildRequest());
    expect(g.inserted).toEqual([{ event_id: "evt_cur_1", event_type: "checkout.session.completed" }]);
  });

  it("treats a redelivery (23505 on the claim) as a no-op duplicate", async () => {
    g.claimError = { code: "23505" };
    fireCuration();
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ duplicate: true });
    // The branch never ran, so no release either.
    expect(g.deleted).toEqual([]);
  });

  it("500s when the claim insert fails for a real reason, so Stripe retries", async () => {
    g.claimError = { code: "40001", message: "deadlock" };
    fireCuration();
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
  });

  it("releases the claim when the handler returns a 5xx, so the retry can reprocess", async () => {
    // This is the case the plan's claim-only snippet gets wrong: the curation
    // branch 500s, and without the release the retry would be dropped as a
    // duplicate with the order never written.
    fireCuration();
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    expect(g.deleted).toEqual(["evt_cur_1"]);
  });

  it("keeps the claim when the handler succeeds", async () => {
    // A normal 2xx must NOT release, or the guard would protect nothing on
    // redelivery.
    constructEventMock.mockReturnValue({
      id: "evt_noop_1",
      type: "charge.refunded", // no branch handles it → fall-through 200
      data: { object: {} },
    });
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(g.inserted).toHaveLength(1);
    expect(g.deleted).toEqual([]);
  });
});
