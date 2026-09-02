// @vitest-environment jsdom
//
// Task 2 gap: commit e3233e02 put the blue "Sample" pill beside seed
// artists' names on the artist profile page, the artwork page, and the
// list-view toggle of /browse, but missed BrowseArtistCard, the DEFAULT
// grid card on /browse and the most visible place a seed artist's name
// appears. This covers that card directly.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Artist } from "@/data/artists";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ userType: null }) }));

import BrowseArtistCard from "./BrowseArtistCard";

afterEach(() => cleanup());

// Minimal fixture satisfying the fields BrowseArtistCard actually reads;
// cast at the call site since the full Artist type carries many optional
// fields this card never touches.
const baseArtist = {
  slug: "test-artist",
  name: "Test Artist",
  profileColor: "#000000",
  shortBio: "",
  extendedBio: "",
  location: "London",
  primaryMedium: "Photography",
  styleTags: [],
  instagram: "",
  offersOriginals: true,
  offersPrints: false,
  offersFramed: false,
  availableSizes: [],
  openToCommissions: false,
  isFoundingArtist: false,
  themes: [],
  deliveryRadius: "",
  openToFreeLoan: false,
  openToRevenueShare: false,
  openToOutrightPurchase: false,
  canProvideFrames: false,
  canArrangeFraming: false,
  venueTypesSuitedFor: [],
  coordinates: null,
  image: "",
  works: [
    {
      id: "w1",
      title: "Test Work",
      medium: "Photography",
      dimensions: "",
      priceBand: "",
      pricing: [],
      available: true,
      color: "",
      image: "",
    },
  ],
};

describe("<BrowseArtistCard />", () => {
  it("shows the Sample pill beside the name for a seed artist", () => {
    const artist = { ...baseArtist, isSeedArtist: true } as unknown as Artist;
    render(<BrowseArtistCard artist={artist} distance={null} />);
    expect(screen.getByText("Sample")).toBeTruthy();
  });

  it("does not show the Sample pill for a real (non-seed) artist", () => {
    const artist = { ...baseArtist, isSeedArtist: false } as unknown as Artist;
    render(<BrowseArtistCard artist={artist} distance={null} />);
    expect(screen.queryByText("Sample")).toBeNull();
  });
});
