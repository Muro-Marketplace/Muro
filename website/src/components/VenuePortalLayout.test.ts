/**
 * Static source assertion — mobile viewport regression guard.
 *
 * VenuePortalLayout's desktop sidebar must use h-[100dvh] (robust to
 * mobile browser chrome) not h-[calc(100vh-...)].  We read the source
 * string directly so the test does not need to mount the component or
 * stub auth / router.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  path.join(__dirname, "VenuePortalLayout.tsx"),
  "utf8",
);

describe("VenuePortalLayout — sidebar viewport class", () => {
  it("desktop sidebar uses h-[100dvh] (dvh, not calc)", () => {
    expect(src).toContain("h-[100dvh]");
    expect(src).not.toContain("h-[calc(100vh");
  });

  it("desktop sidebar does not use the old sticky top-14 offset", () => {
    // The aside must use top-0 lg:top-16, not sticky top-14 … h-[calc(…)]
    expect(src).not.toContain("sticky top-14 lg:top-16 self-start h-[calc");
  });

  it("nav container carries overflow-y-auto so long nav lists scroll", () => {
    expect(src).toContain("overflow-y-auto");
  });
});
