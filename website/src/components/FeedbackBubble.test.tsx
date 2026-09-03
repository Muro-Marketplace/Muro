// @vitest-environment jsdom
// The bubble and the wall visualiser's Preview pill both live at
// bottom-right. An editor that is mounted holds the bubble hidden so it
// can never sit on top of the button the editor exists for.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("<FeedbackBubble /> minimise", () => {
  it("hides to a small dot on the minus control, remembers it, and comes back on the dot", () => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => store.clear(),
        key: () => null,
        length: 0,
      },
    });
    render(<FeedbackBubble />);
    fireEvent.click(screen.getByRole("button", { name: "Hide feedback button" }));
    expect(screen.queryByRole("button", { name: "Feedback and feature requests" })).toBeNull();
    expect(store.get("wallplace.feedback.minimised")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Show feedback button" }));
    expect(screen.getByRole("button", { name: "Feedback and feature requests" })).toBeTruthy();
    expect(store.get("wallplace.feedback.minimised")).toBe("0");
  });
});
