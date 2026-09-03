// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { fullscreenSupported, toggleFullscreen, useFullscreenBox } from "./fullscreen";

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

describe("useFullscreenBox", () => {
  it("falls back to a pinned box where the API is missing, and Escape leaves it", () => {
    const { result } = renderHook(() => useFullscreenBox());
    expect(result.current[1].active).toBe(false);
    expect(result.current[1].boxClassName).toBe("");
    act(() => {
      void result.current[1].toggle();
    });
    expect(result.current[1].fake).toBe(true);
    expect(result.current[1].active).toBe(true);
    expect(result.current[1].boxClassName).toBe("wp-fake-fullscreen");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current[1].active).toBe(false);
  });

  it("uses the real API when the browser has it", async () => {
    const request = vi.fn(async () => {});
    (document.documentElement as unknown as { requestFullscreen: unknown }).requestFullscreen = request;
    const { result } = renderHook(() => useFullscreenBox());
    const el = document.createElement("div");
    (el as unknown as { requestFullscreen: unknown }).requestFullscreen = request;
    (result.current[0] as unknown as { current: HTMLDivElement }).current = el;
    await act(async () => {
      await result.current[1].toggle();
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current[1].fake).toBe(false);
  });
});
