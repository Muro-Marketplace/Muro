// @vitest-environment jsdom
// 05 E43-j. The venue portal self-heals its venue_profiles row on load. The write
// used authFetch(...).catch(() => {}), so a failed self-heal was invisible and the
// venue then hit a misleading "Artist profile not found" on every subsequent call.
// It now goes through mutate() (throws) and surfaces a retry banner on failure.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ mutate: mutateMock }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { email_confirmed_at: "2026-01-01T00:00:00Z" },
    loading: false,
    userType: "venue",
    displayName: "The Gallery",
    signOut: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/venue-portal",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));

import VenuePortalLayout from "./VenuePortalLayout";

afterEach(() => cleanup());
beforeEach(() => {
  mutateMock.mockReset();
});

describe("VenuePortalLayout self-heal (05 E43-j)", () => {
  it("surfaces a retry banner when the self-heal fails", async () => {
    mutateMock.mockRejectedValue(new Error("profile link failed"));
    render(<VenuePortalLayout>portal content</VenuePortalLayout>);

    // Fail-before: the old authFetch(...).catch(() => {}) swallowed this silently.
    expect(await screen.findByText(/finish setting up your venue portal/i)).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(mutateMock).toHaveBeenCalledWith("/api/venue-profile", expect.objectContaining({ method: "PATCH" }));
  });

  it("shows no banner when the self-heal succeeds", async () => {
    mutateMock.mockResolvedValue({});
    render(<VenuePortalLayout>portal content</VenuePortalLayout>);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(screen.queryByText(/finish setting up your venue portal/i)).toBeNull();
  });
});
