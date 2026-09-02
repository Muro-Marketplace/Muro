// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

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

const { company } = vi.hoisted(() => ({
  company: { tradingName: "Wallplace", legalName: "", number: "", registeredOffice: "" },
}));
vi.mock("@/lib/company", () => ({
  COMPANY: company,
  isIncorporated: () => company.number.trim().length > 0,
}));

import Footer from "./Footer";

afterEach(() => {
  cleanup();
  company.legalName = "";
  company.number = "";
  company.registeredOffice = "";
});

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

  it("does not render company details while unincorporated", () => {
    const { container } = render(<Footer />);
    expect(container.textContent).not.toContain("company number");
  });

  it("renders the company legal name, number, and registered office once incorporated", () => {
    company.legalName = "Wallplace Ltd";
    company.number = "12345678";
    company.registeredOffice = "1 Example Street, London";
    const { container } = render(<Footer />);
    const text = container.textContent || "";
    expect(text).toContain("Wallplace Ltd");
    expect(text).toContain("company number 12345678");
    expect(text).toContain("1 Example Street, London");
  });
});
