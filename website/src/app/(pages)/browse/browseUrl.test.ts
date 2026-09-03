// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveBrowseQuery, writeBrowseQuery } from "./browseUrl";

function setUrl(search: string) {
  window.history.replaceState(null, "", `/browse${search}`);
}

describe("writeBrowseQuery", () => {
  afterEach(() => {
    setUrl("");
    vi.restoreAllMocks();
  });

  it("merges from the live URL, not from any snapshot", () => {
    setUrl("?loc_lat=51.5&loc_lng=-0.1&maxDistance=13");
    writeBrowseQuery((p) => p.set("q", "blue"));
    expect(window.location.search).toBe("?loc_lat=51.5&loc_lng=-0.1&maxDistance=13&q=blue");
  });

  it("drops to a bare /browse when nothing is left", () => {
    setUrl("?q=blue");
    writeBrowseQuery((p) => p.delete("q"));
    expect(window.location.pathname).toBe("/browse");
    expect(window.location.search).toBe("");
  });

  it("accepts a replacement set from the mutator", () => {
    setUrl("?view=portfolios&q=blue");
    writeBrowseQuery((p) => {
      const out = new URLSearchParams(p.toString());
      out.set("maxDistance", "40");
      return out;
    });
    expect(window.location.search).toBe("?view=portfolios&q=blue&maxDistance=40");
  });

  it("uses replaceState so the history stack does not grow", () => {
    const spy = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    writeBrowseQuery((p) => p.set("q", "x"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("liveBrowseQuery", () => {
  it("returns the query without the question mark", () => {
    setUrl("?q=blue&view=portfolios");
    expect(liveBrowseQuery()).toBe("q=blue&view=portfolios");
    setUrl("");
    expect(liveBrowseQuery()).toBe("");
  });
});
