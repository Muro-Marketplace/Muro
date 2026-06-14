// Tests for remediation findings 1.5 (admin gate), 4.1 (artist self-approval
// block), and 1.8 (idempotent refund processing via atomic claim).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { isAdminMock, authMock, fromMock, stripeMock, claimPendingMock, releaseClaimMock } = vi.hoisted(() => ({
  isAdminMock: vi.fn(),
  authMock: vi.fn(),
  fromMock: vi.fn(),
  stripeMock: {
    refunds: { create: vi.fn(async () => ({ id: "re_test" })) },
    transfers: { createReversal: vi.fn(async () => ({})) },
  },
  claimPendingMock: vi.fn(),
  releaseClaimMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: isAdminMock }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: null } })) } },
  }),
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));
vi.mock("@/lib/email", () => ({
  notifyRefundDecision: vi.fn(async () => {}),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async () => {}),
}));
vi.mock("@/emails/templates/orders/CustomerRefundConfirmation", () => ({
  CustomerRefundConfirmation: () => null,
}));
vi.mock("@/emails/templates/orders/ArtistRefundNotification", () => ({
  ArtistRefundNotification: () => null,
}));
vi.mock("@/lib/orders/lifecycle", () => ({
  recordOrderEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/api/idempotency", () => ({
  claimPending: claimPendingMock,
  releaseClaim: releaseClaimMock,
}));

import { POST } from "./route";

// Helper: build a minimal POST request.
function req(body: unknown): Request {
  return new Request("http://localhost/api/refunds/process", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// DB mock helpers
//
// After the fix, the route's DB touches on refund_requests are:
//   1. select("*").eq("id", id).single()   — pre-authz read (NOT a mutation)
//   2. claimPending(...)                    — mocked via vi.mock above
//   3. update({status:'rejected'|...}).eq() — terminal write (reject/approve)
//
// We mock claimPending directly so tests can assert it was (or was not) called.
// ---------------------------------------------------------------------------

/** Build a refund_requests mock that returns `row` from the pre-authz select. */
function makeSelectChain(row: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        single: async () => row
          ? { data: row, error: null }
          : { data: null, error: { message: "not found" } },
      }),
    }),
  };
}

/** Build a refund_requests mock for the terminal update (.eq chain, no select). */
function makeUpdateChain() {
  return {
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  };
}

/**
 * Set up fromMock for a full happy-path scenario.
 *
 * refundRow is the row returned from the pre-authz select.
 * order is the orders row.
 * claimResult is what claimPending resolves to (the same row on success, null on race-loser).
 */
function setupDb({
  refundRow,
  order,
  claimResult,
}: {
  refundRow: Record<string, unknown> | null;
  order: Record<string, unknown>;
  claimResult: Record<string, unknown> | null;
}) {
  claimPendingMock.mockResolvedValue(claimResult);

  // Track how many times refund_requests has been called so we can serve
  // the right mock per call: first call = pre-authz select, subsequent = terminal update.
  let refundRequestsCallCount = 0;

  fromMock.mockImplementation((table: string) => {
    if (table === "refund_requests") {
      refundRequestsCallCount += 1;
      if (refundRequestsCallCount === 1) {
        // Pre-authz read
        return makeSelectChain(refundRow);
      }
      // Terminal update (reject/approve)
      return makeUpdateChain();
    }
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: order, error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    if (table === "stripe_transfers") {
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        }),
      };
    }
    if (table === "artist_profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { name: "Alice" }, error: null }),
          }),
        }),
      };
    }
    return {};
  });
}

beforeEach(() => {
  isAdminMock.mockReset();
  authMock.mockReset();
  fromMock.mockReset();
  claimPendingMock.mockReset();
  releaseClaimMock.mockReset();
  stripeMock.refunds.create.mockReset();
  stripeMock.transfers.createReversal.mockReset();
  stripeMock.refunds.create.mockResolvedValue({ id: "re_test" });
  stripeMock.transfers.createReversal.mockResolvedValue({});
  releaseClaimMock.mockResolvedValue(undefined);
  authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@x.com" }, error: null });
});

