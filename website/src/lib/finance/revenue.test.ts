// Task 9. revenue.ts had no test file at all (not even planPricesPence,
// left untested by the pricing initiative that added it) until this one.
// Scope here is programmeMrrPence, the sibling that makes programme revenue
// visible alongside artist subscription MRR on the admin financials page.

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { programmeMrrPence } from "./revenue";

interface FakeCurationRow {
  tier: string;
  status: string;
  quoted_amount_gbp: number | null;
  billing_interval: "month" | "quarter" | null;
}

/**
 * A curation_requests fake that mirrors the shape the other finance/curation
 * test fakes use (programme-rent.test.ts, order-money.test.ts): a chainable
 * `.eq()` narrows the in-memory rows, and the query resolves at `.in()`,
 * which is the last call programmeMrrPence's own query makes.
 */
function makeDb(rows: FakeCurationRow[]): SupabaseClient {
  const db = {
    from(table: string) {
      if (table !== "curation_requests") {
        throw new Error(`unexpected table in test fake: ${table}`);
      }
      let filtered = rows.slice();
      const builder = {
        select(_cols: string) {
          return builder;
        },
        eq(col: keyof FakeCurationRow, val: unknown) {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        in(col: keyof FakeCurationRow, vals: unknown[]) {
          filtered = filtered.filter((r) => vals.includes(r[col]));
          return Promise.resolve({ data: filtered, error: null });
        },
      };
      return builder;
    },
  };
  return db as unknown as SupabaseClient;
}

function programme(over: Partial<FakeCurationRow> = {}): FakeCurationRow {
  return {
    tier: "programme",
    status: "in_progress",
    quoted_amount_gbp: 150,
    billing_interval: "month",
    ...over,
  };
}

describe("programmeMrrPence", () => {
  it("sums monthly and quarterly programmes to a monthly-equivalent total", async () => {
    const db = makeDb([
      programme({ quoted_amount_gbp: 150, billing_interval: "month" }),
      programme({ quoted_amount_gbp: 250, billing_interval: "month" }),
      // A quarterly quote is the amount charged PER INVOICE (every three
      // months), not pre-divided — see checkout/route.ts's unitAmount and
      // admin/curation/quote/route.ts's monthlyEquivalentGbp(). £600/quarter
      // is £200/month.
      programme({ quoted_amount_gbp: 600, billing_interval: "quarter" }),
    ]);
    // 15000 + 25000 + 20000 = 60000p. (The task brief's worked example
    // quotes the same three addends but states the sum as 55000p, which is
    // an arithmetic slip: 15000 + 25000 + 20000 is 60000, not 55000. This
    // test asserts the value that actually follows from the stated inputs.)
    await expect(programmeMrrPence(db)).resolves.toBe(60000);
  });

  it("returns 0 when there are no programmes", async () => {
    await expect(programmeMrrPence(makeDb([]))).resolves.toBe(0);
  });

  it("excludes cancelled and awaiting_quote rows", async () => {
    const db = makeDb([
      programme({ status: "cancelled" }),
      programme({ status: "awaiting_quote", quoted_amount_gbp: null, billing_interval: null }),
    ]);
    await expect(programmeMrrPence(db)).resolves.toBe(0);
  });

  it("excludes pending_payment, quoted but never actually paid", async () => {
    const db = makeDb([programme({ status: "pending_payment" })]);
    await expect(programmeMrrPence(db)).resolves.toBe(0);
  });

  it("excludes past_due: Stripe is still retrying, nothing has landed for this cycle yet", async () => {
    // Mirrors the admin financials route's own artist-MRR query, which
    // counts only subscription_status IN ('active', 'trialing') and likewise
    // treats past_due as not-yet-collected rather than collected.
    const db = makeDb([programme({ status: "past_due" })]);
    await expect(programmeMrrPence(db)).resolves.toBe(0);
  });

  it("excludes paused: Stripe has stopped retrying, so there is no live revenue here", async () => {
    const db = makeDb([programme({ status: "paused" })]);
    await expect(programmeMrrPence(db)).resolves.toBe(0);
  });

  it("counts paid as well as in_progress", async () => {
    const db = makeDb([programme({ status: "paid", quoted_amount_gbp: 100, billing_interval: "month" })]);
    await expect(programmeMrrPence(db)).resolves.toBe(10000);
  });

  it("rounds a quarterly amount that does not divide evenly into three months", async () => {
    // £79.99/quarter is 7999p per invoice, which is 2666.33p per month.
    // Math.round takes it to 2666p rather than truncating or carrying a
    // fraction of a penny into the total.
    const db = makeDb([programme({ quoted_amount_gbp: 79.99, billing_interval: "quarter" })]);
    await expect(programmeMrrPence(db)).resolves.toBe(2666);
  });

  it("ignores a non-programme tier even with a live-paying status", async () => {
    const db = makeDb([
      { tier: "bespoke", status: "in_progress", quoted_amount_gbp: 299, billing_interval: "month" },
    ]);
    await expect(programmeMrrPence(db)).resolves.toBe(0);
  });
});
