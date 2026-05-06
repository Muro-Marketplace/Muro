// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import SearchInput from "./SearchInput";

describe("<SearchInput />", () => {
  it("calls onChange after the debounce window", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { container } = render(
      <SearchInput value="" onChange={onChange} placeholder="Search" />,
    );
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "alice" } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(199));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2));
    expect(onChange).toHaveBeenCalledWith("alice");
    vi.useRealTimers();
  });

  it("renders the current value as the input default", () => {
    const { container } = render(
      <SearchInput value="hello" onChange={() => {}} />,
    );
    expect((container.querySelector("input") as HTMLInputElement).value).toBe(
      "hello",
    );
  });

  it("renders a clear button when there is text, calls onChange('') on click", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SearchInput value="alice" onChange={onChange} />,
    );
    const clearBtn = container.querySelector(
      'button[aria-label="Clear search"]',
    )!;
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("re-syncs local state when value prop changes externally", () => {
    const { container, rerender } = render(
      <SearchInput value="first" onChange={() => {}} />,
    );
    expect((container.querySelector("input") as HTMLInputElement).value).toBe(
      "first",
    );
    rerender(<SearchInput value="second" onChange={() => {}} />);
    expect((container.querySelector("input") as HTMLInputElement).value).toBe(
      "second",
    );
  });
});