const baseRefundRow = {
  id: "rr-1",
  status: "pending",
  order_id: "ord-1",
  amount: 50,
  type: "full",
  requester_type: "buyer",
  requester_email: "buyer@x.com",
  requester_user_id: null,
};

// Same data as returned by the claim (status flipped to 'processing').
const baseClaimedReq = {
  ...baseRefundRow,
  status: "processing",
};

const baseOrder = {
  id: "ord-1",
  artist_user_id: "u-artist",
  buyer_email: "buyer@x.com",
  buyer_user_id: null,
  total: 50,
  status: "confirmed",
  status_history: [],
  items: [],
  stripe_payment_intent_id: null, // Avoid Stripe calls in authz tests
  shipping: {},
};

// ---------------------------------------------------------------------------
// 1.8 — Idempotency / race condition tests
// ---------------------------------------------------------------------------

describe("POST /api/refunds/process — idempotency (1.8)", () => {
  it("returns 409 and calls no Stripe methods when the claim returns null (concurrent loser)", async () => {
    isAdminMock.mockResolvedValue(false);
    // Claim returns null → another request already claimed this refund.
    setupDb({ refundRow: baseRefundRow, order: baseOrder, claimResult: null });

    const res = await POST(req({ refundRequestId: "rr-1", action: "approve" }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already been processed/i);
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(stripeMock.transfers.createReversal).not.toHaveBeenCalled();
  });

  it("calls stripe.refunds.create exactly once when the claim succeeds (approve path)", async () => {
    isAdminMock.mockResolvedValue(false);
    setupDb({
      refundRow: baseRefundRow,
      order: {
        ...baseOrder,
        stripe_payment_intent_id: "pi_test",
      },
      claimResult: baseClaimedReq,
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "approve" }));

    // Should succeed (200) and have called Stripe refund exactly once.
    expect(res.status).toBe(200);
    expect(stripeMock.refunds.create).toHaveBeenCalledTimes(1);
  });

  it("passes a per-refund idempotency key to stripe.refunds.create", async () => {
    isAdminMock.mockResolvedValue(false);
    setupDb({
      refundRow: baseRefundRow,
      order: { ...baseOrder, stripe_payment_intent_id: "pi_test" },
      claimResult: baseClaimedReq,
    });

    await POST(req({ refundRequestId: "rr-1", action: "approve" }));

    const call = stripeMock.refunds.create.mock.calls[0] as unknown as [unknown, { idempotencyKey: string }];
    const [, requestOptions] = call;
    expect(requestOptions?.idempotencyKey).toBe("refund:rr-1:refund");
  });

  it("returns 500 (NOT 409) and never calls Stripe when claimPending throws a DB error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    isAdminMock.mockResolvedValue(false);
    // Authorised path that reaches the claim, but the claim itself throws a real
    // DB error rather than returning null. This must surface as a 500, not be
    // misreported as a 409 "already processed".
    setupDb({ refundRow: baseRefundRow, order: baseOrder, claimResult: null });
    claimPendingMock.mockRejectedValue(new Error("connection terminated unexpectedly"));

    const res = await POST(req({ refundRequestId: "rr-1", action: "approve" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to process refund/i);
    expect(res.status).not.toBe(409);
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(stripeMock.transfers.createReversal).not.toHaveBeenCalled();
    // No claim was taken (claimPending threw before returning), so no release.
    expect(releaseClaimMock).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  it("returns 500 and releases the claim when an unexpected error throws AFTER a successful claim", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    isAdminMock.mockResolvedValue(false);
    claimPendingMock.mockResolvedValue(baseClaimedReq);

    const order = { ...baseOrder, stripe_payment_intent_id: "pi_test" };

    // Custom from() wiring: the claim succeeds and Stripe refunds, but the
    // post-refund orders status update rejects. That throw lands in the route's
    // catch, which must 500 and best-effort release the claim.
    let refundRequestsCallCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "refund_requests") {
        refundRequestsCallCount += 1;
        if (refundRequestsCallCount === 1) {
          return {
            select: () => ({
              eq: () => ({ single: async () => ({ data: baseRefundRow, error: null }) }),
            }),
          };
        }
        return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      }
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: order, error: null }) }),
          }),
          // The order-status update rejects, simulating an unexpected failure
          // after the claim + Stripe refund have already happened.
          update: () => ({ eq: () => Promise.reject(new Error("orders update failed")) }),
        };
      }
      if (table === "stripe_transfers") {
        return { select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) };
      }
      return {};
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "approve" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to process refund/i);
    // Stripe refund did run (the throw is after it), proving we got past the claim.
    expect(stripeMock.refunds.create).toHaveBeenCalledTimes(1);
    // The catch must release the claim it took so the row isn't stranded.
    expect(releaseClaimMock).toHaveBeenCalledWith(
      expect.anything(),
      "refund_requests",
      "rr-1",
    );

    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 1.5 / 4.1 — Authorisation tests
