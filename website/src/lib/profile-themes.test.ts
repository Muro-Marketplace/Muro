import { describe, expect, it } from "vitest";
import {
  canCustomiseTheme,
  getProfileTheme,
  getLabelTheme,
  PROFILE_THEMES,
  LABEL_THEMES,
  DEFAULT_PROFILE_THEME,
  DEFAULT_LABEL_THEME,
} from "./profile-themes";

describe("canCustomiseTheme", () => {
  it("unlocks for premium", () => {
    expect(canCustomiseTheme("premium")).toBe(true);
    expect(canCustomiseTheme("Premium")).toBe(true);
  });

  it("unlocks for pro", () => {
    expect(canCustomiseTheme("pro")).toBe(true);
    expect(canCustomiseTheme("PRO")).toBe(true);
  });

  it("locks core, free, none, null, undefined, and unknown values", () => {
    expect(canCustomiseTheme("core")).toBe(false);
    expect(canCustomiseTheme("free")).toBe(false);
    expect(canCustomiseTheme("none")).toBe(false);
    expect(canCustomiseTheme(null)).toBe(false);
    expect(canCustomiseTheme(undefined)).toBe(false);
    expect(canCustomiseTheme("")).toBe(false);
    // Unknown tiers fall through to locked, no risk of a typo'd plan
    // string accidentally unlocking the feature.
    expect(canCustomiseTheme("enterprise")).toBe(false);
  });
});

describe("getProfileTheme", () => {
  it("returns the matching theme by id", () => {
    expect(getProfileTheme("dark").id).toBe("dark");
    expect(getProfileTheme("warm").id).toBe("warm");
  });

  it("falls back to the default for null, empty, or unknown ids", () => {
    expect(getProfileTheme(null).id).toBe(DEFAULT_PROFILE_THEME);
    expect(getProfileTheme(undefined).id).toBe(DEFAULT_PROFILE_THEME);
    expect(getProfileTheme("").id).toBe(DEFAULT_PROFILE_THEME);
    expect(getProfileTheme("hot-pink-marquee").id).toBe(DEFAULT_PROFILE_THEME);
  });

  it("every theme has tested foreground / background contrast tokens populated", () => {
    for (const t of PROFILE_THEMES) {
      expect(t.bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(t.fg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(t.accent).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("getLabelTheme", () => {
  it("returns the matching theme by id", () => {
    expect(getLabelTheme("dark").id).toBe("dark");
  });

  it("falls back to classic for null / unknown ids", () => {
    expect(getLabelTheme(null).id).toBe(DEFAULT_LABEL_THEME);
    expect(getLabelTheme("rainbow").id).toBe(DEFAULT_LABEL_THEME);
  });

  it("the dark theme flags qrDark so printed labels add a quiet zone behind the code", () => {
    expect(getLabelTheme("dark").qrDark).toBe(true);
    expect(getLabelTheme("classic").qrDark).toBe(false);
  });

  it("every label theme uses absolute hex colours, no relative tokens that would print as black", () => {
    for (const t of LABEL_THEMES) {
      expect(t.bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(t.fg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(t.subtle).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
