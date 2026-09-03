// @vitest-environment jsdom
// The bubble and the wall visualiser's Preview pill both live at
// bottom-right. An editor that is mounted holds the bubble hidden so it
// can never sit on top of the button the editor exists for.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn(() => "/browse") }));
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }));

import FeedbackBubble from "./FeedbackBubble";
import {
  _resetFeedbackBubbleVisibility,
  hideFeedbackBubble,
} from "@/lib/ui/feedback-bubble-visibility";

beforeEach(() => {
  _resetFeedbackBubbleVisibility();
  pathnameMock.mockReturnValue("/browse");
});
afterEach(() => cleanup());

const bubble = () => screen.queryByRole("button", { name: /feedback and feature requests/i });

describe("<FeedbackBubble />", () => {
  it("renders on an ordinary page", () => {
    render(<FeedbackBubble />);
    expect(bubble()).not.toBeNull();
  });

  it("still opts out on legal pages", () => {
    pathnameMock.mockReturnValue("/terms");
    render(<FeedbackBubble />);
    expect(bubble()).toBeNull();
  });

  it("renders nothing while an editor holds it hidden, and comes back on release", () => {
    render(<FeedbackBubble />);
    expect(bubble()).not.toBeNull();

    let release: () => void = () => {};
    act(() => {
      release = hideFeedbackBubble();
    });
    expect(bubble()).toBeNull();

    act(() => release());
    expect(bubble()).not.toBeNull();
  });

  it("stays hidden while any one of several holders remains", () => {
    render(<FeedbackBubble />);
    let releaseA: () => void = () => {};
    let releaseB: () => void = () => {};
    act(() => {
      releaseA = hideFeedbackBubble();
      releaseB = hideFeedbackBubble();
    });
    act(() => releaseA());
    expect(bubble()).toBeNull();
    act(() => releaseB());
    expect(bubble()).not.toBeNull();
  });
});
