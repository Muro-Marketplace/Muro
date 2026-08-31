import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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
  handleSubDeletedMock,
  notifyAdminBillingStalledMock,
  sendEmailMock,
  resolveArtistNamesBulkMock,
  receiptPropsMock,
  rpcMock,
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
  handleSubDeletedMock: vi.fn(async () => false),
  notifyAdminBillingStalledMock: vi.fn(),
  sendEmailMock: vi.fn(async () => {}),
  resolveArtistNamesBulkMock: vi.fn(async () => new Map<string, string>()),
  receiptPropsMock: vi.fn(() => null),
  rpcMock: vi.fn(
    async (): Promise<{ data: unknown; error: { message: string } | null }> => ({ data: null, error: null }),
  ),
}));

// D52: the webhook now gates payouts on canReceivePayout (not the onboarding
// boolean) and records blocked legs. Both are mocked here.
// 09 item 1.3: the order-placed emails now fan out from recordOrderEvent, which
// this file mocks. The email COUNT is asserted in
// tests/integration/email-one-per-event.test.ts, which runs the real dispatcher;
// here we assert the payload the webhook hands it, which is the webhook's job.
const { recordOrderEventMock } = vi.hoisted(() => ({
  // Typed with its input so mock.calls[0][0] is addressable in the assertions.
  recordOrderEventMock: vi.fn(async (_input: {
    orderId: string;
    buyerEmail?: string | null;
    artistEmail?: string | null;
    data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => ({ eventType: null, sent: 0, deduped: 0 })),
}));

const { recordBlockedLegMock, canReceivePayoutMock } = vi.hoisted(() => ({
  recordBlockedLegMock: vi.fn(async () => {}),
  canReceivePayoutMock: vi.fn(),
}));

// D21: the curation billing module is mocked so we can assert the webhook wires
// each event to the right reconciler. The handlers return false (not a curation
// subscription) so every existing test flows through unchanged; their real
// behaviour is unit-tested in src/lib/curation/billing.test.ts.
const { curationInvoicePaidMock, curationInvoiceFailedMock, curationSubDeletedMock, notifyAdminCurationPaidMock } = vi.hoisted(() => ({
  curationInvoicePaidMock: vi.fn(async () => false),
  curationInvoiceFailedMock: vi.fn(async () => false),
  curationSubDeletedMock: vi.fn(async () => false),
  notifyAdminCurationPaidMock: vi.fn(async () => {}),
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
    rpc: rpcMock,
    auth: { admin: { getUserById: authGetUserByIdMock } },
  }),
}));

vi.mock("@/lib/stripe-connect", () => ({
  scheduleTransfer: scheduleTransferMock,
  recordBlockedLeg: recordBlockedLegMock,
}));

vi.mock("@/lib/payouts/capability", () => ({
  canReceivePayout: canReceivePayoutMock,
}));

vi.mock("@/lib/curation/billing", () => ({
  handleCurationInvoicePaid: curationInvoicePaidMock,
  handleCurationInvoiceFailed: curationInvoiceFailedMock,
  handleCurationSubscriptionDeleted: curationSubDeletedMock,
}));

