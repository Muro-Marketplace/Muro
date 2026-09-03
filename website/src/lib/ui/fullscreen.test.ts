// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fullscreenSupported, toggleFullscreen } from "./fullscreen";

describe("toggleFullscreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (document.documentElement as unknown as { requestFullscreen?: unknown }).requestFullscreen;
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
  });

  it("does nothing when the browser has no Fullscreen API", async () => {
    expect(fullscreenSupported()).toBe(false);
    expect(await toggleFullscreen(document.createElement("div"))).toBe(false);
  });

  it("enters fullscreen on the element, and exits when already fullscreen", async () => {
    const el = document.createElement("div");
    const request = vi.fn(async () => {});
    (document.documentElement as unknown as { requestFullscreen: unknown }).requestFullscreen = request;
    (el as unknown as { requestFullscreen: unknown }).requestFullscreen = request;
    expect(await toggleFullscreen(el)).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "fullscreenElement", { value: el, configurable: true });
    const exit = vi.fn(async () => {});
    (document as unknown as { exitFullscreen: unknown }).exitFullscreen = exit;
    expect(await toggleFullscreen(el)).toBe(false);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
