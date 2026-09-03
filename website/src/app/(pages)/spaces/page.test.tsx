// @vitest-environment jsdom
//
// A15. The venue card's "Message" control computed its destination as
// `userType === "artist" ? "/artist-portal" : "/venue-portal"`, but the gate
// that renders the control (canMessageVenues) admits customers as well as
// artists. A customer pressing Message was therefore pushed into
// /venue-portal/messages, a portal PortalGuard turns them away from.
//
// There is no customer to venue message channel to redirect them to either:
// the messages API rejects any account with no artist or venue profile, and
// /customer-portal/messages is an explainer rather than an inbox (F15/H8). So
// the control is artist-only now.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { push, authFetchMock, useAuthMock, useOutreachAllowanceMock } = vi.hoisted(() => ({
  push: vi.fn(),
  authFetchMock: vi.fn(),
  useAuthMock: vi.fn(),
  useOutreachAllowanceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock("@/lib/geocode", () => ({ geocodePostcode: vi.fn().mockResolvedValue(null) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: useAuthMock }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/components/PostcodeInput", () => ({
  default: () => null,
  persistLocation: vi.fn(),
  readPersistedCoords: () => null,
  clearPersistedLocation: vi.fn(),
}));
vi.mock("@/components/SpacesPlacementRequestForm", () => ({ default: () => <div>request form</div> }));
vi.mock("@/components/OutreachAllowance", () => ({
  default: () => null,
  useOutreachAllowance: useOutreachAllowanceMock,
}));

const { currentArtistState } = vi.hoisted(() => ({
  currentArtistState: { artist: null as null | { isVerified: boolean } },
}));
vi.mock("@/hooks/useCurrentArtist", () => ({
  useCurrentArtist: () => ({ artist: currentArtistState.artist, loading: false, profileId: null, refetch: vi.fn() }),
}));

import SpacesPage from "./page";

const VENUE = {
  slug: "copper-kettle",
  name: "The Copper Kettle",
  type: "Café",
  location: "Hampton",
  coordinates: null,
  wallSpace: "Two large walls",
  approximateFootfall: "400 a week",
  preferredStyles: ["Abstract"],
  preferredThemes: ["Nature"],
  interestedInFreeLoan: true,
  interestedInRevenueShare: false,
  interestedInDirectPurchase: false,
  description: "A corner café with good light.",
  image: "",
  images: [] as string[],
};

function signedInAs(userType: string, subscriptionStatus: string | null = null) {
  useAuthMock.mockReturnValue({
    user: { id: "u-1", email: "someone@example.com" },
    userType,
    loading: false,
    subscriptionStatus,
    subscriptionPlan: null,
    session: { access_token: "tok" },
  });
}

async function renderSpaces() {
  render(<SpacesPage />);
  expect(await screen.findByText(VENUE.name)).toBeTruthy();
}

beforeEach(() => {
  push.mockReset();
  useAuthMock.mockReset();
  useOutreachAllowanceMock.mockReset();
  useOutreachAllowanceMock.mockReturnValue({ loading: false, allowance: null, refresh: vi.fn() });
  authFetchMock.mockReset();
  authFetchMock.mockImplementation((url: string) => {
    if (url.startsWith("/api/venues/demand")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ venues: [VENUE], stats: null }),
      } as unknown as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as unknown as Response);
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ works: [] }) }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/spaces venue card messaging (A15)", () => {
  it("does not offer a customer a Message control that leads into the venue portal", async () => {
    signedInAs("customer");
    await renderSpaces();
    expect(screen.queryByRole("button", { name: "Message" })).toBeNull();
  });

  it("never routes a customer anywhere near /venue-portal", async () => {
    signedInAs("customer");
    await renderSpaces();
    const message = screen.queryByRole("button", { name: "Message" });
    if (message) fireEvent.click(message);
    const destinations = push.mock.calls.map((c) => String(c[0]));
    expect(destinations.some((d) => d.includes("/venue-portal"))).toBe(false);
  });

  it("still lets a customer reach the venue's public profile", async () => {
    signedInAs("customer");
    await renderSpaces();
    const hrefs = (screen.getAllByRole("link") as HTMLAnchorElement[]).map((l) => l.getAttribute("href"));
    expect(hrefs).toContain(`/venues/${VENUE.slug}`);
  });

  it("still gives a subscribed artist the Message control, pointed at their own portal", async () => {
    signedInAs("artist", "active");
    await renderSpaces();
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const dest = String(push.mock.calls[0][0]);
    expect(dest.startsWith("/artist-portal/messages?")).toBe(true);
    expect(dest).toContain(`artist=${VENUE.slug}`);
    expect(dest).toContain("artistName=The%20Copper%20Kettle");
  });
});

describe("an artist under review is told so, not sold a subscription (owner instruction, 2 September)", () => {
  afterEach(() => {
    currentArtistState.artist = null;
  });

  it("explains that venue names unlock on approval and points at the profile, not pricing", async () => {
    currentArtistState.artist = { isVerified: false };
    signedInAs("artist", null);
    render(<SpacesPage />);
    expect(await screen.findByText(/Venue names are shown once your application is approved/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /view plans/i })).toBeNull();
    expect(screen.queryByText(/Subscribe to see venue name/)).toBeNull();
  });

  it("still asks an approved but unsubscribed artist to subscribe", async () => {
    currentArtistState.artist = { isVerified: true };
    signedInAs("artist", null);
    render(<SpacesPage />);
    expect(await screen.findByText(/Subscribe to see full venue details/)).toBeTruthy();
  });
});


describe("venues with public walls", () => {
  it("advertises the walls on the card and links an artist straight to them", async () => {
    authFetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/venues/demand")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ venues: [{ ...VENUE, publicWallCount: 2 }], stats: null }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as unknown as Response);
    });
    signedInAs("artist", "active");
    currentArtistState.artist = { isVerified: true };
    await renderSpaces();
    expect(screen.getByText("2 walls measured up")).toBeTruthy();
    const link = screen.getByRole("link", { name: "View walls" });
    expect(link.getAttribute("href")).toBe("/venues/copper-kettle#walls");
  });

  it("says nothing about walls when the venue has none", async () => {
    signedInAs("artist", "active");
    currentArtistState.artist = { isVerified: true };
    await renderSpaces();
    expect(screen.queryByText(/measured up/)).toBeNull();
    expect(screen.queryByRole("link", { name: /View walls?/ })).toBeNull();
  });
});
