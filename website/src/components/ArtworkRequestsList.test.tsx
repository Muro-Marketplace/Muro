// @vitest-environment jsdom
// E23, artist-facing direction. qr_revenue_share_percent on an artwork
// request is the VENUE'S share of each QR sale (canonical, same as
// placements.revenue_share_percent). The browse card used to render the
// raw number as "% to artist" — the opposite of the deal the venue set.
// This pins the derived "you keep X%" copy instead.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-artist" }, userType: "artist", loading: false }),
}));
vi.mock("@/lib/api-client", () => ({
  authFetch: authFetchMock,
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import ArtworkRequestsList from "./ArtworkRequestsList";

afterEach(() => cleanup());

const QR_REQUEST = {
  id: "arq_1",
  title: "Back-wall statement piece",
  description: "Bold abstract for the seating area.",
  intent: ["display"],
  styles: [],
  mediums: [],
  budget_min_pence: null,
  budget_max_pence: null,
  qr_revenue_share_percent: 25,
  location: null,
  timescale: null,
  created_at: "2026-01-01T00:00:00Z",
  venue_slug: "copper-kettle",
  venue_name: "Copper Kettle",
  venue_type: "Cafe",
  venue_location: "London",
  venue_image: null,
};

describe("<ArtworkRequestsList /> QR share direction (E23)", () => {
  it("shows the artist their derived cut, not the venue's share as if it were theirs", async () => {
    authFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ requests: [QR_REQUEST] }), { status: 200 }),
    );

    render(<ArtworkRequestsList />);

    // Venue keeps 25%, so the artist keeps 75% of each sale.
    expect(await screen.findByText("QR display · you keep 75% of sales")).toBeTruthy();
    // Fail-before: rendered "QR display · 25% to artist".
    expect(screen.queryByText(/25% to artist/)).toBeNull();
  });
});
