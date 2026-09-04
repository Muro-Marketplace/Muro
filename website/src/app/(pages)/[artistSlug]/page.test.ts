// The vanity URL. `wallplace.co.uk/{slug}` is what an artist puts in their
// Instagram bio, and until this route existed it 404'd, including for every
// caption the post studio has ever generated (InstagramPostGenerator builds
// `wallplace.co.uk/{artistSlug}` and there was nothing serving it).
//
// This is a catch-all, so it also receives every mistyped URL on the site. The
// tests below pin the three things that matters for: real slugs redirect,
// everything else 404s, and junk never reaches the database.

import { beforeEach, describe, expect, it, vi } from "vitest";

// redirect() and notFound() work by throwing, which is how a server component
// stops rendering. Mirror that here so a route which called both, or called one
// and carried on, cannot pass.
// vi.mock factories are hoisted above ordinary consts, so the spies have to be
// created inside vi.hoisted to exist by the time the factory runs.
const { redirect, permanentRedirect, notFound, artistSlugExists } = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(public readonly to: string) {
      super(`redirect:${to}`);
      this.name = "RedirectError";
    }
  }
  class NotFound extends Error {
    constructor() {
      super("notFound");
      this.name = "NotFoundError";
    }
  }
  return {
    redirect: vi.fn((to: string) => {
      throw new Redirect(to);
    }),
    permanentRedirect: vi.fn((to: string) => {
      throw new Redirect(to);
    }),
    notFound: vi.fn(() => {
      throw new NotFound();
    }),
    artistSlugExists: vi.fn(async (slug: string) => slug === "fin-coles"),
  };
});

vi.mock("next/navigation", () => ({ redirect, permanentRedirect, notFound }));
vi.mock("@/lib/db/merged-data", () => ({ artistSlugExists }));

import ArtistVanityPage from "./page";

/** Runs the page and reports what it did, rather than what it returned. */
async function visit(artistSlug: string): Promise<
  { outcome: "redirect"; to: string } | { outcome: "notFound" } | { outcome: "rendered" }
> {
  try {
    await ArtistVanityPage({ params: Promise.resolve({ artistSlug }) });
    return { outcome: "rendered" };
  } catch (e) {
    const err = e as Error & { to?: string };
    if (err.name === "RedirectError") return { outcome: "redirect", to: err.to as string };
    if (err.name === "NotFoundError") return { outcome: "notFound" };
    throw e;
  }
}

describe("/{artistSlug} vanity URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a real artist slug to their shop", async () => {
    expect(await visit("fin-coles")).toEqual({ outcome: "redirect", to: "/browse/fin-coles" });
  });

  it("redirects temporarily, never permanently", async () => {
    // A 308 is cached by browsers indefinitely. On a catch-all that would pin
    // every path anyone mistypes today, including paths we may later want to
    // ship as real pages. `/browse/{slug}` stays canonical in the sitemap and
    // the page metadata, so there is nothing to gain by making this permanent.
    // See the K8 note on the /browse/finlay-coles rule in next.config.ts.
    await visit("fin-coles");
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("404s a slug nobody holds", async () => {
    expect(await visit("no-such-artist")).toEqual({ outcome: "notFound" });
  });

  it.each([
    ["Fin-Coles", "uppercase"],
    ["fin coles", "a space"],
    ["fin_coles", "an underscore"],
    ["-fin-coles", "a leading hyphen"],
    ["fin--coles", "a doubled hyphen"],
    ["fin.coles", "a dot"],
    ["../../etc/passwd", "traversal"],
    ["", "nothing at all"],
  ])("404s %p (%s) without touching the database", async (slug) => {
    expect(await visit(slug)).toEqual({ outcome: "notFound" });
    expect(artistSlugExists).not.toHaveBeenCalled();
  });

  it("does look up anything slug-shaped", async () => {
    // The guard is a cheap filter on obvious junk, not a second opinion on who
    // exists. Anything that could be a slug still gets asked about.
    await visit("some-new-artist-2");
    expect(artistSlugExists).toHaveBeenCalledWith("some-new-artist-2");
  });
});
