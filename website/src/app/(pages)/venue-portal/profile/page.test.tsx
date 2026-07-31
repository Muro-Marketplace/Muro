// @vitest-environment jsdom
// E42-a. The venue detail rows bound a display fallback ("Not set" / "Your Venue")
// straight into the controlled <input value>, so entering edit mode seeded the field
// with "Not set" and the first keystroke produced "Not setCafe". The input value is
// now the editable state only; the fallback is display-only.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, venueState } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  venueState: { venue: null as unknown },
}));

vi.mock("@/hooks/useCurrentVenue", () => ({ useCurrentVenue: () => ({ venue: venueState.venue, refetch: vi.fn() }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/lib/upload", () => ({ uploadImage: vi.fn(async () => "https://cdn/x.png") }));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("next/image", () => ({ default: () => null }));

import VenueProfilePage from "./page";

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  authFetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
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

    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    const putCall = authFetchMock.mock.calls.find((c) => c[0] === "/api/venue-profile");
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.type).toBe("Cafe");
  });
});
