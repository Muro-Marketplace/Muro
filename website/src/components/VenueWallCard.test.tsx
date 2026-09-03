// @vitest-environment jsdom
// The public wall card shows the preview the venue saved from the editor
// when there is one, so artists see the wall as it was built, and falls
// back to the bare photo or the colour swatch otherwise.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ userType: null }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
// next/image needs the optimiser; a plain img keeps the src inspectable.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import VenueWallCard from "./VenueWallCard";

const VENUE = { slug: "copper-kettle", name: "The Copper Kettle" };

const BASE = {
  id: "w1",
  name: "Front room",
  width_cm: 300,
  height_cm: 240,
  kind: "uploaded" as const,
  wall_color_hex: "F5F1EB",
  source_image_url: "https://signed.example/photo.jpg",
};

afterEach(() => cleanup());

const images = () => Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));

describe("<VenueWallCard />", () => {
  it("shows the saved preview in place of the bare wall photo", () => {
    render(
      <VenueWallCard
        wall={{ ...BASE, preview_image_url: "https://cdn.example/wall-renders/u/r1.webp" }}
        venue={VENUE}
      />,
    );
    expect(images()).toEqual(["https://cdn.example/wall-renders/u/r1.webp"]);
    const img = screen.getByRole("img");
    expect(img.getAttribute("alt")).toMatch(/Front room, with artwork previewed on it/);
  });

  it("opens the lightbox with the preview at full size", () => {
    render(
      <VenueWallCard
        wall={{ ...BASE, preview_image_url: "https://cdn.example/wall-renders/u/r1.webp" }}
        venue={VENUE}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /view front room wall/i }));
    const dialog = screen.getByRole("dialog");
    const lightboxImg = dialog.querySelector("img");
    expect(lightboxImg?.getAttribute("src")).toBe("https://cdn.example/wall-renders/u/r1.webp");
    expect(dialog.textContent).toMatch(/300 × 240 cm/);
  });

  it("falls back to the wall photo when no preview has been saved", () => {
    render(<VenueWallCard wall={BASE} venue={VENUE} />);
    expect(images()).toEqual(["https://signed.example/photo.jpg"]);
    expect(screen.getByRole("img").getAttribute("alt")).toBe("Front room");
  });

  it("falls back to the colour swatch for a preset wall with no preview", () => {
    render(
      <VenueWallCard
        wall={{ ...BASE, kind: "preset", source_image_url: undefined }}
        venue={VENUE}
      />,
    );
    expect(images()).toEqual([]);
  });

  it("prefers the preview even for a preset wall", () => {
    render(
      <VenueWallCard
        wall={{
          ...BASE,
          kind: "preset",
          source_image_url: undefined,
          preview_image_url: "https://cdn.example/wall-renders/u/r2.webp",
        }}
        venue={VENUE}
      />,
    );
    expect(images()).toEqual(["https://cdn.example/wall-renders/u/r2.webp"]);
  });
});
