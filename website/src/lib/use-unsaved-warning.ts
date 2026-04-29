import { useEffect } from "react";

/**
 * Warns the user before they navigate away with unsaved changes.
 *
 * Two layers of protection (Next.js router handles client-side
 * navigation differently from browser-level events, so we need both):
 *
 *   1. `beforeunload`, closing the tab, hard refresh, typing a new
 *      URL, or browser back/forward. Browser shows its own dialog;
 *      we just need to opt-in.
 *
 *   2. Capture-phase click listener on anchor tags, Next.js client
 *      navigation goes through `<Link>`, which renders a real `<a>`
 *      that the framework intercepts on click. We hook the click
 *      first (capture phase) and pop a confirm() if the destination
 *      is a different path on the same origin. The user cancelling
 *      the confirm preventDefaults the click so Next.js never sees
 *      it. Modifier-key clicks (cmd/ctrl/shift = open in new tab)
 *      are passed through untouched.
 *
 * Listener only attaches while `dirty` is true so clean forms have
 * zero overhead.
 *
 * Usage:
 *   useUnsavedWarning(hasUnsavedChanges);
 */
export function useUnsavedWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const beforeunload = (e: BeforeUnloadEvent) => {
      // Most browsers ignore custom messages and show their own, but
      // the preventDefault + returnValue pair is required to trigger
      // the native "Are you sure you want to leave?" dialog.
      e.preventDefault();
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      // Modifier clicks open in new tab, let those through.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;
      // Skip download links + anchors that explicitly opt out.
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "" && anchor.target !== "_self") {
        return;
      }
      try {
        const url = new URL(anchor.href, window.location.origin);
        // External links, the browser's beforeunload listener will
        // catch those independently.
        if (url.origin !== window.location.origin) return;
        // Same path / hash-only navigation, not a real move.
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        ) {
          return;
        }
      } catch {
        return;
      }
      const ok = window.confirm(
        "You have unsaved changes. Leave without saving?",
      );
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", beforeunload);
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("beforeunload", beforeunload);
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [dirty]);
}
