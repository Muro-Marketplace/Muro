// Migration 136. The end date is the only forward-looking date on
// `placements`, so its rules are the ones nothing else in the codebase
// already encodes: null means open ended, a date before the row existed is a
// typo, and a plain DATE must not drift a day when it is formatted.

import { describe, expect, it } from "vitest";
import {
  endDateLabel,
  formatEndDate,
  isPlainDate,
  plainDateInDays,
  toPlainDate,
  validateEndDate,
} from "./end-date";

describe("isPlainDate", () => {
  it("accepts a YYYY-MM-DD calendar day", () => {
    expect(isPlainDate("2026-05-08")).toBe(true);
    expect(isPlainDate("2028-02-29")).toBe(true); // a real leap day
  });

  it("rejects a day that does not exist", () => {
    // The regex alone passes this; the round trip is what catches it.
    expect(isPlainDate("2026-02-31")).toBe(false);
    expect(isPlainDate("2026-02-29")).toBe(false); // 2026 is not a leap year
    expect(isPlainDate("2026-13-01")).toBe(false);
    expect(isPlainDate("2026-00-10")).toBe(false);
  });

  it("rejects anything that is not a bare date string", () => {
    expect(isPlainDate("2026-05-08T12:00:00Z")).toBe(false);
    expect(isPlainDate("08/05/2026")).toBe(false);
    expect(isPlainDate("")).toBe(false);
    expect(isPlainDate(null)).toBe(false);
    expect(isPlainDate(undefined)).toBe(false);
    expect(isPlainDate(20260508)).toBe(false);
    expect(isPlainDate({ toString: () => "2026-05-08" })).toBe(false);
  });
});

describe("toPlainDate", () => {
  it("reads the UTC day out of an ISO timestamp", () => {
    expect(toPlainDate("2026-05-08T23:30:00.000Z")).toBe("2026-05-08");
  });

  it("passes a plain date straight through", () => {
    expect(toPlainDate("2026-05-08")).toBe("2026-05-08");
  });

  it("returns null for null, undefined and unparseable input", () => {
    expect(toPlainDate(null)).toBeNull();
    expect(toPlainDate(undefined)).toBeNull();
    expect(toPlainDate("not a date")).toBeNull();
  });
});

describe("validateEndDate", () => {
  const CREATED = "2026-04-01T09:00:00.000Z";

  it("accepts null, because open ended is a legitimate placement", () => {
    expect(validateEndDate(null, CREATED)).toEqual({ ok: true, value: null });
  });

  it("accepts a plain date on or after the day the placement was created", () => {
    expect(validateEndDate("2026-04-01", CREATED)).toEqual({ ok: true, value: "2026-04-01" });
    expect(validateEndDate("2026-09-30", CREATED)).toEqual({ ok: true, value: "2026-09-30" });
  });

  it("refuses a date before the placement was created", () => {
    const result = validateEndDate("2026-03-31", CREATED);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining("before the placement") });
  });

  it("refuses a timestamp, a malformed string and a non-string", () => {
    for (const bad of ["2026-05-08T12:00:00Z", "8 May 2026", "2026-02-31", 5, undefined]) {
      const result = validateEndDate(bad, CREATED);
      expect(result.ok, `${String(bad)} should be refused`).toBe(false);
    }
  });

  it("allows a past date that is still after creation, so an overrun can be recorded", () => {
    expect(validateEndDate("2026-04-02", CREATED)).toEqual({ ok: true, value: "2026-04-02" });
  });

  it("validates without a created_at rather than refusing outright", () => {
    // A legacy row with no created_at must still be settable; the shape check
    // is the part that matters.
    expect(validateEndDate("2026-05-08", null)).toEqual({ ok: true, value: "2026-05-08" });
    expect(validateEndDate("nonsense", null).ok).toBe(false);
  });
});

describe("formatEndDate", () => {
  it("formats as a British long date", () => {
    expect(formatEndDate("2026-05-08")).toBe("8 May 2026");
  });

  it("does not slip a day for a reader west of Greenwich", () => {
    // Fail-before: formatting `new Date("2026-05-08")` without pinning the
    // zone renders 7 May in a negative-offset environment, so the reminder
    // names the wrong day. Also covers 29 Feb, which the naive parse mangles.
    const original = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(formatEndDate("2026-05-08")).toBe("8 May 2026");
      expect(formatEndDate("2026-01-01")).toBe("1 January 2026");
      expect(formatEndDate("2028-02-29")).toBe("29 February 2028");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("returns null for an unset or malformed date", () => {
    expect(formatEndDate(null)).toBeNull();
    expect(formatEndDate(undefined)).toBeNull();
    expect(formatEndDate("2026-02-31")).toBeNull();
  });
});

describe("endDateLabel", () => {
  it("names the date when there is one", () => {
    expect(endDateLabel("2026-05-08")).toBe("Ends on 8 May 2026");
  });

  it("reads Open ended when unset", () => {
    expect(endDateLabel(null)).toBe("Open ended");
    expect(endDateLabel(undefined)).toBe("Open ended");
    expect(endDateLabel("")).toBe("Open ended");
  });

  it("never implies the placement ends itself", () => {
    // The migration is explicit that reaching the date changes nothing, so the
    // copy must not promise otherwise.
    for (const label of [endDateLabel("2026-05-08"), endDateLabel(null)]) {
      expect(label.toLowerCase()).not.toContain("will end");
      expect(label.toLowerCase()).not.toContain("automatically");
      expect(label).not.toMatch(/[—–]/);
    }
  });
});

describe("plainDateInDays", () => {
  it("counts whole UTC days forward from the given day", () => {
    expect(plainDateInDays(14, new Date("2026-04-24T23:59:00.000Z"))).toBe("2026-05-08");
    expect(plainDateInDays(0, new Date("2026-04-24T00:00:01.000Z"))).toBe("2026-04-24");
  });

  it("crosses a month and a year boundary", () => {
    expect(plainDateInDays(14, new Date("2026-12-25T12:00:00.000Z"))).toBe("2027-01-08");
  });

  it("ignores the time of day, so two runs on the same day agree", () => {
    const morning = plainDateInDays(14, new Date("2026-04-24T00:05:00.000Z"));
    const evening = plainDateInDays(14, new Date("2026-04-24T22:05:00.000Z"));
    expect(morning).toBe(evening);
  });
});
