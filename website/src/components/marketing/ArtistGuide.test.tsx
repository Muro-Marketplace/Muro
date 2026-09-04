// @vitest-environment jsdom
//
// The artist page described the storefront three times and tied all three to a
// venue QR code, so an artist arriving with an existing following was never
// told the one thing that would matter most to them: their page is a shop that
// works from day one, placement or not.
//
// These assertions cover the parts of that rewrite that carry an argument
// rather than decoration. The rest of the copy is deliberately not pinned.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// The pricing cards reach for Stripe price env vars at module scope.
vi.mock("@/components/ArtistPricingCards", () => ({
  default: () => null,
}));
// AnimateIn wraps every section and uses IntersectionObserver, which jsdom
// does not implement. Same stub the homepage test uses.
vi.mock("@/components/AnimateIn", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import ArtistGuide from "./ArtistGuide";

afterEach(() => cleanup());

describe("<ArtistGuide /> comparison table", () => {
  it("says Instagram cannot take payment, which is the actual difference", () => {
    // The table used to frame Instagram as a rival channel to choose between
    // (Audience: "Followers" against "Daily venue footfall"). It is not a
    // rival, it is where the audience already is. What it cannot do is take
    // the money.
    render(<ArtistGuide />);
    expect(screen.getByText("Takes payment")).toBeTruthy();
    expect(screen.getByText("Not in the UK")).toBeTruthy();
  });

  it("does not claim a flat No for Instagram payments", () => {
    // Meta wound Shops checkout down outside the US rather than everywhere, so
    // an absolute claim is the sort a reader disputes and then distrusts the
    // rest of the table over.
    render(<ArtistGuide />);
    const row = screen.getByText("Takes payment").closest("tr");
    expect(row?.textContent).not.toMatch(/\bNo\b/);
  });

  it("counts the artist's own following as part of the audience", () => {
    render(<ArtistGuide />);
    expect(screen.getByText("Venue footfall and your own followers")).toBeTruthy();
  });
});

describe("<ArtistGuide /> storefront framing", () => {
  it("describes the shop without requiring a venue placement", () => {
    render(<ArtistGuide />);
    expect(
      screen.getByText(/works the day you are accepted, with or without a placement/i),
    ).toBeTruthy();
  });

  it("does not claim Wallplace supplies the artist's existing audience", () => {
    // The honest pitch on an artist's own followers is the infrastructure, not
    // the traffic. We take 15% of a sale they might have closed by DM, so the
    // page has to be straight about which audience is whose.
    render(<ArtistGuide />);
    expect(screen.getByText(/not claiming to bring you that audience/i)).toBeTruthy();
  });

  it("answers the question an artist with a following will actually ask", () => {
    render(<ArtistGuide />);
    expect(
      screen.getByText(/I already have an Instagram following/i),
    ).toBeTruthy();
  });
});
