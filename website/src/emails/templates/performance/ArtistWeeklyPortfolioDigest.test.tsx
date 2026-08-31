// H23. "Top works this week" was rendered unconditionally above a list the
// cron always passed as empty, so every weekly digest ever sent carried a
// heading with nothing under it. No works, no section.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { ArtistWeeklyPortfolioDigest, mock } from "./ArtistWeeklyPortfolioDigest";

async function html(props: Parameters<typeof ArtistWeeklyPortfolioDigest>[0]) {
  return render(ArtistWeeklyPortfolioDigest(props));
}

describe("ArtistWeeklyPortfolioDigest (H23)", () => {
  it("omits the top-works heading when there are no works", async () => {
    // Fail-before: the heading rendered above an empty list, every time.
    expect(await html({ ...mock, topWorks: [] })).not.toContain("Top works this week");
  });

  it("shows the top-works section when there are works", async () => {
    const out = await html(mock);
    expect(out).toContain("Top works this week");
    expect(out).toContain(mock.topWorks[0].title);
  });

  it("still shows the stat block when there are no works", async () => {
    const out = await html({ ...mock, topWorks: [] });
    expect(out).toContain("Profile views");
    expect(out).toContain("QR scans");
  });
});
