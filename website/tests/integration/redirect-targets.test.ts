// K8 (07 §8.5). Every permanent redirect points somewhere that exists.
//
// `next.config.ts` sends `/browse/finlay-coles` to `/browse/fin-coles` with
// `permanent: true`, which is a 308. Browsers cache 308s indefinitely. The
// target is a live DB row with no static seed entry behind it, so **deleting
// that row turns a permanent redirect into a permanent 404**, for every visitor
// whose browser has already cached the hop.
//
// This asserts the config's shape rather than hitting the network: the point is
// that a future data purge is caught in CI, not that the redirect works today.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const CONFIG = readFileSync("next.config.ts", "utf8");

/** `{ source, destination, permanent }` triples, in declaration order. */
function redirects(): { source: string; destination: string; permanent: boolean }[] {
  const out: { source: string; destination: string; permanent: boolean }[] = [];
  const re =
    /\{\s*source:\s*"([^"]+)",\s*destination:\s*"([^"]+)",\s*permanent:\s*(true|false)\s*\}/g;
  for (const m of CONFIG.matchAll(re)) {
    out.push({ source: m[1], destination: m[2], permanent: m[3] === "true" });
  }
  return out;
}

describe("next.config.ts redirects (K8)", () => {
  it("parses some redirects, so an empty sweep cannot pass vacuously", () => {
    expect(redirects().length).toBeGreaterThan(3);
  });

  it("never redirects a path to itself", () => {
    const selfies = redirects().filter((r) => r.source === r.destination);
    expect(selfies).toEqual([]);
  });

  it("has no redirect chain, which a 308 makes permanent twice over", () => {
    const bySource = new Map(redirects().map((r) => [r.source, r.destination]));
    const chained = redirects().filter((r) => bySource.has(r.destination));
    expect(chained, "one of these destinations is itself redirected away").toEqual([]);
  });

  it("keeps the artist-slug redirect and its target named together", () => {
    // The load-bearing one. `fin-coles` exists only as a DB row, so nothing in
    // the repo stops someone deleting it. The comment beside the rule is the
    // only warning; this test is the one that fails.
    const artistRedirects = redirects().filter((r) => r.source.startsWith("/browse/"));
    expect(artistRedirects).toEqual([
      { source: "/browse/finlay-coles", destination: "/browse/fin-coles", permanent: true },
    ]);

    // If the rule ever changes, the comment above it must too.
    expect(CONFIG).toMatch(/canonical slug is fin-coles/);
    expect(
      CONFIG,
      "the config must say the target is a DB row that cannot be deleted independently",
    ).toMatch(/DB row/i);
  });
});
