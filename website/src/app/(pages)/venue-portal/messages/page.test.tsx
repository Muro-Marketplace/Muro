// @vitest-environment jsdom
//
// E30. The shell rendered "Loading messages..." while `loading || !venue?.slug`,
// but useCurrentVenue sets venue null with loading FALSE when the API has no row
// and the static fallback misses. So the terminal failure state and the loading
// state were the same line of text, and the page spun forever with no error, no
// retry and no way forward.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

const { useCurrentVenueMock, refetchMock, searchParamsMock } = vi.hoisted(() => ({
  useCurrentVenueMock: vi.fn(),
  refetchMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => searchParamsMock() }));
vi.mock("@/hooks/useCurrentVenue", () => ({ useCurrentVenue: useCurrentVenueMock }));
vi.mock("@/components/VenuePortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/MessageInbox", () => ({
  default: ({ userSlug }: { userSlug: string }) => <div data-testid="inbox">{userSlug}</div>,
}));

import VenueMessagesPage from "./page";

afterEach(() => cleanup());
beforeEach(() => {
  useCurrentVenueMock.mockReset();
  refetchMock.mockReset();
  searchParamsMock.mockReturnValue(new URLSearchParams());
});

describe("venue messages shell when the profile never resolves (E30)", () => {
  it("renders a failure state with a retry instead of spinning", () => {
    useCurrentVenueMock.mockReturnValue({
      venue: null,
      loading: false,
      profileId: null,
      refetch: refetchMock,
    });

    render(<VenueMessagesPage />);

    // Fail-before: the page showed "Loading messages..." forever.
    expect(screen.queryByText("Loading messages...")).toBeNull();
    expect(screen.getByText(/couldn.t load your venue profile/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a venue row with no slug as a failure too", () => {
    useCurrentVenueMock.mockReturnValue({
      venue: { name: "Copper Kettle" },
      loading: false,
      profileId: null,
      refetch: refetchMock,
    });

    render(<VenueMessagesPage />);

    expect(screen.getByText(/couldn.t load your venue profile/i)).toBeTruthy();
    expect(screen.queryByTestId("inbox")).toBeNull();
  });

  it("still shows the loading line while the profile is genuinely in flight", () => {
    useCurrentVenueMock.mockReturnValue({
      venue: null,
      loading: true,
      profileId: null,
      refetch: refetchMock,
    });

    render(<VenueMessagesPage />);

    expect(screen.getByText("Loading messages...")).toBeTruthy();
    expect(screen.queryByText(/couldn.t load your venue profile/i)).toBeNull();
  });

  it("renders the inbox once the venue resolves", () => {
    useCurrentVenueMock.mockReturnValue({
      venue: { slug: "copper-kettle", name: "Copper Kettle" },
      loading: false,
      profileId: "vp-1",
      refetch: refetchMock,
    });

    render(<VenueMessagesPage />);

    expect(screen.getByTestId("inbox").textContent).toBe("copper-kettle");
  });
});
