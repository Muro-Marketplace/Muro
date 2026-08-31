// Task 6: rent accrual on paid programme invoices.
//
// accrueProgrammeRent is called from handleCurationInvoicePaid (billing.ts)
// on every paid invoice for a Wallplace Programme. For each ACTIVE placement
// linked to the programme (placements.programme_request_id) with a real rent
// (programme_rent_gbp > 0), it inserts one row recording what the artist has
// earned this invoice. amount_pence is the monthly rent scaled by
// period_months, so a quarterly invoice accrues three months in one row.
//
// The pool guard runs BEFORE any insert: if the linked placements' combined
// monthly rent would exceed PROGRAMME_RENT_SHARE_MAX of the quote's monthly
// equivalent, nothing is written and the admin is alerted instead. It
// compares against the REAL linked placements, not curation_requests
// .pieces_estimate (see the task report for why: pieces_estimate is intake
// guidance the admin quoted against, not a locked total, and a request that
// links more placements than it was quoted for is exactly the case this
// guard exists to catch — the function signature not taking piecesEstimate
// at all is the tell).
//
// Idempotency is the UNIQUE (stripe_invoice_id, placement_id) constraint, not
// an app-level pre-check: a Stripe webhook redelivery re-attempts the same
// insert per placement, and the fake DB below reproduces the constraint (a
// 23505 on a repeated key) exactly as Postgres would, so "replay accrues
// nothing more" is proven against the real failure mode, not asserted by a
// mock that simply remembers it was called before.

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { sendAdminAlertMock } = vi.hoisted(() => ({
  sendAdminAlertMock: vi.fn(
    async (_input: {
      idempotencyKey: string;
      subject: string;
      summary: string;
      fields?: { label: string; value: string }[];
    }) => ({ ok: true as const, skipped: false as const, messageId: "m" }),
  ),
}));

vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

import { accrueProgrammeRent } from "./programme-rent";

interface FakePlacement {
  id: string;
  artist_user_id: string | null;
  programme_rent_gbp: number | null;
  status: string;
  programme_request_id: string | null;
}

/**
 * A placements + programme_rent_accruals fake that reproduces the real
 * failure mode the function relies on: a second insert with the same
 * (stripe_invoice_id, placement_id) is rejected with Postgres's 23505
 * (unique_violation), exactly like the real UNIQUE constraint would, rather
 * than the test merely trusting the function to have checked first.
 */
