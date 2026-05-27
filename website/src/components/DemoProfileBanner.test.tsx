// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import DemoProfileBanner from "./DemoProfileBanner";

afterEach(() => cleanup());

describe("<DemoProfileBanner />", () => {
  it("renders the demo label and a link to the live marketplace", () => {
    const { getByText, getAllByRole } = render(<DemoProfileBanner />);
    expect(getByText(/Demo profile/i)).toBeTruthy();
    const link = getAllByRole("link").find(
      (a) => a.getAttribute("href") === "/browse",
    );
    expect(link).toBeTruthy();
  });

  it("renders a compact variant when compact is true", () => {
    const { container } = render(<DemoProfileBanner compact />);
    // Compact variant is small (no max-w-2xl, no big padding band).
    expect(container.querySelector(".max-w-2xl")).toBeNull();
    expect(container.textContent).toMatch(/Demo profile/i);
  });
});
