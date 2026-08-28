// @vitest-environment jsdom
// E43-f. Both "View" buttons on the enquiries page had no onClick, no href and no
// form association, while cursor-pointer + the accent colour made them look live —
// so the only way to open an enquiry from this page did nothing. They now push to
// the messages inbox, which is where enquiry threads actually live.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { pushMock, fetchMock } = vi.hoisted(() => ({ pushMock: vi.fn(), fetchMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));

import EnquiriesPage from "./page";

const ENQUIRY = {
  id: "e1",
  artist_slug: "fin-coles",
  message: "Would love to show your work in our cafe.",
  enquiry_type: "Display",
  created_at: "2026-01-01T00:00:00Z",
  status: "Pending",
};

afterEach(() => cleanup());
beforeEach(() => {
  pushMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ json: async () => ({ enquiries: [ENQUIRY] }) });
});

describe("enquiries View buttons (E43-f)", () => {
  it("opens the artist's message thread when View is clicked", async () => {
    render(<EnquiriesPage />);
    // Desktop table and mobile list both render, so there are two affordances.
    fireEvent.click(await screen.findByText("View"));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/venue-portal/messages?artist=fin-coles"),
    );
  });

  it("opens the same thread from the mobile 'View Details' control", async () => {
    render(<EnquiriesPage />);
    fireEvent.click(await screen.findByText("View Details"));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/venue-portal/messages?artist=fin-coles"),
    );
  });

  it("falls back to the unfiltered inbox when the enquiry has no artist slug", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ enquiries: [{ ...ENQUIRY, artist_slug: null }] }),
    });

    render(<EnquiriesPage />);
    fireEvent.click(await screen.findByText("View"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/venue-portal/messages"));
  });

  it("does not fetch /api/orders (the discarded request was deleted)", async () => {
    render(<EnquiriesPage />);
    await screen.findByText("View");

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("/api/enquiry");
    expect(urls.some((u) => u.includes("/api/orders"))).toBe(false);
  });
});
