// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ImageWithFallback from "./ImageWithFallback";

describe("<ImageWithFallback />", () => {
  it("renders the img by default", () => {
    const { container } = render(
      <ImageWithFallback src="/x.jpg" alt="x" />,
    );
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("swaps to a placeholder block on error", () => {
    const { container, getByText } = render(
      <ImageWithFallback
        src="/missing.jpg"
        alt="missing"
        placeholderText="MIS"
      />,
    );
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("MIS")).toBeTruthy();
  });

  it("derives a placeholder letter from alt text when none provided", () => {
    const { container, getByText } = render(
      <ImageWithFallback src="/x.jpg" alt="alice" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(getByText("A")).toBeTruthy();
  });

  it("renders the placeholder immediately when src is null/empty", () => {
    const { container, getByText } = render(
      <ImageWithFallback src={null} alt="bob" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("B")).toBeTruthy();
  });

  it("falls back to '?' when alt is empty and no placeholderText is given", () => {
    const { getByText } = render(
      <ImageWithFallback src={undefined} alt="" />,
    );
    expect(getByText("?")).toBeTruthy();
  });
});
