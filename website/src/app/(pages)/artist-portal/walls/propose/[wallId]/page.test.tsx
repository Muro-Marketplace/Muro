// @vitest-environment jsdom
// The propose page loads the venue's public wall and the venue, then mounts
// the visualiser in artist_venue_wall mode; a wall that is not available
// says so and points back to the venue.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { searchParams } = vi.hoisted(() => ({ searchParams: { value: "venue=copper-kettle" } }));

vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => true }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ session: { access_token: "tok-artist" }, loading: false }),
}));
vi.mock("@/components/ArtistPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParams.value),
  useParams: () => ({ wallId: "w1" }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
// The visualiser is Konva-backed; the page's job is to mount it with the
// right mode, wall and venue, which the stub records.
vi.mock("next/dynamic", () => ({
  default: () =>
    function VisualizerStub(props: { mode: string; wall?: { name: string }; venue?: { name: string }; bgImageUrl?: string | null }) {
      return (
        <div
          data-testid="visualizer"
          data-mode={props.mode}
          data-wall={props.wall?.name}
          data-venue={props.venue?.name}
          data-bg={props.bgImageUrl ?? ""}
        />
      );
    },
}));

import ProposeOnWallPage from "./page";

const WALL = {
  id: "w1",
  name: "Front room",
  width_cm: 300,
  height_cm: 240,
  kind: "uploaded",
  preset_id: null,
  wall_color_hex: "F5F1EB",
  source_image_url: "https://signed.example/front",
};
const VENUE = {
  slug: "copper-kettle",
  name: "The Copper Kettle",
  interested_in_revenue_share: true,
  interested_in_free_loan: false,
  interested_in_direct_purchase: true,
};

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";
  searchParams.value = "venue=copper-kettle";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/venues/copper-kettle/walls/w1") return json({ wall: WALL });
    if (url === "/api/venues/copper-kettle") return json({ venue: VENUE });
    return json({ error: "unexpected" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});


describe("/artist-portal/walls/propose/[wallId]", () => {
  it("loads the wall and the venue with the bearer token and mounts the visualiser in artist_venue_wall mode", async () => {
    render(<ProposeOnWallPage />);
    const stub = await screen.findByTestId("visualizer");

    expect(stub.getAttribute("data-mode")).toBe("artist_venue_wall");
    expect(stub.getAttribute("data-wall")).toBe("Front room");
    expect(stub.getAttribute("data-venue")).toBe("The Copper Kettle");
    expect(stub.getAttribute("data-bg")).toBe("https://signed.example/front");
    expect(screen.getByRole("link", { name: /Back to The Copper Kettle/ }).getAttribute("href")).toBe("/venues/copper-kettle");
    expect(screen.getByText(/300 × 240 cm/)).toBeTruthy();

    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain("/api/venues/copper-kettle/walls/w1");
    expect(urls).toContain("/api/venues/copper-kettle");
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok-artist" });
    }
  });

  it("says the wall is not available when the wall read 404s, with a way back to the venue", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/venues/copper-kettle" ? json({ venue: VENUE }) : json({ error: "Wall not found" }, 404),
    );
    render(<ProposeOnWallPage />);
    await screen.findByText(/This wall isn.t available to propose on/);
    expect(screen.getByRole("link", { name: "Back to the venue" }).getAttribute("href")).toBe("/venues/copper-kettle");
    expect(screen.queryByTestId("visualizer")).toBeNull();
  });

  it("is unavailable without a venue in the link, and fetches nothing", async () => {
    searchParams.value = "";
    render(<ProposeOnWallPage />);
    await screen.findByText(/This wall isn.t available to propose on/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
