// The venue's three Curated and Programme billing notices, and the artist's
// two programme rent emails.
//
// Email audit, 2026-09-04: the reconcilers in src/lib/curation/billing.ts told
// the admin about every renewal, failure and cancellation and told the paying
// venue nothing, and src/lib/curation/programme-rent.ts recorded and settled
// an artist's rent without ever telling the artist. These pin the copy those
// send sites depend on being right: the money, the tense, and which product
// the reader is being written to about.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { CurationPaymentFailed, mock as failedMock } from "./CurationPaymentFailed";
import { CurationRenewalReceipt, mock as receiptMock } from "./CurationRenewalReceipt";
import { CurationSubscriptionCancelled, mock as cancelledMock } from "./CurationSubscriptionCancelled";
import { ArtistProgrammeRentStatement, mock as statementMock } from "./ArtistProgrammeRentStatement";
import { ArtistProgrammeRentSettled, mock as settledMock } from "./ArtistProgrammeRentSettled";

describe("CurationPaymentFailed", () => {
  it("asks for the card while Stripe is still retrying, and does not say paused", async () => {
    const html = await render(CurationPaymentFailed({ ...failedMock, finalAttempt: false }));
    expect(html).toContain("did not go through");
    expect(html).toContain("Update payment method");
    expect(html).not.toContain("paused");
  });

  it("says the payments are paused, and what that costs the artists, on the final attempt", async () => {
    const html = await render(CurationPaymentFailed({ ...failedMock, finalAttempt: true }));
    expect(html).toContain("paused");
    expect(html).toContain("Pay the invoice");
    // The rent stopping is the consequence the venue would not otherwise know.
    expect(html).toContain("rent stops while the subscription is paused");
  });

  it("does not tell a managed-curation venue about programme rent it does not pay", async () => {
    const html = await render(
      CurationPaymentFailed({ ...failedMock, kind: "managed", finalAttempt: true }),
    );
    expect(html).toContain("managed curation subscription");
    expect(html).not.toContain("rent stops");
  });

  it("shows the amount due", async () => {
    const html = await render(CurationPaymentFailed(failedMock));
    expect(html).toContain("£250.00");
  });
});

describe("CurationRenewalReceipt", () => {
  it("reads as a receipt: what was paid, against which invoice, and when", async () => {
    const html = await render(CurationRenewalReceipt(receiptMock));
    expect(html).toContain("Payment received");
    expect(html).toContain("£250.00");
    expect(html).toContain("WP-INV-00517");
    expect(html).toContain("4 September 2026");
  });

  it("names the cadence the venue is actually billed on", async () => {
    expect(await render(CurationRenewalReceipt({ ...receiptMock, billingInterval: "quarter" }))).toContain(
      "quarter",
    );
  });

  it("tells a programme client their fee pays the artists, and says no such thing to a managed one", async () => {
    expect(await render(CurationRenewalReceipt(receiptMock))).toContain("paid rent out of this payment");
    expect(await render(CurationRenewalReceipt({ ...receiptMock, kind: "managed" }))).not.toContain(
      "paid rent out of this payment",
    );
  });
});

describe("CurationSubscriptionCancelled", () => {
  it("is written in the past tense, because Stripe has already ended it", async () => {
    const html = await render(CurationSubscriptionCancelled(cancelledMock));
    expect(html).toContain("has ended");
    expect(html).toContain("No further payments will be taken");
    expect(html).toContain("4 September 2026");
    // The artist-plan template's "you keep access until the period ends" would
    // be wrong here: this fires when the subscription is over.
    expect(html).not.toContain("keep full access");
  });

  it("tells a programme client their walls are not being emptied today", async () => {
    const html = await render(CurationSubscriptionCancelled(cancelledMock));
    expect(html).toContain("nothing needs collecting today");
  });
});

describe("ArtistProgrammeRentStatement", () => {
  it("lists every piece with its rent, and the total", async () => {
    const html = await render(ArtistProgrammeRentStatement(statementMock));
    expect(html).toContain("Last Light on Mare Street");
    expect(html).toContain("The Flower Seller");
    expect(html).toContain("£20.00");
  });

  it("says when the money is actually paid, so the statement is not mistaken for a payout", async () => {
    const html = await render(ArtistProgrammeRentStatement(statementMock));
    expect(html).toContain("recorded");
    expect(html).toContain("once a quarter");
  });

  it("describes a quarterly invoice as three months, not one", async () => {
    const html = await render(ArtistProgrammeRentStatement({ ...statementMock, periodMonths: 3 }));
    expect(html).toContain("the next 3 months");
  });
});

describe("ArtistProgrammeRentSettled", () => {
  it("says the transfer is scheduled and roughly when it lands, without inventing a date", async () => {
    const html = await render(ArtistProgrammeRentSettled(settledMock));
    expect(html).toContain("£60.00");
    expect(html).toContain("scheduled");
    expect(html).toContain("holding period");
    expect(html).toContain("the period up to 30 September 2026");
  });
});

describe("public copy rules", () => {
  // AGENTS.md: no em dashes, no en dashes, no entity forms, in anything a
  // person reads.
  const cases: Array<[string, Promise<string>]> = [
    ["CurationPaymentFailed", render(CurationPaymentFailed(failedMock))],
    ["CurationPaymentFailed (final)", render(CurationPaymentFailed({ ...failedMock, finalAttempt: true }))],
    ["CurationRenewalReceipt", render(CurationRenewalReceipt(receiptMock))],
    ["CurationSubscriptionCancelled", render(CurationSubscriptionCancelled(cancelledMock))],
    ["ArtistProgrammeRentStatement", render(ArtistProgrammeRentStatement(statementMock))],
    ["ArtistProgrammeRentSettled", render(ArtistProgrammeRentSettled(settledMock))],
  ];

  it.each(cases)("%s uses no em or en dashes", async (_name, htmlPromise) => {
    const html = await htmlPromise;
    expect(html).not.toContain("—");
    expect(html).not.toContain("–");
    expect(html).not.toContain("&mdash;");
    expect(html).not.toContain("&ndash;");
  });

  it("says programme, never program", async () => {
    for (const [, htmlPromise] of cases) {
      const html = await htmlPromise;
      expect(html).not.toMatch(/\bprogram\b/i);
    }
  });
});
