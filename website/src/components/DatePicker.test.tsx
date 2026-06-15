/**
 * Static source assertion — tap-target regression guard.
 *
 * The DatePicker component passes a `classNames` object to DayPicker.
 * The day_button class must be at least 44px (w-11 h-11) to meet WCAG
 * 2.5.5 / Apple HIG tap-target guidelines.
 *
 * We assert on the source string directly so the test works without
 * mounting the component (react-day-picker needs a browser environment
 * to open a calendar popup, which jsdom can't exercise end-to-end).
 * The Playwright tap-target audit covers the rendered pixel sizes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, "DatePicker.tsx"), "utf8");

describe("DatePicker — day button tap target (w-11 h-11)", () => {
  it("day_button classNames contain w-11 (44px)", () => {
    // e.g. day_button: "w-11 h-11 ..."
    expect(src).toContain("w-11");
  });

  it("day_button classNames contain h-11 (44px)", () => {
    expect(src).toContain("h-11");
  });

  it("day_button classNames do not revert to the old w-8 h-8 (32px)", () => {
    // Guard against the old values accidentally being re-introduced.
    // We check that w-8 / h-8 do not appear adjacent to day_button.
    const dayButtonLine = src
      .split("\n")
      .find((line) => line.includes("day_button:"));
    expect(dayButtonLine).toBeDefined();
    expect(dayButtonLine).not.toContain("w-8");
    expect(dayButtonLine).not.toContain("h-8");
  });
});