// K1: the legacy @/lib/email is deleted. The curation admin ping is an
// operational alert now; the customer receipt goes through sendEmail.
vi.mock("@/lib/email/admin-alert", () => ({
  sendAdminAlert: notifyAdminCurationPaidMock,
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
  recordOrderEvent: recordOrderEventMock,
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
  handleSubscriptionDeleted: handleSubDeletedMock,
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
          // The firstArtistSlug user_id lookup (D4: .maybeSingle) and the per-leg
          // Connect lookup (.single). Filtered by the actual column so a two-artist
          // transfer test gets each artist's own Connect row, not one shared answer.
          eq: (col: string, val: string) => {
            const row = () =>
              profiles.find((p) => (col === "user_id" ? p.user_id === val : (p.slug || "") === val)) ?? null;
            return {
              single: async () => ({ data: row() }),
              maybeSingle: async () => ({ data: row(), error: null }),
            };
          },
        }),
      };
    }
    if (table === "placements") {
      return {
        select: () => ({
          // Per-line lookup: .in("artist_slug", slugs).eq("venue_slug").eq("status")
          //   .order("created_at", { ascending: true })  (D9 determinism)
          in: (_col: string, slugs: string[]) => {
            const result = { data: placements.filter((p) => slugs.includes(p.artist_slug)), error: null };
            return {
              eq: () => ({
                eq: () => ({
                  // Post-D9 the query ends in .order(); keep it awaitable both ways
                  // so older call shapes in this file still resolve.
                  order: async () => result,
                  then: (fn: (v: typeof result) => unknown) => Promise.resolve(result).then(fn),
                }),
              }),
            };
          },
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
          // Work-level placement resolution (2026-08-28): no linked
          // placements in this fixture, so the artist-level rate map these
          // tests pin remains the deciding one.
          in: async () => ({ data: [], error: null }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
          in: () => Promise.resolve({ error: null }),
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

// D52: userIds / venue slugs whose canReceivePayout should return a block.
let blockedPayoutTargets = new Set<string>();

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  constructEventMock.mockReset();
  fromMock.mockReset();
  loadCartSessionMock.mockReset();
  scheduleTransferMock.mockClear();
  // D52 payout gate: default every target payable, deriving the account id from
  // the user id (u-alice -> acct_alice) or the venue slug. Tests add a userId or
  // slug to blockedPayoutTargets to simulate a lapsed / non-payout-ready account.
  recordBlockedLegMock.mockClear();
  recordOrderEventMock.mockClear();
  blockedPayoutTargets = new Set();
  canReceivePayoutMock.mockReset();
  canReceivePayoutMock.mockImplementation(
    async (_db: unknown, target: { userId?: string; slug?: string }) => {
      const key = target.userId ?? target.slug ?? "";
      if (blockedPayoutTargets.has(key)) return { ok: false, accountId: null, reason: "payouts_disabled" };
      const suffix = (target.userId ?? "").replace(/^u-/, "") || (target.slug ?? "");
      return { ok: true, accountId: `acct_${suffix}`, reason: null };
    },
  );
  rpcMock.mockClear();
  rpcMock.mockResolvedValue({ data: null, error: null });
  // mockReset, not mockClear: a mockRejectedValueOnce that no test consumed
  // stays queued and fires in whichever test calls sendEmail next.
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);
  createNotificationMock.mockClear();
  subscriptionsRetrieveMock.mockReset();
  authGetUserByIdMock.mockReset();
  authGetUserByIdMock.mockResolvedValue({ data: { user: null } });
  receiptPropsMock.mockClear();
  curationInvoicePaidMock.mockClear();
  curationInvoiceFailedMock.mockClear();
  curationSubDeletedMock.mockClear();
  notifyAdminCurationPaidMock.mockClear();
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
    /** Row the D3 collision-check select returns on a 23505. */
    orderClash?: { stripe_payment_intent_id: string | null } | null;
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
          // D3: classifyOrderIdConflict reads the clashing row's payment intent.
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.orderClash ?? null }) }),
          }),
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
            eq: (_c: string, workId: string) => {
              const row = () =>
                state.stock[workId] === undefined
                  ? null
                  : { quantity_available: state.stock[workId], title: state.titles?.[workId] };
              return { single: async () => ({ data: row() }), maybeSingle: async () => ({ data: row() }) };
            },
            // Work-level placement resolution (2026-08-28): none linked here.
            in: async () => ({ data: [], error: null }),
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
      orderClash: { stripe_payment_intent_id: "pi_test_1" },
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

  /**
   * Task 5: £300.00 offer for a work on a venue's wall, 15% platform fee and a
   * 10% venue placement share, both off the artist's side: fee 4500p, venue
   * cut 3000p, artist net 22500p (30000 - 4500 - 3000). Mirrors what the
   * checkout route now stamps onto the session per the venue-share tests in
   * checkout/route.test.ts.
   */
  const OFFER_META_WITH_VENUE = {
    ...OFFER_META,
    offer_amount_pence: "30000",
    offer_platform_fee_pence: "4500",
    offer_artist_net_pence: "22500",
    offer_platform_fee_percent: "15",
    offer_venue_slug: "copper-kettle",
    offer_venue_user_id: "u-venue-1",
    offer_venue_cut_pence: "3000",
    offer_venue_share_percent: "10",
    // Finding 3 (final review): the single active placement id the checkout
    // route resolved alongside the share, now travelling with it so the
    // order row can be attributed back to the venue's placement card.
    offer_placement_id: "plc-1",
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
    // Finding 3 (final review): no venue share means no venue placement to
    // credit, so placement_id must be null rather than an empty string
    // (the DB column, unlike the Stripe metadata carrying it, is nullable).
    expect(state.orderInsert.row?.placement_id).toBeNull();
  });

  it("puts an email in buyer_email, never the buyer's UUID", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer();
    expect(state.orderInsert.row?.buyer_email).toBe("venue@example.com");
    expect(state.orderInsert.row?.buyer_email).not.toBe(OFFER_META.offer_buyer_user_id);
  });

  it("E10/D5: decrements stock atomically for each work on the offer", async () => {
    // D5 moved the offer decrement to the shared decrement_work_stock RPC, so the
    // assertion is now the RPC calls, not the old read-then-write .update()s.
    const state = freshState({ stock: { "w-1": 3, "w-2": 1 } });
    setupOfferDb(state);
    await fireOffer({ ...OFFER_META, offer_work_ids: "w-1,w-2" });
    const stockCalls = (rpcMock.mock.calls as unknown as Array<[string, Record<string, unknown>]>).filter(
      ([fn]) => fn === "decrement_work_stock",
    );
    expect(stockCalls.map(([, args]) => args)).toEqual([
      { p_work_id: "w-1", p_qty: 1 },
      { p_work_id: "w-2", p_qty: 1 },
    ]);
    // The old read-then-write update path is gone.
    expect(state.stockUpdates).toEqual([]);
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

  it("does not pay an artist whose payout account is not ready, and records a blocked leg (D52)", async () => {
    const state = freshState();
    setupOfferDb(state);
    blockedPayoutTargets.add("u-artist"); // canReceivePayout -> { ok: false, reason: "payouts_disabled" }
    const res = await fireOffer();
    // The order still exists so the sale is recorded and recoverable.
    expect(state.orderInsert.row).not.toBeNull();
    expect(scheduleTransferMock).not.toHaveBeenCalled();
    // The owed payout is recorded, not lost, with the real capability reason.
    expect(recordBlockedLegMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recipientUserId: "u-artist", reason: "payouts_disabled" }),
    );
    expect(res.status).toBe(200);
  });

  it("marks the offer paid only after the order row lands", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer();
    expect(state.offerUpdate.row).toMatchObject({ status: "paid", paid_order_id: "OFR-W45TSGG1" });
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

  it("500s on an OFR- id collision instead of flipping the offer paid (D3)", async () => {
    // 23505, but the clashing row belongs to a DIFFERENT payment. The old code
    // proceeded and marked THIS offer paid against another payment's order.
    const state = freshState({
      orderInsert: { row: null, error: { code: "23505", message: "duplicate key value" } },
      orderClash: { stripe_payment_intent_id: "pi_a_completely_different_payment" },
    });
    setupOfferDb(state);
    const res = await fireOffer();
    expect(res.status).toBe(500);
    expect(state.offerUpdate.row, "the offer must NOT be marked paid on a collision").toBeNull();
  });

  // ── E6 part 3: the offer branch used to send nothing at all ──

  function offerSends() {
    return (sendEmailMock.mock.calls as unknown as Array<[{ template: string; to: string; idempotencyKey: string; react: unknown }]>)
      .map(([a]) => a);
  }

  /** The data payload the webhook handed recordOrderEvent (09 item 1.3). */
  function eventData() {
    const calls = recordOrderEventMock.mock.calls as unknown as Array<[{
      buyerEmail: string | null; artistEmail: string | null;
      data: Record<string, unknown>;
    }]>;
    return calls[0]?.[0];
  }

  it("hands both parties to the order-placed event, which it never did before", async () => {
    // E6 originally: the offer branch sent nothing. It then sent three emails
    // (buyer receipt + two artist). 09 item 1.3 routes both recipients through
    // recordOrderEvent instead, one email each. That fan-out is asserted in
    // tests/integration/email-one-per-event.test.ts, which runs the real
    // dispatcher; here we check the webhook supplies both addresses.
    authGetUserByIdMock.mockResolvedValue({ data: { user: { email: "artist@example.com" } } });
    setupOfferDb(freshState());
    await fireOffer();
    expect(eventData()?.buyerEmail).toBe("venue@example.com");
    expect(eventData()?.artistEmail).toBe("artist@example.com");
  });

  it("ties the offer event to the payment intent, so a Stripe retry cannot double-send", async () => {
    authGetUserByIdMock.mockResolvedValue({ data: { user: { email: "artist@example.com" } } });
    setupOfferDb(freshState());
    await fireOffer();
    const call = recordOrderEventMock.mock.calls[0]?.[0] as unknown as {
      metadata?: Record<string, unknown>;
    };
    expect(JSON.stringify(call?.metadata ?? {})).toContain("pi_test_1");
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
    const props = eventData()!.data as unknown as {
      items: Array<{ title: string; quantity: number; lineTotal: { amount: number } }>;
      subtotal: { amount: number }; shipping: { amount: number }; total: { amount: number };
    };
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
    const props = eventData()!.data as unknown as { items: Array<{ title: string; artistName: string }> };
    expect(props.items[0].title).toBe("Harbour Light");
    expect(props.items[0].artistName).toBe("Fin Coles");
  });

  it("counts the works when the offer covers several", async () => {
    setupOfferDb(freshState({ stock: { "w-1": 2, "w-2": 2 }, titles: { "w-1": "One", "w-2": "Two" } }));
    await fireOffer({ ...OFFER_META, offer_work_ids: "w-1,w-2" });
    const props = eventData()!.data as unknown as { items: Array<{ title: string }> };
    expect(props.items[0].title).toBe("2 works");
  });

  it("names the collection when the offer is for one", async () => {
    setupOfferDb(freshState());
    await fireOffer({ ...OFFER_META, offer_collection_id: "col_7" });
    const props = eventData()!.data as unknown as { items: Array<{ title: string }> };
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

  // ── Task 5: venue share on offer sales (work-on-wall rule) ──
  //
  // The checkout route resolves the venue share and stamps it onto the
  // session metadata (checkout/route.test.ts); this webhook branch just
  // reads those keys, writes them onto the order row, and pays the venue
  // the same way it already pays the artist.

  it("Task 5: writes the venue slug and share onto the order row, summing with the rest of the split", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer(OFFER_META_WITH_VENUE, 30000);
    const row = state.orderInsert.row!;
    expect(row.venue_slug).toBe("copper-kettle");
    expect(row.venue_revenue).toBe(30);
    expect(row.venue_revenue_share_percent).toBe(10);
    expect(row.platform_fee).toBe(45);
    expect(row.artist_revenue).toBe(225);
    expect(row.total).toBe(300);
    // Finding 3 (final review): the order carries the placement id so the
    // placements list can sum venue earnings by orders.placement_id and
    // show this offer's cut on the right placement card.
    expect(row.placement_id).toBe("plc-1");
    // total = artist_revenue + venue_revenue + platform_fee, in integer pence.
    expect(
      Math.round((row.artist_revenue as number) * 100) +
        Math.round((row.venue_revenue as number) * 100) +
        Math.round((row.platform_fee as number) * 100),
    ).toBe(Math.round((row.total as number) * 100));
  });

  it("Task 5: schedules a venue transfer for the cut alongside the artist's, when the venue can be paid", async () => {
    const state = freshState();
    setupOfferDb(state);
    await fireOffer(OFFER_META_WITH_VENUE, 30000);
    expect(scheduleTransferMock).toHaveBeenCalledTimes(2);
    expect(scheduleTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientType: "artist",
        recipientUserId: "u-artist",
        amountCents: 22500,
      }),
    );
    expect(scheduleTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientType: "venue",
        recipientUserId: "u-venue-1",
        connectAccountId: "acct_venue-1",
        amountCents: 3000,
        immediate: false,
      }),
    );
  });

  it("Task 5: records a blocked leg for the venue, without touching the artist's payout, when the venue cannot be paid yet", async () => {
    const state = freshState();
    setupOfferDb(state);
    blockedPayoutTargets.add("u-venue-1"); // canReceivePayout -> { ok: false, reason: "payouts_disabled" }
    const res = await fireOffer(OFFER_META_WITH_VENUE, 30000);
    expect(res.status).toBe(200);
    // The artist leg is unaffected: still scheduled, for the full net.
    expect(scheduleTransferMock).toHaveBeenCalledTimes(1);
    expect(scheduleTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientType: "artist", recipientUserId: "u-artist", amountCents: 22500 }),
    );
    expect(recordBlockedLegMock).toHaveBeenCalledTimes(1);
    expect(recordBlockedLegMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientType: "venue",
        recipientUserId: "u-venue-1",
        amountCents: 3000,
        reason: "payouts_disabled",
      }),
    );
    // The order still exists; the sale is recorded and recoverable.
    expect(state.orderInsert.row).not.toBeNull();
  });

  it("Task 5: a venue capability error does not affect the artist payout or the order (venue leg is best-effort)", async () => {
    const state = freshState();
    setupOfferDb(state);
    canReceivePayoutMock.mockReset();
    canReceivePayoutMock.mockImplementation(async (_db: unknown, target: { kind: string; userId?: string }) => {
      if (target.kind === "venue") throw new Error("stripe unreachable");
      return { ok: true, accountId: "acct_artist", reason: null };
    });
    const res = await fireOffer(OFFER_META_WITH_VENUE, 30000);
    expect(res.status).toBe(200);
    expect(state.orderInsert.row).not.toBeNull();
    expect(scheduleTransferMock).toHaveBeenCalledTimes(1);
    expect(scheduleTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientType: "artist", recipientUserId: "u-artist", amountCents: 22500 }),
    );
    // No blocked leg either: the throw is swallowed by the venue leg's own
    // try/catch, not routed to recordBlockedLeg (that path is for a clean
    // capability answer of "not ready", not for a thrown error).
    expect(recordBlockedLegMock).not.toHaveBeenCalled();
  });

  it("Task 5: pays no venue share when the offer metadata carries none (unplaced or mixed-venue offer)", async () => {
    // Same fixture as the rest of this describe block: OFFER_META has no
    // offer_venue_* keys, matching what the checkout route stamps when no
    // single active placement covers every offered work.
    const state = freshState();
    setupOfferDb(state);
    await fireOffer();
    expect(state.orderInsert.row?.venue_slug).toBeNull();
    expect(scheduleTransferMock).toHaveBeenCalledTimes(1); // artist only
    expect(recordBlockedLegMock).not.toHaveBeenCalled();
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

  it("hands both parties to the order-placed event", async () => {
    // Was three emails (buyer receipt + two artist). 09 item 1.3 routes both
    // recipients through recordOrderEvent, one email each; the fan-out itself is
    // asserted in tests/integration/email-one-per-event.test.ts against the real
    // dispatcher, since this file mocks recordOrderEvent.
    await runCartCheckout();
    const call = recordOrderEventMock.mock.calls[0]?.[0] as unknown as {
      buyerEmail: string | null; artistEmail: string | null;
    };
    expect(call?.buyerEmail).toBe("buyer@example.com");
    expect(call?.artistEmail).toBe("alice@example.com");
  });

  it("keys every send on the payment intent so a Stripe retry cannot double-send", async () => {
    await runCartCheckout();
    const keys = sends().map((s) => s.idempotencyKey);
    // The dispatcher appends the transactional template name to the caller's key.
    for (const key of keys) expect(key).toContain("pi_test_1");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries the buyer's totals and the artist's sale amount in one payload", async () => {
    // One data object feeds both templates, so a dropped field silently
    // downgrades an email rather than failing.
    await runCartCheckout();
    const data = (recordOrderEventMock.mock.calls[0]?.[0] as unknown as {
      data: Record<string, unknown>;
    })?.data;
    expect(data?.total).toBeTruthy();
    expect(data?.billingAddress).toBeTruthy();
    expect(data?.saleAmount).toBeTruthy();
  });

  it("files both under orders_and_payouts", async () => {
    await runCartCheckout();
    for (const c of sends().map((s) => s.category)) {
      expect(c).toBe("orders_and_payouts");
    }
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
    // No artist auth user means no artist address on the event, so the dispatcher
    // has nobody to send the artist copy to; the buyer's still goes.
    const call = recordOrderEventMock.mock.calls[0]?.[0] as unknown as {
      buyerEmail: string | null; artistEmail: string | null;
    };
    expect(call?.artistEmail).toBeNull();
    expect(call?.buyerEmail).toBe("buyer@example.com");
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
      subscription_status: "active",
      stripe_connect_account_id: "acct_alice",
      stripe_connect_onboarding_complete: true,
    },
    {
      user_id: "u-bob",
      slug: "bob",
      subscription_plan: "pro", // 15%
      subscription_status: "active",
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
    // Alice: 10000 - 15% = 8500. Bob: 10000 - 15% = 8500 (flat rate, owner decision 2026-08-28).
    expect(artistTransfers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientUserId: "u-alice", connectAccountId: "acct_alice", amountCents: 8500 }),
        expect.objectContaining({ recipientUserId: "u-bob", connectAccountId: "acct_bob", amountCents: 8500 }),
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
    expect(row.artist_revenue).toBe(170);
    expect(row.platform_fee).toBe(30);
    expect(row.platform_fee_percent).toBe(15); // flat 15% on both legs now (owner decision 2026-08-28)
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
        expect.objectContaining({ recipientUserId: "u-bob", amountCents: 8500 + 450 }),
      ]),
    );
  });

  it("pays the other artist when one artist's payout account has lapsed (D52)", async () => {
    // One leg failing must not strand the rest. The old single-transfer shape had
    // nothing to strand, so this behaviour is new and worth pinning.
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({ artistProfiles: TWO_ARTISTS, insertCaptured });
    twoArtistCart();
    blockedPayoutTargets.add("u-alice"); // canReceivePayout -> blocked for alice only

    expect((await POST(buildRequest())).status).toBe(200);

    const artistTransfers = transfers().filter((t) => t.recipientType === "artist");
    expect(artistTransfers).toHaveLength(1);
    expect(artistTransfers[0]).toMatchObject({ recipientUserId: "u-bob", amountCents: 8500 });
    // Alice's owed payout is recorded as a blocked leg, not lost.
    expect(recordBlockedLegMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recipientUserId: "u-alice", reason: "payouts_disabled" }),
    );
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

  it("re-attempts the payout legs on a duplicate redelivery, filling missed legs (D52.3)", async () => {
    // existingOrderId set => the F30 payment-intent duplicate path fires: the
    // order already exists, so the handler used to return WITHOUT scheduling any
    // legs (the "12 orders, 0 transfers" blind spot). Now it re-runs
    // scheduleOrderLegs so a leg the first delivery missed gets a second chance;
    // already-scheduled legs are 23505 no-ops.
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({ artistProfiles: TWO_ARTISTS, existingOrderId: "WS-EXISTING", insertCaptured });
    twoArtistCart();

    const res = await POST(buildRequest());
    await expect(res.json()).resolves.toMatchObject({ duplicate: true });
    const artistTransfers = transfers().filter((t) => t.recipientType === "artist");
    expect(artistTransfers.length).toBeGreaterThan(0);
    expect(artistTransfers.map((t) => t.recipientUserId)).toEqual(
      expect.arrayContaining(["u-alice", "u-bob"]),
    );
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

describe("Stripe webhook — setup_intent.succeeded is no longer handled (K2)", () => {
  // The E7d branch existed only to re-invoke startPaidLoanBilling once a venue
  // attached a card. That was the second of two implementations that could each
  // start a monthly charge for the same placement; it is deleted, and nothing
  // mints a paid-loan SetupIntent any more. The surviving path is Stripe
  // Checkout in subscription mode, which collects the card inside the session.
  beforeEach(() => {
    // Only the global replay guard is reached before the fall-through, so this
    // is the whole database surface the test needs.
    fromMock.mockImplementation(() => ({
      insert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }));
  });

  it("falls through to the default acknowledgement instead of starting billing", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_si_1",
      type: "setup_intent.succeeded",
      data: {
        object: {
          id: "seti_1",
          customer: "cus_1",
          payment_method: "pm_1",
          metadata: {
            source: "wallplace_paid_loan_billing",
            placement_id: "pl-1",
            venue_user_id: "u-venue",
          },
        },
      },
    });

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    // The deleted branch answered { received: true, billing: <status> }. A plain
    // acknowledgement is the proof that nothing tried to start billing. Note the
    // stripe mock at the top of this file has no `subscriptions.create` at all,
    // which is itself the point: the webhook creates no subscriptions.
    expect(await res.json()).not.toHaveProperty("billing");
  });
});

