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
// Type-only: erased at compile time, so referencing these inside
// vi.hoisted()'s factory (which runs before the module's real imports, at
// runtime) is safe — nothing here survives past the type checker.
import type { PayoutCapability, PayoutTarget } from "@/lib/payouts/capability";
import type { ScheduleTransferParams } from "@/lib/stripe-connect";

const {
  sendAdminAlertMock,
  sendEmailMock,
  canReceivePayoutMock,
  scheduleTransferMock,
  recordBlockedLegMock,
} = vi.hoisted(() => ({
  // Email audit, 2026-09-04: rent was recorded and settled with nothing said
  // to the artist it belonged to. accrueProgrammeRent now sends a statement
  // per artist per paid invoice and settleProgrammeRent a note per payout, so
  // the artist-facing sends need their own mock: without one the real
  // sendEmail runs against these fakes, throws, and is swallowed by the
  // helpers' own try/catch, leaving both sends untested.
  sendEmailMock: vi.fn(
    async (_input: {
      idempotencyKey: string;
      template: string;
      to: string;
      subject: string;
      userId?: string;
      react: unknown;
      metadata?: Record<string, unknown>;
    }) => ({ ok: true as const, skipped: false as const, messageId: "m" }),
  ),
  sendAdminAlertMock: vi.fn(
    async (_input: {
      idempotencyKey: string;
      subject: string;
      summary: string;
      fields?: { label: string; value: string }[];
    }) => ({ ok: true as const, skipped: false as const, messageId: "m" }),
  ),
  // Typed against the real PayoutTarget/PayoutCapability (ok: boolean, not a
  // discriminated union), so a per-test .mockImplementation() override that
  // returns the ok:false shape typechecks against the SAME signature this
  // default was declared with, rather than TS locking in the narrower
  // ok:true-only shape this default happens to return.
  canReceivePayoutMock: vi.fn(
    async (_db: unknown, target: PayoutTarget): Promise<PayoutCapability> => ({
      ok: true,
      accountId: `acct_${target.userId}`,
      reason: null,
    }),
  ),
  scheduleTransferMock: vi.fn(async (_params: ScheduleTransferParams) => "tr_default"),
  recordBlockedLegMock: vi.fn(async (_db: unknown, _args: unknown) => undefined),
}));

vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/payouts/capability", () => ({ canReceivePayout: canReceivePayoutMock }));
vi.mock("@/lib/stripe-connect", () => ({
  scheduleTransfer: scheduleTransferMock,
  recordBlockedLeg: recordBlockedLegMock,
}));

import {
  accrueProgrammeRent,
  settleProgrammeRent,
  quarterKeyFor,
  voidProgrammeAccrualsForInvoice,
} from "./programme-rent";

interface FakePlacement {
  id: string;
  artist_user_id: string | null;
  programme_rent_gbp: number | null;
  status: string;
  programme_request_id: string | null;
  work_title: string | null;
}

/** How an artist's account and profile answer the lookup behind their emails. */
interface FakeArtistAccount {
  email?: string | null;
  name?: string | null;
}

/**
 * The two reads every artist-facing send makes: the auth user (for the
 * address) and artist_profiles (for the name). Shared by both fake databases
 * below, so the accrual statement and the settlement note resolve their
 * recipient the same way the real ones do.
 */
function artistLookup(accounts: Record<string, FakeArtistAccount> = {}) {
  const accountFor = (id: string): FakeArtistAccount =>
    accounts[id] ?? { email: `${id}@example.com`, name: "Maya Chen" };
  return {
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const account = accountFor(id);
          return {
            data: { user: account.email ? { id, email: account.email, user_metadata: {} } : null },
            error: null,
          };
        },
      },
    },
    profileTable: {
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => ({ data: { name: accountFor(val).name ?? null }, error: null }),
        }),
      }),
    },
  };
}

/**
 * A placements + programme_rent_accruals fake that reproduces the real
 * failure mode the function relies on: a second insert with the same
 * (stripe_invoice_id, placement_id) is rejected with Postgres's 23505
 * (unique_violation), exactly like the real UNIQUE constraint would, rather
 * than the test merely trusting the function to have checked first.
 *
 * Finding 1: `insertErrorForPlacementIds` forces a NON-23505 error for
 * specific placement ids, so a test can pin the property that matters most —
 * that one placement's real DB failure does not stop the loop reaching the
 * placements after it.
 */
