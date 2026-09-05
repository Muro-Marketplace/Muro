// @vitest-environment jsdom
/**
 * Venue dashboard: the walls prompt (owner instruction, 3 September 2026).
 * A venue with no walls is asked to photograph one; a venue whose walls are
 * all private is nudged to show them; a venue with a public wall sees neither.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "v1", email: "venue@example.com" }, displayName: "The Copper Kettle", loading: false, userType: "venue" }),
}));
vi.mock("@/context/SavedContext", () => ({ useSaved: () => ({ savedItems: [], savedIds: new Set(), isSaved: () => false, toggleSaved: vi.fn() }) }));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/PlacementActionItems", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import VenueDashboardPage from "./page";

function respond(json: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => json } as unknown as Response);
}

function wire(walls: Array<{ id: string; is_public_on_profile?: boolean }>) {
  authFetchMock.mockImplementation((url: string) => {
    if (url === "/api/walls") return respond({ walls, cap: 6 });
    if (url === "/api/dashboard") return respond({ orders: [] });
    if (url === "/api/placements") return respond({ placements: [] });
    if (url.startsWith("/api/analytics/venue")) return respond({ totals: { qr_scans: 0 } });
    if (url.startsWith("/api/stripe-connect/status")) return respond({ onboardingComplete: true });
    return respond({});
  });
}

// vitest's jsdom hands out a localStorage without getItem/setItem; the
// dashboard reads its onboarding-dismissed flag from it.
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => { store.delete(k); },
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
  } as Storage;
}

beforeEach(() => {
  authFetchMock.mockReset();
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
});
afterEach(() => {
  cleanup();
});

describe("venue dashboard walls prompt", () => {
  it("asks a venue with no walls to add a wall photo", async () => {
    wire([]);
    render(<VenueDashboardPage />);
    const prompt = await screen.findByTestId("walls-prompt");
    expect(prompt.textContent).toContain("Show artists your walls.");
    const link = screen.getByRole("link", { name: "Add a wall photo" });
    expect(link.getAttribute("href")).toBe("/venue-portal/walls/new");
    expect(screen.queryByTestId("walls-nudge")).toBeNull();
  });

  it("nudges a venue whose walls are all private to show them", async () => {
    wire([{ id: "w1", is_public_on_profile: false }]);
    render(<VenueDashboardPage />);
    const nudge = await screen.findByTestId("walls-nudge");
    expect(nudge.textContent).toContain("aren’t on your profile yet");
    expect(screen.getByRole("link", { name: "Open My Walls" }).getAttribute("href")).toBe("/venue-portal/walls");
    expect(screen.queryByTestId("walls-prompt")).toBeNull();
  });

  it("shows neither once a wall is public", async () => {
    wire([{ id: "w1", is_public_on_profile: true }]);
    render(<VenueDashboardPage />);
    await waitFor(() => expect(authFetchMock.mock.calls.some((c) => c[0] === "/api/walls")).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("walls-prompt")).toBeNull();
    expect(screen.queryByTestId("walls-nudge")).toBeNull();
  });
});

// LA-C037 (launch audit 2026-09-05). Every request behind the dashboard ended in
// a .catch that substituted an empty result, so the tiles rendered £0.00 and 0
// scans as fact when the requests had failed.
describe("venue dashboard when a request fails (LA-C037)", () => {
  it("shows an error with a retry instead of £0 tiles, and recovers on retry", async () => {
    let dashboardCalls = 0;
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/walls") return respond({ walls: [{ id: "w1", is_public_on_profile: true }], cap: 6 });
      if (url === "/api/dashboard") {
        dashboardCalls += 1;
        return dashboardCalls === 1 ? respond({ error: "boom" }, false) : respond({ orders: [] });
      }
      if (url === "/api/placements") return respond({ placements: [] });
      if (url.startsWith("/api/analytics/venue")) return respond({ totals: { qr_scans: 0 } });
      if (url.startsWith("/api/stripe-connect/status")) return respond({ onboardingComplete: true });
      return respond({});
    });
    render(<VenueDashboardPage />);
    expect(await screen.findByText(/could not load your dashboard figures/i)).toBeTruthy();
    // The figure tiles are replaced by the error, not rendered as £0.00.
    expect(screen.queryByText("Total Spent")).toBeNull();
    expect(screen.queryByText("Revenue Share Earned")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText("Total Spent")).toBeTruthy();
  });
});