describe("Stripe webhook — subscription period end (E11b)", () => {
  let profileUpdates: Array<Record<string, unknown>>;

  // D12: the SaaS branch now ignores an unrecognised price, so the fired item must
  // carry a known one for this branch to run at all. periodFromSubscription's
  // no-items behaviour is covered by stripe-subscription-period.test.ts.
  const PRICE = { id: "price_premium_test" };
  function fireSubscription(periodFields: Record<string, unknown> | null) {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_art_1",
          customer: "cus_art",
          status: "active",
          trial_end: null,
          items: { data: [{ ...(periodFields || {}), price: PRICE }] },
        },
      },
    });
  }

  afterEach(() => {
    delete process.env.STRIPE_PRICE_PREMIUM;
  });

  beforeEach(() => {
    process.env.STRIPE_PRICE_PREMIUM = "price_premium_test";
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
    fireSubscription({ current_period_end: 1_702_000_000 });
    await POST(buildRequest());
    expect(profileUpdates[0].subscription_period_end).toBe(
      new Date(1_702_000_000 * 1000).toISOString(),
    );
  });

  it("writes null, not 1970, when Stripe sends no period", async () => {
    fireSubscription({});
    await POST(buildRequest());
    expect(profileUpdates[0].subscription_period_end).toBeNull();
  });

  it("writes null, not 1970, when the item carries no period", async () => {
    fireSubscription({}); // price present (added by fireSubscription), no period
    await POST(buildRequest());
    expect(profileUpdates[0].subscription_period_end).toBeNull();
  });

  it("never writes a 1970 date under any of those shapes", async () => {
    for (const periodFields of [{}, { current_period_end: 0 }]) {
      profileUpdates = [];
      fireSubscription(periodFields);
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

// ── D4: the artist lookup silently zeroed attribution (04 §B1) ───────────────
//
// `.single()` errors on 0 rows AND on >1 row, and the old code discarded that
// error, so artist_user_id was left null and the order booked with no attribution
// (pre-E9 it also skipped the artist transfer and defaulted the fee to 15%; E9
// moved payouts and the fee to per-artist legs, so what remains is attribution).
describe("Stripe webhook — artist attribution lookup (D4)", () => {
  function driveWithFirstArtist(firstArtistSlug: string, profiles: Array<Record<string, unknown>>) {
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({
      artistProfiles: profiles as never,
      insertCaptured,
    });
    loadCartSessionMock.mockResolvedValue({
      // The cart line's artist (bob) resolves, so buildArtistLegs succeeds; only
      // firstArtistSlug (from artistSlugs) is the missing one. That isolates D4
      // from buildArtistLegs' own missing-artist throw.
      cart: [{ workId: "w-b", artistSlug: "bob", title: "Sunrise", price: 100, qty: 1, image: "" }],
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "direct",
      venueSlug: "",
      artistSlugs: [firstArtistSlug],
      expectedSubtotalPence: 10000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: buildSession({
          amount_total: 10000,
          metadata: { kind: "cart_checkout", artist_slugs: firstArtistSlug, venue_slug: "", fulfilment_method: "ship", source: "direct" },
        }),
      },
    });
    return insertCaptured;
  }

  const BOB = { user_id: "u-bob", slug: "bob", subscription_plan: "core" };

  it("500s and books no order when the first artist's profile is missing", async () => {
    const insertCaptured = driveWithFirstArtist("ghost", [BOB]);
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Unknown artist" });
    expect(insertCaptured.row, "no order may be booked when we cannot attribute it").toBeNull();
  });

  it("books the order with attribution when the first artist resolves", async () => {
    // firstArtistSlug = bob, who exists. The order row carries artist_user_id.
    const insertCaptured = driveWithFirstArtist("bob", [BOB]);
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(insertCaptured.row).not.toBeNull();
    expect(insertCaptured.row!.artist_user_id).toBe("u-bob");
  });
});

// ── D5: atomic stock decrement (04 §B1) ──────────────────────────────────────
//
// The cart decrement was read-then-write: two concurrent orders for the last
// piece both read 1 and both wrote 0. decrement_work_stock does it in one UPDATE
// so Postgres serialises them. It is deliberately best-effort, not fatal: it runs
// after the order insert and before the receipt, and a 500 would lose both on the
// retry (the order's 23505 is classified a duplicate by D3 and returns early).
describe("Stripe webhook — atomic stock decrement (D5)", () => {
  function driveCart(cart: Array<Record<string, unknown>>) {
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({
      artistProfiles: [{ user_id: "u-bob", slug: "bob", subscription_plan: "core" }] as never,
      insertCaptured,
    });
    loadCartSessionMock.mockResolvedValue({
      cart,
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "direct",
      venueSlug: "",
      artistSlugs: ["bob"],
      expectedSubtotalPence: 10000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: buildSession({
          amount_total: 10000,
          metadata: { kind: "cart_checkout", artist_slugs: "bob", venue_slug: "", fulfilment_method: "ship", source: "direct" },
        }),
      },
    });
    return insertCaptured;
  }

  const stockCalls = () =>
    (rpcMock.mock.calls as unknown as Array<[string, Record<string, unknown>]>)
      .filter(([fn]) => fn === "decrement_work_stock")
      .map(([, args]) => args);

  it("calls the RPC once per line with the line quantity", async () => {
    driveCart([
      { workId: "w-1", artistSlug: "bob", title: "A", price: 50, qty: 2, image: "" },
      { workId: "w-2", artistSlug: "bob", title: "B", price: 50, qty: 1, image: "" },
    ]);
    expect((await POST(buildRequest())).status).toBe(200);
    expect(stockCalls()).toEqual([
      { p_work_id: "w-1", p_qty: 2 },
      { p_work_id: "w-2", p_qty: 1 },
    ]);
  });

  it("does not read-then-write: no artist_works UPDATE is issued", async () => {
    // The whole point of D5. The mock's artist_works.update pushes to
    // insertCaptured-adjacent state; here we assert the RPC path is used instead
    // by confirming exactly one RPC call and a booked order.
    const insertCaptured = driveCart([{ workId: "w-1", artistSlug: "bob", title: "A", price: 100, qty: 1, image: "" }]);
    await POST(buildRequest());
    expect(stockCalls()).toHaveLength(1);
    expect(insertCaptured.row).not.toBeNull();
  });

  it("still books the order and stays 200 when the decrement errors (best-effort)", async () => {
    // A decrement failure must not lose the order or the receipt. The race, not
    // the failure path, is the finding.
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc boom" } });
    const insertCaptured = driveCart([{ workId: "w-1", artistSlug: "bob", title: "A", price: 100, qty: 1, image: "" }]);
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(insertCaptured.row, "the order is still booked").not.toBeNull();
  });

  it("skips lines with no work id or a non-positive quantity", async () => {
    driveCart([
      { artistSlug: "bob", title: "no-id", price: 50, qty: 1, image: "" },
      { workId: "w-2", artistSlug: "bob", title: "zero", price: 50, qty: 0, image: "" },
      { workId: "w-3", artistSlug: "bob", title: "ok", price: 50, qty: 1, image: "" },
    ]);
    await POST(buildRequest());
    expect(stockCalls()).toEqual([{ p_work_id: "w-3", p_qty: 1 }]);
  });
});

// ── D6: the strip-and-retry loop must not drop money columns (04 §B1) ────────
//
// On a schema-drift insert error the loop stripped whatever column the error
// named and retried. The list included venue_revenue, artist_revenue,
// platform_fee and stripe_payment_intent_id, so the order could save with the
// split silently missing while the code then scheduled transfers from in-memory
// values that were never persisted. The list is now split: attribution may be
// stripped, money columns and the payment intent may not.
describe("Stripe webhook — strip-and-retry money-column guard (D6)", () => {
  /** Order insert that errors "column X does not exist" until X is stripped. */
  function driveWithMissingColumn(missing: string) {
    const inserted: Array<Record<string, unknown>> = [];
    setupDbMock({
      artistProfiles: [{ user_id: "u-bob", slug: "bob", subscription_plan: "core" }] as never,
      insertCaptured: { row: null },
    });
    // Override the orders branch to simulate the missing column.
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            if (row[missing] !== undefined) {
              return Promise.resolve({
                error: { code: "42703", message: `column "${missing}" of relation "orders" does not exist` },
              });
            }
            return Promise.resolve({ error: null });
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return base(table);
    });
    loadCartSessionMock.mockResolvedValue({
      cart: [{ workId: "w-1", artistSlug: "bob", title: "A", price: 100, qty: 1, image: "" }],
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "direct",
      venueSlug: "",
      artistSlugs: ["bob"],
      expectedSubtotalPence: 10000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: buildSession({
          amount_total: 10000,
          metadata: { kind: "cart_checkout", artist_slugs: "bob", venue_slug: "", fulfilment_method: "ship", source: "direct" },
        }),
      },
    });
    return { inserted };
  }

  it("500s rather than stripping a money column (artist_revenue)", async () => {
    const { inserted } = driveWithMissingColumn("artist_revenue");
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Schema drift on money columns" });
    // Exactly one insert attempt: it refused rather than retrying with the column dropped.
    expect(inserted).toHaveLength(1);
  });

  it("500s rather than stripping stripe_payment_intent_id", async () => {
    const { inserted } = driveWithMissingColumn("stripe_payment_intent_id");
    const r = await POST(buildRequest());
    expect(r.status).toBe(500);
    await expect(r.json()).resolves.toMatchObject({ error: "Schema drift on money columns" });
    // Only the first attempt; it never retried with the column removed.
    expect(inserted).toHaveLength(1);
  });

  it("still strips an attribution column and books the order", async () => {
    // placement_id is attribution, not money: dropping it keeps the order bookable.
    const { inserted } = driveWithMissingColumn("placement_id");
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    // Two attempts: full row, then the retry with placement_id removed.
    expect(inserted).toHaveLength(2);
    expect(inserted[1].placement_id).toBeUndefined();
    // The money columns survived the strip.
    expect(inserted[1]).toHaveProperty("artist_revenue");
    expect(inserted[1]).toHaveProperty("platform_fee");
  });
});