function makeDb(
  placements: FakePlacement[],
  options: {
    selectError?: { message: string };
    insertErrorForPlacementIds?: Record<string, { code?: string; message: string }>;
    artists?: Record<string, FakeArtistAccount>;
  } = {},
) {
  const inserted: Array<Record<string, unknown>> = [];
  const seenKeys = new Set<string>();
  const lookup = artistLookup(options.artists);

  const db = {
    auth: lookup.auth,
    from(table: string) {
      if (table === "artist_profiles") return lookup.profileTable;
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
            const forced = options.insertErrorForPlacementIds?.[payload.placement_id as string];
            if (forced) {
              return Promise.resolve({ error: forced });
            }
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
    work_title: `Work ${overrides.id}`,
    ...overrides,
  };
}

/** Every artist-facing email sent by the call under test. */
function sentEmails() {
  return sendEmailMock.mock.calls.map((c) => c[0]);
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

    expect(result).toEqual({ accrued: 2, skipped: 0, failed: 0 });
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

    expect(first).toEqual({ accrued: 2, skipped: 0, failed: 0 });
    expect(second).toEqual({ accrued: 0, skipped: 2, failed: 0 });
    // Still only the two rows from the first call: the replay wrote nothing.
    expect(inserted).toHaveLength(2);
    // Finding 1: a 23505 replay is an expected idempotent skip, not a
    // failure, so it must never trigger the accrual-failed admin alert.
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
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

    expect(result).toEqual({ accrued: 2, skipped: 0, failed: 0 });
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

    expect(result).toEqual({ accrued: 0, skipped: 0, failed: 0 });
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

    expect(result).toEqual({ accrued: 2, skipped: 0, failed: 0 });
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

    expect(result).toEqual({ accrued: 1, skipped: 0, failed: 0 });
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

    expect(result).toEqual({ accrued: 1, skipped: 0, failed: 0 });
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

    expect(result).toEqual({ accrued: 1, skipped: 0, failed: 0 });
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

    expect(result).toEqual({ accrued: 1, skipped: 0, failed: 0 });
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

// Finding 1 (review fix): a non-23505 insert failure used to throw and unwind
// the whole function, abandoning every placement the loop hadn't reached yet.
// Because accrueProgrammeRent is keyed on the exact invoiceId, nothing about
// that failure was ever retried by a Stripe webhook redelivery -- the
// abandoned placements' rent for the period was lost, not delayed. These pin
// the fix: the loop now catches a real DB error per placement, keeps going,
// and reports what happened instead of throwing.
describe("accrueProgrammeRent — Finding 1: a mid-loop error must not cost its siblings their accrual", () => {
  it("a mid-loop non-conflict DB error still accrues the other placements, counts it as failed, and alerts the admin", async () => {
    const { db, inserted } = makeDb(
      [
        placement({ id: "pl_a", programme_rent_gbp: 10 }),
        placement({ id: "pl_b", programme_rent_gbp: 8 }),
        placement({ id: "pl_c", programme_rent_gbp: 12 }),
      ],
      {
        // pl_b sits in the MIDDLE of the loop. A real DB error on it (not a
        // 23505) is exactly the case that used to throw and abandon pl_c,
        // the placement after it that the loop hadn't reached yet.
        insertErrorForPlacementIds: {
          pl_b: { message: "connection reset by peer" },
        },
      },
    );

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_mid_fail",
      periodMonths: 1,
      quotedAmountPence: 15000,
    });

    expect(result.accrued).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failedPlacementIds).toEqual(["pl_b"]);
    // The whole point of the fix: pl_a accrued before the failure, and pl_c
    // -- reached only AFTER pl_b's failure -- still accrued too.
    expect(inserted.map((r) => r.placement_id).sort()).toEqual(["pl_a", "pl_c"]);

    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    const alert = lastAlert();
    expect(alert?.idempotencyKey).toContain("in_mid_fail");
    expect((alert?.summary ?? "") + (alert?.subject ?? "")).toMatch(/failed|backfill/i);
    const fieldValues = (alert?.fields ?? []).map((f) => `${f.label}: ${f.value}`).join(" | ");
    expect(fieldValues).toContain("in_mid_fail");
    expect(fieldValues).toContain("cr_prog_1");
    expect(fieldValues).toContain("pl_b");
    // The two placements that DID accrue must not be named as failed.
    expect(fieldValues).not.toContain("pl_a");
    expect(fieldValues).not.toContain("pl_c");
  });

  it("every placement failing still returns cleanly (not throwing) with the full set reported", async () => {
    const { db, inserted } = makeDb(
      [
        placement({ id: "pl_x", programme_rent_gbp: 10 }),
        placement({ id: "pl_y", programme_rent_gbp: 8 }),
      ],
      {
        insertErrorForPlacementIds: {
          pl_x: { message: "db unavailable" },
          pl_y: { message: "db unavailable" },
        },
      },
    );

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_all_fail",
      periodMonths: 1,
      quotedAmountPence: 15000,
    });

    expect(result).toEqual({
      accrued: 0,
      skipped: 0,
      failed: 2,
      failedPlacementIds: ["pl_x", "pl_y"],
    });
    expect(inserted).toHaveLength(0);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
  });

  it("a 23505 conflict is never counted as failed and never alerts, even alongside a real failure in the same call", async () => {
    // pl_dup replays (23505); pl_broken hits a genuine DB error. The two
    // failure modes must stay distinct in the result and in the alert.
    const { db, inserted } = makeDb(
      [
        placement({ id: "pl_dup", programme_rent_gbp: 10 }),
        placement({ id: "pl_broken", programme_rent_gbp: 8 }),
      ],
      {
        insertErrorForPlacementIds: {
          pl_broken: { message: "connection reset" },
        },
      },
    );
    const input = {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_mixed",
      periodMonths: 1,
      quotedAmountPence: 15000,
    };

    // First call: pl_dup accrues, pl_broken fails.
    const first = await accrueProgrammeRent(db, input);
    expect(first).toEqual({ accrued: 1, skipped: 0, failed: 1, failedPlacementIds: ["pl_broken"] });

    // Second call (webhook redelivery): pl_dup now 23505-skips: it already
    // accrued. pl_broken still fails the same way, since the underlying
    // outage hasn't cleared -- but that must count as `failed` again, not
    // `skipped`, and must not be conflated with pl_dup's clean replay.
    const second = await accrueProgrammeRent(db, input);
    expect(second).toEqual({ accrued: 0, skipped: 1, failed: 1, failedPlacementIds: ["pl_broken"] });

    expect(inserted.map((r) => r.placement_id)).toEqual(["pl_dup"]);
    // One alert per call that actually had a failure, both naming pl_broken,
    // never pl_dup.
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(2);
    for (const call of sendAdminAlertMock.mock.calls) {
      const fieldValues = (call[0].fields ?? []).map((f) => f.value).join(" | ");
      expect(fieldValues).toContain("pl_broken");
      expect(fieldValues).not.toContain("pl_dup");
    }
  });

  it("a 23505 conflict still just skips, without alerting, when it is the ONLY outcome", async () => {
    const { db, inserted } = makeDb([
      placement({ id: "pl_only", programme_rent_gbp: 10 }),
    ]);
    const input = {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_replay_only",
      periodMonths: 1,
      quotedAmountPence: 15000,
    };

    await accrueProgrammeRent(db, input);
    const result = await accrueProgrammeRent(db, input);

    expect(result).toEqual({ accrued: 0, skipped: 1, failed: 0 });
    expect(inserted).toHaveLength(1);
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });
});