//
// For all authz-failure cases (403/404) the claim must NEVER be called —
// the refund_requests row must not be mutated for an unauthorised caller.
// ---------------------------------------------------------------------------

describe("POST /api/refunds/process — authorisation (1.5, 4.1)", () => {
  it("403 when caller is not artist and not admin — claimPending is never called", async () => {
    isAdminMock.mockResolvedValue(false);
    authMock.mockResolvedValue({ user: { id: "u-stranger", email: "x@x.com" }, error: null });
    setupDb({
      refundRow: { ...baseRefundRow, requester_type: "buyer" },
      order: { ...baseOrder, artist_user_id: "u-artist" }, // caller != artist
      claimResult: baseClaimedReq,
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "reject" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not authorised/i);
    // The row must not have been flipped to 'processing'.
    expect(claimPendingMock).not.toHaveBeenCalled();
  });

  it("403 when caller is artist of order but requester_type is 'artist' (self-approval block, 4.1) — claimPending is never called", async () => {
    isAdminMock.mockResolvedValue(false);
    authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@x.com" }, error: null });
    setupDb({
      refundRow: { ...baseRefundRow, requester_type: "artist" },
      order: { ...baseOrder, artist_user_id: "u-artist" },
      claimResult: baseClaimedReq,
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "reject" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/artist-initiated refunds require admin approval/i);
    // The row must not have been flipped to 'processing'.
    expect(claimPendingMock).not.toHaveBeenCalled();
  });

  it("admin CAN action artist-initiated refund (confirm admin bypass of 4.1 block)", async () => {
    isAdminMock.mockResolvedValue(true);
    authMock.mockResolvedValue({ user: { id: "u-admin", email: "admin@x.com" }, error: null });
    setupDb({
      refundRow: { ...baseRefundRow, requester_type: "artist" },
      order: { ...baseOrder, artist_user_id: "u-artist" },
      claimResult: baseClaimedReq,
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "reject" }));
    // reject path should succeed; must not be 403.
    expect(res.status).not.toBe(403);
    // Claim must have been called (authorised path proceeds to claim).
    expect(claimPendingMock).toHaveBeenCalledOnce();
  });

  it("artist CAN action buyer-initiated refund (requester_type='buyer')", async () => {
    isAdminMock.mockResolvedValue(false);
    authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@x.com" }, error: null });
    setupDb({
      refundRow: { ...baseRefundRow, requester_type: "buyer" },
      order: { ...baseOrder, artist_user_id: "u-artist" },
      claimResult: baseClaimedReq,
    });

    const res = await POST(req({ refundRequestId: "rr-1", action: "reject" }));
    expect(res.status).not.toBe(403);
    // Claim must have been called (authorised path proceeds to claim).
    expect(claimPendingMock).toHaveBeenCalledOnce();
  });

  it("404 when the refund request row does not exist in the database", async () => {
    isAdminMock.mockResolvedValue(false);
    authMock.mockResolvedValue({ user: { id: "u-artist", email: "a@x.com" }, error: null });
    // Pass null for refundRow so makeSelectChain returns { data: null, error: { message: 'not found' } }
    setupDb({ refundRow: null, order: baseOrder, claimResult: null });

    const res = await POST(req({ refundRequestId: "does-not-exist", action: "approve" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/refund request not found/i);
    // Must bail before reaching the claim or Stripe.
    expect(claimPendingMock).not.toHaveBeenCalled();
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });
});