// ── D9: deterministic venue-share pick among duplicate active placements ──────
//
// A venue+artist can have several active placements (prod has real duplicates and
// the unique index that would stop them is blocked on that data). The map fill had
// no order and last-wins, so the venue's share could differ between two replays of
// the same event. The query now orders by created_at and the fill is first-wins.
describe("Stripe webhook — deterministic venue share (D9)", () => {
  it("uses the first-created placement's rate when duplicates exist", async () => {
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({
      artistProfiles: [{ user_id: "u-alice", slug: "alice", subscription_plan: "core" }] as never,
      // Two active placements for alice at kings-arms, earliest first (as the
      // created_at order would return them). 20% must win over 40%.
      placements: [
        { id: "place-early", artist_slug: "alice", revenue_share_percent: 20 },
        { id: "place-late", artist_slug: "alice", revenue_share_percent: 40 },
      ],
      insertCaptured,
    });
    loadCartSessionMock.mockResolvedValue({
      cart: [{ workId: "w-a", artistSlug: "alice", title: "Sunset", price: 100, qty: 1, image: "" }],
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "qr",
      venueSlug: "kings-arms",
      artistSlugs: ["alice"],
      expectedSubtotalPence: 10000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: buildSession({ amount_total: 10000, metadata: { kind: "cart_checkout", artist_slugs: "alice", venue_slug: "kings-arms", fulfilment_method: "ship", source: "qr" } }) },
    });

    expect((await POST(buildRequest())).status).toBe(200);
    // £100 at 20% = £20, not £40. The placement_id is the first one too.
    expect(insertCaptured.row!.venue_revenue).toBe(20);
    expect(insertCaptured.row!.placement_id).toBe("place-early");
  });
});

