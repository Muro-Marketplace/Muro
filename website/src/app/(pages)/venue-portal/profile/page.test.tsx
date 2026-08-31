// @vitest-environment jsdom
// E42-a. The venue detail rows bound a display fallback ("Not set" / "Your Venue")
// straight into the controlled <input value>, so entering edit mode seeded the field
// with "Not set" and the first keystroke produced "Not setCafe". The input value is
// now the editable state only; the fallback is display-only.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mutateMock, venueState, unsavedWarningMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  venueState: { venue: null as unknown },
  unsavedWarningMock: vi.fn(),
}));

vi.mock("@/hooks/useCurrentVenue", () => ({ useCurrentVenue: () => ({ venue: venueState.venue, refetch: vi.fn() }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// 05: the profile PUT goes through mutate now (throws on a non-2xx).
vi.mock("@/lib/api-client", () => ({ mutate: mutateMock }));
vi.mock("@/lib/upload", () => ({ uploadImage: vi.fn(async () => "https://cdn/x.png") }));
vi.mock("@/lib/use-unsaved-warning", () => ({ useUnsavedWarning: unsavedWarningMock }));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("next/image", () => ({ default: () => null }));

import VenueProfilePage from "./page";

afterEach(() => cleanup());
beforeEach(() => {
  mutateMock.mockReset();
  unsavedWarningMock.mockReset();
  mutateMock.mockResolvedValue({});
  // A venue with a name but NO type — the row whose value used to fall to "Not set".
  venueState.venue = { name: "Kings Arms", type: undefined, location: "London" };
});

describe("venue profile editing (E42-a)", () => {
  it("does not seed the input with 'Not set', and saves the typed value (not 'Not setCafe')", async () => {
    render(<VenueProfilePage />);

    // Enter edit mode on the details section (its Edit button is the first one).
    fireEvent.click(screen.getAllByText("Edit")[0]);

    const typeInput = screen.getByPlaceholderText("e.g. Independent cafe") as HTMLInputElement;
    // Fail-before: value was `detailType || venue?.type || "Not set"` -> "Not set".
    expect(typeInput.value).toBe("");

    fireEvent.change(typeInput, { target: { value: "Cafe" } });
    fireEvent.click(screen.getAllByText("Save Changes")[0]);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const putCall = mutateMock.mock.calls.find((c) => c[0] === "/api/venue-profile");
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.type).toBe("Cafe");
  });

  it("sends null (not undefined) when a field is cleared, so it can be blanked (E42-d)", async () => {
    // A venue that HAS a type, so clearing it must reach the server as null.
    venueState.venue = { name: "Kings Arms", type: "Cafe", location: "London" };
    render(<VenueProfilePage />);

    fireEvent.click(screen.getAllByText("Edit")[0]);
    const typeInput = screen.getByPlaceholderText("e.g. Independent cafe") as HTMLInputElement;
    expect(typeInput.value).toBe("Cafe"); // hydrated from the venue

    fireEvent.change(typeInput, { target: { value: "" } }); // clear it
    fireEvent.click(screen.getAllByText("Save Changes")[0]);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const putCall = mutateMock.mock.calls.find((c) => c[0] === "/api/venue-profile");
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    // Fail-before: `|| undefined` dropped the key from the JSON, so the field could
    // never be blanked. `|| null` sends null and the DAO writes NULL.
    expect(body.type).toBeNull();
    expect("type" in body).toBe(true);
  });

  it("delegates the unsaved-changes guard to useUnsavedWarning, dirty once a field changes (E42-e)", async () => {
    venueState.venue = { name: "Kings Arms", type: "Cafe", location: "London" };
    render(<VenueProfilePage />);

    // Clean on first render: the shared hook is called with false.
    expect(unsavedWarningMock).toHaveBeenCalledWith(false);

    // Enter edit mode and change a field -> markDirty() -> hasUnsavedChanges = true.
    fireEvent.click(screen.getAllByText("Edit")[0]);
    const typeInput = screen.getByPlaceholderText("e.g. Independent cafe") as HTMLInputElement;
    fireEvent.change(typeInput, { target: { value: "Bar" } });

    // Fail-before: the page hand-rolled its own window.addEventListener("beforeunload")
    // and never called useUnsavedWarning, so the hook was never invoked with true (and
    // there was no capture-phase <Link> interception). The shared hook does both.
    await waitFor(() => expect(unsavedWarningMock).toHaveBeenCalledWith(true));
  });
});

// WS8 item 4 (QA 2026-08-28): three venue-profile truths.
describe("venue profile truths (E6/E8/E9)", () => {
  it("E6: Cancel reverts the section's edits, so the next Save does not persist them", async () => {
    venueState.venue = { name: "Kings Arms", type: "Cafe", location: "London" };
    render(<VenueProfilePage />);

    fireEvent.click(screen.getAllByText("Edit")[0]);
    const nameInput = screen.getByPlaceholderText("Your venue's name") as HTMLInputElement;
    expect(nameInput.value).toBe("Kings Arms");
    fireEvent.change(nameInput, { target: { value: "Renamed Arms" } });

    // Fail-before: Cancel only exited edit mode; the typed value stayed in
    // state (and dirty) and the next Save persisted the "cancelled" edit.
    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getAllByText("Save Changes")[0]);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const putCall = mutateMock.mock.calls.find((c) => c[0] === "/api/venue-profile");
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.name).toBe("Kings Arms");
  });

  it("E8: an empty profile starts with no styles or themes selected, and Save persists none", async () => {
    venueState.venue = { name: "Kings Arms", location: "London" };
    render(<VenueProfilePage />);

    fireEvent.click(screen.getAllByText("Save Changes")[0]);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const putCall = mutateMock.mock.calls.find((c) => c[0] === "/api/venue-profile");
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    // Fail-before: Contemporary/Minimal/Photography and
    // Nature/City/Architecture were pre-selected for empty profiles, so any
    // Save silently persisted taste tags the venue never chose, and artists
    // then targeted them on false data.
    expect(body.preferred_styles).toEqual([]);
    expect(body.preferred_themes).toEqual([]);
  });

  it("E8: saved tags still hydrate and persist unchanged", async () => {
    venueState.venue = {
      name: "Kings Arms",
      location: "London",
      preferredStyles: ["Abstract"],
      preferredThemes: ["Seascape"],
    };
    render(<VenueProfilePage />);

    fireEvent.click(screen.getAllByText("Save Changes")[0]);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const putCall = mutateMock.mock.calls.find((c) => c[0] === "/api/venue-profile");
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.preferred_styles).toEqual(["Abstract"]);
    expect(body.preferred_themes).toEqual(["Seascape"]);
  });

  it("E9: the decorative Preferred Artwork Sizes control is gone", () => {
    // No preferred_sizes column exists (vestigial per writable-fields.ts), so
    // the pills could only ever discard the selection on save. Honest UI:
    // the control is removed until the column exists.
    render(<VenueProfilePage />);
    expect(screen.queryByText("Preferred Artwork Sizes")).toBeNull();
    expect(screen.queryByText("Small (up to 40cm)")).toBeNull();
  });
});
