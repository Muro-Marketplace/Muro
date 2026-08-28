import { describe, it, expect } from "vitest";
import {
  STAGE_ORDER,
  currentStage,
  nextStage,
  normaliseStatus,
  statusBadgeClass,
  viewerRole,
  type DisplayStatus,
  type PlacementLifecycle,
} from "./status";

// K3: the `arrangementLabel()` block that lived here moved to
// src/lib/arrangement-labels.test.ts along with the function itself — status.ts
// was a SECOND label implementation with a different vocabulary from the module
// that calls itself the single source of truth.
//
// That left this file testing nothing, and the module's other six exports had
// never had a test. Rather than delete the file, they get one: the lifecycle
// helpers below drive what the placement panel shows and who it lets act.

const EMPTY: PlacementLifecycle = { status: "pending" };

describe("normaliseStatus", () => {
  it("maps every known raw status to its display form", () => {
    const cases: Record<string, DisplayStatus> = {
      active: "Active",
      pending: "Pending",
      declined: "Declined",
      cancelled: "Cancelled",
      sold: "Sold",
      completed: "Completed",
      // Owner decision 8a (07 §4.2 item 1). This mapped to "Completed", which is
      // a lie about a paused placement: completed means the arrangement ended,
      // paused means the work is expected back. Zero live rows carry `paused`,
      // so the change is about what a future pause reads as.
      paused: "Paused",
    };
    for (const [raw, expected] of Object.entries(cases)) {
      expect(normaliseStatus(raw), raw).toBe(expected);
    }
  });

  it("is case-insensitive, because legacy rows are capitalised", () => {
    expect(normaliseStatus("Active")).toBe("Active");
    expect(normaliseStatus("PENDING")).toBe("Pending");
  });

  it("defaults an unknown or missing status to Unknown, never to Active", () => {
    // Owner decision 8b (07 §4.2 item 2). The default was "Active", so a row
    // with a status nobody recognised wore the live badge and matched every
    // `displayStatus === "Active"` gate, including the context panel's
    // stage-advance controls whose collected transition cancels paid-loan
    // billing. "Unknown" matches no gate: the row shows its badge and offers
    // nothing until someone looks at it.
    expect(normaliseStatus("nonsense")).toBe("Unknown");
    expect(normaliseStatus(null)).toBe("Unknown");
    expect(normaliseStatus(undefined)).toBe("Unknown");
    expect(normaliseStatus("")).toBe("Unknown");
  });
});

describe("statusBadgeClass", () => {
  it("returns a class string for every display status", () => {
    const statuses: DisplayStatus[] = [
      "Active", "Pending", "Declined", "Cancelled", "Sold", "Completed", "Paused", "Unknown",
    ];
    for (const status of statuses) {
      expect(statusBadgeClass(status), status).toMatch(/\S/);
    }
  });

  it("gives the two negative outcomes the same treatment", () => {
    expect(statusBadgeClass("Cancelled")).toBe(statusBadgeClass("Declined"));
  });

  it("does not dress Unknown as anything that already has a meaning", () => {
    for (const other of ["Active", "Pending", "Completed", "Cancelled"] as const) {
      expect(statusBadgeClass("Unknown"), other).not.toBe(statusBadgeClass(other));
    }
  });

  it("does not dress Paused as Completed or as Active", () => {
    // The whole point of 8a: the old fold meant a paused placement wore the
    // ended-arrangement badge.
    expect(statusBadgeClass("Paused")).not.toBe(statusBadgeClass("Completed"));
    expect(statusBadgeClass("Paused")).not.toBe(statusBadgeClass("Active"));
  });
});

describe("currentStage", () => {
  it("returns null before anything has happened", () => {
    expect(currentStage(EMPTY)).toBeNull();
  });

  it("reads the furthest stage reached, not the first", () => {
    // The checks run latest-first, so a placement that has been accepted,
    // scheduled, installed and gone live reads as "live".
    expect(
      currentStage({
        status: "active",
        acceptedAt: "2026-01-01",
        scheduledFor: "2026-01-02",
        installedAt: "2026-01-03",
        liveFrom: "2026-01-04",
      }),
    ).toBe("live");
  });

  it("walks each stage in order", () => {
    const p: PlacementLifecycle = { status: "active" };
    expect(currentStage({ ...p, acceptedAt: "x" })).toBe("accepted");
    expect(currentStage({ ...p, acceptedAt: "x", scheduledFor: "x" })).toBe("scheduled");
    expect(currentStage({ ...p, acceptedAt: "x", installedAt: "x" })).toBe("installed");
    expect(currentStage({ ...p, acceptedAt: "x", collectedAt: "x" })).toBe("collected");
  });
});

describe("nextStage", () => {
  it("returns null when nothing has started", () => {
    expect(nextStage(EMPTY)).toBeNull();
  });

  it("returns the following stage", () => {
    expect(nextStage({ status: "active", acceptedAt: "x" })).toBe("scheduled");
    expect(nextStage({ status: "active", acceptedAt: "x", scheduledFor: "x" })).toBe("installed");
  });

  it("returns null at the end of the lifecycle rather than wrapping", () => {
    expect(nextStage({ status: "completed", collectedAt: "x" })).toBeNull();
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe("collected");
  });
});

describe("viewerRole", () => {
  it("treats a signed-out viewer as an observer", () => {
    expect(viewerRole({ status: "pending", requesterUserId: "u1" }, null)).toBe("observer");
    expect(viewerRole({ status: "pending", requesterUserId: "u1" }, undefined)).toBe("observer");
  });

  it("names the requester", () => {
    expect(viewerRole({ status: "pending", requesterUserId: "u1" }, "u1")).toBe("requester");
  });

  it("names anyone else as the responder", () => {
    expect(viewerRole({ status: "pending", requesterUserId: "u1" }, "u2")).toBe("responder");
  });

  it("falls back to responder when the requester is unknown", () => {
    // Legacy rows have no requester recorded. Reading them as "responder" means
    // the panel offers Accept/Decline rather than "waiting on the other side",
    // which is the recoverable direction: a wrong "waiting" strands the
    // placement with nobody able to move it.
    expect(viewerRole({ status: "pending" }, "u1")).toBe("responder");
    expect(viewerRole({ status: "pending", requesterUserId: null }, "u1")).toBe("responder");
  });
});
