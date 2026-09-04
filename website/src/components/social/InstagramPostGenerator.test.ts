// The post studio is where an artist is meant to turn a piece into something
// postable. Two things were wrong with it for the artist this feature is aimed
// at, the one arriving with an existing following:
//
//  1. Everything was framed around a placement. The venue line came from an
//     active placement, so a newly accepted artist with no wall yet had nothing
//     useful to generate on day one, which is exactly when they are keenest.
//  2. Only the STORY caption carried a link. The post caption, the common one,
//     said "Discover more on Wallplace" and named no URL at all, so a follower
//     who wanted to buy had nowhere to go.

import { afterEach, describe, expect, it } from "vitest";
import { buildCaption, type PostMode } from "./InstagramPostGenerator";

const SNAPSHOT = { ...process.env };
afterEach(() => {
  process.env = { ...SNAPSHOT };
});

const work = {
  workTitle: "Low Tide",
  artistName: "Fin Coles",
  artistSlug: "fin-coles",
  workImage: "https://example.test/low-tide.jpg",
  workMedium: "screenprint",
};

const placed = { ...work, showingAtVenueName: "The Copper Kettle" };

const TABS = ["post", "story", "reel"] as const;

describe("buildCaption() in shop mode", () => {
  it.each(TABS)("puts the artist's shop link in the %s caption", (tab) => {
    // The gap this closes. Before, only "story" named a URL.
    expect(buildCaption(work, tab, "shop")).toContain("wallplace.co.uk/fin-coles");
  });

  it("never mentions a venue, even when the artist has a live placement", () => {
    // Shop mode is the artist promoting their shop. Someone scrolling their
    // feed does not need to be sent to a cafe to buy.
    const caption = buildCaption(placed, "post", "shop");
    expect(caption).not.toContain("The Copper Kettle");
    expect(caption).not.toMatch(/now showing/i);
  });

  it("still names the work and the artist", () => {
    const caption = buildCaption(work, "post", "shop");
    expect(caption).toContain("Low Tide");
    expect(caption).toContain("Fin Coles");
  });

  it("follows the configured origin, so a preview deploy does not advertise production", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.vercel.app";
    expect(buildCaption(work, "post", "shop")).toContain("preview.vercel.app/fin-coles");
  });
});

describe("buildCaption() in venue mode", () => {
  it("leads with the venue when there is one", () => {
    expect(buildCaption(placed, "post", "venue")).toMatch(/now showing at The Copper Kettle/i);
  });

  it("carries the shop link as well, so the post is still shoppable", () => {
    // The venue drives the story; the link is still how anyone buys.
    expect(buildCaption(placed, "post", "venue")).toContain("wallplace.co.uk/fin-coles");
  });

  it("falls back to shop mode when the artist has no placement", () => {
    // The UI disables the venue tab in this state, but the builder is not
    // allowed to emit "Now showing at null".
    const caption = buildCaption(work, "post", "venue");
    expect(caption).not.toMatch(/now showing/i);
    expect(caption).not.toContain("null");
    expect(caption).toBe(buildCaption(work, "post", "shop"));
  });
});

describe("mode is exhaustive", () => {
  it.each(["shop", "venue"] as PostMode[])("%s produces a non-empty caption for every tab", (mode) => {
    for (const tab of TABS) {
      expect(buildCaption(placed, tab, mode).trim().length).toBeGreaterThan(20);
    }
  });
});
