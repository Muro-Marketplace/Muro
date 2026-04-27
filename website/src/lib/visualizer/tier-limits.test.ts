// Tier limits drive every visualizer entitlement decision. We test:
//   - the approved table values are returned for each tier
//   - env overrides take precedence
//   - unknown tiers fail closed (guest limits)
//   - Pro is the only showroom-eligible tier
//   - sentinel values (-1 = unlimited) are preserved

import { afterEach, describe, expect, it } from "vitest";
import {
  ACTION_COSTS,
  TIER_DISPLAY_ORDER,
  TIER_LABELS,
  getDefaultTierLimits,
  getTierLimits,
} from "./tier-limits";
import type { VisualizerTier } from "./types";

describe("getTierLimits — approved values", () => {
  it("guest = zero everything", () => {
    expect(getTierLimits("guest")).toEqual({
      daily: 0,
      monthly: 0,
      wall_uploads_daily: 0,
      saved_walls: 0,
      saved_layouts_per_wall: 0,
      can_publish_showroom: false,
    });
  });

  it("customer = 2/30, 1 saved wall", () => {
    const l = getTierLimits("customer");
    expect(l.daily).toBe(2);
    expect(l.monthly).toBe(30);
    expect(l.saved_walls).toBe(1);
    expect(l.can_publish_showroom).toBe(false);
  });

  it("artist_core = 3/50, 2 saved walls", () => {
    const l = getTierLimits("artist_core");
    expect(l.daily).toBe(3);
    expect(l.monthly).toBe(50);
    expect(l.saved_walls).toBe(2);
  });

  it("artist_premium = 10/200, 5 saved walls", () => {
    const l = getTierLimits("artist_premium");
    expect(l.daily).toBe(10);
    expect(l.monthly).toBe(200);
    expect(l.saved_walls).toBe(5);
  });

  it("artist_pro = unlimited daily/monthly + walls + showroom", () => {
    const l = getTierLimits("artist_pro");
    // Switched to per-artwork in 5334417 — Pro now bypasses the daily/
    // monthly cap entirely (sentinel -1).
    expect(l.daily).toBe(-1);
    expect(l.monthly).toBe(-1);
    expect(l.saved_walls).toBe(-1);
    expect(l.saved_layouts_per_wall).toBe(-1);
    expect(l.can_publish_showroom).toBe(true);
  });

  it("venue_standard = 5/100", () => {
    const l = getTierLimits("venue_standard");
    expect(l.daily).toBe(5);
    expect(l.monthly).toBe(100);
    expect(l.saved_walls).toBe(3);
  });

  it("venue_premium = unlimited daily/monthly + walls (no showroom)", () => {
    const l = getTierLimits("venue_premium");
    // Switched to per-artwork in 5334417 — Venue Premium now bypasses
    // the daily/monthly cap entirely (sentinel -1).
    expect(l.daily).toBe(-1);
    expect(l.monthly).toBe(-1);
    expect(l.saved_walls).toBe(-1);
    expect(l.can_publish_showroom).toBe(false);
  });
});

describe("getTierLimits — env overrides", () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("env can lower the daily cap", () => {
    process.env.VISUALIZER_LIMIT_ARTIST_PREMIUM_DAILY = "5";
    expect(getTierLimits("artist_premium").daily).toBe(5);
  });

  it("env can raise the monthly cap", () => {
    process.env.VISUALIZER_LIMIT_VENUE_STANDARD_MONTHLY = "999";
    expect(getTierLimits("venue_standard").monthly).toBe(999);
  });

  it("env override of upload cap", () => {
    process.env.VISUALIZER_LIMIT_ARTIST_PRO_UPLOADS_DAILY = "50";
    expect(getTierLimits("artist_pro").wall_uploads_daily).toBe(50);
  });

  it("ignores non-numeric env values", () => {
    process.env.VISUALIZER_LIMIT_CUSTOMER_DAILY = "many";
    expect(getTierLimits("customer").daily).toBe(2); // back to default
  });

  it("ignores negative env values", () => {
    process.env.VISUALIZER_LIMIT_CUSTOMER_DAILY = "-5";
    expect(getTierLimits("customer").daily).toBe(2);
  });
});

describe("unknown tier handling", () => {
  it("falls back to guest limits", () => {
    // Cast — runtime can hand us anything if a stale token survives a deploy.
    const limits = getTierLimits("ghost" as unknown as VisualizerTier);
    expect(limits.daily).toBe(0);
    expect(limits.can_publish_showroom).toBe(false);
  });
});

describe("getDefaultTierLimits", () => {
  it("returns the static defaults regardless of env", () => {
    const ORIGINAL = { ...process.env };
    try {
      process.env.VISUALIZER_LIMIT_CUSTOMER_DAILY = "999";
      // env-aware
      expect(getTierLimits("customer").daily).toBe(999);
      // env-free
      expect(getDefaultTierLimits("customer").daily).toBe(2);
    } finally {
      process.env = { ...ORIGINAL };
    }
  });
});

describe("display order + labels", () => {
  it("includes every tier", () => {
    expect(TIER_DISPLAY_ORDER).toContain("guest");
    expect(TIER_DISPLAY_ORDER).toContain("artist_pro");
    expect(TIER_DISPLAY_ORDER).toContain("venue_premium");
  });

  it("has a label for every tier", () => {
    for (const t of TIER_DISPLAY_ORDER) {
      expect(TIER_LABELS[t]).toBeDefined();
      expect(TIER_LABELS[t].length).toBeGreaterThan(0);
    }
  });
});

describe("ACTION_COSTS", () => {
  it("HD costs more than standard", () => {
    expect(ACTION_COSTS.render_hd).toBeGreaterThan(ACTION_COSTS.render_standard);
  });

  it("standard render costs 1 unit", () => {
    expect(ACTION_COSTS.render_standard).toBe(1);
  });

  it("wall upload costs 1 unit", () => {
    expect(ACTION_COSTS.wall_upload).toBe(1);
  });
});
