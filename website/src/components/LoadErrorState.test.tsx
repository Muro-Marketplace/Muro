// @vitest-environment jsdom
// Launch audit 2026-09-05. About twenty portal pages rendered their empty state
// ("No offers yet", "No placements found", "No saved addresses") when the
// request behind them failed. This is the one block they render instead, so a
// failure reads as a failure and can be retried.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import LoadErrorState from "./LoadErrorState";

afterEach(() => cleanup());

describe("<LoadErrorState />", () => {
  it("announces the message as an alert", () => {
    render(<LoadErrorState message="Could not load your offers. Please try again." />);
    expect(screen.getByRole("alert").textContent).toContain("Could not load your offers.");
  });

  it("offers a Retry that calls back, only when a handler is given", () => {
    const onRetry = vi.fn();
    render(<LoadErrorState message="Failed" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    cleanup();
    render(<LoadErrorState message="Failed" />);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
