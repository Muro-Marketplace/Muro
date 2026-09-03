// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useStickySidebarHeight } from "./useStickySidebarHeight";

let topPx = 300;

function Sidebar() {
  const { ref, style } = useStickySidebarHeight(80, 16);
  return (
    <aside
      data-testid="aside"
      ref={(node) => {
        if (node) {
          node.getBoundingClientRect = () => ({ top: topPx, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: topPx, toJSON: () => ({}) });
        }
        ref(node);
      }}
      style={style}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useStickySidebarHeight", () => {
  it("fits the sidebar to the space below its live top at the top of the page", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
    topPx = 300;
    const { getByTestId } = render(<Sidebar />);
    expect(getByTestId("aside").style.maxHeight).toBe("484px");
  });

  it("uses the sticky offset once the page has scrolled past it", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
    topPx = 300;
    const { getByTestId } = render(<Sidebar />);
    topPx = 40;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(getByTestId("aside").style.maxHeight).toBe("704px");
  });
});
