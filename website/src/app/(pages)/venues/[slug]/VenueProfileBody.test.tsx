// @vitest-environment jsdom
// LA-C094 (launch audit 2026-09-05). Every non-OK answer and every network
// failure rendered "Space not found", so a real outage read as a venue that
// does not exist. Only a 404 means not found; anything else is an error.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/VenueWallCard", () => ({ default: () => null }));
vi.mock("@/components/Breadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/VenueProfileApplyCta", () => ({ default: () => null }));
// Stubbed like its sibling child components above: it pulls in AuthContext,
// which builds a Supabase client at module load. Its own behaviour is covered
// by src/components/ReportContentButton.test.tsx.
vi.mock("@/components/ReportContentButton", () => ({ default: () => null }));

import VenueProfileBody from "./VenueProfileBody";

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response);
}

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
});

describe("venue profile when the request fails (LA-C094)", () => {
  it("shows an error with a retry on a 500, not 'Space not found'", async () => {
    authFetchMock.mockImplementation(() => respond(500, { error: "boom" }));
    render(<VenueProfileBody slug="the-gallery" />);
    expect(await screen.findByText(/could not load this space/i)).toBeTruthy();
    expect(screen.queryByText("Space not found")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(2));
  });

  it("shows an error on a network failure too", async () => {
    authFetchMock.mockRejectedValue(new Error("network down"));
    render(<VenueProfileBody slug="the-gallery" />);
    expect(await screen.findByText(/could not load this space/i)).toBeTruthy();
    expect(screen.queryByText("Space not found")).toBeNull();
  });

  it("still says Space not found on a 404", async () => {
    authFetchMock.mockImplementation(() => respond(404, { error: "Not found" }));
    render(<VenueProfileBody slug="nowhere" />);
    expect(await screen.findByText("Space not found")).toBeTruthy();
  });
});
