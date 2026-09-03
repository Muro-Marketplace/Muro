// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImageLightbox from "./ImageLightbox";

afterEach(() => cleanup());

describe("<ImageLightbox />", () => {
  it("renders nothing while closed", () => {
    const { container } = render(<ImageLightbox open={false} onClose={() => {}} src="https://x/y.webp" alt="Wall" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the picture full size with Fullscreen and Close, and closes on Escape", () => {
    const onClose = vi.fn();
    render(<ImageLightbox open onClose={onClose} src="https://x/y.webp" alt="Studio wall" title="Studio wall" subtitle="300 × 240 cm" />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByAltText("Studio wall") as HTMLImageElement).getAttribute("src")).toBe("https://x/y.webp");
    expect(screen.getByRole("button", { name: "Fullscreen" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
