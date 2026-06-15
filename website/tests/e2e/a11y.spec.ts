/**
 * Accessibility audit — axe-core, critical + serious violations only.
 *
 * PUBLIC PAGES (active): /pricing, /checkout, /checkout/confirmation, /cookies
 *   Navigate each page without auth and assert no critical or serious axe
 *   violations are present.
 *
 * AUTH-GATED PORTAL PAGES (skipped): artist-portal + venue-portal pages
 *   Structurally present so CI can see what's pending, but guarded with
 *   test.skip() because no authenticated storageState fixture exists yet.
 *   Without auth the pages redirect to /login, which means axe audits the
 *   login page repeatedly rather than the portal UI, producing meaningless
 *   results. Once a seeded storageState is available, remove the skip guards.
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

type AxeImpact = "minor" | "moderate" | "serious" | "critical";
const AUDITED_IMPACTS: AxeImpact[] = ["critical", "serious"];

/**
 * Return a Playwright test body that navigates to `pageLabel`, runs axe,
 * filters to critical/serious violations, and asserts none exist. On failure,
 * prints each violation's rule id and affected nodes for debuggability.
 */
function axeTestBody(pageLabel: string) {
  return async ({ page }: { page: import("@playwright/test").Page }) => {
    await page.goto(pageLabel);
    // Wait for main content to be in the DOM before running axe.
    await page.waitForLoadState("domcontentloaded");

    const results = await new AxeBuilder({ page }).analyze();

    const serious = results.violations.filter(
      (v) => v.impact && AUDITED_IMPACTS.includes(v.impact as AxeImpact),
    );

    if (serious.length > 0) {
      const detail = serious
        .map(
          (v) =>
            `  [${v.impact}] ${v.id}: ${v.description}\n` +
            v.nodes
              .slice(0, 3)
              .map((n) => `    - ${n.html.slice(0, 120)}`)
              .join("\n"),
        )
        .join("\n");
      // Fail with a readable message.
      expect(serious, `[${pageLabel}] axe found ${serious.length} critical/serious violation(s):\n${detail}`).toHaveLength(0);
    } else {
      expect(serious).toHaveLength(0);
    }
  };
}

// ---------------------------------------------------------------------------
// PUBLIC PAGES — active assertions
// ---------------------------------------------------------------------------

test.describe("a11y audit — public pages", () => {
  test(
    "/pricing — no critical or serious axe violations",
    axeTestBody("/pricing"),
  );

  test(
    "/checkout — no critical or serious axe violations",
    axeTestBody("/checkout"),
  );

  test(
    "/checkout/confirmation — no critical or serious axe violations",
    axeTestBody("/checkout/confirmation"),
  );

  test(
    "/cookies — no critical or serious axe violations",
    axeTestBody("/cookies"),
  );
});

// ---------------------------------------------------------------------------
// AUTH-GATED PORTAL PAGES — skipped pending storageState fixture
// ---------------------------------------------------------------------------

test.describe("a11y audit — auth-gated pages (skipped: no auth fixture)", () => {
  // Remove the test.skip() calls here once a seeded storageState is wired
  // into playwright.config.ts (artist + venue test accounts). Without auth
  // these pages redirect to /login, so axe would audit the login page
  // rather than the portal UI.

  test("/artist-portal — no critical or serious axe violations", async ({
    page,
  }) => {
    test.skip(
      true,
      "Needs authenticated storageState — redirects to /login without it",
    );
    await page.goto("/artist-portal");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact && AUDITED_IMPACTS.includes(v.impact as AxeImpact),
    );
    expect(serious).toHaveLength(0);
  });

  test("/artist-portal/portfolio — no critical or serious axe violations", async ({
    page,
  }) => {
    test.skip(
      true,
      "Needs authenticated storageState — redirects to /login without it",
    );
    await page.goto("/artist-portal/portfolio");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact && AUDITED_IMPACTS.includes(v.impact as AxeImpact),
    );
    expect(serious).toHaveLength(0);
  });

  test("/venue-portal — no critical or serious axe violations", async ({
    page,
  }) => {
    test.skip(
      true,
      "Needs authenticated storageState — redirects to /login without it",
    );
    await page.goto("/venue-portal");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact && AUDITED_IMPACTS.includes(v.impact as AxeImpact),
    );
    expect(serious).toHaveLength(0);
  });

  test("/venue-portal/placements — no critical or serious axe violations", async ({
    page,
  }) => {
    test.skip(
      true,
      "Needs authenticated storageState — redirects to /login without it",
    );
    await page.goto("/venue-portal/placements");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact && AUDITED_IMPACTS.includes(v.impact as AxeImpact),
    );
    expect(serious).toHaveLength(0);
  });
});
