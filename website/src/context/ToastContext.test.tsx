// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastContext";

afterEach(() => cleanup());

function Trigger({
  variant,
  durationMs,
}: {
  variant?: "info" | "warn" | "error";
  durationMs?: number;
}) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast("Heads up", { variant, durationMs })}>
      fire
    </button>
  );
}

describe("ToastContext extensions", () => {
  it("respects custom duration", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger durationMs={5000} variant="warn" />
      </ToastProvider>,
    );
    act(() => screen.getByText("fire").click());
    expect(screen.getByText("Heads up")).toBeTruthy();
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.queryByText("Heads up")).not.toBeNull();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByText("Heads up")).toBeNull();
    vi.useRealTimers();
  });

  it("falls back to 3 s when no duration is supplied", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => screen.getByText("fire").click());
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText("Heads up")).not.toBeNull();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByText("Heads up")).toBeNull();
    vi.useRealTimers();
  });
});
