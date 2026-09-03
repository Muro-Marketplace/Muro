// The venue-initiated half of the request receipt. Item 8 of the email audit:
// the artist's receipt carries the wall proposal capture when there is one,
// and a venue's request never has one, so this template must not claim a
// preview it does not have.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import entry, { VenuePlacementRequestSent, mock } from "./VenuePlacementRequestSent";

const PREVIEW = "https://cdn.example/wall-renders/u-artist/r1.webp";

/** See brief-emails.test.tsx: strips React's text-node comment and unescapes
 *  apostrophes, so an assertion reads the sentence the recipient sees. */
function copyOf(html: string): string {
  return html.replaceAll("<!-- -->", "").replaceAll("&#x27;", "'");
}

describe("VenuePlacementRequestSent", () => {
  it("confirms the request, the works and the terms, and links the placement", async () => {
    const html = await render(<VenuePlacementRequestSent {...mock} />);
    const copy = copyOf(html);
    expect(copy).toContain("Request sent to Maya Chen");
    expect(copy).toContain("Last Light on Mare Street");
    expect(copy).toContain("Paid loan · £120/mo");
    expect(html).toContain('href="https://wallplace.co.uk/placements/p_example"');
  });

  it("claims no preview when there is none, which is every venue-initiated request", async () => {
    const html = await render(<VenuePlacementRequestSent {...mock} />);
    expect(html).not.toContain("<img");
    expect(copyOf(html)).not.toContain("wall, as previewed");
  });

  it("needs both a URL and a wall name before it shows a capture", async () => {
    const urlOnly = await render(<VenuePlacementRequestSent {...mock} wallPreviewUrl={PREVIEW} />);
    expect(urlOnly).not.toContain(PREVIEW);

    const both = await render(<VenuePlacementRequestSent {...mock} wallPreviewUrl={PREVIEW} wallName="Lobby" />);
    expect(both).toContain(`src="${PREVIEW}"`);
    expect(copyOf(both)).toContain("The proposal on your Lobby wall, as previewed.");
  });

  it("mirrors the artist receipt's registry shape", () => {
    expect(entry.id).toBe("venue_placement_request_sent");
    expect(entry.persona).toBe("venue");
    expect(entry.category).toBe("placements");
    expect(entry.canUnsubscribe).toBe(true);
  });

  it("uses no em or en dashes in the copy the recipient reads", async () => {
    const text = await render(<VenuePlacementRequestSent {...mock} />, { plainText: true });
    expect(text).not.toMatch(/[—–]/);
  });
});
