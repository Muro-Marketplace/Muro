// @vitest-environment jsdom
// B12/F17/H9: customer accounts cannot use the messages API (403 without an
// artist or venue profile), yet this CTA used to route customers into the
// customer-portal inbox and guests into signup pointed at that same dead end.
// Customers and guests now go to the profile's enquiry form instead; venues
// keep their portal path; artists see no button at all (the send would 403).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

const { pushMock, authState } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  authState: {
    user: null as null | { id: string },
    userType: null as string | null,
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => authState }));

import MessageArtistButton from "./MessageArtistButton";

afterEach(() => cleanup());
beforeEach(() => {
  pushMock.mockReset();
  authState.user = null;
  authState.userType = null;
});

describe("MessageArtistButton routing (B12/F17/H9)", () => {
  it("sends a GUEST to the profile enquiry form, not signup", () => {
    render(<MessageArtistButton artistSlug="alice" artistName="Alice" />);

    fireEvent.click(screen.getByRole("button", { name: "Message" }));

    // Fail-before: guests were pushed into /signup/customer?next=
    // /customer-portal/messages, a signup funnel ending on a broken inbox.
    expect(pushMock).toHaveBeenCalledWith("/browse/alice?enquiry=1");
  });

  it("sends a CUSTOMER to the profile enquiry form", () => {
    authState.user = { id: "u-cust" };
    authState.userType = "customer";
    render(<MessageArtistButton artistSlug="alice" artistName="Alice" />);

    fireEvent.click(screen.getByRole("button", { name: "Message" }));

    expect(pushMock).toHaveBeenCalledWith("/browse/alice?enquiry=1");
  });

  it("keeps the VENUE portal messages path", () => {
    authState.user = { id: "u-venue" };
    authState.userType = "venue";
    render(<MessageArtistButton artistSlug="alice" artistName="Alice" />);

    fireEvent.click(screen.getByRole("button", { name: "Message" }));

    expect(pushMock).toHaveBeenCalledWith("/venue-portal/messages?artist=alice&artistName=Alice");
  });

  it("renders nothing for an ARTIST viewing another artist", () => {
    authState.user = { id: "u-art" };
    authState.userType = "artist";
    const { container } = render(<MessageArtistButton artistSlug="alice" artistName="Alice" />);

    expect(container.firstChild).toBeNull();
  });
});
