// @vitest-environment jsdom
/**
 * Artist Showroom list, brought back on 2026-09-03 (parked 2026-08-28).
 * The page lists the artist's own walls from GET /api/walls and links each
 * to its editor; an artist with none sees the empty state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => true }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ session: { access_token: "tok-artist" }, loading: false }),
}));
vi.mock("@/components/ArtistPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => <img alt={props.alt} src={props.src} />,
}));

import ArtistShowroomPage from "./page";

const fetchMock = vi.fn();

function respondWithWalls(walls: unknown[]) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/walls") return new Response(JSON.stringify({ walls }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/artist-portal/showroom", () => {
  it("lists the artist's walls and links each to its editor", async () => {
    respondWithWalls([
      { id: "w1", owner_type: "artist", name: "Studio wall", kind: "preset", width_cm: 300, height_cm: 240, wall_color_hex: "F5F1EB" },
      { id: "w2", owner_type: "venue", name: "Not mine", kind: "preset", width_cm: 300, height_cm: 240, wall_color_hex: "F5F1EB" },
    ]);
    render(<ArtistShowroomPage />);
    const link = await screen.findByRole("link", { name: /Studio wall/ });
    expect(link.getAttribute("href")).toBe("/artist-portal/showroom/w1");
    expect(screen.queryByText(/Not mine/)).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/walls");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-artist");
  });

  it("shows the empty state with a way to create the first showroom", async () => {
    respondWithWalls([]);
    render(<ArtistShowroomPage />);
    expect(await screen.findByText("No showrooms yet")).toBeTruthy();
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/artist-portal/showroom/new");
  });
});
