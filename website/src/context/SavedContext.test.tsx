// @vitest-environment jsdom
//
// Pins G2-11: an /api/saved POST/DELETE that fails must revert the
// optimistic toggle and surface an error toast. Before Plan F Task 7
// the .catch was a silent swallow, so the heart stayed filled and the
// "added to favourites" message lied to the user.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { mockAuthFetch, mockMutate, stableUser } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockMutate: vi.fn(),
  // Stable reference — SavedContext's load effect depends on `user`,
  // so a fresh object literal each render would reload mid-test.
  stableUser: { id: "u1", email: "x@y.com" },
}));

// 05: the read GET stays on authFetch; the POST/DELETE toggles now go through
// mutate, which rejects on a non-2xx instead of resolving.
vi.mock("@/lib/api-client", () => ({
  authFetch: mockAuthFetch,
  mutate: mockMutate,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: stableUser }),
}));

import { ToastProvider } from "./ToastContext";
import { SavedProvider, useSaved } from "./SavedContext";

function Probe() {
  const { toggleSaved, isSaved } = useSaved();
  const saved = isSaved("work", "w1");
  return (
    <div>
      <span data-testid="state">{saved ? "saved" : "not-saved"}</span>
      <button onClick={() => toggleSaved("work", "w1")}>toggle</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <ToastProvider>
      <SavedProvider>
        <Probe />
      </SavedProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockMutate.mockReset();
});
afterEach(() => cleanup());

describe("SavedContext failure handling", () => {
  it("reverts the optimistic add and shows an error toast when POST fails", async () => {
    mockAuthFetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => ({ items: [] }) }),
    );
    mockMutate.mockRejectedValue(new Error("HTTP 500"));

    renderHarness();
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText("toggle"));

    expect(await screen.findByText("Couldn't update favourites. Try again.")).toBeTruthy();
    expect(screen.getByTestId("state").textContent).toBe("not-saved");
  });

  it("reverts the optimistic remove and shows an error toast when DELETE fails", async () => {
    let firstLoad = true;
    mockAuthFetch.mockImplementation(() => {
      if (firstLoad) {
        firstLoad = false;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [{ item_type: "work", item_id: "w1", created_at: "2026-05-06T00:00:00Z" }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });
    mockMutate.mockRejectedValue(new Error("HTTP 500"));

    renderHarness();
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("saved"));

    fireEvent.click(screen.getByText("toggle"));

    expect(await screen.findByText("Couldn't update favourites. Try again.")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("saved"));
  });
});
