/**
 * Who has asked the feedback bubble to get out of the way.
 *
 * The bubble is `fixed bottom-3 right-3`, and so is the wall visualiser's
 * floating Preview pill, so with both on screen the bubble sits on top of
 * the one button the editor exists for. Full-screen editors call
 * `hideFeedbackBubble()` on mount and the returned release on unmount;
 * the bubble subscribes with `useFeedbackBubbleHidden()` and renders
 * nothing while anyone holds it hidden.
 *
 * Ref-counted rather than a boolean so two overlays (or React StrictMode's
 * double mount) cannot show the bubble while the other is still open.
 * Module state, not context: the bubble is mounted by the root layouts and
 * the editors are deep in unrelated trees.
 */

import { useSyncExternalStore } from "react";

let holders = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** True while at least one caller holds the bubble hidden. */
export function isFeedbackBubbleHidden(): boolean {
  return holders > 0;
}

/**
 * Hide the bubble. Returns a release that undoes exactly this call and is
 * safe to invoke more than once; `showFeedbackBubble()` is the same thing
 * for callers that prefer the pair.
 */
export function hideFeedbackBubble(): () => void {
  holders += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    showFeedbackBubble();
  };
}

/** Release one hold. Never goes below zero. */
export function showFeedbackBubble(): void {
  if (holders === 0) return;
  holders -= 1;
  emit();
}

export function subscribeFeedbackBubble(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Server snapshot is "visible": the bubble renders on first paint as before. */
const getServerSnapshot = () => false;

export function useFeedbackBubbleHidden(): boolean {
  return useSyncExternalStore(subscribeFeedbackBubble, isFeedbackBubbleHidden, getServerSnapshot);
}

/** Test-only: drop every hold and listener. */
export function _resetFeedbackBubbleVisibility(): void {
  holders = 0;
  listeners.clear();
}
