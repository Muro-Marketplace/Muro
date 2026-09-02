// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SamplePill from "./SamplePill";

afterEach(() => cleanup());

describe("<SamplePill />", () => {
  it("reads Sample, in grey, with an explanation on hover", () => {
    render(<SamplePill />);
    const pill = screen.getByText("Sample");
    expect(pill.className).toContain("bg-neutral-500");
    expect(pill.getAttribute("title")).toMatch(/sample profile/i);
  });
});
