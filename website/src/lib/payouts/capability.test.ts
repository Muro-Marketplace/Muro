// Tests for canReceivePayout (C1). Ports the coverage of the deleted
// stripe-connect-status.test.ts (no-account, cached, stale re-check) and adds
// the reason it exists: charges_enabled is not enough, we gate on
// payouts_enabled, and venues are first-class payout targets too.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { accountsRetrieve, fromMock } = vi.hoisted(() => ({
  accountsRetrieve: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { accounts: { retrieve: accountsRetrieve } },
}));

import { canReceivePayout } from "./capability";

// The real client only needs `.from`; canReceivePayout types it as Pick<_, "from">.
const db = { from: fromMock } as unknown as Parameters<typeof canReceivePayout>[0];

beforeEach(() => {
  accountsRetrieve.mockReset();
  fromMock.mockReset();
});

/**
 * A from() stub whose select().eq().maybeSingle() resolves to {data,error} and
 * whose update().eq() resolves ok. Every method returns the same chain so the
 * route's `q = q.eq(...)` reassignment and the update path both work.
 */
function profileClient(row: Record<string, unknown> | null, error: unknown = null) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    update: () => chain,
    maybeSingle: async () => ({ data: row, error }),
  };
  return chain;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    stripe_connect_account_id: "acct_123",
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_charges_checked_at: new Date().toISOString(), // fresh
    ...overrides,
  };
}

describe("canReceivePayout()", () => {
  it("no_account when the connect id is null", async () => {
    fromMock.mockReturnValue(profileClient(row({ stripe_connect_account_id: null })));
    const cap = await canReceivePayout(db, { kind: "artist", slug: "alice" });
    expect(cap).toEqual({ ok: false, accountId: null, reason: "no_account" });
    expect(accountsRetrieve).not.toHaveBeenCalled();
  });

  it("no_account when the connect id is the empty-string default (mig 004 trap)", async () => {
    fromMock.mockReturnValue(profileClient(row({ stripe_connect_account_id: "" })));
    const cap = await canReceivePayout(db, { kind: "artist", slug: "alice" });
    expect(cap.reason).toBe("no_account");
    expect(accountsRetrieve).not.toHaveBeenCalled();
  });

  it("ok from cache when charges + payouts both enabled and fresh", async () => {
    fromMock.mockReturnValue(profileClient(row()));
    const cap = await canReceivePayout(db, { kind: "artist", slug: "alice" });
    expect(cap).toEqual({ ok: true, accountId: "acct_123", reason: null });
    expect(accountsRetrieve).not.toHaveBeenCalled();
  });

  it("payouts_disabled from cache even when charges are enabled (the C1 reason for being)", async () => {
    fromMock.mockReturnValue(profileClient(row({ stripe_payouts_enabled: false })));
    const cap = await canReceivePayout(db, { kind: "artist", slug: "alice" });
    expect(cap.ok).toBe(false);
    expect(cap.reason).toBe("payouts_disabled");
    expect(accountsRetrieve).not.toHaveBeenCalled();
  });

  it("re-checks Stripe when the cache is stale, and blocks on payouts_disabled", async () => {
    fromMock.mockReturnValue(
      profileClient(
        row({ stripe_charges_checked_at: new Date(Date.now() - 90_000).toISOString() }),
      ),
    );
    accountsRetrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: false });
    const cap = await canReceivePayout(db, { kind: "artist", slug: "alice" });
    expect(cap.reason).toBe("payouts_disabled");
    expect(accountsRetrieve).toHaveBeenCalledWith("acct_123");
  });

  it("charges_disabled when a stale re-check shows charges off", async () => {
    fromMock.mockReturnValue(
      profileClient(row({ stripe_charges_enabled: null, stripe_payouts_enabled: null })),
    );
    accountsRetrieve.mockResolvedValue({ charges_enabled: false, payouts_enabled: false });
    const cap = await canReceivePayout(db, { kind: "artist", slug: "alice" });
    expect(cap.reason).toBe("charges_disabled");
  });

  it("fails closed (stripe_unavailable) when accounts.retrieve throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromMock.mockReturnValue(
      profileClient(
        row({ stripe_charges_checked_at: new Date(Date.now() - 90_000).toISOString() }),
      ),
    );
    accountsRetrieve.mockRejectedValue(new Error("stripe down"));
    const cap = await canReceivePayout(db, { kind: "artist", slug: "alice" });
    expect(cap).toEqual({ ok: false, accountId: "acct_123", reason: "stripe_unavailable" });
    errSpy.mockRestore();
  });

  it("resolves a venue target against venue_profiles", async () => {
    fromMock.mockReturnValue(profileClient(row()));
    const cap = await canReceivePayout(db, { kind: "venue", userId: "v-1" });
    expect(cap.ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith("venue_profiles");
  });
});
