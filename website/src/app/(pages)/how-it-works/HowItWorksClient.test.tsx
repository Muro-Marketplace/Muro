// @vitest-environment jsdom
//
// /how-it-works?tab=artist must open the artists tab: the homepage's
// "Learn more" for artists points here (owner instruction, 2 September).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/marketing/VenueGuide", () => ({ default: () => <div data-testid="venue-guide" /> }));
vi.mock("@/components/marketing/ArtistGuide", () => ({ default: () => <div data-testid="artist-guide" /> }));
vi.mock("@/components/marketing/CustomerGuide", () => ({ default: () => <div data-testid="customer-guide" /> }));

import HowItWorksClient from "./HowItWorksClient";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/how-it-works");
});

describe("<HowItWorksClient /> deep links", () => {
  it("opens the venues tab by default", async () => {
    render(<HowItWorksClient />);
    expect(await screen.findByTestId("venue-guide")).toBeTruthy();
    expect(screen.queryByTestId("artist-guide")).toBeNull();
  });

  it("opens the artists tab for ?tab=artist", async () => {
    window.history.replaceState({}, "", "/how-it-works?tab=artist");
    render(<HowItWorksClient />);
    expect(await screen.findByTestId("artist-guide")).toBeTruthy();
    expect(screen.queryByTestId("venue-guide")).toBeNull();
  });

  it("ignores an unknown tab value", async () => {
    window.history.replaceState({}, "", "/how-it-works?tab=nonsense");
    render(<HowItWorksClient />);
    expect(await screen.findByTestId("venue-guide")).toBeTruthy();
  });
});