// ── D11: a QR sale with no active placement is logged, not silent (04 §B5) ────
//
// The venue-attributed branch filters status='active'. A pending/paused/completed
// placement yields pct 0 with no log, so the venue saw a sale and no revenue and
// nobody could tell why.
describe("Stripe webhook — QR sale with no active placement is observable (D11)", () => {
  function driveVenueSale(placements: Array<{ id: string; artist_slug: string; revenue_share_percent: number }>) {
    setupDbMock({
      artistProfiles: [{ user_id: "u-bob", slug: "bob", subscription_plan: "core" }] as never,
      placements,
      insertCaptured: { row: null },
    });
    loadCartSessionMock.mockResolvedValue({
      cart: [{ workId: "w-b", artistSlug: "bob", title: "Sunrise", price: 100, qty: 1, image: "" }],
      shipping: { fullName: "Buyer", email: "buyer@example.com", country: "GB", fulfilmentMethod: "ship" },
      source: "qr",
      venueSlug: "kings-arms",
      artistSlugs: ["bob"],
      expectedSubtotalPence: 10000,
      expectedShippingPence: 0,
      artistShippingPence: {},
    });
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: buildSession({ amount_total: 10000, metadata: { kind: "cart_checkout", artist_slugs: "bob", venue_slug: "kings-arms", fulfilment_method: "ship", source: "qr" } }) },
    });
  }

  it("warns when the artist has no active placement at the attributed venue", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    driveVenueSale([]); // no placement for bob at kings-arms
    await POST(buildRequest());
    expect(warn).toHaveBeenCalledWith(
      "[webhook] QR sale with no active placement",
      expect.objectContaining({ venueSlug: "kings-arms", artistSlug: "bob" }),
    );
    warn.mockRestore();
  });

  it("does NOT warn when the artist has an active placement", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    driveVenueSale([{ id: "place-bob", artist_slug: "bob", revenue_share_percent: 20 }]);
    await POST(buildRequest());
    const d11Calls = warn.mock.calls.filter(([m]) => m === "[webhook] QR sale with no active placement");
    expect(d11Calls).toHaveLength(0);
    warn.mockRestore();
  });
});

