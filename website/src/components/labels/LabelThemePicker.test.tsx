// @vitest-environment jsdom
// Owner decision 2026-09-02: QR label colour moved off Edit Profile (where
// it was Premium-gated) onto the label-printing screens, free for every
// plan. LabelThemeCard from the profile page was adapted into this shared
// swatch picker so the artist and venue labels pages render the same four
// options the same way.
//
// No @testing-library/jest-dom matchers here, this repo doesn't wire them
// up (no setupFiles, nothing imports it), so assertions use plain
// vitest/DOM: `.toBeTruthy()` and reading attributes/properties directly.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import LabelThemePicker from "./LabelThemePicker";
import { LABEL_THEMES } from "@/lib/profile-themes";

afterEach(() => cleanup());

describe("LabelThemePicker", () => {
  it("renders all four label themes as swatches", () => {
    render(<LabelThemePicker value="classic" onChange={vi.fn()} />);
    for (const theme of LABEL_THEMES) {
      expect(screen.getByRole("button", { name: theme.label })).toBeTruthy();
    }
  });

  it("marks only the current value as selected via aria-pressed", () => {
    render(<LabelThemePicker value="dark" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Classic (white)" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Warm cream" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Accent" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onChange with the picked theme's id when a swatch is clicked", () => {
    const onChange = vi.fn();
    render(<LabelThemePicker value="classic" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Warm cream" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("warm");
  });

  it("shows the default 'Label colour' heading unless a custom (or empty) label is passed", () => {
    const { rerender } = render(<LabelThemePicker value="classic" onChange={vi.fn()} />);
    expect(screen.getByText("Label colour")).toBeTruthy();

    rerender(<LabelThemePicker value="classic" onChange={vi.fn()} label="" />);
    expect(screen.queryByText("Label colour")).toBeNull();
  });

  it("has no Premium/upgrade gating, nothing is disabled regardless of value", () => {
    render(<LabelThemePicker value="unknown-theme-id" onChange={vi.fn()} />);
    for (const theme of LABEL_THEMES) {
      const button = screen.getByRole("button", { name: theme.label }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    }
  });
});