// Task 8: refund/dispute clawback.
//
// voidProgrammeAccrualsForInvoice is called from the charge.refunded and
// charge.dispute.created webhook handlers once they have resolved a Stripe
// invoice id for a charge/dispute that has no matching `orders` row — i.e.
// is a Wallplace Programme invoice, not a one-off marketplace order. Before
// this, a programme refund reversed nothing: the venue got their money back
// and the artists kept, or went on to receive, rent for the refunded period.
//
// Two-tier response: an unsettled accrual (money not yet paid out) is
// stamped voided_at/voided_reason so settleProgrammeRent's own
// `voided_at IS NULL` filter (see that describe block below) never pays it.
// An already-settled accrual (money already sent to the artist via Stripe
// Connect) is left completely untouched — no automatic clawback — but
// counted, so the admin alert can say exactly how much is unrecoverable
// without a human conversation.
// Email audit, 2026-09-04. Rent accrued to an artist and nothing told them:
// the money was recorded as owed and paid out a quarter later with no
// statement in between, so an artist had no way to know what they had earned
// or when it was coming.
describe("accrueProgrammeRent — the artist's rent statement", () => {
  it("sends one statement per artist, listing every piece and the total", async () => {
    const { db } = makeDb([
      placement({ id: "p1", artist_user_id: "artist_a", work_title: "Last Light" }),
      placement({ id: "p2", artist_user_id: "artist_a", work_title: "Low Tide" }),
    ]);

    await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_1",
      periodMonths: 1,
      quotedAmountPence: 25000,
      venueName: "Riverside Offices",
    });

    // Fail-before: two accrual rows were written and no email went anywhere.
    const emails = sentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].template).toBe("artist_programme_rent_statement");
    expect(emails[0].to).toBe("artist_a@example.com");
    expect(emails[0].userId).toBe("artist_a");
    // £10/month each, so £20 across the two pieces.
    expect(emails[0].subject).toBe("£20.00 of programme rent recorded for you");
  });

  it("keys the statement on the invoice and the artist, so one run is one email each", async () => {
    const { db } = makeDb([
      placement({ id: "p1", artist_user_id: "artist_a" }),
      placement({ id: "p2", artist_user_id: "artist_b" }),
    ]);

    await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_1",
      periodMonths: 1,
      quotedAmountPence: 25000,
    });

    expect(sentEmails().map((e) => e.idempotencyKey)).toEqual([
      "programme_rent_statement:in_1:artist_a",
      "programme_rent_statement:in_1:artist_b",
    ]);
  });

  it("sends nothing on a replay, because nothing was newly accrued", async () => {
    // A Stripe redelivery 23505s every insert. The artist has already had this
    // invoice's statement and must not get a second copy of it.
    const { db } = makeDb([placement({ id: "p1", artist_user_id: "artist_a" })]);
    const input = {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_1",
      periodMonths: 1,
      quotedAmountPence: 25000,
    };

    await accrueProgrammeRent(db, input);
    sendEmailMock.mockClear();
    const replay = await accrueProgrammeRent(db, input);

    expect(replay).toMatchObject({ accrued: 0, skipped: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends nothing to an artist whose own insert failed, while the others still hear", async () => {
    const { db } = makeDb(
      [
        placement({ id: "p1", artist_user_id: "artist_a" }),
        placement({ id: "p2", artist_user_id: "artist_b" }),
      ],
      { insertErrorForPlacementIds: { p1: { code: "08006", message: "connection failure" } } },
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_1",
      periodMonths: 1,
      quotedAmountPence: 25000,
    });

    // Telling an artist their rent is recorded when the row never landed would
    // be worse than telling them nothing.
    expect(sentEmails().map((e) => e.to)).toEqual(["artist_b@example.com"]);
  });

  it("sends nothing when the pool guard refuses the whole invoice", async () => {
    const { db } = makeDb([
      placement({ id: "p1", artist_user_id: "artist_a", programme_rent_gbp: 200 }),
    ]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_1",
      periodMonths: 1,
      quotedAmountPence: 25000,
    });

    expect(result.blockedReason).toBeTruthy();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips the statement for an artist with no reachable address, keeping the accrual", async () => {
    const { db, inserted } = makeDb([placement({ id: "p1", artist_user_id: "artist_a" })], {
      artists: { artist_a: { email: null } },
    });

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_1",
      periodMonths: 1,
      quotedAmountPence: 25000,
    });

    expect(result.accrued).toBe(1);
    expect(inserted).toHaveLength(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("a failed statement never costs anyone their accrual", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("resend down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, inserted } = makeDb([placement({ id: "p1", artist_user_id: "artist_a" })]);

    const result = await accrueProgrammeRent(db, {
      curationRequestId: "cr_prog_1",
      invoiceId: "in_1",
      periodMonths: 1,
      quotedAmountPence: 25000,
    });

    expect(result).toMatchObject({ accrued: 1, skipped: 0, failed: 0 });
    expect(inserted).toHaveLength(1);
    errSpy.mockRestore();
  });
});

