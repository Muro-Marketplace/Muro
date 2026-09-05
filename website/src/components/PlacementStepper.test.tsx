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

// Row 727 / PASS2-placement-lifecycle-log. After a GBP 120 off-the-wall sale
// the placement went to `sold` and every stage control vanished for both
// parties, leaving the bar at 5 of 6 with "Collected" out of reach forever.
// Only the closing stage is offered from `sold`; the API refuses the rest.
describe("PlacementStepper on a SOLD placement (row 727)", () => {
  const sold = {
    id: "pl-sold",
    status: "sold",
    createdAt: "2026-08-01T10:00:00.000Z",
    acceptedAt: "2026-08-01T11:00:00.000Z",
    scheduledFor: "2026-08-02T12:00:00.000Z",
    installedAt: "2026-08-03T12:00:00.000Z",
    liveFrom: "2026-08-04T12:00:00.000Z",
    collectedAt: null,
  };

  it("still offers the closing stage so the loan can be shut", () => {
    render(<PlacementStepper placement={sold} canAdvance />);

    expect(screen.getByRole("button", { name: /Mark collected/i })).toBeTruthy();
  });

  it("offers nothing once the collection has been recorded", () => {
    render(
      <PlacementStepper
        placement={{ ...sold, status: "completed", collectedAt: "2026-08-10T12:00:00.000Z" }}
        canAdvance
      />,
    );

    expect(screen.queryByRole("button", { name: /Mark collected/i })).toBeNull();
  });
});

