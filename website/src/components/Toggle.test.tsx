// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import Toggle from "./Toggle";

afterEach(() => cleanup());

describe("<Toggle />", () => {
  it("renders an unchecked toggle when checked is false", () => {
    const { getByRole } = render(
      <Toggle checked={false} onChange={() => {}} />
    );
    const btn = getByRole("button");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.className).toContain("bg-border");
    expect(btn.className).not.toContain("bg-accent");
  });

  it("renders a checked toggle when checked is true", () => {
    const { getByRole } = render(
      <Toggle checked onChange={() => {}} />
    );
    const btn = getByRole("button");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.className).toContain("bg-accent");
  });

  it("calls onChange with the inverse value when clicked", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <Toggle checked={false} onChange={onChange} />
    );
    fireEvent.click(getByRole("button"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange with false when an already-on toggle is clicked", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <Toggle checked onChange={onChange} />
    );
    fireEvent.click(getByRole("button"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does not call onChange when disabled", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <Toggle checked={false} onChange={onChange} disabled />
    );
    fireEvent.click(getByRole("button"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses the compact track width when size='compact'", () => {
    const { getByRole } = render(
      <Toggle checked={false} onChange={() => {}} size="compact" />
    );
    expect(getByRole("button").className).toContain("w-9");
  });

  it("uses the standard track width by default", () => {
    const { getByRole } = render(
      <Toggle checked={false} onChange={() => {}} />
    );
    expect(getByRole("button").className).toContain("w-10");
  });

  it("forwards ariaLabel to the button for screen readers", () => {
    const { getByLabelText } = render(
      <Toggle checked={false} onChange={() => {}} ariaLabel="Paid loan" />
    );
    expect(getByLabelText("Paid loan")).toBeTruthy();
  });
});