// ── D12: an unknown price id must not silently downgrade the artist ───────────
//
// The old mapping defaulted to "core" and only bumped up on a match, so an unset
// or mistyped STRIPE_PRICE_PRO wrote every Pro artist as core, and the fee helper
// then charged 15% instead of 5% on every sale. Now an unrecognised price stamps
// nothing.
describe("Stripe webhook — subscription plan mapping (D12)", () => {
  let updates: Array<Record<string, unknown>>;

  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO = "price_pro_live";
    process.env.STRIPE_PRICE_PREMIUM = "price_premium_live";
    process.env.STRIPE_PRICE_CORE = "price_core_live";
    updates = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return webhookEventsStub();
      if (table === "artist_profiles") {
        return {
          update: (row: Record<string, unknown>) => {
            updates.push(row);
            return { eq: async () => ({ error: null }) };
          },
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
    });
  });
  afterEach(() => {
    delete process.env.STRIPE_PRICE_PRO;
    delete process.env.STRIPE_PRICE_PREMIUM;
    delete process.env.STRIPE_PRICE_CORE;
  });

  function fireWithPrice(priceId: string) {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          trial_end: null,
          items: { data: [{ price: { id: priceId }, current_period_end: 1_800_000_000 }] },
        },
      },
    });
  }

  it("maps a recognised Pro price to pro", async () => {
    fireWithPrice("price_pro_live");
    expect((await POST(buildRequest())).status).toBe(200);
    expect(updates[0].subscription_plan).toBe("pro");
  });

  it("ignores an unknown price and writes NO plan, rather than defaulting to core", async () => {
    // The whole finding: a Pro artist whose price id we do not recognise must not
    // be stamped core (which would overcharge them 15% vs 5%).
    fireWithPrice("price_something_unconfigured");
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ignored: "unknown_price" });
    expect(updates, "no artist_profiles write on an unknown price").toHaveLength(0);
  });

  it("ignores a paid-loan subscription's dynamic price (not a SaaS plan)", async () => {
    // startPaidLoanBilling creates subscriptions with a price_data, not a
    // STRIPE_PRICE_* id, so they land here and must be left to their own handler.
    fireWithPrice("price_dynamic_paid_loan");
    await expect((await POST(buildRequest())).json()).resolves.toMatchObject({
      ignored: "unknown_price",
    });
    expect(updates).toHaveLength(0);
  });
});

