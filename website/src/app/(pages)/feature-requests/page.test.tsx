// @vitest-environment jsdom
// LA-C024 (launch audit 2026-09-05). The list load had no res.ok check and its
// catch set the list to [], so a failed request rendered "No open requests yet."
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null, userType: null, loading: false }) }));
vi.mock("@/lib/api-client", () => ({ mutate: vi.fn() }));

import FeatureRequestsPage from "./page";

const REQUEST = {
  id: "fr1",
  title: "Dark mode for the portal",
  description: "Easier on the eyes in the evening.",
  category: "portal",
  status: "open",
  upvotes: 3,
  created_at: "2026-08-01T00:00:00.000Z",
};

afterEach(() => cleanup());
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("feature requests when the list request fails (LA-C024)", () => {
  it("shows an error with a retry instead of 'No open requests yet.'", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ error: "Could not load requests" }), { status: 500 })),
    );
    render(<FeatureRequestsPage />);
    expect(await screen.findByText(/could not load feature requests/i)).toBeTruthy();
    expect(screen.queryByText(/No open requests yet/)).toBeNull();

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ requests: [REQUEST] }), { status: 200 })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Dark mode for the portal")).toBeTruthy();
  });
});
