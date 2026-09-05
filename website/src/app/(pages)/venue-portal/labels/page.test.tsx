// @vitest-environment jsdom
// Owner decision 2026-09-02: QR label colour is free for every plan,
// venues included, and now has a picker here (this page never had one
// before). Venues have no saved-profile theme column, so the choice lives
// only in component state for the current print run, nothing is persisted.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, labelPreviewProps } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  labelPreviewProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
// Mocked so we can assert on exactly what reaches it, per the task brief.
vi.mock("@/components/labels/LabelPreview", () => ({
  default: (props: Record<string, unknown>) => {
    labelPreviewProps.push(props);
    return null;
  },
}));

import VenueLabelsPage from "./page";

const PLACEMENTS = [
  {
    id: "p1",
    work_title: "Sunset Over the Bay",
    work_image: "https://example.com/sunset.jpg",
    work_size: "40x50cm",
    artist_slug: "james-okafor",
    venue: "The Curzon",
    status: "active",
  },
];

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  labelPreviewProps.length = 0;
  authFetchMock.mockImplementation((url: string) => {
    if (url === "/api/placements") return jsonResponse({ placements: PLACEMENTS });
    if (url === "/api/venue-profile") return jsonResponse({ profile: { name: "The Curzon", slug: "the-curzon" } });
    return jsonResponse({});
  });
});

describe("venue labels page — label colour picker (owner decision 2026-09-02)", () => {
  it("shows a Label colour picker with all four themes, defaulting to classic", async () => {
    render(<VenueLabelsPage />);
    await screen.findByText("Sunset Over the Bay");

    expect(screen.getByText("Label colour")).toBeTruthy();
    for (const label of ["Classic (white)", "Warm cream", "Dark", "Accent"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Classic (white)" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("choosing a colour reaches LabelPreview immediately; nothing is persisted", async () => {
    render(<VenueLabelsPage />);
    await screen.findByText("Sunset Over the Bay");

    fireEvent.click(await screen.findByText("Preview & Print"));
    expect(labelPreviewProps.at(-1)?.labelTheme).toBe("classic");

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(labelPreviewProps.at(-1)?.labelTheme).toBe("dark");

    // Venues have no saved theme column, only /api/placements and
    // /api/venue-profile / /api/browse-artists are ever called, never a
    // profile-update write for the colour choice.
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    const calledUrls = authFetchMock.mock.calls.map((c) => c[0]);
    expect(calledUrls).not.toContain("/api/artist-profile");
    expect(calledUrls).not.toContain("/api/venue-profile-theme");
  });
});

// LA-C035 (launch audit 2026-09-05). The placements request had no res.ok check
// (authFetch resolves on a non-2xx), so a failed load became an empty list and
// the page told a venue with live placements "No active placements yet".
describe("venue labels when the placements request fails (LA-C035)", () => {
  it("shows an error with a retry instead of 'No active placements yet'", async () => {
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/placements") return Promise.resolve(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
      return jsonResponse({});
    });
    render(<VenueLabelsPage />);
    expect(await screen.findByText(/could not load your placements/i)).toBeTruthy();
    expect(screen.queryByText("No active placements yet")).toBeNull();

    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/placements") return jsonResponse({ placements: PLACEMENTS });
      if (url === "/api/venue-profile") return jsonResponse({ profile: { name: "The Curzon", slug: "the-curzon" } });
      return jsonResponse({});
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Sunset Over the Bay")).toBeTruthy();
  });
});
