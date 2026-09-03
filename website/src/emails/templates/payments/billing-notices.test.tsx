// The billing, refund, chargeback and payout notices added by the 2026-09
// transactional-email audit, rendered with their mocks. `npm run email:render`
// proves each renders at all; this pins the copy that has to be TRUE at the
// moment each one is sent, and the rules public copy is held to.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { createElement } from "react";
import type { TemplateEntry } from "@/emails/registry-types";

import SubscriptionTrialEnding, { mock as trialMock } from "./SubscriptionTrialEnding";
import SubscriptionEnded from "./SubscriptionEnded";
import SubscriptionCancelled from "./SubscriptionCancelled";
import VenuePaidLoanPaymentSetUp, { mock as setUpMock } from "./VenuePaidLoanPaymentSetUp";
import VenuePaidLoanBillingStopped from "./VenuePaidLoanBillingStopped";
import ArtistPaidLoanBillingStopped from "./ArtistPaidLoanBillingStopped";
import VenuePayoutSent from "./VenuePayoutSent";
import ArtistPayoutRetriesExhausted from "./ArtistPayoutRetriesExhausted";
import ArtistOrderUnshippedPayoutHeld from "../orders/ArtistOrderUnshippedPayoutHeld";
import ArtistChargebackOpened, { describeDisputeReason } from "../orders/ArtistChargebackOpened";
import ArtistChargebackClosed, { ArtistChargebackClosed as ClosedComponent, mock as closedMock } from "../orders/ArtistChargebackClosed";
import CustomerRefundFailed, { describeRefundFailure } from "../orders/CustomerRefundFailed";
import { PLAN_FEATURES } from "@/lib/plan-features";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NEW_TEMPLATES: TemplateEntry<any>[] = [
  SubscriptionTrialEnding,
  SubscriptionEnded,
  VenuePaidLoanPaymentSetUp,
  VenuePaidLoanBillingStopped,
  ArtistPaidLoanBillingStopped,
  VenuePayoutSent,
  ArtistPayoutRetriesExhausted,
  ArtistOrderUnshippedPayoutHeld,
  ArtistChargebackOpened,
  ArtistChargebackClosed,
  CustomerRefundFailed,
];

// Props are declared with `interface`, which has no implicit index
// signature, so the generic stays unconstrained.
async function renderEntry<P extends object>(entry: TemplateEntry<P>, props?: P) {
  const element = createElement(entry.component, props ?? entry.mock);
  return { html: await render(element), text: await render(element, { plainText: true }) };
}

describe("the new billing notices", () => {
  it("are all critical, never suppressible, and carry no marketing unsubscribe", async () => {
    for (const entry of NEW_TEMPLATES) {
      expect(entry.category, entry.id).toBe("orders_and_payouts");
      expect(entry.stream, entry.id).toBe("tx");
      expect(entry.canUnsubscribe, entry.id).toBe(false);
      const { html } = await renderEntry(entry);
      expect(html, entry.id).not.toContain("/account/email/unsubscribe");
    }
  });

  it("use no dashes as punctuation and no emojis, in HTML or plaintext", async () => {
    for (const entry of NEW_TEMPLATES) {
      const { html, text } = await renderEntry(entry);
      for (const body of [html, text]) {
        expect(body, entry.id).not.toMatch(/[–—]|&mdash;|&ndash;/);
        expect(body, entry.id).not.toMatch(/\p{Extended_Pictographic}/u);
      }
      expect(entry.subject, entry.id).not.toMatch(/[–—]/);
      expect(entry.previewText, entry.id).not.toMatch(/[–—]/);
    }
  });
});

describe("SubscriptionTrialEnding", () => {
  it("is a billing notice: says what is charged and when, and lists the plan's real features", async () => {
    const { text } = await renderEntry(SubscriptionTrialEnding);
    expect(text).toContain("ends on 28 April 2026");
    expect(text).toContain("charged £24.99 a month unless you cancel before that date");
    for (const feature of PLAN_FEATURES.premium) expect(text).toContain(feature);
    expect(text).not.toContain("Priority matching with venues");
    expect(text).not.toContain("Advanced QR analytics");
  });

  it("still reads correctly when the send site does not know the amount", async () => {
    const { text } = await renderEntry(SubscriptionTrialEnding, {
      ...trialMock,
      amount: undefined,
      billingInterval: undefined,
    });
    expect(text).toContain("charged to the card on your account unless you cancel");
  });
});

