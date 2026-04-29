// Covers tests #4 and #5 from docs/security/AUDIT.md §3.4:
//   4. Requester cannot accept their own placement
//   5. Counter offerer cannot accept their own counter
// Plus the full matrix of cases canRespond() has to handle.

import { describe, expect, it } from "vitest";
import { canRespond, isRequester, type PlacementPermissionInput } from "./placement-permissions";

const ARTIST = "user-artist";
const VENUE = "user-venue";
const OTHER = "user-other";

describe("canRespond()", () => {
  const basePending: PlacementPermissionInput = {
    status: "pending",
    artist_user_id: ARTIST,
    venue_user_id: VENUE,
    requester_user_id: null,
  };

  describe("core rule, only pending can be responded to", () => {
    for (const bad of ["active", "declined", "completed", "cancelled", "sold", "", null] as const) {
      it(`rejects status=${String(bad)}`, () => {
        const p = { ...basePending, status: bad, requester_user_id: VENUE };
        expect(canRespond(p, ARTIST)).toBe(false);
      });
    }
  });

  describe("with explicit requester_user_id", () => {
    it("requester themselves cannot respond to their own request", () => {
      const p = { ...basePending, requester_user_id: VENUE };
      expect(canRespond(p, VENUE)).toBe(false);
    });

    it("the other party CAN respond", () => {
      const p = { ...basePending, requester_user_id: VENUE };
      expect(canRespond(p, ARTIST)).toBe(true);
    });

    it("a third party (neither artist nor venue) cannot respond", () => {
      const p = { ...basePending, requester_user_id: VENUE };
      expect(canRespond(p, OTHER)).toBe(false);
    });

    it("covers artist-initiated too (artist = requester)", () => {
      const p = { ...basePending, requester_user_id: ARTIST };
      expect(canRespond(p, ARTIST)).toBe(false);
      expect(canRespond(p, VENUE)).toBe(true);
    });

    it("counter flip: after counter, the new requester_user_id is the counter-er", () => {
      // Test #5: if ARTIST counters, they become the new requester.
      // They must not be able to accept their own counter, and VENUE must.
      const countered = { ...basePending, requester_user_id: ARTIST };
      expect(canRespond(countered, ARTIST)).toBe(false);
      expect(canRespond(countered, VENUE)).toBe(true);
    });
  });

  describe("legacy rows (NULL requester_user_id)", () => {
    it("refuses when the requester is unknown (safer than guessing)", () => {
      const legacy = { ...basePending, requester_user_id: null };
      expect(canRespond(legacy, ARTIST)).toBe(false);
      expect(canRespond(legacy, VENUE)).toBe(false);
    });
  });

  describe("guard edge cases", () => {
    it("returns false for empty/null userId", () => {
      const p = { ...basePending, requester_user_id: VENUE };
      expect(canRespond(p, null)).toBe(false);
      expect(canRespond(p, undefined)).toBe(false);
      expect(canRespond(p, "")).toBe(false);
    });

    it("case-insensitive on status", () => {
      const p = { ...basePending, status: "PENDING" as string, requester_user_id: VENUE };
      expect(canRespond(p, ARTIST)).toBe(true);
    });
  });
});

describe("isRequester()", () => {
  it("true when user matches requester_user_id", () => {
    expect(isRequester({ requester_user_id: ARTIST }, ARTIST)).toBe(true);
  });

  it("false when user mismatches", () => {
    expect(isRequester({ requester_user_id: ARTIST }, VENUE)).toBe(false);
  });

  it("false when requester_user_id is null (legacy)", () => {
    expect(isRequester({ requester_user_id: null }, ARTIST)).toBe(false);
  });

  it("false when userId is null/undefined/empty", () => {
    const p = { requester_user_id: ARTIST };
    expect(isRequester(p, null)).toBe(false);
    expect(isRequester(p, undefined)).toBe(false);
    expect(isRequester(p, "")).toBe(false);
  });
});
