// @vitest-environment jsdom
// My Walls cards show the preview the venue saved from the editor when
// GET /api/walls carries one, otherwise the wall photo, otherwise the
// colour swatch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ session: { access_token: "tok" }, loading: false }),
}));
vi.mock("@/components/VenuePortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={rest.className}>
      {children}
    </a>
  ),
}));

import VenueWallsPage from "./page";

const WALLS = [
  {
    id: "w-preview",
    name: "Front room",
    kind: "uploaded",
    width_cm: 300,
    height_cm: 240,
    wall_color_hex: "F5F1EB",
    source_image_url: "https://signed.example/front.jpg",
    preview_image_url: "https://cdn.example/wall-renders/u/r1.webp",
  },
  {
    id: "w-photo",
    name: "Back room",
    kind: "uploaded",
    width_cm: 300,
    height_cm: 240,
    wall_color_hex: "F5F1EB",
    source_image_url: "https://signed.example/back.jpg",
  },
  {
    id: "w-swatch",
    name: "Bar",
    kind: "preset",
    width_cm: 300,
    height_cm: 240,
    wall_color_hex: "E5E1DA",
  },
];

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ walls: WALLS, cap: 6 }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/venue-portal/walls cards", () => {
  it("shows the saved preview, then the photo, then the swatch", async () => {
    render(<VenueWallsPage />);
    await screen.findByText("Front room");

    const srcs = Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs).toEqual([
      "https://cdn.example/wall-renders/u/r1.webp",
      "https://signed.example/back.jpg",
    ]);

    const previewImg = screen.getByAltText(/Front room, with artwork previewed on it/);
    expect(previewImg.getAttribute("src")).toBe("https://cdn.example/wall-renders/u/r1.webp");

    // The preset wall has no image at all, just its swatch.
    const barCard = screen.getByText("Bar").closest("a");
    expect(barCard?.querySelector("img")).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/walls");
  });
});
