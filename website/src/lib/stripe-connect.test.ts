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

import { executeTransfer } from "./stripe-connect";

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
