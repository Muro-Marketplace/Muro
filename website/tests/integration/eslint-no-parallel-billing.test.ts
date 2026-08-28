// K2 (07 §2.7). The guard that stops a second subscription creator reappearing.
//
// Two implementations could each start a monthly charge for the same placement,
// and their dedup guards read different tables, so neither could see the other.
// With PAID_LOAN_V2 flipped on, an accepted placement whose venue then clicked
// "Set up payment" would have produced two live Stripe subscriptions billing the
// same venue twice for the same artwork.

import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/no-parallel-billing.js") as import("eslint").Rule.RuleModule;

const config = [
  {
    files: ["**/*.ts"],
    languageOptions: { ecmaVersion: "latest" as const, sourceType: "module" as const },
    plugins: { wallplace: { rules: { "no-parallel-billing": rule } } },
    rules: { "wallplace/no-parallel-billing": "error" as const },
  },
];

function lint(code: string, filename = "src/lib/placements/some-new-module.ts") {
  return new Linter().verify(code, config, filename);
}

const ids = (messages: Linter.LintMessage[]) => messages.map((m) => m.messageId);

describe("wallplace/no-parallel-billing", () => {
  it("flags stripe.subscriptions.create outside the allowlist", () => {
    // The exact shape startPaidLoanBilling used.
    const messages = lint(`
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price_data: { currency: "gbp", recurring: { interval: "month" } } }],
      });
    `);
    expect(ids(messages)).toEqual(["parallelBilling"]);
    expect(messages[0].message).toContain("one place per product");
  });

  it("flags a subscription-mode Checkout session outside the allowlist", () => {
    const messages = lint(`
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [],
      });
    `);
    expect(ids(messages)).toEqual(["parallelBilling"]);
  });

  it("flags it with the key quoted, not just as an identifier", () => {
    const messages = lint(`
      await stripe.checkout.sessions.create({ "mode": "subscription" });
    `);
    expect(ids(messages)).toEqual(["parallelBilling"]);
  });

  it("leaves a one-off payment Checkout session alone", () => {
    // Cart, offer and one-off curation checkouts are not billing entry points,
    // and there are several of them. Flagging those would make the rule noise.
    const messages = lint(`
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [],
      });
    `);
    expect(messages).toEqual([]);
  });

  it("leaves a Checkout session with no mode alone", () => {
    const messages = lint(`await stripe.checkout.sessions.create({ line_items: [] });`);
    expect(messages).toEqual([]);
  });

  it("leaves reads and updates alone", () => {
    const messages = lint(`
      await stripe.subscriptions.retrieve(id);
      await stripe.subscriptions.update(id, { cancel_at_period_end: true });
      await stripe.checkout.sessions.retrieve(id);
    `);
    expect(messages).toEqual([]);
  });

  it("allows the paid-loan setup route, which is the one that survived", () => {
    const messages = lint(
      `await stripe.checkout.sessions.create({ mode: "subscription" });`,
      "src/app/api/placements/[id]/payment/setup/route.ts",
    );
    expect(messages).toEqual([]);
  });

  it("allows the artist plan and curation retainer entry points", () => {
    for (const file of ["src/app/api/subscribe/route.ts", "src/app/api/curation/route.ts"]) {
      const messages = lint(
        `await stripe.checkout.sessions.create({ mode: "subscription" });`,
        file,
      );
      expect(messages, file).toEqual([]);
    }
  });

  it("does not lint test harness mocks", () => {
    const messages = lint(
      `await stripe.subscriptions.create({});`,
      "src/lib/placements/paid-loan-billing.test.ts",
    );
    expect(messages).toEqual([]);
  });
});