describe("voidProgrammeAccrualsForInvoice", () => {
  interface FakeAccrualForVoid {
    id: string;
    curation_request_id: string;
    stripe_invoice_id: string;
    amount_pence: number;
    settled_at: string | null;
    voided_at: string | null;
    voided_reason: string | null;
  }

  function accrualForVoid(overrides: Partial<FakeAccrualForVoid> & { id: string }): FakeAccrualForVoid {
    return {
      curation_request_id: "cr_prog_1",
      stripe_invoice_id: "in_refunded",
      amount_pence: 1000,
      settled_at: null,
      voided_at: null,
      voided_reason: null,
      ...overrides,
    };
  }

  /**
   * A programme_rent_accruals fake supporting exactly what
   * voidProgrammeAccrualsForInvoice needs: select().eq("stripe_invoice_id", x)
   * and update({...}).in("id", [...]). The update MUTATES the underlying rows
   * array in place, matching makeSettlementDb's own pattern above, so calling
   * this function twice against the SAME `rows` reference reproduces a real
   * Stripe webhook redelivery: the second call's SELECT sees whatever the
   * first call's UPDATE actually wrote.
   */
  function makeVoidDb(
    rows: FakeAccrualForVoid[],
    options: { selectError?: { message: string }; updateError?: { message: string } } = {},
  ) {
    const updateCalls: Array<{ ids: string[]; payload: Record<string, unknown> }> = [];
    const db = {
      from(table: string) {
        if (table !== "programme_rent_accruals") throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: (col: "stripe_invoice_id", val: string) => ({
              then(
                onFulfilled: (v: { data: FakeAccrualForVoid[] | null; error: { message: string } | null }) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) {
                const result = options.selectError
                  ? { data: null, error: options.selectError }
                  : { data: rows.filter((r) => r[col] === val), error: null };
                return Promise.resolve(result).then(onFulfilled, onRejected);
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            in: (col: "id", ids: string[]) => {
              updateCalls.push({ ids, payload });
              if (options.updateError) return Promise.resolve({ error: options.updateError });
              for (const row of rows) {
                if (col === "id" && ids.includes(row.id)) Object.assign(row, payload);
              }
              return Promise.resolve({ error: null });
            },
          }),
        };
      },
    } as unknown as SupabaseClient;
    return { db, rows, updateCalls };
  }

  it("voids every unsettled accrual on the invoice and reports their total", async () => {
    const { db, rows } = makeVoidDb([
      accrualForVoid({ id: "r1", amount_pence: 1000 }),
      accrualForVoid({ id: "r2", amount_pence: 800 }),
    ]);

    const result = await voidProgrammeAccrualsForInvoice(db, {
      invoiceId: "in_refunded",
      reason: "charge.refunded ch_1",
    });

    expect(result).toEqual({ voided: 2, voidedPence: 1800, alreadySettled: 0, alreadySettledPence: 0 });
    for (const row of rows) {
      expect(row.voided_at).toEqual(expect.any(String));
      expect(row.voided_at).not.toBeNull();
    }
    expect(rows.every((r) => r.settled_at === null)).toBe(true);
  });

  it("stamps voided_reason with exactly the caller's reason", async () => {
    const { db, rows } = makeVoidDb([accrualForVoid({ id: "r1" })]);

    await voidProgrammeAccrualsForInvoice(db, { invoiceId: "in_refunded", reason: "charge.refunded ch_abc123" });

    expect(rows[0].voided_reason).toBe("charge.refunded ch_abc123");
  });

  it("leaves an already-settled accrual completely untouched, but counts it and alerts", async () => {
    const { db, rows } = makeVoidDb([
      accrualForVoid({ id: "r1", settled_at: "2026-08-01T09:00:00.000Z", amount_pence: 1200 }),
    ]);

    const result = await voidProgrammeAccrualsForInvoice(db, {
      invoiceId: "in_refunded",
      reason: "charge.refunded ch_2",
    });

    expect(result).toEqual({ voided: 0, voidedPence: 0, alreadySettled: 1, alreadySettledPence: 1200 });
    // Untouched: still settled exactly as before, never voided.
    expect(rows[0].settled_at).toBe("2026-08-01T09:00:00.000Z");
    expect(rows[0].voided_at).toBeNull();

    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    const alert = lastAlert();
    expect(alert?.idempotencyKey).toBe("programme_rent_void:in_refunded");
    const fieldValues = (alert?.fields ?? []).map((f) => `${f.label}: ${f.value}`).join(" | ");
    expect(fieldValues).toContain("in_refunded");
    expect(fieldValues).toContain("cr_prog_1");
    // The critical figure: how much is unrecoverable without a conversation.
    expect((alert?.summary ?? "") + fieldValues).toMatch(/already.*paid|1200|12\.00/i);
  });

  it("a mixed invoice voids the unsettled rows and separately counts the settled ones, in one alert", async () => {
    const { db, rows } = makeVoidDb([
      accrualForVoid({ id: "unsettled_1", amount_pence: 1000 }),
      accrualForVoid({ id: "unsettled_2", amount_pence: 500 }),
      accrualForVoid({ id: "settled_1", settled_at: "2026-08-01T09:00:00.000Z", amount_pence: 2000 }),
    ]);

    const result = await voidProgrammeAccrualsForInvoice(db, {
      invoiceId: "in_refunded",
      reason: "charge.refunded ch_mixed",
    });

    expect(result).toEqual({ voided: 2, voidedPence: 1500, alreadySettled: 1, alreadySettledPence: 2000 });
    expect(rows.find((r) => r.id === "unsettled_1")?.voided_at).not.toBeNull();
    expect(rows.find((r) => r.id === "unsettled_2")?.voided_at).not.toBeNull();
    expect(rows.find((r) => r.id === "settled_1")?.voided_at).toBeNull();
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
  });

  it("a redelivered refund is a no-op: nothing more is voided and the admin is not re-alerted", async () => {
    const { db, rows } = makeVoidDb([
      accrualForVoid({ id: "r1", amount_pence: 1000 }),
      accrualForVoid({ id: "r2", settled_at: "2026-08-01T09:00:00.000Z", amount_pence: 500 }),
    ]);
    const input = { invoiceId: "in_refunded", reason: "charge.refunded ch_redeliver" };

    const first = await voidProgrammeAccrualsForInvoice(db, input);
    expect(first).toEqual({ voided: 1, voidedPence: 1000, alreadySettled: 1, alreadySettledPence: 500 });

    // sendEmail's own idempotency key is what actually stops a second email
    // (see send.ts); at this layer we assert the function calls sendAdminAlert
    // with the SAME key again — a genuine no-op, not a second distinct alert
    // — and that it does not attempt to re-void or re-sum r1.
    const second = await voidProgrammeAccrualsForInvoice(db, input);
    expect(second).toEqual({ voided: 0, voidedPence: 0, alreadySettled: 1, alreadySettledPence: 500 });

    // r1 was voided by the FIRST call and stays voided — the second call must
    // not have touched it again (nothing left to stamp).
    expect(rows.find((r) => r.id === "r1")?.voided_at).toEqual(expect.any(String));
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(2);
    expect(sendAdminAlertMock.mock.calls[0][0].idempotencyKey).toBe("programme_rent_void:in_refunded");
    expect(sendAdminAlertMock.mock.calls[1][0].idempotencyKey).toBe("programme_rent_void:in_refunded");
  });

  it("a refund whose invoice has no programme accruals returns all zeros and alerts nobody", async () => {
    const { db } = makeVoidDb([accrualForVoid({ id: "other", stripe_invoice_id: "in_unrelated" })]);

    const result = await voidProgrammeAccrualsForInvoice(db, {
      invoiceId: "in_no_accruals",
      reason: "charge.refunded ch_3",
    });

    expect(result).toEqual({ voided: 0, voidedPence: 0, alreadySettled: 0, alreadySettledPence: 0 });
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });

  it("never throws when the lookup fails, returning zeros instead", async () => {
    const { db } = makeVoidDb([], { selectError: { message: "connection reset" } });

    await expect(
      voidProgrammeAccrualsForInvoice(db, { invoiceId: "in_x", reason: "charge.refunded ch_4" }),
    ).resolves.toEqual({ voided: 0, voidedPence: 0, alreadySettled: 0, alreadySettledPence: 0 });
  });

  it("never throws when the void UPDATE itself fails, and still alerts", async () => {
    const { db, rows } = makeVoidDb(
      [accrualForVoid({ id: "r1", amount_pence: 1000 })],
      { updateError: { message: "connection reset" } },
    );

    const result = await voidProgrammeAccrualsForInvoice(db, {
      invoiceId: "in_refunded",
      reason: "charge.refunded ch_5",
    });

    // The stamp did not land, so this must not claim the money is protected.
    expect(result).toEqual({ voided: 0, voidedPence: 0, alreadySettled: 0, alreadySettledPence: 0 });
    expect(rows[0].voided_at).toBeNull();
    // A human still needs to know the refund landed on a programme invoice,
    // even though the automatic protection failed.
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
  });

  it("an admin-alert failure does not propagate, and the counts are still returned", async () => {
    const { db } = makeVoidDb([accrualForVoid({ id: "r1", amount_pence: 1000 })]);
    sendAdminAlertMock.mockRejectedValueOnce(new Error("resend down"));

    await expect(
      voidProgrammeAccrualsForInvoice(db, { invoiceId: "in_refunded", reason: "charge.refunded ch_6" }),
    ).resolves.toEqual({ voided: 1, voidedPence: 1000, alreadySettled: 0, alreadySettledPence: 0 });
  });
});

