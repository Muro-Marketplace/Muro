// @vitest-environment jsdom
//
// LA-C003 (launch audit 2026-09-05). The venue Saved page resolved saved work
// ids against getGalleryWorks(), the static seed catalogue, so a work hearted
// from a real (database) artist's page was dropped by the lookup and the tab
// read "No saved works yet" with no message. The customer and artist portals
// already resolve saved works through /api/browse-artists, the merged
// catalogue; this page now does the same.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { fetchMock, savedItemsMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  savedItemsMock: { current: [] as { type: "work" | "artist" | "collection"; id: string; savedAt: string }[] },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/venue-portal/saved",
}));
vi.mock("@/components/VenuePortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/EmptyState", () => ({
  default: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="thumb">{alt}</span>,
}));
vi.mock("@/context/SavedContext", () => ({
  useSaved: () => ({ savedItems: savedItemsMock.current, toggleSaved: vi.fn() }),
}));

import SavedPage from "./page";

// A work that exists only in the database: not in src/data/artists.ts.
const DB_WORK_ID = "cccccccc-1234-4abc-8def-000000000001";

const artists = [
  {
    slug: "real-artist",
    name: "Real Artist",
    image: "/real.jpg",
    works: [{ id: DB_WORK_ID, title: "Harbour at Dusk", image: "/harbour.jpg", priceBand: "£250 to £400" }],
  },
];

function json(data: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => data } as unknown as Response;
}

afterEach(() => cleanup());
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(() => Promise.resolve(json({ artists })));
  savedItemsMock.current = [{ type: "work", id: DB_WORK_ID, savedAt: "2026-09-01T10:00:00.000Z" }];
});

describe("venue saved works resolve against the merged catalogue (LA-C003)", () => {
  it("shows a saved work by a database artist", async () => {
    render(<SavedPage />);
    // Fail-before: the seed lookup dropped the id and the empty state rendered.
    expect(await screen.findByRole("heading", { name: "Harbour at Dusk" })).toBeTruthy();
    expect(screen.queryByText("No saved works yet")).toBeNull();
  });

  it("links the work through its artist's page", async () => {
    render(<SavedPage />);
    await screen.findByRole("heading", { name: "Harbour at Dusk" });
    const view = screen.getByText("View");
    expect(view.getAttribute("href")).toBe("/browse/real-artist?work=harbour-at-dusk");
  });

  it("does not claim there are no saved works when the catalogue failed to load", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ artists: [] }, false)));
    render(<SavedPage />);
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).toBeNull();
    });
    expect(screen.queryByText("No saved works yet")).toBeNull();
    expect(screen.getByText(/could not load your saved works/i)).toBeTruthy();
  });
});
