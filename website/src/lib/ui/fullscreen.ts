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