// ── D13: a stale SaaS subscription.deleted must still run the paid-loan handler ─
//
// The SaaS block used to `return` on isStale, exiting the whole handler, so the
// paid-loan customer.subscription.deleted handler below never ran. An artist
// upgrading their plan could leave a paid-loan billing row stuck active.
describe("Stripe webhook — subscription.deleted reaches the paid-loan handler (D13)", () => {
  beforeEach(() => {
    handleSubDeletedMock.mockClear();
  });

  function fireDeleted(profileSubId: string | null) {
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return webhookEventsStub();
      if (table === "artist_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: profileSubId
                  ? { user_id: null, name: null, subscription_plan: "pro", stripe_subscription_id: profileSubId }
                  : null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), update: () => ({ eq: async () => ({ error: null }) }) };
    });
    constructEventMock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_deleted", customer: "cus_1", cancel_at: null } },
    });
  }

  it("runs the paid-loan handler even when the SaaS deletion is stale (upgrade race)", async () => {
    // profile points at a DIFFERENT (newer) subscription => isStale true.
    fireDeleted("sub_newer_active");
    expect((await POST(buildRequest())).status).toBe(200);
    expect(handleSubDeletedMock).toHaveBeenCalledTimes(1);
  });

  it("also runs the paid-loan handler on a non-stale SaaS deletion", async () => {
    fireDeleted("sub_deleted"); // same id => not stale
    await POST(buildRequest());
    expect(handleSubDeletedMock).toHaveBeenCalledTimes(1);
  });
});

// ── D15: the SaaS subscription branch must be scoped by metadata.kind ─────────
//
// It writes artist_profiles by stripe_customer_id, so a paid-loan or
// managed-curation subscription must be left to its own handler rather than
// stamping a plan onto whatever profile shares that customer id.
describe("Stripe webhook — SaaS subscription scoped by kind (D15)", () => {
  let updates: Array<Record<string, unknown>>;

  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO = "price_pro_live";
    updates = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return webhookEventsStub();
      if (table === "artist_profiles") {
        return {
          update: (row: Record<string, unknown>) => {
            updates.push(row);
            return { eq: async () => ({ error: null }) };
          },
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
    });
  });
  afterEach(() => {
    delete process.env.STRIPE_PRICE_PRO;
  });

  function fire(metadata: Record<string, string>) {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          trial_end: null,
          metadata,
          items: { data: [{ price: { id: "price_pro_live" }, current_period_end: 1_800_000_000 }] },
        },
      },
    });
  }

  it("ignores a paid-loan subscription even when its price is a known SaaS price", async () => {
    // The exact near-miss D15 guards: a dedicated-kind sub whose price would
    // otherwise map to a plan must NOT write artist_profiles.
    fire({ kind: "paid_loan_monthly" });
    const res = await POST(buildRequest());
    await expect(res.json()).resolves.toMatchObject({ ignored: "not_saas_subscription" });
    expect(updates).toHaveLength(0);
  });

  it("ignores a curation subscription", async () => {
    fire({ kind: "curation_request" });
    await POST(buildRequest());
    expect(updates).toHaveLength(0);
  });

  it("ignores the paid-loan billing source label too", async () => {
    fire({ source: "wallplace_paid_loan_billing" });
    await POST(buildRequest());
    expect(updates).toHaveLength(0);
  });

  it("still processes a genuine platform SaaS subscription (no dedicated kind)", async () => {
    fire({}); // no kind/source => platform SaaS
    await POST(buildRequest());
    expect(updates[0]?.subscription_plan).toBe("pro");
  });
});

