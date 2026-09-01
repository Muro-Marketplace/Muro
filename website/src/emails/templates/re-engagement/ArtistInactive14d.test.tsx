// H22/H26. The cron passed `nearbyVenues: []`, and the stat block printed its
// length, so every returning artist was told there were zero venues near them.
// There is no geo matching behind that number, so the stat only appears when a
// real list is supplied.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { ArtistInactive14d, mock } from "./ArtistInactive14d";

async function html(props: Parameters<typeof ArtistInactive14d>[0]) {
  return render(ArtistInactive14d(props));
}

describe("ArtistInactive14d (H22)", () => {
  it("omits the nearby-venues stat when no venues are supplied", async () => {
    const out = await html({ ...mock, nearbyVenues: undefined });
    // Fail-before: "Venues near you  0".
    expect(out).not.toContain("Venues near you");
  });

  it("shows the nearby-venues stat when venues are supplied", async () => {
    const out = await html(mock);
    expect(out).toContain("Venues near you");
    expect(out).toContain(mock.nearbyVenues![0].name);
  });

  it("always shows the real profile-view count", async () => {
    const out = await html({ ...mock, profileViews: 43, nearbyVenues: undefined });
    expect(out).toContain("Profile views");
    expect(out).toContain("43");
  });

  it("does not describe profile views as venues in the preview line", async () => {
    // Fail-before: "43 venues viewed your profile", which conflated a view
    // count with a count of venues.
    const out = await html({ ...mock, profileViews: 43 });
    expect(out).not.toContain("venues viewed your profile");
  });
});
