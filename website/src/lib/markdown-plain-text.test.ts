// LA-C015 (launch audit 2026-09-05). The blog index printed the first 240
// characters of body_markdown as the card excerpt, and the post page used the
// first 160 as its meta description, so headings, emphasis and link syntax
// reached readers and search engines as literal `##`, `**` and `[text](url)`.
// Excerpts and descriptions need the prose, not the markup.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { markdownToPlainText } from "./markdown";

describe("markdownToPlainText", () => {
  it("strips headings and emphasis and joins blocks into one line of prose", () => {
    expect(markdownToPlainText("## A heading\n\nSome **bold text** and _italics_.")).toBe(
      "A heading Some bold text and italics.",
    );
  });

  it("keeps link and image text and drops the URLs", () => {
    expect(markdownToPlainText("See [our guide](https://x.example/z) and ![a wall](https://x.example/w.jpg).")).toBe(
      "See our guide and a wall.",
    );
  });

  it("drops list markers, blockquote marks, rules and code fences", () => {
    expect(markdownToPlainText("- one\n- two\n\n> quoted\n\n---\n\n```\ncode here\n```")).toBe(
      "one two quoted code here",
    );
  });

  it("returns an empty string for empty or missing input", () => {
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText(null as unknown as string)).toBe("");
  });
});

describe("blog surfaces use plain text for excerpts and descriptions (LA-C015)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("the blog index and the post metadata do not slice raw markdown", () => {
    const index = read("src/app/(pages)/blog/page.tsx");
    expect(index).not.toMatch(/body_markdown \?\? ""\)\.slice/);
    expect(index).toMatch(/markdownToPlainText/);
    const post = read("src/app/(pages)/blog/[slug]/page.tsx");
    expect(post).not.toMatch(/body_markdown \?\? ""\)\.slice/);
    expect(post).toMatch(/markdownToPlainText/);
  });
});