// D20: the curation checkout branch wrote `paymentIntentId || subscriptionId`
// into curation_requests.stripe_payment_intent_id. A managed tier is a Stripe
// subscription whose checkout session has no top-level payment intent, so the
// column ended up holding a sub_… id. Any refund keyed on it would call
// stripe.refunds.create({ payment_intent: "sub_…" }) and fail. The column must
// hold a real pi_… id or null; the subscription is recoverable from the stored
// checkout session id when the curation refund path is built.
describe("Stripe webhook — curation payment id storage (D20)", () => {
  let curationUpdate: Record<string, unknown> | null;

  function setupCurationDb(existingStatus = "pending_payment") {
    curationUpdate = null;
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return webhookEventsStub();
      if (table === "curation_requests") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "cr_1",
                  tier: "managed_monthly",
                  venue_name: "The Copper Kettle",
                  contact_name: "Maya Chen",
                  contact_email: "maya@example.com",
                  status: existingStatus,
                },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            curationUpdate = payload;
            return { eq: async () => ({ error: null }) };
          },
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

  function fireCuration(opts: {
    mode: "payment" | "subscription";
    payment_intent: string | null;
    subscription: string | null;
    amount_total?: number;
  }) {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_curation_1",
          mode: opts.mode,
          amount_total: opts.amount_total ?? 4900,
          customer_email: "maya@example.com",
          payment_intent: opts.payment_intent,
          subscription: opts.subscription,
          metadata: {
            kind: "curation_request",
            curation_request_id: "cr_1",
            tier: opts.mode === "subscription" ? "managed_monthly" : "single_wall",
          },
        },
      },
    });
    return POST(buildRequest());
  }

  it("stores null, never the subscription id, for a managed subscription session", async () => {
    setupCurationDb();

    const res = await fireCuration({ mode: "subscription", payment_intent: null, subscription: "sub_live_123" });

    expect(res.status).toBe(200);
    expect(curationUpdate).not.toBeNull();
    // The crux: a subscription id must never masquerade as a payment intent.
    expect(curationUpdate!.stripe_payment_intent_id).toBeNull();
    expect(curationUpdate!.stripe_payment_intent_id).not.toBe("sub_live_123");
    // D20-complete (migration 099): the sub id lands in its own column.
    expect(curationUpdate!.stripe_subscription_id).toBe("sub_live_123");
    // Managed tier is an ongoing service.
    expect(curationUpdate!.status).toBe("in_progress");
  });

  it("stores the real payment intent for a one-off session", async () => {
    setupCurationDb();

    const res = await fireCuration({ mode: "payment", payment_intent: "pi_live_456", subscription: null });

    expect(res.status).toBe(200);
    expect(curationUpdate!.stripe_payment_intent_id).toBe("pi_live_456");
    // A one-off has no subscription, so the column stays null.
    expect(curationUpdate!.stripe_subscription_id).toBeNull();
    expect(curationUpdate!.status).toBe("paid");
  });

  it("D23: tells the admin the money landed when a curation payment settles", async () => {
    setupCurationDb();

    await fireCuration({ mode: "subscription", payment_intent: null, subscription: "sub_x", amount_total: 7999 });

    // K1: one generic alert helper now, so the identifying detail lives in the
    // subject and fields rather than in named props.
    const alert = (notifyAdminCurationPaidMock.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
      subject: string;
      summary: string;
      fields?: { label: string; value: string }[];
    };
    expect(alert.subject).toContain("Curation paid");
    expect(alert.subject).toContain("The Copper Kettle");
    const values = (alert.fields ?? []).map((f) => f.value).join(" | ");
    // Wallplace Programmes plan, Task 1: managed_monthly is retired from
    // CURATION_TIERS, so the "One label source: CURATION_TIERS" lookup this
    // fixture exercises (route.ts) now misses and falls back to the raw tier
    // key rather than the old "Managed, monthly rotation" label. This is the
    // intended, existing graceful-degradation behaviour for a historical row
    // whose tier no longer has a live marketing label.
    expect(values).toContain("managed_monthly");
    expect(values).toContain("79.99");
    expect(values).toContain("Managed subscription, first payment");
  });
});

// D21: the webhook must route each subscription-lifecycle event to the curation
// reconciler. Before D21 there was no curation billing module wired in at all,
// so a managed-curation renewal / cancellation / failure reconciled nothing. The
// module is mocked (returns false) here; this pins only the wiring. The empty db
// lets the co-running paid-loan and SaaS handlers no-op without throwing.
describe("Stripe webhook — D21 curation reconcile wiring", () => {
  beforeEach(() => {
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") return webhookEventsStub();
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
      };
    });
  });

  it("routes invoice.paid to handleCurationInvoicePaid", async () => {
    const invoice = { id: "in_cur_1", subscription: "sub_cur_1" };
    constructEventMock.mockReturnValue({ type: "invoice.paid", data: { object: invoice } });

    await POST(buildRequest());

    expect(curationInvoicePaidMock).toHaveBeenCalledWith(invoice);
    expect(curationInvoiceFailedMock).not.toHaveBeenCalled();
    expect(curationSubDeletedMock).not.toHaveBeenCalled();
  });

  it("routes invoice.payment_failed to handleCurationInvoiceFailed", async () => {
    const invoice = { id: "in_cur_2", subscription: "sub_cur_1", next_payment_attempt: null };
    constructEventMock.mockReturnValue({ type: "invoice.payment_failed", data: { object: invoice } });

    await POST(buildRequest());

    expect(curationInvoiceFailedMock).toHaveBeenCalledWith(invoice);
    expect(curationInvoicePaidMock).not.toHaveBeenCalled();
  });

  it("routes customer.subscription.deleted to handleCurationSubscriptionDeleted", async () => {
    const subscription = { id: "sub_cur_1", customer: "cus_1" };
    constructEventMock.mockReturnValue({ type: "customer.subscription.deleted", data: { object: subscription } });

    await POST(buildRequest());

    expect(curationSubDeletedMock).toHaveBeenCalledWith(subscription);
    expect(curationInvoicePaidMock).not.toHaveBeenCalled();
  });

  // Task 5: a Wallplace Programme's lifecycle rides these same reconcilers,
  // resolved by metadata rather than a price-id lookup (billing.ts). billing.ts
  // itself has no per-invoice dedupe -- calling handleCurationInvoicePaid twice
  // is NOT idempotent by itself, since it unconditionally re-stamps status and
  // last_invoice_paid_at. What makes a Stripe redelivery a no-op is the D1
  // global replay guard above (stripe_webhook_events, keyed on event.id), which
  // runs before ANY branch, curation included. This test proves that guard
  // actually covers the curation invoice.paid path: the reconciler mock is
  // invoked exactly once across two deliveries of the identical event id.
  it("Task 5: a redelivered invoice.paid for a curation subscription is a no-op (D1 replay guard, not a billing.ts dedupe)", async () => {
    const claimed = new Set<string>();
    fromMock.mockImplementation((table: string) => {
      if (table === "stripe_webhook_events") {
        return {
          insert: async (row: { event_id: string }) => {
            if (claimed.has(row.event_id)) return { error: { code: "23505" } };
            claimed.add(row.event_id);
            return { error: null };
          },
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
      };
    });

    const invoice = { id: "in_prog_1", subscription: "sub_prog_1" };
    constructEventMock.mockReturnValue({ id: "evt_prog_1", type: "invoice.paid", data: { object: invoice } });

    const first = await POST(buildRequest());
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.not.toMatchObject({ duplicate: true });
    expect(curationInvoicePaidMock).toHaveBeenCalledTimes(1);

    const second = await POST(buildRequest());
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ duplicate: true });
    // The reconciler must not run again for the redelivered event.
    expect(curationInvoicePaidMock).toHaveBeenCalledTimes(1);
  });
});
