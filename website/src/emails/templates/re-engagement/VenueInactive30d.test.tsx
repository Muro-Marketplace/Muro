// H22/H26. The heading read "Four artists near you" while the cron passed
// `suggestedArtists: []`, so the email promised four artists and listed none.
// The count now comes from the list, and "near you" is gone because nothing
// behind this email establishes proximity.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { VenueInactive30d, mock } from "./VenueInactive30d";
import { mockArtist, mockArtistSecondary } from "@/emails/data/mockData";

async function html(props: Parameters<typeof VenueInactive30d>[0]) {
  return render(VenueInactive30d(props));
}

describe("VenueInactive30d (H22)", () => {
  it("never promises four artists", async () => {
    // Fail-before: a hardcoded "Four artists near you" heading.
    expect(await html(mock)).not.toContain("Four artists");
  });

  it("counts the artists it actually lists", async () => {
    const two = await html({ ...mock, suggestedArtists: [mockArtist, mockArtistSecondary] });
    expect(two).toContain("2 new artists to see");
    expect(two).toContain(mockArtist.name);
    expect(two).toContain(mockArtistSecondary.name);
  });

  it("reads naturally for a single artist", async () => {
    const one = await html({ ...mock, suggestedArtists: [mockArtist] });
    expect(one).toContain("A new artist to see");
    expect(one).not.toContain("1 new artists");
  });

  it("makes no claim about proximity", async () => {
    // There is no geo matching, so "near" must not appear anywhere in the body.
    expect(await html(mock)).not.toContain("near you");
  });
});
