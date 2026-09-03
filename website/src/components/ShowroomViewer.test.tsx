// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ShowroomViewer from "./ShowroomViewer";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

afterEach(() => cleanup());

const WALLS = [
  { id: "w1", name: "Studio wall", width_cm: 300, height_cm: 240, kind: "uploaded" as const, wall_color_hex: "F5F1EB", preview_image_url: "https://p/w1.webp", source_image_url: null },
  { id: "w2", name: "Hallway", width_cm: 200, height_cm: 150, kind: "preset" as const, wall_color_hex: "FFFFFF", preview_image_url: null, source_image_url: "https://p/w2.jpg" },
  { id: "w3", name: "No picture", width_cm: 200, height_cm: 150, kind: "preset" as const, wall_color_hex: "FFFFFF", preview_image_url: null, source_image_url: null },
];

describe("<ShowroomViewer />", () => {
  it("opens on the first wall with a picture, lets you move to another, and links back to the artist", () => {
    render(<ShowroomViewer artistName="Maya Chen" artistSlug="maya-chen" walls={WALLS} />);
    expect((screen.getByAltText("Studio wall, 300 by 240 cm") as HTMLImageElement).getAttribute("src")).toBe("https://p/w1.webp");
    expect(screen.getByRole("tab", { name: /Hallway/ }).getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByRole("tab", { name: /Hallway/ }));
    expect((screen.getByAltText("Hallway, 200 by 150 cm") as HTMLImageElement).getAttribute("src")).toBe("https://p/w2.jpg");
    expect(screen.queryByRole("tab", { name: /No picture/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Back to Maya Chen/ }).getAttribute("href")).toBe("/browse/maya-chen");
    expect(screen.getByRole("button", { name: "Fullscreen" })).toBeTruthy();
    expect(screen.getByTestId("pan-zoom")).toBeTruthy();
  });

  it("honours a requested wall", () => {
    render(<ShowroomViewer artistName="Maya Chen" artistSlug="maya-chen" walls={WALLS} initialWallId="w2" />);
    expect(screen.getByAltText("Hallway, 200 by 150 cm")).toBeTruthy();
  });

  it("says so when there is nothing to show", () => {
    render(<ShowroomViewer artistName="Maya Chen" artistSlug="maya-chen" walls={[WALLS[2]]} />);
    expect(screen.getByText(/showroom is empty/)).toBeTruthy();
  });
});
