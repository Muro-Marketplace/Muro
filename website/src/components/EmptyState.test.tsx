// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import EmptyState from "./EmptyState";

afterEach(() => cleanup());

describe("<EmptyState />", () => {
  it("renders title and hint", () => {
    const { getByText } = render(
      <EmptyState title="No orders yet" hint="Browse art to place your first order." />,
    );
    expect(getByText("No orders yet")).toBeTruthy();
    expect(getByText("Browse art to place your first order.")).toBeTruthy();
  });

  it("renders the CTA when provided as a link", () => {
    const { getByRole } = render(
      <EmptyState title="t" hint="h" cta={{ label: "Browse", href: "/browse" }} />,
    );
    const link = getByRole("link", { name: "Browse" });
    expect(link.getAttribute("href")).toBe("/browse");
  });

  it("omits the CTA section when cta is undefined", () => {
    const { queryByRole } = render(<EmptyState title="t" hint="h" />);
    expect(queryByRole("link")).toBeNull();
  });
});
