// K2 (07 §2.6). One path can start a paid-loan monthly charge, not two.
//
// There were two, and they differed in more than style:
//
//   A  api/placements/[id]/payment/setup — venue clicks "Set up payment",
//      Stripe Checkout in subscription mode. Never flag-gated, live in prod.
//   B  startPaidLoanBilling()            — fired on placement acceptance,
//      gated by PAID_LOAN_V2, created the subscription server-side.
//
// A's dedup guard read `placements.stripe_subscription_id`; B's read
// `placement_recurring_billings`. With PAID_LOAN_V2 flipped on, an accepted
// placement whose venue then clicked "Set up payment" would have produced two
// live Stripe subscriptions billing the same venue twice for one artwork.
//
// These assert the shape rather than the behaviour, on purpose: the failure mode
// is "somebody adds a second creator", which no behavioural test of the first
// one can catch.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

/**
 * Source with comments stripped. These invariants are about code, not about
 * whether a file explains its own history: the comments here deliberately name
 * `startPaidLoanBilling` and `ensureVenueCustomer` to say why they are gone, and
 * an assertion that tripped on that would be pushing people to delete the
 * explanation.
 */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await sourceFiles(full)));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path.relative(process.cwd(), full));
    }
  }
  return out.sort();
}

describe("paid loan has exactly one billing entry point (K2)", () => {
  it("has no module that creates a Stripe subscription directly", async () => {
    // `stripe.subscriptions.create` was B's creator. Nothing should call it:
    // every surviving entry point goes through Checkout, which creates the
    // subscription on Stripe's side once the customer pays.
    const files = await sourceFiles(SRC);
    const offenders = files.filter((f) =>
      /\bsubscriptions\s*\.\s*create\s*\(/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("has exactly one file creating a subscription-mode Checkout session for paid loans", async () => {
    const files = await sourceFiles(SRC);
    const creators = files.filter((f) => {
      const source = readFileSync(f, "utf8");
      return (
        /checkout\s*\.\s*sessions\s*\.\s*create\s*\(/.test(source) &&
        /paid_loan_monthly/.test(source)
      );
    });
    expect(creators).toEqual([
      path.join("src", "app", "api", "placements", "[id]", "payment", "setup", "route.ts"),
    ]);
  });

  it("finds source files at all, so an empty sweep cannot pass vacuously", async () => {
    const files = await sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(200);
  });

  it("no longer exports the second creator or its Setup Intent machinery", async () => {
    const billing = code("src/lib/placements/paid-loan-billing.ts");

    expect(billing).not.toMatch(/export async function startPaidLoanBilling/);
    // Checkout collects the card itself, so B's ensureVenueCustomer +
    // hasAttachedCard + SetupIntent dance was redundant, not merely duplicated.
    expect(billing).not.toMatch(/setupIntents/);
    expect(billing).not.toMatch(/ensureVenueCustomer/);
    expect(billing).not.toMatch(/hasAttachedCard/);
  });

  it("no longer starts billing when a placement is accepted", async () => {
    // Acceptance used to fire B automatically. The surviving trigger is the
    // venue clicking through PaidLoanPaymentChip.
    const placements = code("src/app/api/placements/route.ts");
    expect(placements).not.toMatch(/startPaidLoanBilling/);
    // Cancellation stays: a placement leaving 'active' must stop the charge.
    expect(placements).toMatch(/cancelPaidLoanBilling/);
  });

  it("uses the canonical paid-loan predicate, with no private shadow", async () => {
    // 07 §2.3 calls this "a third duplicate hiding inside B": a private
    // `isPaidLoan` over {paid_loan, mixed} that, unlike the canonical one,
    // never classified a legacy `free_loan` row with a positive monthly fee as
    // a paid loan. So the billing module would never bill a row the rest of the
    // app displays as a paid loan.
    const billing = code("src/lib/placements/paid-loan-billing.ts");
    expect(billing).not.toMatch(/function isPaidLoan\s*\(/);
    expect(billing).not.toMatch(/PAID_LOAN_TYPES/);
  });

  it("keeps the webhook reconcilers, which are what the ledger depends on", async () => {
    // Deleting B must not take its dunning and cancellation handling with it:
    // A had neither, and a subscription that exists in Stripe has to be
    // reconciled whatever any flag says (E11).
    const billing = readFileSync("src/lib/placements/paid-loan-billing.ts", "utf8");
    for (const survivor of [
      "recordPaidLoanSubscription",
      "cancelPaidLoanBilling",
      "handleInvoicePaid",
      "handleInvoicePaymentFailed",
      "handleSubscriptionDeleted",
    ]) {
      expect(billing, survivor).toMatch(new RegExp(`export async function ${survivor}`));
    }
  });
});
