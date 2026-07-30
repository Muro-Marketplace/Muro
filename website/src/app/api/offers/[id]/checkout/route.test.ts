// T3 / E6, the taking-the-money half.
//
// The route created a plain platform charge and put nothing about the split in
// the session, so the webhook had no way to know what the artist was owed. It
// also never checked whether the artist could be paid at all, so Wallplace could
// capture money for an artist with no usable Connect account.
//
// The fee percent is computed from `subscription_plan` only. Naming `free_until`
// in the select, as the plan's proposed fix does, would make PostgREST reject the
// whole statement and null the profile, and platformFeePercentForArtist defaults a
// null profile to 15%, so every artist would be silently overcharged. That exact
// bug is live on the cart path (webhooks/stripe/route.ts:203) and is recorded in
// PROGRESS.md as its own finding.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { sessionsCreateMock, fromMock, canAcceptMock, getUserMock } = vi.hoisted(() => ({
  sessionsCreateMock: vi.fn(async () => ({ url: "https://stripe.example/pay", id: "cs_1" })),
  fromMock: vi.fn(),
  canAcceptMock: vi.fn(async () => true),
  getUserMock: vi.fn(async () => ({ user: { id: "u-buyer", email: "venue@example.com" }, error: null })),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: sessionsCreateMock } } },
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/stripe-connect-status", () => ({ canArtistAcceptOrders: canAcceptMock }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getUserMock }));

import { POST } from "./route";

const OFFER = {
  id: "off_1",
  buyer_user_id: "u-buyer",
  buyer_email: "venue@example.com",
  artist_user_id: "u-artist",
  artist_slug: "fin-coles",
  work_ids: ["w-1"],
  collection_id: null,
  amount_pence: 3300,
  currency: "GBP",
  status: "accepted",
};

/** Columns the profile select is allowed to name, mirroring the live table. */
const LIVE_PROFILE_COLUMNS = [
  "slug", "subscription_plan", "user_id", "name",
  "stripe_connect_account_id", "stripe_connect_onboarding_complete",
];

let profileSelects: string[] = [];

function setupDb(
  offer: Record<string, unknown> | null = OFFER,
  profile: Record<string, unknown> | null = { slug: "fin-coles", subscription_plan: "core" },
) {
  profileSelects = [];
  fromMock.mockImplementation((table: string) => {
    if (table === "purchase_offers") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: offer }) }) }),
      };
    }
    if (table === "artist_profiles") {
      return {
        select: (columns: string) => {
          profileSelects.push(columns);
          // PostgREST rejects the whole statement when a column does not exist.
          const unknown = columns.split(",").map((c) => c.trim())
            .filter((c) => c && !LIVE_PROFILE_COLUMNS.includes(c));
          return {
            eq: () => ({
              maybeSingle: async () =>
                unknown.length > 0
                  ? { data: null, error: { message: `column artist_profiles.${unknown[0]} does not exist` } }
                  : { data: profile, error: null },
            }),
          };
        },
      };
    }
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
  });
}

const post = () =>
  POST(
    new Request("http://localhost/api/offers/off_1/checkout", {
      method: "POST",
      headers: { authorization: "Bearer buyer", origin: "http://localhost:3000" },
    }),
    { params: Promise.resolve({ id: "off_1" }) },
  );

/** The metadata the created session carried. */
function metadata(): Record<string, string> {
  const calls = sessionsCreateMock.mock.calls as unknown as Array<[{ metadata: Record<string, string> }]>;
  return calls[0]?.[0]?.metadata ?? {};
}

beforeEach(() => {
  sessionsCreateMock.mockClear();
  fromMock.mockReset();
  canAcceptMock.mockReset();
  canAcceptMock.mockResolvedValue(true);
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ user: { id: "u-buyer", email: "venue@example.com" }, error: null });
  setupDb();
});

describe("POST /api/offers/[id]/checkout split (E6)", () => {
  it("carries the split on the session so the webhook can write a complete order", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(metadata()).toMatchObject({
      offer_platform_fee_pence: "495",
      offer_artist_net_pence: "2805",
      offer_platform_fee_percent: "15",
    });
  });

  it("splits to the penny: fee plus net equals the amount charged", async () => {
    await post();
    const m = metadata();
    expect(Number(m.offer_platform_fee_pence) + Number(m.offer_artist_net_pence)).toBe(OFFER.amount_pence);
  });

  it("uses the artist's real plan rate, not a flat 15%", async () => {
    setupDb(OFFER, { slug: "fin-coles", subscription_plan: "pro" }); // 5%
    await post();
    expect(metadata()).toMatchObject({
      offer_platform_fee_percent: "5",
      offer_platform_fee_pence: "165",
      offer_artist_net_pence: "3135",
    });
  });

  it("never names a column the artist_profiles table does not have", async () => {
    await post();
    expect(profileSelects.length).toBeGreaterThan(0);
    for (const columns of profileSelects) {
      expect(columns, `select names a phantom column: "${columns}"`).not.toContain("free_until");
    }
  });

  it("splits an odd amount without losing or inventing a penny", async () => {
    // 2505p at 15% is 375.75p, which must round once and leave the rest as net.
    setupDb({ ...OFFER, amount_pence: 2505 });
    await post();
    const m = metadata();
    expect(m.offer_platform_fee_pence).toBe("376");
    expect(m.offer_artist_net_pence).toBe("2129");
    expect(Number(m.offer_platform_fee_pence) + Number(m.offer_artist_net_pence)).toBe(2505);
  });

  it("puts a real email in the metadata for the NOT NULL buyer_email column", async () => {
    await post();
    expect(metadata().offer_buyer_email).toBe("venue@example.com");
  });
});

describe("POST /api/offers/[id]/checkout payout pre-flight (E6)", () => {
  it("refuses with 422 and takes no money when the artist cannot be paid out", async () => {
    canAcceptMock.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ reason: "payouts_unavailable" });
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("refuses with 500 and takes no money when the artist profile is missing", async () => {
    setupDb(OFFER, null);
    const res = await post();
    expect(res.status).toBe(500);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("still refuses a non-buyer and a non-accepted offer before any of this", async () => {
    getUserMock.mockResolvedValue({ user: { id: "u-someone-else", email: "x@y.z" }, error: null });
    expect((await post()).status).toBe(403);

    getUserMock.mockResolvedValue({ user: { id: "u-buyer", email: "venue@example.com" }, error: null });
    setupDb({ ...OFFER, status: "pending" });
    expect((await post()).status).toBe(409);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});
