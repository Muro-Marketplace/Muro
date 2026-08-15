// @vitest-environment jsdom
// 05 (authFetch->mutate). advance() and undoStage() PATCH /api/placements and used a
// manual res.ok check, dispatching the cross-portal wallplace:placement-changed event
// inside the success block. They now go through mutate (throws on a non-2xx), so a
// rejected advance surfaces the error and does NOT fire the event or onChange; a
// confirmed 2xx advances + fires once. This pins advance() (a direct-stamp stage).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, mutate: mutateMock };
});
vi.mock("@/context/ConfirmContext", () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));

import PlacementStepper from "./PlacementStepper";
import { ApiError } from "@/lib/api-client";

// status active + scheduled already stamped -> the next advanceable stage is "installed",
// which stamps immediately (unlike "scheduled", which opens a date picker).
const PLACEMENT = {
  id: "p1",
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  acceptedAt: "2026-01-02T00:00:00Z",
  scheduledFor: "2026-01-03T12:00:00Z",
};

let eventSpy: ReturnType<typeof vi.fn>;

afterEach(() => {
  window.removeEventListener("wallplace:placement-changed", eventSpy);
  cleanup();
});
beforeEach(() => {
  mutateMock.mockReset();
  eventSpy = vi.fn();
  window.addEventListener("wallplace:placement-changed", eventSpy);
});

describe("PlacementStepper advance (05 mutate)", () => {
  it("surfaces the error and fires neither onChange nor the event when the advance fails", async () => {
    mutateMock.mockRejectedValue(new ApiError(403, "Not allowed", "Not allowed", {}));
    const onChange = vi.fn();

    render(<PlacementStepper placement={PLACEMENT} canAdvance onChange={onChange} />);
    fireEvent.click(screen.getByText("Mark installed"));

    expect(await screen.findByText("Not allowed")).toBeTruthy();
    // Fail-before: the old code dispatched the event / advanced regardless of res.ok.
    expect(onChange).not.toHaveBeenCalled();
    expect(eventSpy).not.toHaveBeenCalled();
    expect(mutateMock).toHaveBeenCalledWith("/api/placements", expect.objectContaining({ method: "PATCH" }));
  });

  it("advances and fires onChange + the event once on a confirmed 2xx", async () => {
    mutateMock.mockResolvedValue({});
    const onChange = vi.fn();

    render(<PlacementStepper placement={PLACEMENT} canAdvance onChange={onChange} />);
    fireEvent.click(screen.getByText("Mark installed"));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0].installedAt).toBeTruthy();
    expect(eventSpy).toHaveBeenCalledTimes(1);
  });
});
