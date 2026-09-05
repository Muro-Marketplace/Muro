// @vitest-environment jsdom
// LA-C034 (launch audit 2026-09-05). A failed analytics request set the data to
// null and the page rendered 0 in every tile and "No scans yet" under both
// lists, so an outage read as a venue nobody had scanned.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import VenueAnalyticsPage from "./page";

const DATA = {
  totals: { qr_scans: 5 },
  scans_over_time: [],
  top_works: [{ work_id: "w1", title: "Harbour at Dusk", artist_slug: "real-artist", scans: 5 }],
  top_artists: [{ artist_slug: "real-artist", artist_name: "Real Artist", scans: 5 }],
  range: "30d",
};

function respond(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response);
}

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
});

describe("venue analytics when the request fails (LA-C034)", () => {
  it("shows an error with a retry instead of zeros and 'No scans yet', and recovers", async () => {
    let calls = 0;
    authFetchMock.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? respond({ error: "Venue profile not found" }, false) : respond(DATA);
    });
    render(<VenueAnalyticsPage />);
    expect(await screen.findByText(/could not load your analytics/i)).toBeTruthy();
    expect(screen.queryByText(/No scans yet/)).toBeNull();
    expect(screen.queryAllByText("0", { selector: "p" })).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText("Harbour at Dusk")).toBeTruthy();
    expect(screen.getAllByText("5", { selector: "p" }).length).toBeGreaterThan(0);
  });
});
