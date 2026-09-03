// @vitest-environment jsdom
//
// Task 2 gap: commit e3233e02 put the blue "Sample" pill beside seed
// artists' names on the artist profile page, the artwork page, and the
// list-view toggle of /browse, but missed BrowseArtistCard, the DEFAULT
// grid card on /browse and the most visible place a seed artist's name
// appears. This covers that card directly.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import type { Artist } from "@/data/artists";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ userType: null }) }));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }) }));
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
  subscriptionPlan: "core",
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

// Owner decision 2026-09-02: Featured is Pro only; Premium loses the chip
// and its second-place weighting in the marketplace sort.
describe("<BrowseArtistCard /> Featured chip", () => {
  it("shows Featured for Pro only", () => {
    const proArtist = { ...baseArtist, subscriptionPlan: "pro" } as unknown as Artist;
    render(<BrowseArtistCard artist={proArtist} distance={null} />);
    expect(screen.getByText("Featured")).toBeTruthy();
    cleanup();
    const premiumArtist = { ...baseArtist, subscriptionPlan: "premium" } as unknown as Artist;
    render(<BrowseArtistCard artist={premiumArtist} distance={null} />);
    expect(screen.queryByText("Featured")).toBeNull();
  });
});


describe("View showroom", () => {
  it("shows a button for artists with public showroom walls that opens their showroom section", () => {
    pushMock.mockReset();
    const artist = { ...baseArtist, showroomWallCount: 2 } as unknown as Artist;
    render(<BrowseArtistCard artist={artist} distance={null} />);
    const button = screen.getByRole("button", { name: "View showroom" });
    fireEvent.click(button);
    expect(pushMock).toHaveBeenCalledWith(`/browse/${baseArtist.slug}#showroom`);
  });

  it("shows nothing when the artist has no public showroom walls", () => {
    const artist = { ...baseArtist, showroomWallCount: 0 } as unknown as Artist;
    render(<BrowseArtistCard artist={artist} distance={null} />);
    expect(screen.queryByRole("button", { name: "View showroom" })).toBeNull();
  });
});
