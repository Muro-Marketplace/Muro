"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

/**
 * Height for a sticky, internally scrolling sidebar.
 *
 * `max-h-[calc(100vh-6rem)]` assumed the sidebar was already pinned at its
 * sticky offset. At the top of the page it sits lower (under the header
 * and tabs), so that height overflowed the viewport and the inner scroll
 * ran out before the last filters (owner-reported 2 September: "stuck
 * before Theme" until the page itself was scrolled). This measures the
 * sidebar's live top on scroll and resize and fits it to what is visible.
 */
export function useStickySidebarHeight(stickyTopPx = 80, bottomGapPx = 16): {
  ref: (el: HTMLElement | null) => void;
  style: CSSProperties;
} {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);

  useEffect(() => {
    if (!el) return;
    let frame = 0;
    let pending = false;
    const measure = () => {
      pending = false;
      const top = Math.max(el.getBoundingClientRect().top, stickyTopPx);
      const next = Math.max(160, Math.round(window.innerHeight - top - bottomGapPx));
      // Runs in a frame callback, never synchronously in the effect body; the
      // lint rule cannot see through requestAnimationFrame.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMaxHeight((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      frame = window.requestAnimationFrame(measure);
    };
    // First measurement goes through the same frame callback as the rest, so
    // no state is set synchronously inside the effect.
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (pending) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [el, stickyTopPx, bottomGapPx]);

  return { ref, style: maxHeight === undefined ? {} : { maxHeight } };
}
