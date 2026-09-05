// Next 16 turned `images.qualities` into an allowlist that defaults to [75],
// and the image optimiser answers 400 — not a fallback, a failed request — for
// any `q` outside it. Nothing in the build warns about this, and every image
// on the site is remote, so the only symptom is an image that quietly does not
// appear in production while looking fine in dev (where `unoptimized` bypasses
// the optimiser entirely).
//
// These hold the two invariants the sign-in backdrop's quality depends on:
// every quality the app passes is declared, and the auth background is fetched
// from Unsplash at least as wide as the widest size Next will ever ask for, so
// no step in the chain is upscaling.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG = readFileSync(path.join(ROOT, "next.config.ts"), "utf8");

/** Parses a numeric array off an `images` key in next.config.ts. */
function configNumbers(key: string): number[] {
  const match = CONFIG.match(new RegExp(String.raw`\n\s*${key}:\s*\[([^\]]*)\]`));
  expect(match, `${key} should be set explicitly in next.config.ts`).toBeTruthy();
  return match![1]
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map(Number);
}

/** Every `quality={<literal>}` written anywhere under src/. */
function qualityLiteralsInSource(): { value: number; site: string }[] {
  let out = "";
  try {
    out = execFileSync(
      "grep",
      ["-rEno", String.raw`quality=\{[0-9]+\}`, "--include=*.tsx", "--include=*.ts", path.join(ROOT, "src")],
      { encoding: "utf8" },
    );
  } catch (err) {
    // grep exits 1 on no matches. No quality props is trivially valid.
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const value = Number(line.match(/quality=\{(\d+)\}/)![1]);
      return { value, site: line.split(":").slice(0, 2).join(":").replace(`${ROOT}/`, "") };
    });
}

describe("images.qualities allowlist", () => {
  it("declares 75, the default used wherever no quality prop is set", () => {
    expect(configNumbers("qualities")).toContain(75);
  });

  it("declares every quality literal passed anywhere in src/", () => {
    const allowed = new Set(configNumbers("qualities"));
    const undeclared = qualityLiteralsInSource().filter((q) => !allowed.has(q.value));

    expect(
      undeclared.map((q) => `${q.site} uses quality ${q.value}`),
      "these images would be served a 400 by the optimiser in production; " +
        "add the value to images.qualities in next.config.ts",
    ).toEqual([]);
  });

  it("keeps the ternary quality in ArtistProfileClient declared", () => {
    // The one quality prop that is not a bare literal, so the grep above
    // cannot see it: `quality={isFullscreen ? 85 : 60}`.
    const allowed = new Set(configNumbers("qualities"));
    expect(allowed.has(85) && allowed.has(60)).toBe(true);
  });
});

/**
 * The full-bleed Unsplash backdrops, with the width each one is allowed to
 * stop at. `null` means "as wide as the widest device size", which is the
 * right answer whenever the Unsplash master has the detail to fill it.
 */
const BACKDROPS: { page: string; photo: string; ceiling: number | null }[] = [
  { page: "src/app/(pages)/login/page.tsx", photo: "photo-1561214115-f2f134cc4912", ceiling: null },
  { page: "src/app/(pages)/signup/page.tsx", photo: "photo-1561214115-f2f134cc4912", ceiling: null },
  { page: "src/app/(pages)/signup/artist/page.tsx", photo: "photo-1561214115-f2f134cc4912", ceiling: null },
  { page: "src/app/(pages)/signup/customer/page.tsx", photo: "photo-1561214115-f2f134cc4912", ceiling: null },
  // The how-it-works master is 2448x2448, so 2448 wide is the whole 16:9
  // centre crop that exists. Asking Unsplash for more only has it enlarge the
  // same detail into a bigger file, so this one is capped at native.
  { page: "src/app/(pages)/how-it-works/HowItWorksClient.tsx", photo: "photo-1460661419201-fd4cecdf8a8b", ceiling: 2448 },
  // Homepage hero: master is 3449x4368, so 3449x1940 is the whole 16:9 crop.
  { page: "src/app/page.tsx", photo: "photo-1541961017774-22349e4a1262", ceiling: 3449 },
];

/**
 * The homepage's curated banner is full-bleed too, but its box is short and
 * wide (h-56 lg:h-72), so the width binds and object-cover adds no overdraw.
 * 100vw is right there, which is why it is not in BACKDROPS: it needs the
 * native-width rule without the overdraw rule.
 */
const BANNER = { page: "src/app/page.tsx", photo: "photo-1460661419201-fd4cecdf8a8b", ceiling: 2448 };

describe("full-bleed backdrop resolution", () => {
  it("requests each source at the widest size its master actually holds", () => {
    // Below this, Next has nothing left to downscale from and the browser
    // upscales instead — which is exactly what made these look soft when the
    // sources were pinned at w=1920 and deviceSizes topped out at 1200.
    const widest = Math.max(...configNumbers("deviceSizes"));

    for (const { page, photo, ceiling } of BACKDROPS) {
      const src = readFileSync(path.join(ROOT, page), "utf8").match(
        new RegExp(String.raw`images\.unsplash\.com/${photo}\?([^"]*)`),
      );
      expect(src, `${page} should still render its backdrop`).toBeTruthy();

      const params = new URLSearchParams(src![1].replace(/&amp;/g, "&"));
      expect(Number(params.get("w")), `${page} source width`).toBe(ceiling ?? widest);
    }
  });

  it("sizes each backdrop for the overdraw that object-cover creates", () => {
    // A 16:9 image cover-fitting a full-height box paints far wider than the
    // viewport on portrait screens, but browsers choose a srcset entry from
    // the width alone. A plain 100vw here under-requests by ~4x on a phone,
    // and a `fill` image with no sizes at all defaults to exactly that.
    for (const { page, photo } of BACKDROPS) {
      const source = readFileSync(path.join(ROOT, page), "utf8");
      const tag = source.match(new RegExp(String.raw`<Image[^>]*${photo}[\s\S]*?/>`))?.[0];
      expect(tag, `${page} backdrop <Image>`).toBeTruthy();

      const sizes = tag!.match(/sizes="([^"]*)"/)?.[1];
      expect(sizes, `${page} backdrop has no sizes, so it defaults to 100vw`).toBeTruthy();
      expect(sizes, `${page} backdrop sizes`).toMatch(/max-width:\s*640px\)\s*\d{3}vw/);
    }
  });

  it("requests the curated banner at its master's native width", () => {
    const src = readFileSync(path.join(ROOT, BANNER.page), "utf8").match(
      new RegExp(String.raw`images\.unsplash\.com/${BANNER.photo}\?([^"]*)`),
    );
    expect(src, "homepage curated banner").toBeTruthy();
    const params = new URLSearchParams(src![1].replace(/&amp;/g, "&"));
    expect(Number(params.get("w"))).toBe(BANNER.ceiling);
  });
});
