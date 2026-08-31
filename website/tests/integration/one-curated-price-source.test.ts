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

  // Task 9b. The Task 9 review found the /curated page component itself
  // (CuratedClient.tsx: hero copy, trust strip, page-level FAQ array, the
  // "included in any plan" clarifier, and the checkout submit-button labels)
  // still held its own hand-typed "£49"-style literals, unguarded by the
  // test above because that test only reads curated-tiers.ts. Same drift
  // risk, different file: this closes that gap the same way.
  it("CuratedClient page component derives its prices from billing tiers, not literal £ strings", () => {
    const client = readFileSync(
      join(process.cwd(), "src/app/(pages)/curated/CuratedClient.tsx"),
      "utf8",
    );
    expect(client).toContain('from "@/lib/curation-tiers"');
    expect(client).not.toMatch(/£\d+(\.\d{2})?/);
    expect(client).not.toMatch(/&pound;\d/);
  });

  // Task 10. The curated page's metadata description ("From £49") must derive
  // from CURATION_TIERS, not a literal, so a reprice cannot leave a stale
  // description in search results.
  it("curated page metadata derives description from billing tiers, not literal £ strings", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/(pages)/curated/page.tsx"),
      "utf8",
    );
    expect(page).toContain('from "@/lib/curation-tiers"');
    expect(page).not.toMatch(/£\d+(\.\d{2})?/);
    expect(page).not.toMatch(/&pound;\d/);
  });

  // Task 3, Wallplace Programmes plan. /programmes is a second marketing
  // surface for the same `programme` tier (the /curated Programmes card
  // is the first). Same drift risk as CuratedClient/page.tsx above, so the
  // same two-file guard: the page and its client component must derive
  // every price from CURATION_TIERS / PROGRAMME_LADDER via gbp(), never a
  // literal "£<number>".
  it("programmes page derives its prices from billing tiers, not literal £ strings", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/(pages)/programmes/page.tsx"),
      "utf8",
    );
    expect(page).toContain('from "@/lib/curation-tiers"');
    expect(page).not.toMatch(/£\d+(\.\d{2})?/);
    expect(page).not.toMatch(/&pound;\d/);
  });

  it("ProgrammesClient derives its prices from billing tiers, not literal £ strings", () => {
    const client = readFileSync(
      join(process.cwd(), "src/app/(pages)/programmes/ProgrammesClient.tsx"),
      "utf8",
    );
    expect(client).toContain('from "@/lib/curation-tiers"');
    expect(client).not.toMatch(/£\d+(\.\d{2})?/);
    expect(client).not.toMatch(/&pound;\d/);
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

    // Task 1, Wallplace Programmes: managed_monthly and managed_quarterly are
    // retired (never sold a unit) in favour of one quoted programme tier.
    expect(byKey.programme.priceLabel).toBe("From £79.99 per site per month");
    expect(byKey.programme.cta).toBe("Request a programme quote");
    expect(byKey.programme.detail.highlights[3]).toBe(
      "Quoted per site once we understand your space, from £79.99 a month",
    );
    expect(byKey.programme.detail.faq[0].a).toBe(
      "Every programme is quoted for your site, from £79.99 a month depending on how many pieces and walls are involved.",
    );
  });
});