function makeDb(placements: FakePlacement[], options: { selectError?: { message: string } } = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const seenKeys = new Set<string>();

  const db = {
    from(table: string) {
      if (table === "placements") {
        return {
          select: () => {
            let rows = placements.slice();
            const builder = {
              eq(col: keyof FakePlacement, val: unknown) {
                rows = rows.filter((r) => r[col] === val);
                return builder;
              },
              gt(col: keyof FakePlacement, val: number) {
                rows = rows.filter((r) => {
                  const v = r[col];
                  return typeof v === "number" && v > val;
                });
                return builder;
              },
              not(col: keyof FakePlacement, op: string, val: unknown) {
                if (op === "is" && val === null) {
                  rows = rows.filter((r) => r[col] !== null);
                }
                return builder;
              },
              then(
                onFulfilled: (v: { data: FakePlacement[] | null; error: { message: string } | null }) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) {
                const result = options.selectError
                  ? { data: null, error: options.selectError }
                  : { data: rows, error: null };
                return Promise.resolve(result).then(onFulfilled, onRejected);
              },
            };
            return builder;
          },
        };
      }
      if (table === "programme_rent_accruals") {
        return {
          insert: (payload: Record<string, unknown>) => {
            const key = `${payload.stripe_invoice_id}::${payload.placement_id}`;
            if (seenKeys.has(key)) {
              return Promise.resolve({
                error: {
                  code: "23505",
                  message:
                    'duplicate key value violates unique constraint "programme_rent_accruals_stripe_invoice_id_placement_id_key"',
                },
              });
            }
            seenKeys.add(key);
            inserted.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { db, inserted };
}

function placement(overrides: Partial<FakePlacement> & { id: string }): FakePlacement {
  return {
    artist_user_id: `artist_${overrides.id}`,
    programme_rent_gbp: 10,
    status: "active",
    programme_request_id: "cr_prog_1",
    ...overrides,
  };
}

const lastAlert = () => sendAdminAlertMock.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("accrueProgrammeRent", () => {
  it("accrues one row per active linked placement at its own monthly rent", async () => {
    const { db, inserted } = makeDb([
      placement({ id: "pl_10", programme_rent_gbp: 10 }),
      placement({ id: "pl_8", programme_rent_gbp: 8 }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_1",
      periodMonths: 1,
      quotedAmountPence: 15000, // £150/month programme
    });

    expect(result).toEqual({ accrued: 2, skipped: 0 });
    expect(inserted).toHaveLength(2);
    const byPlacement = Object.fromEntries(inserted.map((r) => [r.placement_id, r]));
    expect(byPlacement.pl_10).toMatchObject({
      curation_request_id: "cr_prog_1",
      placement_id: "pl_10",
      artist_user_id: "artist_pl_10",
      stripe_invoice_id: "in_1",
      period_months: 1,
      amount_pence: 1000,
    });
    expect(byPlacement.pl_8).toMatchObject({
      placement_id: "pl_8",
      artist_user_id: "artist_pl_8",
      amount_pence: 800,
    });
  });

  it("replaying the same invoice accrues nothing more (unique constraint)", async () => {
    const { db, inserted } = makeDb([
      placement({ id: "pl_10", programme_rent_gbp: 10 }),
      placement({ id: "pl_8", programme_rent_gbp: 8 }),
    ]);
    const input = {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_1",
      periodMonths: 1,
      quotedAmountPence: 15000,
    };

    const first = await accrueProgrammeRent(db, input);
    const second = await accrueProgrammeRent(db, input);

    expect(first).toEqual({ accrued: 2, skipped: 0 });
    expect(second).toEqual({ accrued: 0, skipped: 2 });
    // Still only the two rows from the first call: the replay wrote nothing.
    expect(inserted).toHaveLength(2);
  });

  it("a quarterly invoice accrues three months per placement in one row", async () => {
    const { db, inserted } = makeDb([
      placement({ id: "pl_10", programme_rent_gbp: 10 }),
      placement({ id: "pl_8", programme_rent_gbp: 8 }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_q1",
      periodMonths: 3,
      // £150/month equivalent, billed quarterly: £450 per invoice.
      quotedAmountPence: 45000,
    });

    expect(result).toEqual({ accrued: 2, skipped: 0 });
    expect(inserted).toHaveLength(2);
    const byPlacement = Object.fromEntries(inserted.map((r) => [r.placement_id, r]));
    expect(byPlacement.pl_10).toMatchObject({ period_months: 3, amount_pence: 3000 });
    expect(byPlacement.pl_8).toMatchObject({ period_months: 3, amount_pence: 2400 });
  });

  it("blocks and alerts, without writing anything, when the rent pool exceeds 70% of the quote", async () => {
    const { db, inserted } = makeDb([
      placement({ id: "pl_40", programme_rent_gbp: 40 }),
      placement({ id: "pl_35", programme_rent_gbp: 35 }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_2",
      periodMonths: 1,
      // £100/month quote; 70% ceiling is £70/month. Pool here is £75/month.
      quotedAmountPence: 10000,
    });

    expect(result.accrued).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.blockedReason).toBeTruthy();
    expect(inserted).toHaveLength(0);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    const alert = lastAlert();
    expect(alert?.idempotencyKey).toContain("in_2");
    expect((alert?.summary ?? "") + (alert?.subject ?? "")).toMatch(/pool|70/i);
  });

  it("zero linked placements returns {accrued: 0} cleanly, without alerting", async () => {
    const { db, inserted } = makeDb([]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_3",
      periodMonths: 1,
      quotedAmountPence: 15000,
    });

    expect(result).toEqual({ accrued: 0, skipped: 0 });
    expect(inserted).toHaveLength(0);
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });

  // The case the brief specifically flagged: the pool guard must compare
  // against the MONTHLY-equivalent quote, not the raw per-invoice amount. A
  // quarterly invoice's quotedAmountPence is the full quarter's charge (Stripe
  // price_data.unit_amount charged every 3 months, curation/[id]/checkout
  // /route.ts), so a guard that forgot to divide by periodMonths would use a
  // ceiling three times too generous and let an unsustainable pool through.
  it("quarterly pool guard divides the quote by periodMonths before comparing, not the raw quarterly total", async () => {
    const { db, inserted } = makeDb([
      // £120/month combined rent.
      placement({ id: "pl_70", programme_rent_gbp: 70 }),
      placement({ id: "pl_50", programme_rent_gbp: 50 }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_q2",
      periodMonths: 3,
      // £150/month equivalent (£450/quarter). Correct ceiling: 70% of £150 =
      // £105/month, so £120/month must be BLOCKED. A guard that wrongly used
      // the raw £450 as if it were monthly would compute a £315 ceiling and
      // wrongly let this through.
      quotedAmountPence: 45000,
    });

    expect(result.accrued).toBe(0);
    expect(result.blockedReason).toBeTruthy();
    expect(inserted).toHaveLength(0);
  });

  it("a valid quarterly pool within 70% of the monthly-equivalent quote is not blocked", async () => {
    const { db, inserted } = makeDb([
      // £90/month combined rent, under the £105/month (70% of £150) ceiling.
      placement({ id: "pl_50", programme_rent_gbp: 50 }),
      placement({ id: "pl_40", programme_rent_gbp: 40 }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_q3",
      periodMonths: 3,
      quotedAmountPence: 45000,
    });

    expect(result).toEqual({ accrued: 2, skipped: 0 });
    expect(inserted).toHaveLength(2);
  });

  it("excludes a placement that is not active", async () => {
    const { db, inserted } = makeDb([
      placement({ id: "pl_active", programme_rent_gbp: 10, status: "active" }),
      placement({ id: "pl_pending", programme_rent_gbp: 10, status: "pending" }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_4",
      periodMonths: 1,
      quotedAmountPence: 15000,
    });

    expect(result).toEqual({ accrued: 1, skipped: 0 });
    expect(inserted.map((r) => r.placement_id)).toEqual(["pl_active"]);
  });

  it("excludes a placement linked to a different programme", async () => {
    const { db, inserted } = makeDb([
      placement({ id: "pl_mine", programme_request_id: "cr_prog_1" }),
      placement({ id: "pl_other", programme_request_id: "cr_prog_OTHER" }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_5",
      periodMonths: 1,
      quotedAmountPence: 15000,
    });

    expect(result).toEqual({ accrued: 1, skipped: 0 });
    expect(inserted.map((r) => r.placement_id)).toEqual(["pl_mine"]);
  });

  it("excludes a linked active placement with no rent set", async () => {
    const { db, inserted } = makeDb([
      placement({ id: "pl_paid", programme_rent_gbp: 10 }),
      placement({ id: "pl_unset", programme_rent_gbp: null }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_6",
      periodMonths: 1,
      quotedAmountPence: 15000,
    });

    expect(result).toEqual({ accrued: 1, skipped: 0 });
    expect(inserted.map((r) => r.placement_id)).toEqual(["pl_paid"]);
  });

  it("excludes a linked active placement whose artist has been erased (artist_user_id NULL)", async () => {
    const { db, inserted } = makeDb([
      placement({ id: "pl_live", programme_rent_gbp: 10, artist_user_id: "artist_1" }),
      placement({ id: "pl_erased", programme_rent_gbp: 10, artist_user_id: null }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_7",
      periodMonths: 1,
      quotedAmountPence: 15000,
    });

    expect(result).toEqual({ accrued: 1, skipped: 0 });
    expect(inserted.map((r) => r.placement_id)).toEqual(["pl_live"]);
  });

  it("throws when loading placements fails, for the caller's own try/catch to handle", async () => {
    const { db } = makeDb([], { selectError: { message: "connection reset" } });

    await expect(
      accrueProgrammeRent(db, {
        curationRequestId: "cr_prog_1",
        invoiceId: "in_8",
        periodMonths: 1,
        quotedAmountPence: 15000,
      }),
    ).rejects.toThrow(/connection reset/);
  });
});
