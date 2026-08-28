import { describe, expect, it, vi, beforeEach } from "vitest";

const { transfersCreate, fromMock, sendAdminAlertMock } = vi.hoisted(() => ({
  transfersCreate: vi.fn(),
  fromMock: vi.fn(),
  // Typed via the parameter so `mock.calls[0][0]` is the alert object, not the
  // `never` an argless async fn infers.
  sendAdminAlertMock: vi.fn(
    async (_input: { idempotencyKey: string; fields?: { label: string; value: string }[] }) => ({
      ok: true as const,
      skipped: false as const,
      messageId: "m",
    }),
  ),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { transfers: { create: transfersCreate } },
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

// alertExhaustedPayout lazily imports the alert helper so the transfer module
// does not pull the email stack into every caller (C4). K1: that used to be the
// legacy @/lib/email; it is the one pipeline now.
vi.mock("@/lib/email/admin-alert", () => ({
  sendAdminAlert: sendAdminAlertMock,
}));

import { executeTransfer, scheduleTransfer, recordBlockedLeg, processPendingTransfers, reconcileOrdersWithoutLegs } from "./stripe-connect";

beforeEach(() => {
  transfersCreate.mockReset();
  fromMock.mockReset();
});

function pendingTransferRow(id: string) {
  return {
    select: () => ({
      eq: () => ({
        // executeTransfer now matches .in("status", ["pending","failed"]) (C4).
        in: () => ({
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
          in: () => ({
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

// C4: the retry sweep. `failed` is retryable now; on a failed attempt a row is
// re-scheduled with exponential backoff up to MAX_RETRIES, then left `failed`
// with an operator alert (the old sweep wrote a terminal `failed` and never
// looked again, so a transient blip permanently killed a payout).
describe("processPendingTransfers() retry sweep (C4)", () => {
  let capturedUpdates: Array<Record<string, unknown>> = [];

  function setupSweep(opts: {
    due: Array<Record<string, unknown>>;
    order?: { status: string } | null;
    transfer: "success" | Error;
  }) {
    capturedUpdates = [];
    sendAdminAlertMock.mockClear();
    transfersCreate.mockReset();
    transfersCreate.mockImplementation(async () => {
      if (opts.transfer instanceof Error) throw opts.transfer;
      return { id: "tr_ok" };
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.order ?? null }) }) }) };
      }
      // stripe_transfers: one chainable stub serving the sweep select
      // (.in().lt().lte().or().order().limit()), the executeTransfer read
      // (.eq().in().single()) and the update.
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        in: () => chain,
        lt: () => chain,
        lte: () => chain,
        eq: () => chain,
        or: () => chain,
        order: () => chain,
        limit: async () => ({ data: opts.due, error: null }),
        single: async () => ({ data: opts.due[0] ?? null }),
        update: (payload: Record<string, unknown>) => {
          capturedUpdates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      });
      return chain;
    });
  }

  const failedLeg = (retry_count: number) => ({
    id: "st_1", order_id: "o1", recipient_type: "artist", recipient_user_id: "u1",
    amount_cents: 5000, currency: "gbp", stripe_connect_account_id: "acct_1",
    status: "failed", retry_count, payout_after: "2020-01-01T00:00:00Z", next_attempt_at: null,
  });

  it("re-schedules a failed transfer with backoff instead of leaving it dead", async () => {
    setupSweep({ due: [failedLeg(2)], order: { status: "confirmed" }, transfer: new Error("stripe rate limit") });
    const res = await processPendingTransfers();
    expect(res.retried).toBe(1);
    expect(res.exhausted).toBe(0);
    const update = capturedUpdates.find((u) => u.status === "failed");
    expect(update).toMatchObject({ status: "failed", retry_count: 3 });
    expect(update?.next_attempt_at).toBeTruthy();
    expect(String(update?.last_error)).toContain("stripe rate limit");
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });

  it("exhausts at MAX_RETRIES and alerts an operator", async () => {
    setupSweep({ due: [failedLeg(5)], order: { status: "confirmed" }, transfer: new Error("still failing") });
    const res = await processPendingTransfers();
    expect(res.exhausted).toBe(1);
    expect(res.retried).toBe(0);
    expect(capturedUpdates.find((u) => u.status === "failed")).toMatchObject({ retry_count: 6 });
    // K1: the alert is one generic admin template now, so the identifiers live
    // in `fields` rather than in named props. Assert they are all still there,
    // because an alert that omits the transfer or the order is not actionable.
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    const alert = sendAdminAlertMock.mock.calls[0][0];
    expect(alert.idempotencyKey).toContain("st_1");
    const values = (alert.fields ?? []).map((f) => f.value).join(" | ");
    expect(values).toContain("o1");
    expect(values).toContain("st_1");
    expect(values).toContain("u1");
  });

  it("cancels a due transfer whose order was cancelled, without calling Stripe", async () => {
    setupSweep({ due: [{ ...failedLeg(0), status: "pending" }], order: { status: "cancelled" }, transfer: "success" });
    const res = await processPendingTransfers();
    expect(res.processed).toBe(0);
    expect(capturedUpdates.find((u) => u.status === "cancelled")).toBeTruthy();
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("skips a failed row whose backoff has not elapsed", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    setupSweep({ due: [{ ...failedLeg(2), next_attempt_at: future }], order: { status: "confirmed" }, transfer: "success" });
    const res = await processPendingTransfers();
    expect(res.processed).toBe(0);
    expect(res.retried).toBe(0);
    expect(transfersCreate).not.toHaveBeenCalled();
  });
});

// D52.3: reconcile orders that are owed money but have NO ledger row at all — the
// "money owed, 0 transfers" blind spot a retry-existing-rows sweep cannot see.
describe("reconcileOrdersWithoutLegs() (D52.3)", () => {
  let inserts: Array<Record<string, unknown>>;
  // D55.2: capture the column the predicate keys on, so a test can prove the sweep
  // keys on "money in" (total) not the attribution field (artist_revenue).
  let gtColumn: string | null;

  function setupReconcile(opts: {
    owed: Array<Record<string, unknown>>;
    existing: Array<{ order_id: string }>;
  }) {
    inserts = [];
    gtColumn = null;
    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            gt: (col: string) => {
              gtColumn = col;
              return { in: () => ({ limit: async () => ({ data: opts.owed, error: null }) }) };
            },
          }),
        };
      }
      // stripe_transfers: select("order_id").in() for the existing-legs lookup;
      // insert() for recordBlockedLeg.
      return {
        select: () => ({ in: async () => ({ data: opts.existing, error: null }) }),
        insert: (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    });
  }

  it("flags an owed order with no ledger row as a blocked leg", async () => {
    setupReconcile({
      owed: [{ id: "o1", artist_user_id: "u1", artist_revenue: 28.99, status: "confirmed" }],
      existing: [],
    });
    const res = await reconcileOrdersWithoutLegs();
    expect(res.flagged).toBe(1);
    expect(res.unresolved).toEqual([]);
    expect(inserts[0]).toMatchObject({
      order_id: "o1",
      recipient_user_id: "u1",
      amount_cents: 2899,
      status: "blocked",
      last_error: "payout_capability:reconciliation:missing_ledger",
    });
  });

  it("skips an order that already has a ledger row", async () => {
    setupReconcile({
      owed: [{ id: "o1", artist_user_id: "u1", artist_revenue: 28.99, status: "delivered" }],
      existing: [{ order_id: "o1" }],
    });
    const res = await reconcileOrdersWithoutLegs();
    expect(res.flagged).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("records the id of an owed order with no resolvable artist as unresolved, not flagged (D55.3)", async () => {
    setupReconcile({
      owed: [{ id: "o2", artist_user_id: null, artist_revenue: 10, status: "processing" }],
      existing: [],
    });
    const res = await reconcileOrdersWithoutLegs();
    // D55.3: the id must survive, not just a count, or the operator cannot chase it.
    expect(res.unresolved).toEqual(["o2"]);
    expect(res.flagged).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("keys the sweep on total (money in), not artist_revenue (D55.2)", async () => {
    setupReconcile({ owed: [], existing: [] });

    await reconcileOrdersWithoutLegs();

    // The crux: artist_revenue = 0 is the D4 attribution-failure signature, so
    // keying on it makes the sweep blind to exactly the orders it must find.
    expect(gtColumn).toBe("total");
    expect(gtColumn).not.toBe("artist_revenue");
  });

  it("surfaces the WP-WSP06D shape (total>0, artist_revenue 0, artist_user_id NULL) as unresolved-with-id (D55.2)", async () => {
    // The order the old .gt("artist_revenue", 0) predicate filtered out entirely.
    setupReconcile({
      owed: [{ id: "WP-WSP06D", total: 64.49, artist_user_id: null, artist_revenue: 0, status: "confirmed" }],
      existing: [],
    });

    const res = await reconcileOrdersWithoutLegs();

    expect(res.unresolved).toEqual(["WP-WSP06D"]);
    expect(res.flagged).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("routes an owed order whose split was never computed (artist_revenue 0, artist present) to unresolved, not a £0 blocked leg (D55.2)", async () => {
    setupReconcile({
      owed: [{ id: "o3", total: 40, artist_user_id: "u3", artist_revenue: 0, status: "confirmed" }],
      existing: [],
    });

    const res = await reconcileOrdersWithoutLegs();

    // A £0 blocked leg would violate the amount_cents > 0 CHECK; the owed amount is
    // indeterminate, so this is a human's call, surfaced by id.
    expect(res.unresolved).toEqual(["o3"]);
    expect(res.flagged).toBe(0);
    expect(inserts).toHaveLength(0);
  });
});
