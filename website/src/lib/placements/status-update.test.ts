// @vitest-environment jsdom
// E43-a. Both placement portals used to optimistically set the row, never check
// res.ok (authFetch resolves for non-2xx), and dispatch the cross-portal
// `wallplace:placement-changed` event even on a 403/500 — so a rejected change
// looked successful on both portals with no rollback. updatePlacementStatus is
// the single shared implementation; these tests pin the three paths.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));

import { updatePlacementStatus, apiStatusFor } from "./status-update";

type Row = { id: string; status: string; note?: string };

let eventSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  authFetchMock.mockReset();
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

  it("on a non-2xx response: rolls back, toasts, and does NOT fire the event", async () => {
    authFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "not allowed" }), { status: 403 }),
    );
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
    authFetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
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

  it("on a network error: rolls back, toasts, and does NOT fire the event", async () => {
    authFetchMock.mockRejectedValue(new Error("offline"));
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
