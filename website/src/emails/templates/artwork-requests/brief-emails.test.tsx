// The two ends of a brief that emailed nobody: the artists a venue names on
// its invite list, and the venue when one of them responds.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import invitation, { ArtistBriefInvitation, mock as invitationMock } from "./ArtistBriefInvitation";
import responseReceived, { VenueBriefResponseReceived, mock as responseMock } from "./VenueBriefResponseReceived";

/**
 * The sentence a reader actually sees. React puts an empty comment between two
 * adjacent text nodes, so `{venueName} would like to hear from you` reaches the
 * markup as "The Copper Kettle<!-- --> would like to hear from you", and it
 * escapes apostrophes. Neither is visible in an inbox, so copy assertions run
 * against this and only href/src assertions run against the raw markup.
 */
function copyOf(html: string): string {
  return html.replaceAll("<!-- -->", "").replaceAll("&#x27;", "'");
}

describe("ArtistBriefInvitation", () => {
  it("names the venue, the brief and what they are looking for, with a link to the brief", async () => {
    const html = await render(<ArtistBriefInvitation {...invitationMock} />);
    const copy = copyOf(html);

    expect(copy).toContain("The Copper Kettle would like to hear from you");
    expect(copy).toContain("Coffee shop wall");
    expect(copy).toContain("Purchase, QR-enabled display");
    expect(copy).toContain("£300 to £900");
    expect(copy).toContain("Within a few weeks");
    expect(copy).toContain("3m wall behind the counter");
    expect(html).toContain('href="https://wallplace.co.uk/artist-portal/artwork-requests/arq_example"');
  });

  it("drops the optional lines the brief did not fill in", async () => {
    const copy = copyOf(
      await render(
        <ArtistBriefInvitation
          {...invitationMock}
          budgetLabel={undefined}
          timescaleLabel={undefined}
          intentLabel={undefined}
          briefExcerpt=""
        />,
      ),
    );

    expect(copy).not.toContain("Budget:");
    expect(copy).not.toContain("Timescale:");
    expect(copy).not.toContain("Looking for:");
    expect(copy).toContain("Brief:");
  });

  it("is a placements notice the artist can switch off", () => {
    expect(invitation.id).toBe("artist_brief_invitation");
    expect(invitation.category).toBe("placements");
    expect(invitation.stream).toBe("notify");
    expect(invitation.canUnsubscribe).toBe(true);
  });

  it("uses no em or en dashes in the copy the recipient reads", async () => {
    const text = await render(<ArtistBriefInvitation {...invitationMock} />, { plainText: true });
    expect(text).not.toMatch(/[—–]/);
  });
});

describe("VenueBriefResponseReceived", () => {
  it("names the artist, the brief and the response type, quotes the message and links the responses", async () => {
    const html = await render(<VenueBriefResponseReceived {...responseMock} />);
    const copy = copyOf(html);

    expect(copy).toContain("Maya Chen responded to your brief");
    expect(copy).toContain("Coffee shop wall");
    expect(copy).toContain("placement proposal");
    expect(copy).toContain("three warm abstracts");
    expect(html).toContain('href="https://wallplace.co.uk/venue-portal/artwork-requests/arq_example"');
  });

  it("is a placements notice the venue can switch off", () => {
    expect(responseReceived.id).toBe("venue_brief_response_received");
    expect(responseReceived.category).toBe("placements");
    expect(responseReceived.canUnsubscribe).toBe(true);
  });

  it("uses no em or en dashes in the copy the recipient reads", async () => {
    const text = await render(<VenueBriefResponseReceived {...responseMock} />, { plainText: true });
    expect(text).not.toMatch(/[—–]/);
  });
});