describe("the two subscription-end moments", () => {
  it("cancelled says access continues until the period end", async () => {
    const { text } = await renderEntry(SubscriptionCancelled);
    expect(text).toMatch(/scheduled to end on 24 May 2026/);
    expect(text).toMatch(/keep full access until then/);
  });

  it("ended says access has gone and nothing more is charged", async () => {
    const { text } = await renderEntry(SubscriptionEnded);
    expect(text).toContain("ended on 24 May 2026");
    expect(text).toContain("No further payments will be taken");
    expect(text).not.toMatch(/keep full access/);
  });
});

describe("VenuePaidLoanPaymentSetUp", () => {
  it("confirms the amount, the cadence, both charge dates and how to stop", async () => {
    const { text } = await renderEntry(VenuePaidLoanPaymentSetUp);
    expect(text).toContain("£45.00 a month");
    expect(text).toContain("First payment: 24 May 2026");
    expect(text).toContain("Next one after that: 24 June 2026");
    expect(text).toContain("end the placement from its page");
    expect(text).toContain("no refund for that month");
  });

  it("on a trial, says nothing is charged before the trial ends", async () => {
    const { text } = await renderEntry(VenuePaidLoanPaymentSetUp, {
      ...setUpMock,
      trialEndsAt: "1 June 2026",
      firstChargeDate: "1 June 2026",
    });
    expect(text).toContain("Nothing is charged before 1 June 2026");
    expect(text).toContain("The first payment is on 1 June 2026");
  });
});

describe("ArtistChargebackClosed", () => {
  it("won: the hold is lifted", async () => {
    const { text } = await renderEntry(ArtistChargebackClosed, { ...closedMock, outcome: "won" as const });
    // Headings are upper-cased in the plaintext render.
    expect(text).toMatch(/decided in your favour/i);
    expect(text).toContain("The hold on your payout has been lifted");
    expect(text).not.toContain("reversed");
  });

  it("lost: the sale is reversed, and says so when a payout was clawed back", async () => {
    const withReversal = await render(
      createElement(ClosedComponent, { ...closedMock, outcome: "lost" as const, payoutReversed: true }),
      { plainText: true },
    );
    // The template writes a typographic apostrophe (&rsquo;), so the rendered
    // copy carries ’ rather than the ASCII '.
    expect(withReversal).toMatch(/went the buyer[’']s way/i);
    expect(withReversal).toContain("still on hold has been cancelled");
    expect(withReversal).toContain("has been reversed from your Stripe account");

    const withoutReversal = await render(
      createElement(ClosedComponent, { ...closedMock, outcome: "lost" as const, payoutReversed: false }),
      { plainText: true },
    );
    expect(withoutReversal).not.toContain("reversed from your Stripe account");
  });
});

describe("plain-English reason helpers", () => {
  it("translate the Stripe codes and fall back honestly", () => {
    expect(describeDisputeReason("product_not_received")).toBe("They say the order did not arrive.");
    expect(describeDisputeReason("fraudulent")).toBe("They say they did not recognise the charge.");
    expect(describeDisputeReason("something_new")).toBe("Their bank has not given a specific reason.");
    expect(describeDisputeReason(null)).toBe("Their bank has not given a specific reason.");
    expect(describeRefundFailure("expired_or_canceled_card")).toBe("The card has expired or been cancelled.");
    expect(describeRefundFailure(undefined)).toBe("The bank did not give a reason.");
  });

  it("CustomerRefundFailed says the money is not lost and never asks for card details", async () => {
    const { text } = await renderEntry(CustomerRefundFailed);
    expect(text).toMatch(/did not go through/i);
    expect(text).toContain("Your money is not lost");
    expect(text).toContain("The card has expired or been cancelled.");
    expect(text).toContain("do not send card details by email");
  });
});
