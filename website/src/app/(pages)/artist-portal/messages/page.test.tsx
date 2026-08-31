// @vitest-environment jsdom
//
// QA 2026-08-30 bug 40. Every venue page's "Message this venue" CTA links here
// with ?venue=&venueName= (VenueProfileApplyCta), but this page only read
// ?artist=, so the deep link was silently dropped: the inbox opened on "Select
// a conversation" with no composer, for every venue. That is the primary
// artist-to-venue contact route, and it is metered.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { searchParamsMock, inboxPropsSpy } = vi.hoisted(() => ({
  searchParamsMock: { current: new URLSearchParams() },
  inboxPropsSpy: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => searchParamsMock.current }));
vi.mock("@/components/ArtistPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useCurrentArtist", () => ({
  useCurrentArtist: () => ({ artist: { slug: "fin-coles", works: [] }, loading: false }),
}));
vi.mock("@/components/MessageInbox", () => ({
  default: (props: Record<string, unknown>) => {
    inboxPropsSpy(props);
    return <div data-testid="inbox" />;
  },
}));

import ArtistMessagesPage from "./page";

function renderWith(qs: string) {
  searchParamsMock.current = new URLSearchParams(qs);
  render(<ArtistMessagesPage />);
  return inboxPropsSpy.mock.calls.at(-1)![0] as Record<string, unknown>;
}

beforeEach(() => inboxPropsSpy.mockClear());
afterEach(cleanup);

describe("the Message-this-venue deep link opens the thread", () => {
  it("honours ?venue= and ?venueName=, which is what venue pages actually send", () => {
    const props = renderWith("venue=testing-venue&venueName=Testing+Venue");
    expect(props.initialArtistSlug).toBe("testing-venue");
    expect(props.initialArtistName).toBe("Testing Venue");
    expect(screen.getByTestId("inbox")).toBeTruthy();
  });

  it("still honours the older ?artist= spelling", () => {
    const props = renderWith("artist=maya-chen&artistName=Maya+Chen");
    expect(props.initialArtistSlug).toBe("maya-chen");
    expect(props.initialArtistName).toBe("Maya Chen");
  });

  it("passes nothing through when the inbox is opened plainly", () => {
    const props = renderWith("");
    expect(props.initialArtistSlug).toBeUndefined();
    expect(props.initialArtistName).toBeUndefined();
  });
});
