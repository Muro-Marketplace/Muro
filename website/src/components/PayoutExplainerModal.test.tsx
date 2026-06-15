// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import PayoutExplainerModal from "./PayoutExplainerModal";

// Node 25's native Storage shim used by jsdom is partial; swap in a
// complete in-memory store so the modal can read/write its
// dismissed flag the same way real browsers do.
function installMemoryStorage(): void {
  let store: Record<string, string> = {};
  const memory: Storage = {
    get length() { return Object.keys(store).length; },
    clear: () => { store = {}; },
    getItem: (k: string) => (k in store ? store[k] : null),
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    setItem: (k: string, v: string) => { store[k] = String(v); },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: memory });
}

beforeEach(() => installMemoryStorage());
afterEach(() => cleanup());

describe("PayoutExplainerModal", () => {
  it("shows the artist copy when active + no prior dismiss", () => {
    render(<PayoutExplainerModal audience="artist" userId="u1" active={true} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Payouts are set up/i)).toBeTruthy();
    // Artist-specific phrasing: the artist marks orders delivered.
    expect(screen.getByText(/once you mark them delivered/i)).toBeTruthy();
  });

  it("shows the venue copy when audience=venue", () => {
    render(<PayoutExplainerModal audience="venue" userId="u1" active={true} />);
    // Venue-specific phrasing: the artist (not the venue) marks delivered.
    expect(screen.getByText(/once the artist marks them delivered/i)).toBeTruthy();
  });

  it("does not render when active=false", () => {
    render(<PayoutExplainerModal audience="artist" userId="u1" active={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not render when userId is missing (no dismiss key to write)", () => {
    render(<PayoutExplainerModal audience="artist" userId={null} active={true} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides itself on Got it click and persists the dismiss in localStorage", () => {
    const { unmount } = render(
      <PayoutExplainerModal audience="artist" userId="u1" active={true} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem("wallplace:payout-explainer-seen:artist:u1")).toBeTruthy();
    unmount();
  });

  it("exposes an artist-agreement link and DOES NOT dismiss on click", () => {
    render(<PayoutExplainerModal audience="artist" userId="u1" active={true} />);
    const artistLink = screen.getByRole("link", { name: /artist agreement/i }) as HTMLAnchorElement;
    expect(artistLink.getAttribute("href")).toBe("/artist-agreement");
    expect(artistLink.getAttribute("target")).toBe("_blank");
    // Reading the terms should leave the dialog open so the user can
    // come back and explicitly click "Got it"; only the Got it button
    // writes the localStorage flag.
    fireEvent.click(artistLink);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    expect(window.localStorage.getItem("wallplace:payout-explainer-seen:artist:u1")).toBeNull();
  });

  it("points the agreement link to /venue-agreement when audience=venue", () => {
    render(<PayoutExplainerModal audience="venue" userId="u2" active={true} />);
    const venueLink = screen.getByRole("link", { name: /venue agreement/i }) as HTMLAnchorElement;
    expect(venueLink.getAttribute("href")).toBe("/venue-agreement");
    expect(venueLink.getAttribute("target")).toBe("_blank");
  });

  it("does not re-show after a dismiss has been recorded", () => {
    window.localStorage.setItem(
      "wallplace:payout-explainer-seen:artist:u1",
      "2026-05-15T12:00:00Z",
    );
    render(<PayoutExplainerModal audience="artist" userId="u1" active={true} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("namespaces the dismissed flag by audience, dismissing the artist modal doesn't suppress the venue one", () => {
    window.localStorage.setItem(
      "wallplace:payout-explainer-seen:artist:u1",
      "2026-05-15T12:00:00Z",
    );
    render(<PayoutExplainerModal audience="venue" userId="u1" active={true} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("dismisses on Escape key press", () => {
    render(<PayoutExplainerModal audience="artist" userId="u1" active={true} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses when the corner X button is clicked", () => {
    render(<PayoutExplainerModal audience="artist" userId="u1" active={true} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
