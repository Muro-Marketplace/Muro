import { describe, expect, it } from "vitest";
import { grepFiles, read } from "./claims-helpers";

// Launch audit. Each entry is a claim the site made that it could not
// evidence, pinned so it cannot come back.
describe("public claims the site cannot evidence stay out", () => {
  it("no page says venues are looking for art 'right now'", () => {
    for (const p of [
      "src/app/page.tsx",
      "src/components/marketing/ArtistGuide.tsx",
      "src/app/(pages)/spaces/page.tsx",
    ]) {
      expect(read(p), p).not.toMatch(/looking for art right now|Venues Looking for Art|actively seeking|Active Demand/i);
    }
  });

  it("grepFiles distinguishes no-match from a real grep error", () => {
    expect(grepFiles("zz-no-such-needle-zz", ["src/lib"])).toEqual([]);
    expect(() => grepFiles("x", ["no-such-dir-zz"])).toThrow(/grep failed/);
  });
});
