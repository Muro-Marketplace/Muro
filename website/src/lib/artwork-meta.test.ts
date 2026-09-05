// LA-C067 (launch audit 2026-09-05). When a work has no description, the artwork
// page's meta description was built as `${title}, ${medium}, ${dimensions}.`
// from the raw columns, so most live works (whose dimensions are pixel data the
// page body already hides) advertised "2420 × 3632 px" and an empty medium left
// an orphan comma. The fallback now uses the same display formatter as the page
// and only joins the parts that exist.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { artworkMetaDescription } from "./artwork-meta";

const base = {
  title: "Harbour at Dusk",
  medium: "Oil on canvas",
  dimensions: "60 × 90 cm",
  available: true,
  description: "",
};

describe("artworkMetaDescription", () => {
  it("uses the artist's own description, trimmed to 160 characters, when there is one", () => {
    const long = "A".repeat(200);
    expect(artworkMetaDescription({ ...base, description: "  Painted on the quay.  " }, "Real Artist")).toBe(
      "Painted on the quay.",
    );
    expect(artworkMetaDescription({ ...base, description: long }, "Real Artist")).toHaveLength(160);
  });

  it("falls back to the title, medium and display dimensions", () => {
    expect(artworkMetaDescription(base, "Real Artist")).toBe(
      "Harbour at Dusk, Oil on canvas, 24 × 35 in (60 × 90 cm). Available. By Real Artist on Wallplace.",
    );
  });

  it("omits pixel dimensions and empty parts without leaving orphan commas", () => {
    expect(
      artworkMetaDescription({ ...base, medium: "", dimensions: "2420 × 3632 px", available: false }, "Real Artist"),
    ).toBe("Harbour at Dusk. Sold. By Real Artist on Wallplace.");
    expect(artworkMetaDescription({ ...base, dimensions: null }, "Real Artist")).toBe(
      "Harbour at Dusk, Oil on canvas. Available. By Real Artist on Wallplace.",
    );
  });
});

describe("the artwork page builds its metadata through the helper (LA-C067)", () => {
  it("no longer interpolates the raw dimensions column", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(pages)/browse/[slug]/[workSlug]/page.tsx"), "utf8");
    expect(page).not.toMatch(/\$\{work\.dimensions\}/);
    expect(page).toMatch(/artworkMetaDescription/);
  });
});
