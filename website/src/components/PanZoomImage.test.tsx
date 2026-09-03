// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PanZoomImage, { PAN_ZOOM_MAX } from "./PanZoomImage";

afterEach(() => cleanup());

function transformOf() {
  return (screen.getByAltText("Studio wall") as HTMLImageElement).style.transform;
}

describe("<PanZoomImage />", () => {
  it("starts at scale 1 with no offset and zooms with the controls", () => {
    render(<PanZoomImage src="https://x/y.webp" alt="Studio wall" />);
    expect(transformOf()).toBe("translate(0px, 0px) scale(1)");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(transformOf()).toContain("scale(1.5)");
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(transformOf()).toBe("translate(0px, 0px) scale(1)");
  });

  it("pans with a pointer drag", () => {
    render(<PanZoomImage src="https://x/y.webp" alt="Studio wall" />);
    const box = screen.getByTestId("pan-zoom");
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 140, clientY: 70 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(transformOf()).toBe("translate(40px, -30px) scale(1)");
  });

  it("never zooms past the ceiling and never below 1", () => {
    render(<PanZoomImage src="https://x/y.webp" alt="Studio wall" />);
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(transformOf()).toContain(`scale(${PAN_ZOOM_MAX})`);
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(transformOf()).toContain("scale(1)");
  });
});
