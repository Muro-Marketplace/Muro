// The outcome of a purchase offer (accepted, declined, withdrawn) used to reach
// the counterparty as a bell and a thread line only. This template is the
// email half; the venue whose offer was accepted needs the payment link and
// the deadline the offers list already shows.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import entry, { OfferOutcomeNotification, mock } from "./OfferOutcomeNotification";

/** See brief-emails.test.tsx: strips React's text-node comment and unescapes
 *  apostrophes, so an assertion reads the sentence the recipient sees. */
function copyOf(html: string): string {
  return html.replaceAll("<!-- -->", "").replaceAll("&#x27;", "'");
}

async function html(props: Partial<typeof mock>) {
  return render(<OfferOutcomeNotification {...mock} {...props} />);
}
async function copy(props: Partial<typeof mock>) {
  return copyOf(await html(props));
}
async function text(props: Partial<typeof mock>) {
  return render(<OfferOutcomeNotification {...mock} {...props} />, { plainText: true });
}

describe("OfferOutcomeNotification, accepted, to the paying venue", () => {
  it("carries the payment link, the amount, the work and the offer deadline", async () => {
    const raw = await html({});
    const out = copyOf(raw);

    expect(out).toContain("Your offer was accepted");
    expect(out).toContain("Complete payment");
    expect(raw).toContain('href="https://wallplace.co.uk/venue-portal/offers?pay=off_example"');
    expect(out).toContain("£1,250.00");
    expect(out).toContain("Last Light on Mare Street");
    expect(out).toContain("Offer deadline:");
    expect(out).toContain("10 September 2026");
  });

  it("falls back to the offers page when no payment link is supplied", async () => {
    const raw = await html({ paymentUrl: undefined });
    expect(raw).not.toContain("?pay=");
    expect(raw).toContain('href="https://wallplace.co.uk/venue-portal/offers"');
  });

  it("says nothing about a deadline when the offer had none", async () => {
    expect(await copy({ offerDeadline: undefined })).not.toContain("Offer deadline");
  });
});

describe("OfferOutcomeNotification, accepted, to the artist whose counter was taken", () => {
  it("tells them the venue can now pay and offers no payment link", async () => {
    const out = await copy({
      recipientRole: "artist",
      counterpartyName: "The Curzon",
      isCounter: true,
      paymentUrl: undefined,
    });

    expect(out).toContain("Your counter offer was accepted");
    expect(out).toContain("The Curzon accepted your counter offer of £1,250.00");
    expect(out).toContain("separate note the moment they do");
    expect(out).not.toContain("Complete payment");
  });
});

describe("OfferOutcomeNotification, declined and withdrawn", () => {
  it("declined: names the decision and points at the offers page to try again", async () => {
    const out = await copy({ outcome: "declined", paymentUrl: undefined, offerDeadline: undefined });

    expect(out).toContain("Your offer was declined");
    expect(out).toContain("Maya Chen declined your offer of £1,250.00");
    expect(out).toContain("send a revised offer");
    expect(out).toContain("View offers");
    expect(out).not.toContain("Complete payment");
  });

  it("withdrawn: says nothing more is needed", async () => {
    const out = await copy({
      outcome: "withdrawn",
      recipientRole: "artist",
      counterpartyName: "The Curzon",
      paymentUrl: undefined,
    });

    expect(out).toContain("The Curzon withdrew their offer");
    expect(out).toContain("Nothing more is needed from you");
    expect(out).not.toContain("Complete payment");
  });

  it("uses no em or en dashes in the copy the recipient reads", async () => {
    for (const outcome of ["accepted", "declined", "withdrawn"] as const) {
      expect(await text({ outcome })).not.toMatch(/[—–]/);
    }
  });
});

describe("OfferOutcomeNotification registry entry", () => {
  it("rides the critical money category, so no toggle or throttle can drop it", () => {
    expect(entry.id).toBe("offer_outcome_notification");
    expect(entry.category).toBe("orders_and_payouts");
    expect(entry.stream).toBe("tx");
    expect(entry.canUnsubscribe).toBe(false);
  });
});
