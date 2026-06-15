// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { vi } from "vitest";

// Stub next/link so it renders an <a> in jsdom.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// Stub the NewsletterForm so we don't need its full dependency chain.
vi.mock("./NewsletterForm", () => ({
  default: () => <div data-testid="newsletter-form" />,
}));

import Footer from "./Footer";

afterEach(() => cleanup());

describe("<Footer />", () => {
  it("renders without crashing", () => {
    const { getByRole } = render(<Footer />);
    expect(getByRole("contentinfo")).toBeTruthy();
  });

  it("each column's links have unique hrefs within that column", () => {
    const { container } = render(<Footer />);
    // Each column is rendered as a <div> with a <ul>. We check per-<ul>
    // to allow cross-column repetition (/faqs, /how-it-works) while
    // catching within-column duplicates (the original /spaces bug).
    const columns = Array.from(container.querySelectorAll("ul"));
    for (const col of columns) {
      const hrefs = Array.from(col.querySelectorAll("a"))
        .map((a) => a.getAttribute("href") as string)
        .filter((h) => h && h.startsWith("/"));
      const unique = new Set(hrefs);
      const duplicates = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
      expect(
        duplicates,
        `Column contains duplicate hrefs: ${duplicates.join(", ")}`,
      ).toHaveLength(0);
      expect(unique.size).toBe(hrefs.length);
    }
  });

  it("/spaces appears exactly once in the For Artists column (regression for original bug)", () => {
    const { container } = render(<Footer />);
    // The For Artists column is the first <ul>.
    const firstCol = container.querySelectorAll("ul")[0];
    const spacesLinks = Array.from(firstCol.querySelectorAll("a")).filter(
      (a) => a.getAttribute("href") === "/spaces",
    );
    expect(spacesLinks).toHaveLength(1);
  });
});