// Row 2167 / PASS2 "silent failure" pattern. Typing a past install date and
// pressing Confirm did nothing visible: the picker rejects it and the API
// refuses it with `400 {"error":"Install date can't be in the past."}`, and
// neither message had anywhere to render. The only two error slots sat in the
// advance and undo rows, which the open picker replaces.
describe("PlacementStepper install-date refusal is visible (row 2167)", () => {
  const active = {
    id: "pl-1",
    status: "active",
    createdAt: "2026-08-01T10:00:00.000Z",
    acceptedAt: "2026-08-01T11:00:00.000Z",
    scheduledFor: null,
    installedAt: null,
    liveFrom: null,
    collectedAt: null,
  };

  it("shows the reason when the chosen date is in the past", async () => {
    render(<PlacementStepper placement={active} canAdvance />);

    fireEvent.click(screen.getByRole("button", { name: /Schedule install/i }));
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Install date can't be in the past/i);
  });

  it("leaves the picker open so the date can be corrected", async () => {
    render(<PlacementStepper placement={active} canAdvance />);

    fireEvent.click(screen.getByRole("button", { name: /Schedule install/i }));
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));

    await screen.findByRole("alert");
    expect(document.querySelector('input[type="date"]')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Migration 136: the planned end date.
//
// The control is deliberately party-agnostic: the API authorises the artist
// and the venue identically, so the component gates on `canAdvance` alone and
// there is no branch here that could favour one side. The both-parties
// property is pinned in the route's own suite; what these pin is that the date
// reads correctly, saves, clears, and never claims the placement will end
// itself.
// ─────────────────────────────────────────────────────────────────────────────
describe("PlacementStepper end date (migration 136)", () => {
  const ACCEPTED = {
    id: "p1",
    status: "active",
    createdAt: "2026-04-01T00:00:00Z",
    acceptedAt: "2026-04-02T00:00:00Z",
    scheduledFor: "2026-04-03T12:00:00Z",
  };

  it("reads Open ended when no date is set", () => {
    render(<PlacementStepper placement={ACCEPTED} canAdvance />);
    expect(screen.getByText("Open ended")).toBeTruthy();
  });

  it("names the date when one is set", () => {
    render(<PlacementStepper placement={{ ...ACCEPTED, endDate: "2026-09-30" }} canAdvance />);
    expect(screen.getByText("Ends on 30 September 2026")).toBeTruthy();
  });

  it("says nothing about an end date before the placement is accepted", () => {
    // Nothing has been agreed yet, so there is no shared intention to show.
    render(<PlacementStepper placement={{ id: "p1", status: "pending", createdAt: "2026-04-01T00:00:00Z" }} canAdvance />);
    expect(screen.queryByText("Open ended")).toBeNull();
    expect(screen.queryByText("Set end date")).toBeNull();
  });

  it("shows the date but no control to a viewer who cannot act", () => {
    render(<PlacementStepper placement={{ ...ACCEPTED, endDate: "2026-09-30" }} canAdvance={false} />);
    expect(screen.getByText("Ends on 30 September 2026")).toBeTruthy();
    expect(screen.queryByText("Change end date")).toBeNull();
  });

  it("saves a picked date, fires onChange and the cross-portal event once", async () => {
    mutateMock.mockResolvedValue({ success: true, end_date: "2026-09-30" });
    const onChange = vi.fn();
    render(<PlacementStepper placement={ACCEPTED} canAdvance onChange={onChange} />);

    fireEvent.click(screen.getByText("Set end date"));
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(mutateMock).toHaveBeenCalledWith("/api/placements", {
      method: "PATCH",
      body: JSON.stringify({ id: "p1", endDate: "2026-09-30" }),
    });
    expect(onChange.mock.calls[0][0]).toMatchObject({ endDate: "2026-09-30" });
    expect(eventSpy).toHaveBeenCalledTimes(1);
  });

  it("clears back to open ended with an explicit null, not an omitted field", async () => {
    // Fail-before: sending `{}` or an empty string would leave the old date in
    // place, because the API treats a missing endDate as "no change".
    mutateMock.mockResolvedValue({ success: true, end_date: null });
    const onChange = vi.fn();
    render(<PlacementStepper placement={{ ...ACCEPTED, endDate: "2026-09-30" }} canAdvance onChange={onChange} />);

    fireEvent.click(screen.getByText("Change end date"));
    fireEvent.click(screen.getByText("Clear"));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(mutateMock).toHaveBeenCalledWith("/api/placements", {
      method: "PATCH",
      body: JSON.stringify({ id: "p1", endDate: null }),
    });
    expect(onChange.mock.calls[0][0].endDate).toBeNull();
  });

  it("offers no Clear button when the placement is already open ended", () => {
    render(<PlacementStepper placement={ACCEPTED} canAdvance />);
    fireEvent.click(screen.getByText("Set end date"));
    expect(screen.queryByText("Clear")).toBeNull();
  });

  it("surfaces a rejected save and fires neither onChange nor the event", async () => {
    mutateMock.mockRejectedValue(
      new ApiError(400, "End date can't be before the placement was created.", "End date can't be before the placement was created.", {}),
    );
    const onChange = vi.fn();
    render(<PlacementStepper placement={ACCEPTED} canAdvance onChange={onChange} />);

    fireEvent.click(screen.getByText("Set end date"));
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-03-01" } });
    fireEvent.click(screen.getByText("Save"));

    expect(await screen.findByText("End date can't be before the placement was created.")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(eventSpy).not.toHaveBeenCalled();
  });

  it("floors the picker at the day the placement was created", () => {
    render(<PlacementStepper placement={ACCEPTED} canAdvance />);
    fireEvent.click(screen.getByText("Set end date"));
    expect(screen.getByLabelText("End date").getAttribute("min")).toBe("2026-04-01");
  });

  it("keeps the end date out of the stage row, so it is not mistaken for a stage", () => {
    // It is a plan, not a step: putting it in the six-step bar would imply the
    // placement advances to it on its own.
    render(<PlacementStepper placement={{ ...ACCEPTED, endDate: "2026-09-30" }} canAdvance />);
    const steps = screen.getAllByRole("listitem").map((li) => li.textContent || "");
    expect(steps.some((t) => t.includes("30 September 2026"))).toBe(false);
  });

  it("does not tell either party the placement will end itself", () => {
    render(<PlacementStepper placement={ACCEPTED} canAdvance />);
    fireEvent.click(screen.getByText("Set end date"));
    const copy = document.body.textContent || "";
    expect(copy).toContain("remind you both");
    expect(copy.toLowerCase()).not.toContain("will end automatically");
    // Public copy rules: no em or en dashes anywhere the user reads.
    expect(copy).not.toMatch(/[—–]/);
  });
});

describe("both placement pages pass the end date to the stepper", () => {
  // The requirement is that the control appears on the artist AND the venue
  // placement page. Neither page has a render test (they are ~2,000-line
  // client pages), so this reads the source: a stepper rendered without
  // `endDate` would silently show "Open ended" forever on a placement that
  // has one.
  const PORTAL_PAGES = [
    "src/app/(pages)/artist-portal/placements/page.tsx",
    "src/app/(pages)/venue-portal/placements/page.tsx",
  ];

  it("maps end_date off the API row and feeds it to every PlacementStepper", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    for (const rel of PORTAL_PAGES) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(source, `${rel} never reads end_date off the row`).toContain("p.end_date");
      const stepperUsages = source.split("<PlacementStepper").length - 1;
      const endDateProps = source.split("endDate: p.endDate").length - 1;
      expect(endDateProps, `${rel}: ${stepperUsages} steppers, ${endDateProps} passed an endDate`)
        .toBe(stepperUsages);
    }
  });
});
