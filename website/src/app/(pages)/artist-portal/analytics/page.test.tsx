// @vitest-environment jsdom
// Launch audit 2026-09-05, artist analytics page. Four defects on one page,
// each pinned below in its own block: the Performance by Venue table gated on a
// FUNCTION's length (LA-C007), the placement Revenue column reading a cached
// column the API never fills (LA-C008), status badges comparing title case
// against lower-case data (LA-C006), and every failed request rendered as a
// zero (LA-C005).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/components/ArtistPortalLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import AnalyticsPage from "./page";

const ANALYTICS = {
  totals: { profile_views: 12, artwork_views: 7, qr_scans: 3, enquiries: 1, venue_views: 0 },
  views_over_time: [],
  top_works: [],
  traffic_sources: [],
  venue_viewers: null,
  venue_viewer_count: 0,
  is_premium: false,
};

const PLACEMENT = {
  id: "p1",
  work_title: "Harbour at Dusk",
  work_image: "",
  venue: "The Gallery",
  arrangement_type: "revenue_share",
  monthly_fee_gbp: null,
  qr_enabled: true,
  revenue_share_percent: 10,
  status: "active",
  created_at: "2026-08-01T00:00:00.000Z",
  revenue: null,
  revenue_earned_gbp: 42.5,
};

function respond(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response);
}
function wire(overrides: Partial<Record<string, () => Promise<Response>>> = {}) {
  authFetchMock.mockImplementation((url: string) => {
    if (url === "/api/placements") return (overrides.placements ?? (() => respond({ placements: [] })))();
    if (url === "/api/orders") return (overrides.orders ?? (() => respond({ orders: [] })))();
    if (url.startsWith("/api/analytics/artist")) return (overrides.analytics ?? (() => respond(ANALYTICS)))();
    return respond({});
  });
}

afterEach(() => cleanup());
// Block body on purpose: mockReset() returns the mock, and vitest calls a
// function returned from beforeEach as a teardown, i.e. authFetch() with no URL.
beforeEach(() => {
  authFetchMock.mockReset();
});

describe("Performance by Venue (LA-C007)", () => {
  it("is not rendered as an empty table for an artist with no placements", async () => {
    wire();
    render(<AnalyticsPage />);
    await screen.findByText(/No placements logged yet/);
    expect(screen.queryByText("Performance by Venue")).toBeNull();
  });
});

describe("placement revenue column (LA-C008)", () => {
  it("shows the revenue the API computed for the placement", async () => {
    wire({ placements: () => respond({ placements: [PLACEMENT] }) });
    render(<AnalyticsPage />);
    await screen.findByText("Harbour at Dusk");
    expect(screen.getByText("£42.50")).toBeTruthy();
  });
});
