// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// next/image needs a plain img in jsdom. Forward alt and src only; `fill` and
// friends are not valid DOM attributes.
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import WorkThumb from "./WorkThumb";

afterEach(() => cleanup());

describe("WorkThumb", () => {
  it("renders the artwork with its title as alt text", () => {
    render(<WorkThumb src="https://cdn.example/harbour.jpg" alt="Harbour Light" />);
    const img = screen.getByRole("img", { name: "Harbour Light" });
    expect(img.getAttribute("src")).toBe("https://cdn.example/harbour.jpg");
  });

  it("renders a placeholder instead of an empty frame when there is no image", () => {
    // The placements call sites passed src="" for a work with no image, which
    // Next's Image rejects outright.
    for (const src of ["", "   ", null, undefined]) {
      const { container } = render(<WorkThumb src={src} alt="Untitled" />);
      expect(screen.queryByRole("img")).toBeNull();
      expect(container.querySelector("svg")).toBeTruthy();
      cleanup();
    }
  });

  it("hides the placeholder from assistive tech, since the title is already in the row", () => {
    const { container } = render(<WorkThumb src={null} alt="Untitled" />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("sizes the box from the size prop", () => {
    const { container } = render(<WorkThumb src="x.jpg" alt="a" size="sm" />);
    expect(container.firstElementChild?.className).toContain("w-8 h-8");
    cleanup();
    const { container: big } = render(<WorkThumb src="x.jpg" alt="a" size="xl" />);
    expect(big.firstElementChild?.className).toContain("w-16 h-16");
  });

  it("defaults to the 40px size used by most portal rows", () => {
    const { container } = render(<WorkThumb src="x.jpg" alt="a" />);
    expect(container.firstElementChild?.className).toContain("w-10 h-10");
  });

  it("carries the artwork protection hook when it actually shows artwork", () => {
    const { container } = render(<WorkThumb src="x.jpg" alt="a" />);
    expect(container.firstElementChild?.getAttribute("data-protected")).toBe("artwork");
  });
});
