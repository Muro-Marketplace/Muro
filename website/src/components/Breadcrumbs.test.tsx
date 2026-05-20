// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Breadcrumbs from "./Breadcrumbs";

afterEach(() => cleanup());

describe("<Breadcrumbs />", () => {
  it("renders nothing when given no items", () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container.querySelector("nav")).toBeNull();
  });

  it("renders the current item as a non-link", () => {
    const { getByText, queryByRole } = render(
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Galleries" }]} />,
    );
    expect(getByText("Galleries").tagName).toBe("SPAN");
    expect(queryByRole("link", { name: "Galleries" })).toBeNull();
  });

  it("renders intermediate items as links", () => {
    const { getByRole } = render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Browse", href: "/browse" },
          { label: "Untitled" },
        ]}
      />,
    );
    expect(getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(getByRole("link", { name: "Browse" }).getAttribute("href")).toBe("/browse");
  });

  it("uses aria-label on the nav for screen readers", () => {
    const { getByLabelText } = render(
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "X" }]} />,
    );
    expect(getByLabelText("Breadcrumb")).toBeTruthy();
  });
});
