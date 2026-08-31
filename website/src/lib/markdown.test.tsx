// @vitest-environment jsdom
//
// A32. Blog bodies are authored as markdown (the editor labels the field
// "Body (markdown)") but were published by splitting on blank lines into
// <p whitespace-pre-wrap>, so every heading, link and list appeared as raw
// syntax on a public page.
//
// The security half matters as much as the formatting half: this input is
// user-authored and published publicly, so these also pin that no scheme
// other than http(s)/mailto/relative can ever become an href.

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderMarkdown } from "./markdown";

function draw(src: string) {
  return render(<div>{renderMarkdown(src)}</div>);
}

afterEach(cleanup);

describe("renderMarkdown formatting (A32)", () => {
  it("renders headings as headings, not as literal hashes", () => {
    draw("## A studio note");
    const h = screen.getByRole("heading", { level: 2 });
    expect(h.textContent).toBe("A studio note");
    expect(screen.queryByText(/##/)).toBeNull();
  });

  it("renders links as anchors carrying the href", () => {
    draw("See [my shop](https://example.com/shop) for prints.");
    const a = screen.getByRole("link", { name: "my shop" });
    expect(a.getAttribute("href")).toBe("https://example.com/shop");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("renders bullet and numbered lists as real lists", () => {
    const { container } = draw("- one\n- two\n\n1. first\n2. second");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("renders bold, italic and inline code", () => {
    const { container } = draw("A **bold** and *soft* line with `code`.");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("soft");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("renders blockquotes, rules and fenced code blocks", () => {
    const { container } = draw("> quoted\n\n---\n\n```\nraw code\n```");
    expect(container.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(container.querySelector("hr")).not.toBeNull();
    expect(container.querySelector("pre code")?.textContent).toBe("raw code");
  });

  it("joins wrapped lines into one paragraph and keeps separate blocks apart", () => {
    const { container } = draw("line one\nstill one\n\nsecond para");
    const ps = container.querySelectorAll("p");
    expect(ps).toHaveLength(2);
    expect(ps[0].textContent).toBe("line one still one");
  });

  it("plain prose with no syntax still renders as a paragraph", () => {
    draw("Just some words about the work.");
    expect(screen.getByText("Just some words about the work.")).toBeTruthy();
  });
});

describe("renderMarkdown safety (A32)", () => {
  it("drops a javascript: link but keeps the author's words", () => {
    const { container } = draw("[click me](javascript:alert(1))");
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("click me")).toBeTruthy();
  });

  it("drops a data: link the same way", () => {
    const { container } = draw("[x](data:text/html;base64,PHNjcmlwdD4=)");
    expect(container.querySelector("a")).toBeNull();
  });

  it("allows relative and mailto links", () => {
    draw("[browse](/browse) and [mail](mailto:hi@example.com)");
    expect(screen.getByRole("link", { name: "browse" }).getAttribute("href")).toBe("/browse");
    expect(screen.getByRole("link", { name: "mail" }).getAttribute("href")).toBe("mailto:hi@example.com");
  });

  it("never emits raw HTML from the source, it renders it as text", () => {
    const { container } = draw("<script>alert(1)</script> and <b>bold?</b>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("renders an image as a labelled link rather than loading a remote host", () => {
    const { container } = draw("![my studio](https://cdn.example.com/a.jpg)");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "my studio" }).getAttribute("href")).toBe(
      "https://cdn.example.com/a.jpg",
    );
  });

  it("empty or missing bodies render nothing rather than throwing", () => {
    expect(renderMarkdown("")).toEqual([]);
    expect(() => renderMarkdown("**unclosed and [broken](")).not.toThrow();
  });
});
