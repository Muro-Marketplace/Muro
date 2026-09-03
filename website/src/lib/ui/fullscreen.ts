/**
 * Fullscreen for a saved wall picture. Uses the Fullscreen API where the
 * browser has it (Safari on iPhone does not for arbitrary elements); when
 * it is missing nothing happens and the caller's page stays as it was.
 */
export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  return typeof document.documentElement.requestFullscreen === "function";
}

export async function toggleFullscreen(el: HTMLElement | null): Promise<boolean> {
  if (!el || !fullscreenSupported()) return false;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return false;
    }
    await el.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

/**
 * Fullscreen for a viewer box that also works where the API is missing.
 * Returns [ref, state]: put the ref on the box, read the state in render
 * (iPhone Safari allows fullscreen for video only). With the API, the box
 * goes native. Without it, the box is pinned over the whole viewport with
 * the `wp-fake-fullscreen` class and an Exit control the caller renders;
 * Escape leaves either way.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useFullscreenBox<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [fake, setFake] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setNative(!!document.fullscreenElement && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (!fake) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFake(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fake]);

  const toggle = useCallback(async () => {
    if (fullscreenSupported()) {
      await toggleFullscreen(ref.current);
      return;
    }
    setFake((f) => !f);
  }, []);

  const exit = useCallback(() => {
    setFake(false);
    if (typeof document !== "undefined" && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  // The ref travels separately from the state so callers can read the
  // state during render without the refs lint treating it as a ref.
  const state = { active: fake || native, fake, toggle, exit, boxClassName: fake ? "wp-fake-fullscreen" : "" };
  return [ref, state] as const;
}
