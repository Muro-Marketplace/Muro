// Choosing an artist's slug used to happen three different ways.
//
//   api/apply/route.ts          shared slugify(), loop 2..49
//   api/auth/oauth-finalize     its OWN inline slugify, loop 1..99
//   apply/claim/page.tsx        its OWN local slugify, no loop at all
//
// They disagreed on accents ("Søren Kjær" became soren-kjaer down one path and
// s-ren-kj-r down another) and on underscores. Now that a slug is also a public
// URL at `/{slug}`, that divergence is visible to the artist, so the three
// collapse into one function here.
//
// The new constraint is reserved slugs: the vanity route puts artist slugs and
// top-level route names in one namespace, so an artist can no longer be given
// `pricing` or `checkout`.

import { describe, expect, it, vi } from "vitest";
import { RESERVED_SLUGS, isReservedSlug } from "./reserved-slugs";
import { artistSlugBase, chooseArtistSlug } from "./artist-slug";

describe("artistSlugBase()", () => {
  it.each([
    ["Jane Doe", "jane-doe"],
    ["  Padded  Name  ", "padded-name"],
    ["MAKI Studio", "maki-studio"],
  ])("slugifies %p to %p", (name, expected) => {
    expect(artistSlugBase(name)).toBe(expected);
  });

  it("strips accents, which the oauth path used to mangle", () => {
    // The inline slugify in oauth-finalize produced "s-ren-kj-r" here, because
    // it replaced any non-[a-z0-9] run with a hyphen without decomposing first.
    expect(artistSlugBase("Søren Kjær")).toBe("soren-kjaer");
  });

  it.each([["", "empty"], ["🌍🌍", "emoji only"], ["   ", "whitespace"]])(
    "falls back to a usable slug when the name is %p (%s)",
    (name) => {
      expect(artistSlugBase(name)).toBe("artist");
    },
  );

  it.each(["Shop", "Pricing", "Checkout", "browse"])(
    "escapes the reserved name %p instead of handing it over",
    (name) => {
      const slug = artistSlugBase(name);
      expect(isReservedSlug(slug)).toBe(false);
      expect(slug).toContain(name.toLowerCase());
    },
  );

  it("never returns a reserved slug, for any reserved name", () => {
    // The property that actually matters. Reserved names are the exact inputs a
    // studio trading under one word ("Bloom", "Atlas", "Press") would produce.
    for (const reserved of RESERVED_SLUGS) {
      expect(isReservedSlug(artistSlugBase(reserved))).toBe(false);
    }
  });

  it("keeps the original name recognisable when it escapes one", () => {
    expect(artistSlugBase("Shop")).toBe("shop-artist");
  });
});

describe("chooseArtistSlug()", () => {
  /** `isTaken` over a fixed set, plus a record of what it was asked. */
  function taken(...slugs: string[]) {
    const asked: string[] = [];
    const set = new Set(slugs);
    const fn = vi.fn(async (slug: string) => {
      asked.push(slug);
      return set.has(slug);
    });
    return { fn, asked };
  }

  it("uses the plain slug when it is free", async () => {
    const { fn } = taken();
    expect(await chooseArtistSlug("Jane Doe", fn)).toBe("jane-doe");
  });

  it("suffixes past a taken slug", async () => {
    const { fn } = taken("jane-doe");
    expect(await chooseArtistSlug("Jane Doe", fn)).toBe("jane-doe-2");
  });

  it("keeps counting past a run of taken slugs", async () => {
    const { fn } = taken("jane-doe", "jane-doe-2", "jane-doe-3");
    expect(await chooseArtistSlug("Jane Doe", fn)).toBe("jane-doe-4");
  });

  it("asks about each candidate in order and stops at the first free one", async () => {
    const { fn, asked } = taken("jane-doe");
    await chooseArtistSlug("Jane Doe", fn);
    expect(asked).toEqual(["jane-doe", "jane-doe-2"]);
  });

  it("never asks the database about a reserved slug", async () => {
    // The escape happens before any lookup, so a studio called Shop costs one
    // query, not two.
    const { fn, asked } = taken();
    expect(await chooseArtistSlug("Shop", fn)).toBe("shop-artist");
    expect(asked).toEqual(["shop-artist"]);
  });

  it("falls back to a unique suffix rather than returning a taken slug", async () => {
    // The old loops had a latent bug here: on exhaustion they returned the last
    // candidate WITHOUT checking it, so the insert hit the UNIQUE constraint on
    // artist_profiles.slug and the profile was silently never created.
    const { fn } = taken("jane-doe", "jane-doe-2", "jane-doe-3");
    const slug = await chooseArtistSlug("Jane Doe", fn, {
      maxAttempts: 3,
      uniqueSuffix: () => "z9",
    });
    expect(slug).toBe("jane-doe-z9");
  });

  it("returns something usable even when every lookup fails", async () => {
    // Signup should not die because the slug probe errored.
    const failing = vi.fn(async () => {
      throw new Error("supabase is down");
    });
    await expect(chooseArtistSlug("Jane Doe", failing)).resolves.toMatch(/^jane-doe/);
  });
});
