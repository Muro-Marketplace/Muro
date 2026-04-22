import { useEffect } from "react";

/**
 * Attaches a beforeunload listener that warns the user before they leave
 * the page when they have unsaved changes. Listener only attaches when
 * `dirty` is true, so there's no overhead on clean forms.
 *
 * Usage:
 *   useUnsavedWarning(hasUnsavedChanges);
 */
export function useUnsavedWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Most browsers ignore custom messages and show their own, but the
      // preventDefault + returnValue pair is required to trigger the
      // native "Are you sure you want to leave?" dialog.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
