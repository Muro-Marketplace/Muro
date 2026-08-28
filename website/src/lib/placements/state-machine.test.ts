import { describe, it, expect } from "vitest";
import {
  canPlacementTransition,
  PLACEMENT_STATUSES,
  PLACEMENT_TERMINAL_STATUSES,
} from "./state-machine";
import type { RawStatus } from "./status";

// 01-authz-idor.md Phase A task 2. Prod status distribution recorded before the
// transition table was written (uwkuhygwvasdzwsusiym, 2026-07-29):
//   active 37, pending 33, cancelled 7, declined 5, completed 4
//   (no paused and no sold rows, though both are recognised by the code)

describe("canPlacementTransition", () => {
  it("allows the forward path a placement actually takes", () => {
    expect(canPlacementTransition("pending", "active")).toEqual({ ok: true });
    expect(canPlacementTransition("active", "completed")).toEqual({ ok: true });
    expect(canPlacementTransition("active", "paused")).toEqual({ ok: true });
    expect(canPlacementTransition("paused", "active")).toEqual({ ok: true });
  });

  it("allows declining and cancelling from the states that permit it", () => {
    expect(canPlacementTransition("pending", "declined")).toEqual({ ok: true });
    expect(canPlacementTransition("pending", "cancelled")).toEqual({ ok: true });
    expect(canPlacementTransition("active", "cancelled")).toEqual({ ok: true });
    expect(canPlacementTransition("paused", "cancelled")).toEqual({ ok: true });
    expect(canPlacementTransition("declined", "cancelled")).toEqual({ ok: true });
  });

  it("re-opens a declined placement only back to pending (E20)", () => {
    // The counter path re-opens the negotiation and flips who has to accept.
    expect(canPlacementTransition("declined", "pending")).toEqual({ ok: true });
    // The direct jump is what let a rejected requester force their own deal
    // live. It must stay closed.
    const denied = canPlacementTransition("declined", "active");
    expect(denied.ok).toBe(false);
    expect(denied.ok === false && denied.reason).toContain("declined");
  });

  it("treats completed, cancelled and sold as terminal", () => {
    for (const terminal of PLACEMENT_TERMINAL_STATUSES) {
      for (const target of PLACEMENT_STATUSES) {
        if (target === terminal) continue; // same-status is an idempotent no-op
        const result = canPlacementTransition(terminal, target);
        expect(result.ok, `${terminal} -> ${target} should be refused`).toBe(false);
      }
    }
  });

  it("rejects an unknown status on either side", () => {
    const from = canPlacementTransition("archived", "active");
    expect(from.ok).toBe(false);
    expect(from.ok === false && from.reason).toContain("Unknown current status");

    const to = canPlacementTransition("pending", "archived");
    expect(to.ok).toBe(false);
    expect(to.ok === false && to.reason).toContain("Unknown target status");
  });

  it("rejects null and undefined as the current status", () => {
    expect(canPlacementTransition(null, "active").ok).toBe(false);
    expect(canPlacementTransition(undefined, "active").ok).toBe(false);
  });

  it("is case-insensitive about the current status, since rows are free text", () => {
    // placements.status has NO check constraint in prod, so stored casing is
    // not guaranteed.
    expect(canPlacementTransition("PENDING", "active")).toEqual({ ok: true });
    expect(canPlacementTransition("Active", "completed")).toEqual({ ok: true });
  });

  it("treats a no-op as allowed, leaving idempotency to the caller", () => {
    for (const status of PLACEMENT_STATUSES) {
      expect(canPlacementTransition(status, status)).toEqual({ ok: true });
    }
  });
});

describe("vocabulary alignment with status.ts", () => {
  it("covers every RawStatus the rest of the code recognises", () => {
    // status.ts calls itself the single source of truth for placement status, so
    // the transition table must key on the same union or the two will drift.
    // This is a compile-time check made explicit at runtime.
    const declared: RawStatus[] = [
      "pending",
      "active",
      "declined",
      "completed",
      "sold",
      "paused",
      "cancelled",
    ];
    expect([...PLACEMENT_STATUSES].sort()).toEqual([...declared].sort());
  });
});
