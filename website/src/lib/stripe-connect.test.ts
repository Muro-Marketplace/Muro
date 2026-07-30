import { describe, expect, it, vi, beforeEach } from "vitest";

const { transfersCreate, fromMock } = vi.hoisted(() => ({
  transfersCreate: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { transfers: { create: transfersCreate } },
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { executeTransfer, scheduleTransfer, recordBlockedLeg } from "./stripe-connect";

beforeEach(() => {
  transfersCreate.mockReset();
  fromMock.mockReset();
});

function pendingTransferRow(id: string) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id,
              amount_cents: 5000,
              currency: "gbp",
              stripe_connect_account_id: "acct_test123",
              order_id: "order-abc",
            },
          }),
        }),
      }),
    }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  };
}

describe("executeTransfer()", () => {
  it("calls stripe.transfers.create with a deterministic idempotency key", async () => {
    const transferId = "st_row_001";
    fromMock.mockReturnValue(pendingTransferRow(transferId));
    transfersCreate.mockResolvedValue({ id: "tr_stripe_001" });

    await executeTransfer(transferId);

    expect(transfersCreate).toHaveBeenCalledTimes(1);
    // Second argument must carry the idempotency key derived from the row id
    expect(transfersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        currency: "gbp",
        destination: "acct_test123",
        transfer_group: "order-abc",
      }),
      { idempotencyKey: `transfer:${transferId}` },
    );
  });

  it("returns null and does not call stripe when no pending row is found", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({ data: null }),
          }),
        }),
      }),
    });

    const result = await executeTransfer("st_missing");

    expect(result).toBeNull();
    expect(transfersCreate).not.toHaveBeenCalled();
  });
});

// C3: the ledger insert must not vanish. scheduleTransfer validates its inputs,
// throws on any insert failure the caller must not swallow, and treats a
// (order_id, recipient_user_id) 23505 as an idempotent replay.
function scheduleFromMock(opts: {
  insertResult: { data: { id: string } | null; error: { code?: string; message?: string } | null };
  existingId?: string | null;
}) {
  return () => ({
    insert: () => ({ select: () => ({ maybeSingle: async () => opts.insertResult }) }),
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: opts.existingId ? { id: opts.existingId } : null }) }),
      }),
    }),
  });
}

const baseLeg = {
  orderId: "o1",
  recipientType: "artist" as const,
  recipientUserId: "u1",
  connectAccountId: "acct_1",
  amountCents: 5000,
};

describe("scheduleTransfer()", () => {
  it("returns the inserted ledger row id on success", async () => {
    fromMock.mockImplementation(scheduleFromMock({ insertResult: { data: { id: "st_1" }, error: null } }));
    await expect(scheduleTransfer(baseLeg)).resolves.toBe("st_1");
  });

  it("throws on an empty connectAccountId without touching the DB", async () => {
    await expect(scheduleTransfer({ ...baseLeg, connectAccountId: "" })).rejects.toThrow(/connectAccountId/);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("throws on a non-positive amountCents", async () => {
    await expect(scheduleTransfer({ ...baseLeg, amountCents: 0 })).rejects.toThrow(/amountCents/);
  });

  it("throws when the ledger insert fails and it is not a replay (E37 must not vanish)", async () => {
    fromMock.mockImplementation(scheduleFromMock({ insertResult: { data: null, error: { code: "23502", message: "null value" } } }));
    await expect(scheduleTransfer(baseLeg)).rejects.toThrow(/ledger insert failed/);
  });

  it("returns the existing row id on a 23505 replay (idempotent)", async () => {
    fromMock.mockImplementation(scheduleFromMock({ insertResult: { data: null, error: { code: "23505", message: "dup" } }, existingId: "st_existing" }));
    await expect(scheduleTransfer(baseLeg)).resolves.toBe("st_existing");
  });
});

describe("recordBlockedLeg()", () => {
  it("inserts a 'blocked' ledger row with last_error and null payout_after", async () => {
    let captured: Record<string, unknown> | undefined;
    fromMock.mockImplementation(() => ({
      insert: (payload: Record<string, unknown>) => {
        captured = payload;
        return Promise.resolve({ error: null });
      },
    }));
    const db = { from: fromMock } as unknown as Parameters<typeof recordBlockedLeg>[0];
    await recordBlockedLeg(db, { orderId: "o1", recipientUserId: "u1", amountCents: 4500, reason: "onboarding_incomplete" });
    expect(captured).toMatchObject({
      order_id: "o1",
      recipient_user_id: "u1",
      amount_cents: 4500,
      status: "blocked",
      last_error: "payout_capability:onboarding_incomplete",
      payout_after: null,
    });
  });

  it("swallows a duplicate (23505) blocked leg", async () => {
    fromMock.mockImplementation(() => ({ insert: () => Promise.resolve({ error: { code: "23505" } }) }));
    const db = { from: fromMock } as unknown as Parameters<typeof recordBlockedLeg>[0];
    await expect(recordBlockedLeg(db, { orderId: "o1", recipientUserId: "u1", amountCents: 4500, reason: "x" })).resolves.toBeUndefined();
  });

  it("throws on a non-23505 insert error", async () => {
    fromMock.mockImplementation(() => ({ insert: () => Promise.resolve({ error: { code: "XX", message: "boom" } }) }));
    const db = { from: fromMock } as unknown as Parameters<typeof recordBlockedLeg>[0];
    await expect(recordBlockedLeg(db, { orderId: "o1", recipientUserId: "u1", amountCents: 4500, reason: "x" })).rejects.toThrow(/recordBlockedLeg failed/);
  });
});
