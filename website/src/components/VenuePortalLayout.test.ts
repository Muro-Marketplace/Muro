/**
 * Static source assertion — sidebar height regression guard.
 *
 * VenuePortalLayout's desktop sidebar is positioned sticky top-16 (64px
 * below the fixed header at lg+).  The height must be
 * h-[calc(100dvh-4rem)] so the sidebar fills exactly from the header
 * bottom to the viewport bottom.  A bare h-[100dvh] would extend 64px
 * below the viewport, clipping the last nav items and breaking the
 * inner overflow-y-auto scroll.
 *
 * We read the source string directly so the test does not need to mount
 * the component or stub auth / router.
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
  it("desktop sidebar uses h-[calc(100dvh-4rem)] (offset-adjusted dvh)", () => {
    expect(src).toContain("h-[calc(100dvh-4rem)]");
    // Bare h-[100dvh] with no offset would overflow the viewport by 64px.
    // Note: "h-[100dvh]" does not appear as a substring of "h-[calc(100dvh-4rem)]"
    // so this assertion correctly rejects the old bare form.
    expect(src).not.toContain(" h-[100dvh]");
    // Old calc(100vh-…) form used vh (not dvh) — guard against regression.
    expect(src).not.toContain("h-[calc(100vh-");
  });

  it("desktop sidebar does not use the old sticky top-14 offset", () => {
    // The aside must use top-0 lg:top-16, not sticky top-14 … h-[calc(…)]
    expect(src).not.toContain("sticky top-14 lg:top-16 self-start h-[calc");
  });

  it("nav container carries overflow-y-auto so long nav lists scroll", () => {
    expect(src).toContain("overflow-y-auto");
  });
});
