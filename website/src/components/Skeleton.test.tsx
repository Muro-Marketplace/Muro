// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Skeleton from "./Skeleton";

describe("<Skeleton />", () => {
  it("renders an aria-hidden pulsing block", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toContain("animate-pulse");
  });

  it("merges caller className", () => {
    const { container } = render(<Skeleton className="h-8 w-32" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-8");
    expect(el.className).toContain("w-32");
  });
});
