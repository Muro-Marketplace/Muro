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
  sendEmailMock,
  resolveArtistNamesBulkMock,
  platformFeePercentForArtistMock,
} = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  fromMock: vi.fn(),
  authGetUserByIdMock: vi.fn(async () => ({ data: { user: null } })),
  loadCartSessionMock: vi.fn(),
  scheduleTransferMock: vi.fn(async () => {}),
  signOrderTokenMock: vi.fn(async () => "token-abc"),
  createNotificationMock: vi.fn(async () => {}),
  sendEmailMock: vi.fn(async () => {}),
  resolveArtistNamesBulkMock: vi.fn(async () => new Map<string, string>()),
  platformFeePercentForArtistMock: vi.fn(() => 15),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { webhooks: { constructEvent: constructEventMock } },
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

vi.mock("@/lib/platform-fee", () => ({
  platformFeePercentForArtist: platformFeePercentForArtistMock,
  DEFAULT_PLAN_FEE_PERCENT: 15,
}));

vi.mock("@/lib/cart-sessions", () => ({
  loadCartSession: loadCartSessionMock,
}));

vi.mock("@/lib/order-tracking-token", () => ({
  signOrderToken: signOrderTokenMock,
}));

// Email templates are React components, the route only constructs them
// for the `sendEmail` payload. Returning null keeps the templates inert
// without pulling in @react-email at test time.
vi.mock("@/emails/templates/orders/CustomerOrderReceipt", () => ({ CustomerOrderReceipt: () => null }));
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

import { POST } from "./route";

type Placement = { id: string; artist_slug: string; revenue_share_percent: number };
type ArtistProfile = { user_id: string; subscription_plan: string; free_until: string | null; name?: string; slug?: string };

interface DbState {
  artistProfile?: ArtistProfile | null;
  placements?: Placement[];
  insertCaptured: { row: Record<string, unknown> | null };
  existingOrderId?: string | null;
}

function setupDbMock(state: DbState) {
  const placements = state.placements || [];
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: state.artistProfile ?? null }),
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
  sendEmailMock.mockClear();
  createNotificationMock.mockClear();
  authGetUserByIdMock.mockReset();
  authGetUserByIdMock.mockResolvedValue({ data: { user: null } });
  platformFeePercentForArtistMock.mockReturnValue(15);
});

describe("Stripe webhook — venue revenue split", () => {
  it("computes venue_revenue per line for a multi-artist cart with different placement rates", async () => {
    // Alice and Bob both placed at kings-arms with different shares.
    // Cart: 2× £100 (Alice) + 1× £200 (Bob) = £400 subtotal.
    // Expected venue cut: 100×2×0.20 + 200×1×0.30 = £40 + £60 = £100.
    // Blended pct against subtotal: 100/400 = 25%.
    const insertCaptured = { row: null as Record<string, unknown> | null };
    setupDbMock({
      artistProfile: { user_id: "u-alice", subscription_plan: "core", free_until: null },
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
      artistProfile: { user_id: "u-bob", subscription_plan: "core", free_until: null },
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
      artistProfile: { user_id: "u-alice", subscription_plan: "core", free_until: null },
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
