// Acknowledgement to an anonymous enquirer. Modelled on
// SupportRequestReceived: the sender has no account, so the category is the
// always-send bucket and nothing about the send can hinge on a preference.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import entry, { EnquiryReceived, mock } from "./EnquiryReceived";

/** See brief-emails.test.tsx: strips React's text-node comment and unescapes
 *  apostrophes, so an assertion reads the sentence the recipient sees. */
function copyOf(html: string): string {
  return html.replaceAll("<!-- -->", "").replaceAll("&#x27;", "'");
}

describe("EnquiryReceived", () => {
  it("names the artist, the work, the enquiry type and echoes the message", async () => {
    const html = await render(<EnquiryReceived {...mock} />);
    const copy = copyOf(html);

    expect(copy).toContain("passed your message to Maya Chen");
    expect(copy).toContain("Last Light on Mare Street");
    expect(copy).toContain("Purchasing a work");
    expect(copy).toContain("Is this piece still available");
    expect(html).toContain('href="https://wallplace.co.uk/browse/maya-chen"');
  });

  it("omits the work line when the form named no work", async () => {
    const copy = copyOf(await render(<EnquiryReceived {...mock} workTitle={undefined} />));
    expect(copy).not.toContain("About:");
    expect(copy).toContain("Enquiry type:");
  });

  it("uses no em or en dashes in the copy the recipient reads", async () => {
    const text = await render(<EnquiryReceived {...mock} />, { plainText: true });
    expect(text).not.toMatch(/[—–]/);
  });

  it("is registered on the always-send category with no unsubscribe", () => {
    expect(entry.id).toBe("enquiry_received");
    expect(entry.category).toBe("orders_and_payouts");
    expect(entry.stream).toBe("tx");
    expect(entry.canUnsubscribe).toBe(false);
    expect(entry.hasInAppEquivalent).toBe(false);
  });
});
