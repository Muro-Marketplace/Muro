// @vitest-environment jsdom
// F15/H8: this page used to render the full MessageInbox with an invented
// client-side slug. The messages API rejects customer accounts (403), so the
// inbox sat permanently empty while looking functional. It is now an honest
// explainer: artists reply by email, go enquire from a profile.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { searchParamsMock } = vi.hoisted(() => ({
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => searchParamsMock() }));
vi.mock("@/components/CustomerPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import CustomerMessagesPage from "./page";

afterEach(() => cleanup());
beforeEach(() => {
  searchParamsMock.mockReset();
  searchParamsMock.mockReturnValue(new URLSearchParams());
});

describe("customer-portal messages page (F15/H8)", () => {
  it("shows the honest email-reply state, not a fake inbox", async () => {
    render(<CustomerMessagesPage />);

    expect(await screen.findByText("Artists reply to you by email")).toBeTruthy();
    // Fail-before: the MessageInbox rendered here with its search box and
    // compose flow, all of which 403'd server-side for customers.
    expect(screen.queryByPlaceholderText("Search conversations…")).toBeNull();
    const browse = screen.getByText("Browse artists") as HTMLAnchorElement;
    expect(browse.getAttribute("href")).toBe("/browse");
  });

  it("honours old ?artist= funnel links by pointing at that artist's enquiry form", async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("artist=alice&artistName=Alice"));

    render(<CustomerMessagesPage />);

    const cta = (await screen.findByText("Contact Alice")) as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/browse/alice?enquiry=1");
  });
});
