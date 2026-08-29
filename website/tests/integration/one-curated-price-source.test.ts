import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CURATED_TIERS } from "@/lib/curated-tiers";

// Task 9. curation-tiers.ts holds the billing prices (priceGbp, validated
// against Stripe); curated-tiers.ts held its own hand-typed display strings
// (priceLabel: "£49", cta: "Book for £49", and several FAQ answers that
// quote a price in prose). Two owners of the same number meant a reprice
// could edit one and silently miss the other.
//
// This guards two things: (1) the marketing file cannot contain a literal
// pound figure anywhere, not just in priceLabel/cta, so nothing is left to
// drift; (2) every string it currently renders is still byte-identical to
// what venues see today, pinned independently of how the derivation works.
describe("curated pricing has one source of truth", () => {
  it("marketing labels derive from billing prices, not literal £ strings", () => {
    const marketing = readFileSync(join(process.cwd(), "src/lib/curated-tiers.ts"), "utf8");
    expect(marketing).toContain('from "./curation-tiers"');
    // Whole file, not just priceLabel/cta: several FAQ answers also quote a
    // price in prose (e.g. "Full space (£149) considers...").
    expect(marketing).not.toMatch(/£\d+(\.\d{2})?/);
    expect(marketing).not.toMatch(/&pound;\d/);
  });

  it("renders exactly the prices venues see today, for every tier and every FAQ that quotes one", () => {
    const byKey = Object.fromEntries(CURATED_TIERS.map((t) => [t.key, t]));

    expect(byKey.single_wall.priceLabel).toBe("£49");
    expect(byKey.single_wall.cta).toBe("Book for £49");
    expect(byKey.single_wall.detail.faq[1].q).toBe(
      "Do I pay for the art on top of the £49?",
    );
    expect(byKey.single_wall.detail.faq[2].a).toBe(
      "When you have two or more walls and want them to feel coherent together. Full space (£149) considers grouping, palette, and flow across the whole venue, not just one wall.",
    );

    expect(byKey.full_space.priceLabel).toBe("£149");
    expect(byKey.full_space.cta).toBe("Book for £149");
    expect(byKey.full_space.detail.faq[0].a).toBe(
      "Yes, the £149 covers the curation. Each wall can independently use free QR-loan, paid loan, or purchase, depending on what suits the work and the room.",
    );

    expect(byKey.bespoke.priceLabel).toBe("From £299");
    expect(byKey.bespoke.cta).toBe("Request a quote");

    expect(byKey.managed_monthly.priceLabel).toBe("£79.99 / month");
    expect(byKey.managed_monthly.cta).toBe("Start monthly, £79.99/mo");
    expect(byKey.managed_monthly.detail.faq[0].q).toBe(
      "Do I pay for the art on top of £79.99?",
    );
    expect(byKey.managed_monthly.detail.faq[0].a).toBe(
      "Curation is £79.99. The art itself follows whichever arrangement you pick, free QR-loan, paid loan, or outright purchase.",
    );

    expect(byKey.managed_quarterly.priceLabel).toBe("£199.99 / quarter");
    expect(byKey.managed_quarterly.cta).toBe("Start quarterly, £199.99/qtr");
    expect(byKey.managed_quarterly.detail.faq[1].a).toBe(
      "Curation is the £199.99. The art itself follows whichever arrangement you pick.",
    );
  });
});
