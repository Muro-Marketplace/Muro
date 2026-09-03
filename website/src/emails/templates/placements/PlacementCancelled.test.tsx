// PlacementCancelled now goes to the canceller as well as the other party.
// "The Curzon cancelled the placement" reads wrongly to The Curzon, so the
// self-cancelled copy switches to the second person and names the other side.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { PlacementCancelled, mock } from "./PlacementCancelled";

/** See brief-emails.test.tsx: strips React's text-node comment and unescapes
 *  apostrophes, so an assertion reads the sentence the recipient sees. */
function copyOf(html: string): string {
  return html.replaceAll("<!-- -->", "").replaceAll("&#x27;", "'");
}

describe("PlacementCancelled to the other party (unchanged)", () => {
  it("names who cancelled and what it means for the artist's money", async () => {
    const copy = copyOf(await render(<PlacementCancelled {...mock} />));

    expect(copy).toContain("The Curzon cancelled the placement");
    expect(copy).toContain("The Curzon has cancelled this placement");
    expect(copy).toContain("The venue's monthly payment of £12.00 ends with it");
  });
});

describe("PlacementCancelled to the canceller (selfCancelled)", () => {
  it("speaks to a venue canceller in the second person and names the artist", async () => {
    const copy = copyOf(
      await render(
        <PlacementCancelled
          {...mock}
          firstName="Hannah"
          cancelledByName="The Curzon"
          recipientPersona="venue"
          selfCancelled
          counterpartyName="Maya Chen"
          nextStepUrl="https://wallplace.co.uk/browse"
        />,
      ),
    );

    expect(copy).toContain("You cancelled the placement");
    expect(copy).toContain("you cancelled the placement with Maya Chen");
    expect(copy).toContain("Maya Chen has been told");
    expect(copy).not.toContain("The Curzon has cancelled this placement");
    // The money line is keyed on persona, so the paying venue still reads
    // that their own charges have stopped.
    expect(copy).toContain("Your monthly payment of £12.00 ends with it");
    expect(copy).toContain("Browse artists");
  });

  it("speaks to an artist canceller about the venue's payment ending", async () => {
    const copy = copyOf(
      await render(
        <PlacementCancelled {...mock} cancelledByName="Maya Chen" selfCancelled counterpartyName="The Curzon" />,
      ),
    );

    expect(copy).toContain("You cancelled the placement");
    expect(copy).toContain("with The Curzon");
    expect(copy).toContain("The venue's monthly payment of £12.00 ends with it");
  });

  it("falls back to a role noun when no counterparty name is known", async () => {
    const copy = copyOf(await render(<PlacementCancelled {...mock} selfCancelled />));
    expect(copy).toContain("you cancelled the placement with the venue");
  });

  it("uses no em or en dashes in the copy the recipient reads", async () => {
    const text = await render(
      <PlacementCancelled {...mock} selfCancelled counterpartyName="The Curzon" />,
      { plainText: true },
    );
    expect(text).not.toMatch(/[—–]/);
  });
});
