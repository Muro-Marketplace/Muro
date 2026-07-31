// @vitest-environment jsdom
// E43-a. Both placement portals used to optimistically set the row, never check
// res.ok (authFetch resolves for non-2xx), and dispatch the cross-portal
// `wallplace:placement-changed` event even on a 403/500 — so a rejected change
// looked successful on both portals with no rollback. updatePlacementStatus is
// the single shared implementation; these tests pin the three paths.
//
// 05 (authFetch->mutate). The helper now calls mutate(), which throws ApiError on
// a non-2xx and NetworkError on a dropped request, so the manual res.ok check is
// gone. These tests drive mutate's reject/resolve instead of a raw Response.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, mutate: mutateMock };
});

import { updatePlacementStatus, apiStatusFor } from "./status-update";
import { ApiError } from "@/lib/api-client";

type Row = { id: string; status: string; note?: string };

let eventSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mutateMock.mockReset();
  eventSpy = vi.fn();
  window.addEventListener("wallplace:placement-changed", eventSpy);
});
afterEach(() => {
  window.removeEventListener("wallplace:placement-changed", eventSpy);
});

describe("apiStatusFor", () => {
  it("maps display statuses to the API's lowercase form, defaulting to active", () => {
    expect(apiStatusFor("Declined")).toBe("declined");
    expect(apiStatusFor("Sold")).toBe("completed");
    expect(apiStatusFor("Nonsense")).toBe("active");
  });
});

describe("updatePlacementStatus (E43-a)", () => {
  const rows: Row[] = [
    { id: "p1", status: "Pending", note: "keep me" },
    { id: "p2", status: "Active" },
  ];

  it("on an ApiError (non-2xx): rolls back, toasts the server reason, no event", async () => {
    mutateMock.mockRejectedValue(new ApiError(403, "not allowed", "forbidden", { error: "not allowed" }));
    const setPlacements = vi.fn();
    const showToast = vi.fn();

    const ok = await updatePlacementStatus<Row>({
      id: "p1",
      newStatus: "Active",
      placements: rows,
      setPlacements,
      showToast,
    });

    expect(ok).toBe(false);
    // Optimistic write first (p1 -> Active), then rollback to the exact snapshot.
    expect(setPlacements).toHaveBeenCalledTimes(2);
    expect(setPlacements.mock.calls[0][0][0]).toMatchObject({ id: "p1", status: "Active" });
    expect(setPlacements).toHaveBeenLastCalledWith(rows); // same array reference = full rollback
    // Fail-before: the old code dispatched here regardless of res.ok.
    expect(eventSpy).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("not allowed", { variant: "error" });
  });

  it("on success: keeps the optimistic write, fires the event once, no toast", async () => {
    mutateMock.mockResolvedValue({});
    const setPlacements = vi.fn();
    const showToast = vi.fn();

    const ok = await updatePlacementStatus<Row>({
      id: "p2",
      newStatus: "Completed",
      placements: rows,
      setPlacements,
      showToast,
    });

    expect(ok).toBe(true);
    expect(setPlacements).toHaveBeenCalledTimes(1); // optimistic only, no rollback
    expect(eventSpy).toHaveBeenCalledTimes(1);
    const detail = (eventSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({ placementId: "p2", action: "status" });
    expect(showToast).not.toHaveBeenCalled();
  });

  it("on a network error (non-ApiError reject): rolls back, generic toast, no event", async () => {
    mutateMock.mockRejectedValue(new Error("offline"));
    const setPlacements = vi.fn();
    const showToast = vi.fn();

    const ok = await updatePlacementStatus<Row>({
      id: "p1",
      newStatus: "Declined",
      placements: rows,
      setPlacements,
      showToast,
    });

    expect(ok).toBe(false);
    expect(setPlacements).toHaveBeenLastCalledWith(rows);
    expect(eventSpy).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Network error, status not updated. Please try again.",
      { variant: "error" },
    );
  });
});