// Task 7: quarterly rent settlement.
//
// settleProgrammeRent sums each artist's unsettled accruals and pays them in
// ONE transfer, keyed on a synthetic order id
// (`programme-settlement:<quarterKey>:<artistUserId>`) that is stable for
// the quarter — the same idempotency shape paid-loan-billing.ts already uses
// for `placement:<id>:<invoiceId>`.
//
// Settlement rule implemented: Vercel cron cannot express "quarterly", so
// this runs monthly, but only settles accruals older than the CURRENT
// quarter's start boundary (relative to `asOf`) — never the still-open
// quarter an accrual was just written in. The alternative the brief offered
// (settle everything unsettled, every run) was rejected: it would transfer
// money to artists on whatever cadence accruals happen to land, defeating
// the entire reason settlement is quarterly in the first place (context:
// Stripe's ~£1.60/connected-account/month-with-any-activity fee, which the
// quarterly batching exists to avoid). A monthly run this way is a no-op
// most months and catches up a closed quarter every third one.
describe("settleProgrammeRent", () => {
  interface FakeAccrualRow {
    id: string;
    artist_user_id: string | null;
    amount_pence: number;
    accrued_at: string;
    settled_at: string | null;
    settled_transfer_order_id: string | null;
    voided_at: string | null;
  }

  /** Safely inside Q3 2026 — before the Q4 cutoff every test below uses by default. */
  const OLD_ACCRUAL_DATE = "2026-08-01T00:00:00.000Z";
  /** The instant most tests settle "as of": the 1st of Q4, 09:00 UTC — the cron's own schedule. */
  const ASOF_Q4_START = new Date("2026-10-01T09:00:00.000Z");

  function accrualRow(overrides: Partial<FakeAccrualRow> & { id: string }): FakeAccrualRow {
    return {
      artist_user_id: `artist_${overrides.id}`,
      amount_pence: 1000,
      accrued_at: OLD_ACCRUAL_DATE,
      settled_at: null,
      settled_transfer_order_id: null,
      voided_at: null,
      ...overrides,
    };
  }

  /**
   * A programme_rent_accruals fake supporting exactly the chain
   * settleProgrammeRent needs: select().is("settled_at", null).lt("accrued_at", x)
   * and update({...}).in("id", [...]). The update MUTATES the underlying rows
   * array in place, so calling settleProgrammeRent twice against the SAME
   * `rows` reference reproduces a real rerun: the second call's SELECT sees
   * whatever the first call's UPDATE actually wrote, not a fresh fixture.
   */
  function makeSettlementDb(rows: FakeAccrualRow[], artists: Record<string, FakeArtistAccount> = {}) {
    const updateCalls: Array<{ ids: string[]; payload: Record<string, unknown> }> = [];
    const lookup = artistLookup(artists);
    const db = {
      auth: lookup.auth,
      from(table: string) {
        if (table === "artist_profiles") return lookup.profileTable;
        if (table !== "programme_rent_accruals") throw new Error(`unexpected table ${table}`);
        return {
          select: () => {
            let filtered = rows.slice();
            const builder = {
              is(col: keyof FakeAccrualRow, val: null) {
                if (val === null) filtered = filtered.filter((r) => r[col] === null);
                return builder;
              },
              lt(col: keyof FakeAccrualRow, val: string) {
                filtered = filtered.filter((r) => String(r[col]) < val);
                return builder;
              },
              then(
                onFulfilled: (v: { data: FakeAccrualRow[] | null; error: { message: string } | null }) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) {
                return Promise.resolve({ data: filtered, error: null }).then(onFulfilled, onRejected);
              },
            };
            return builder;
          },
          update: (payload: Record<string, unknown>) => ({
            in: (col: "id", ids: string[]) => {
              updateCalls.push({ ids, payload });
              for (const row of rows) {
                if (col === "id" && ids.includes(row.id)) Object.assign(row, payload);
              }
              return Promise.resolve({ error: null });
            },
          }),
        };
      },
    } as unknown as SupabaseClient;
    return { db, rows, updateCalls };
  }

  beforeEach(() => {
    // Re-establish defaults every test: vi.clearAllMocks() (the outer
    // beforeEach) clears call history but NOT a previous test's
    // .mockImplementation() override, so without this a blocked/thrown
    // override from one test would leak into the next.
    canReceivePayoutMock.mockImplementation(
      async (_db: unknown, target: PayoutTarget): Promise<PayoutCapability> => ({
        ok: true,
        accountId: `acct_${target.userId}`,
        reason: null,
      }),
    );
    scheduleTransferMock.mockImplementation(async (_params: ScheduleTransferParams) => "tr_default");
    recordBlockedLegMock.mockImplementation(async () => undefined);
  });

  it("quarterKeyFor derives the calendar quarter from asOf, in UTC", () => {
    expect(quarterKeyFor(new Date("2026-01-15T00:00:00.000Z"))).toBe("2026Q1");
    expect(quarterKeyFor(new Date("2026-03-31T23:59:59.000Z"))).toBe("2026Q1");
    expect(quarterKeyFor(new Date("2026-04-01T00:00:00.000Z"))).toBe("2026Q2");
    expect(quarterKeyFor(new Date("2026-07-01T00:00:00.000Z"))).toBe("2026Q3");
    expect(quarterKeyFor(new Date("2026-10-01T09:00:00.000Z"))).toBe("2026Q4");
    expect(quarterKeyFor(new Date("2026-12-31T00:00:00.000Z"))).toBe("2026Q4");
  });

  it("two artists with accruals across two invoices each get exactly one transfer per artist for the correct sum", async () => {
    const { db, rows } = makeSettlementDb([
      accrualRow({ id: "a1", artist_user_id: "artist_a", amount_pence: 3000 }),
      accrualRow({ id: "a2", artist_user_id: "artist_a", amount_pence: 2000 }),
      accrualRow({ id: "b1", artist_user_id: "artist_b", amount_pence: 1000 }),
      accrualRow({ id: "b2", artist_user_id: "artist_b", amount_pence: 1500 }),
    ]);

    const result = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

    expect(result).toEqual({ artistsPaid: 2, blocked: 0, totalPence: 7500 });
    expect(scheduleTransferMock).toHaveBeenCalledTimes(2);
    const callsByRecipient = Object.fromEntries(
      scheduleTransferMock.mock.calls.map((c) => [(c[0] as { recipientUserId: string }).recipientUserId, c[0]]),
    );
    expect(callsByRecipient.artist_a).toMatchObject({
      orderId: "programme-settlement:2026Q4:artist_a",
      recipientType: "artist",
      connectAccountId: "acct_artist_a",
      amountCents: 5000,
      immediate: false,
    });
    expect(callsByRecipient.artist_b).toMatchObject({
      orderId: "programme-settlement:2026Q4:artist_b",
      amountCents: 2500,
    });
    // Every contributing row is stamped, and stamped with the SAME order id
    // as its artist's transfer.
    for (const row of rows) {
      expect(row.settled_at).toBe(ASOF_Q4_START.toISOString());
      expect(row.settled_transfer_order_id).toBe(`programme-settlement:2026Q4:${row.artist_user_id}`);
    }
  });

  it("a rerun with everything already settled schedules nothing", async () => {
    const { db } = makeSettlementDb([
      accrualRow({ id: "a1", artist_user_id: "artist_a", amount_pence: 3000 }),
      accrualRow({ id: "b1", artist_user_id: "artist_b", amount_pence: 1000 }),
    ]);

    const first = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });
    expect(first).toEqual({ artistsPaid: 2, blocked: 0, totalPence: 4000 });

    scheduleTransferMock.mockClear();
    recordBlockedLegMock.mockClear();

    // Same db — the first call's UPDATE already stamped settled_at on both
    // rows, so this rerun's SELECT (settled_at IS NULL) finds nothing.
    const second = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

    expect(second).toEqual({ artistsPaid: 0, blocked: 0, totalPence: 0 });
    expect(scheduleTransferMock).not.toHaveBeenCalled();
    expect(recordBlockedLegMock).not.toHaveBeenCalled();
  });

  it("an artist failing canReceivePayout gets a blocked leg and stays unsettled, while the other artist is still paid", async () => {
    const { db, rows } = makeSettlementDb([
      accrualRow({ id: "a1", artist_user_id: "artist_ok", amount_pence: 4000 }),
      accrualRow({ id: "b1", artist_user_id: "artist_blocked", amount_pence: 1200 }),
      accrualRow({ id: "b2", artist_user_id: "artist_blocked", amount_pence: 800 }),
    ]);
    canReceivePayoutMock.mockImplementation(
      async (_db: unknown, target: PayoutTarget): Promise<PayoutCapability> =>
        target.userId === "artist_blocked"
          ? { ok: false, accountId: null, reason: "no_account" }
          : { ok: true, accountId: `acct_${target.userId}`, reason: null },
    );

    const result = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

    expect(result).toEqual({ artistsPaid: 1, blocked: 1, totalPence: 4000 });
    expect(scheduleTransferMock).toHaveBeenCalledTimes(1);
    expect(scheduleTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: "artist_ok", amountCents: 4000 }),
    );
    expect(recordBlockedLegMock).toHaveBeenCalledTimes(1);
    expect(recordBlockedLegMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        orderId: "programme-settlement:2026Q4:artist_blocked",
        recipientUserId: "artist_blocked",
        recipientType: "artist",
        amountCents: 2000,
        reason: "no_account",
      }),
    );
    // Blocked artist's rows are untouched — left unsettled for a later retry.
    const blockedRows = rows.filter((r) => r.artist_user_id === "artist_blocked");
    expect(blockedRows.every((r) => r.settled_at === null)).toBe(true);
    // The paid artist's row DID settle.
    expect(rows.find((r) => r.id === "a1")?.settled_at).toBe(ASOF_Q4_START.toISOString());
  });

  it("a thrown transfer for one artist does not prevent the other's, and leaves the failed artist unsettled", async () => {
    const { db, rows } = makeSettlementDb([
      accrualRow({ id: "a1", artist_user_id: "artist_ok", amount_pence: 5000 }),
      accrualRow({ id: "b1", artist_user_id: "artist_throws", amount_pence: 2200 }),
    ]);
    scheduleTransferMock.mockImplementation(async (params: ScheduleTransferParams) => {
      if (params.recipientUserId === "artist_throws") {
        throw new Error("stripe unavailable");
      }
      return "tr_ok";
    });

    const result = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

    // Not "blocked" (that means canReceivePayout said no) — a thrown transfer
    // is a different failure mode, and is not counted in either number, but
    // must not stop artist_ok's payment or crash the run.
    expect(result).toEqual({ artistsPaid: 1, blocked: 0, totalPence: 5000 });
    expect(rows.find((r) => r.id === "a1")?.settled_at).toBe(ASOF_Q4_START.toISOString());
    expect(rows.find((r) => r.id === "b1")?.settled_at).toBeNull();
    // A human is told, so the failure doesn't sit invisible until the next run.
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    const alert = sendAdminAlertMock.mock.calls[0][0];
    expect((alert.summary ?? "") + (alert.subject ?? "")).toMatch(/settlement|failed/i);
    expect((alert.fields ?? []).map((f) => f.value).join(" ")).toContain("artist_throws");
  });

  it("computes a synthetic order id that is stable for the quarter, so a rerun within it is idempotent", async () => {
    const { db: db1 } = makeSettlementDb([
      accrualRow({ id: "r1", artist_user_id: "artist_a", amount_pence: 1000 }),
    ]);
    const { db: db2 } = makeSettlementDb([
      accrualRow({ id: "r2", artist_user_id: "artist_a", amount_pence: 1000 }),
    ]);

    await settleProgrammeRent(db1, { asOf: new Date("2026-10-01T09:00:00.000Z") });
    const firstOrderId = (scheduleTransferMock.mock.calls[0][0] as { orderId: string }).orderId;

    scheduleTransferMock.mockClear();

    // A later moment, same quarter (e.g. a retried cron invocation).
    await settleProgrammeRent(db2, { asOf: new Date("2026-11-15T09:00:00.000Z") });
    const secondOrderId = (scheduleTransferMock.mock.calls[0][0] as { orderId: string }).orderId;

    expect(secondOrderId).toBe(firstOrderId);
    expect(firstOrderId).toBe("programme-settlement:2026Q4:artist_a");
  });

  it("does not settle an accrual from the current, still-open quarter", async () => {
    const { db, rows } = makeSettlementDb([
      accrualRow({ id: "closed", artist_user_id: "artist_old", amount_pence: 3000, accrued_at: OLD_ACCRUAL_DATE }),
      // Written the same day as the settlement run, inside Q4 — must wait
      // for the Q1 2027 run before it is eligible.
      accrualRow({
        id: "open",
        artist_user_id: "artist_new",
        amount_pence: 4000,
        accrued_at: "2026-10-01T05:00:00.000Z",
      }),
    ]);

    const result = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

    expect(result).toEqual({ artistsPaid: 1, blocked: 0, totalPence: 3000 });
    expect(scheduleTransferMock).toHaveBeenCalledTimes(1);
    expect(scheduleTransferMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: "artist_old" }),
    );
    expect(rows.find((r) => r.id === "open")?.settled_at).toBeNull();
  });

  it("skips an accrual whose artist has since been erased (artist_user_id NULL), without crashing or paying anyone the wrong amount", async () => {
    const { db, rows } = makeSettlementDb([
      accrualRow({ id: "live", artist_user_id: "artist_live", amount_pence: 1000 }),
      accrualRow({ id: "erased", artist_user_id: null, amount_pence: 5000 }),
    ]);

    const result = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

    expect(result).toEqual({ artistsPaid: 1, blocked: 0, totalPence: 1000 });
    expect(scheduleTransferMock).toHaveBeenCalledTimes(1);
    // The orphaned row is neither paid nor stamped — it stays a fact on the
    // record with nobody left to send it to.
    expect(rows.find((r) => r.id === "erased")?.settled_at).toBeNull();
  });

  // Task 8: a refund/dispute must be able to stop a payout that just hasn't
  // run yet. voidProgrammeAccrualsForInvoice (see the describe block above)
  // stamps voided_at on the accrual; this is the other half of that
  // contract — the row must never be picked up here, however long it then
  // sits unsettled, or voiding would have been cosmetic.
  it("never pays out an accrual that has been voided (refund/dispute clawback), even though it is still unsettled", async () => {
    const { db, rows } = makeSettlementDb([
      accrualRow({ id: "clean", artist_user_id: "artist_a", amount_pence: 1000 }),
      accrualRow({
        id: "voided",
        artist_user_id: "artist_a",
        amount_pence: 5000,
        voided_at: "2026-09-01T10:00:00.000Z",
      }),
    ]);

    const result = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

    // Only the clean row's 1000, never the voided row's 5000.
    expect(result).toEqual({ artistsPaid: 1, blocked: 0, totalPence: 1000 });
    expect(scheduleTransferMock).toHaveBeenCalledTimes(1);
    expect(scheduleTransferMock).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1000 }));
    // The voided row is left exactly as it was — not settled, still voided.
    const voidedRow = rows.find((r) => r.id === "voided");
    expect(voidedRow?.settled_at).toBeNull();
    expect(voidedRow?.voided_at).toBe("2026-09-01T10:00:00.000Z");
  });

  it("never calls Date.now() or a bare new Date() for the settlement timestamp — asOf is what gets stamped", async () => {
    const { db, rows } = makeSettlementDb([
      accrualRow({ id: "a1", artist_user_id: "artist_a", amount_pence: 1000 }),
    ]);
    const farFuture = new Date("2099-01-01T09:00:00.000Z");

    await settleProgrammeRent(db, { asOf: farFuture });

    expect(rows[0].settled_at).toBe(farFuture.toISOString());
  });

  // Email audit, 2026-09-04: the transfer was scheduled and the artist was
  // told nothing, so money appeared in their Stripe account with no notice
  // and no way to tie it to a period.
  describe("the artist's settlement note", () => {
    it("tells each paid artist what was settled and for which period", async () => {
      const { db } = makeSettlementDb([
        accrualRow({ id: "a1", artist_user_id: "artist_a", amount_pence: 4000 }),
        accrualRow({ id: "a2", artist_user_id: "artist_a", amount_pence: 2000 }),
      ]);

      await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

      const emails = sentEmails();
      expect(emails).toHaveLength(1);
      expect(emails[0].template).toBe("artist_programme_rent_settled");
      expect(emails[0].to).toBe("artist_a@example.com");
      expect(emails[0].userId).toBe("artist_a");
      expect(emails[0].subject).toBe("Programme rent on the way: £60.00");
    });

    it("keys the note on the settlement order id, so a rerun in the same quarter cannot double it", async () => {
      const { db, rows } = makeSettlementDb([
        accrualRow({ id: "a1", artist_user_id: "artist_a", amount_pence: 4000 }),
      ]);

      await settleProgrammeRent(db, { asOf: ASOF_Q4_START });
      expect(sentEmails()[0].idempotencyKey).toBe(
        "programme_rent_settled:programme-settlement:2026Q4:artist_a",
      );

      // The rerun finds the row already settled, so nothing is re-sent either.
      sendEmailMock.mockClear();
      await settleProgrammeRent(db, { asOf: ASOF_Q4_START });
      expect(rows[0].settled_at).toBeTruthy();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("says nothing to an artist whose payout was blocked, because nothing has moved", async () => {
      canReceivePayoutMock.mockImplementation(
        async (_db: unknown, target: PayoutTarget): Promise<PayoutCapability> =>
          target.userId === "artist_a"
            ? { ok: false, accountId: null, reason: "no_account" }
            : { ok: true, accountId: `acct_${target.userId}`, reason: null },
      );
      const { db } = makeSettlementDb([
        accrualRow({ id: "a1", artist_user_id: "artist_a", amount_pence: 4000 }),
        accrualRow({ id: "a2", artist_user_id: "artist_b", amount_pence: 1000 }),
      ]);

      await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

      expect(sentEmails().map((e) => e.to)).toEqual(["artist_b@example.com"]);
    });

    it("a failed note is not a failed settlement: the artist stays settled and no admin alert fires", async () => {
      // The note lives outside the per-artist try/catch's failure meaning. A
      // mail outage must not report the payout as failed or leave the accrual
      // unsettled for the next run to pay a second time.
      sendEmailMock.mockRejectedValueOnce(new Error("resend down"));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { db, rows } = makeSettlementDb([
        accrualRow({ id: "a1", artist_user_id: "artist_a", amount_pence: 4000 }),
      ]);

      const result = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

      expect(result).toMatchObject({ artistsPaid: 1, blocked: 0, totalPence: 4000 });
      expect(rows[0].settled_at).toBe(ASOF_Q4_START.toISOString());
      expect(sendAdminAlertMock).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("skips an artist with no reachable address without disturbing the payout", async () => {
      const { db, rows } = makeSettlementDb(
        [accrualRow({ id: "a1", artist_user_id: "artist_a", amount_pence: 4000 })],
        { artist_a: { email: null } },
      );

      const result = await settleProgrammeRent(db, { asOf: ASOF_Q4_START });

      expect(result.artistsPaid).toBe(1);
      expect(rows[0].settled_at).toBe(ASOF_Q4_START.toISOString());
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  });
});
