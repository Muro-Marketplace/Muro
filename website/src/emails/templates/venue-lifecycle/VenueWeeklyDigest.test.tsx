// H24. "Artist matches" was a stat with no source: the cron passed a literal 0
// for it on every send, so every venue that ever got this digest was told, in a
// stat block, that it had matched with zero artists. The stat is gone until
// matching exists.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { VenueWeeklyDigest, mock } from "./VenueWeeklyDigest";

async function html(props: Parameters<typeof VenueWeeklyDigest>[0]) {
  return render(VenueWeeklyDigest(props));
}

describe("VenueWeeklyDigest (H24)", () => {
  it("has no artist-matches stat", async () => {
    // Fail-before: the stat block carried "Artist matches" against a hardcoded 0.
    expect(await html(mock)).not.toContain("Artist matches");
  });

  it("still shows the three stats it can count", async () => {
    const out = await html(mock);
    expect(out).toContain("Profile views");
    expect(out).toContain("Placement requests");
    expect(out).toContain("Active placements");
  });

  it("omits the suggestions section when no artists are supplied", async () => {
    const out = await html({ ...mock, suggestedArtists: undefined });
    expect(out).not.toContain("New artists worth a look");
  });

  it("shows the suggestions section when artists are supplied", async () => {
    const out = await html(mock);
    expect(out).toContain("New artists worth a look");
  });
});
