// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetFeedbackBubbleVisibility,
  hideFeedbackBubble,
  isFeedbackBubbleHidden,
  showFeedbackBubble,
  subscribeFeedbackBubble,
  useFeedbackBubbleHidden,
} from "./feedback-bubble-visibility";

beforeEach(() => _resetFeedbackBubbleVisibility());
afterEach(() => cleanup());

describe("feedback bubble visibility store", () => {
  it("starts visible", () => {
    expect(isFeedbackBubbleHidden()).toBe(false);
  });

  it("stays hidden until every holder has released", () => {
    const releaseA = hideFeedbackBubble();
    const releaseB = hideFeedbackBubble();
    expect(isFeedbackBubbleHidden()).toBe(true);
    releaseA();
    expect(isFeedbackBubbleHidden()).toBe(true);
    releaseB();
    expect(isFeedbackBubbleHidden()).toBe(false);
  });

  it("ignores a release called twice", () => {
    const release = hideFeedbackBubble();
    hideFeedbackBubble();
    release();
    release();
    expect(isFeedbackBubbleHidden()).toBe(true);
  });

  it("never goes negative on a stray show", () => {
    showFeedbackBubble();
    showFeedbackBubble();
    expect(isFeedbackBubbleHidden()).toBe(false);
    hideFeedbackBubble();
    expect(isFeedbackBubbleHidden()).toBe(true);
  });

  it("notifies subscribers on every change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFeedbackBubble(listener);
    const release = hideFeedbackBubble();
    release();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    hideFeedbackBubble();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

function Probe() {
  const hidden = useFeedbackBubbleHidden();
  return <span data-testid="probe">{hidden ? "hidden" : "visible"}</span>;
}

describe("useFeedbackBubbleHidden", () => {
  it("re-renders the subscriber when a hold is taken and released", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("visible");

    let release: () => void = () => {};
    act(() => {
      release = hideFeedbackBubble();
    });
    expect(screen.getByTestId("probe").textContent).toBe("hidden");

    act(() => release());
    expect(screen.getByTestId("probe").textContent).toBe("visible");
  });

  it("reads an existing hold on mount", () => {
    hideFeedbackBubble();
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("hidden");
  });
});
