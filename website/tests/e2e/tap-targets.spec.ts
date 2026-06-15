/**
 * Tap-target audit — WCAG 2.5.5 / Apple HIG minimum 44 × 44 px.
 *
 * PUBLIC PAGES (active): /pricing, /checkout, /cookies
 *   Navigate each page without auth and assert every visible interactive
 *   element (button, link styled as button, role="button") has a rendered
 *   bounding box of at least 44 px in both width and height.
 *
 * AUTH-GATED PAGES (skipped): artist + venue portal pages
 *   Structurally present so CI can see what's pending, but guarded with
 *   test.skip() because no authenticated storageState fixture exists yet.
 *   These will redirect to /login rather than rendering the portal UI,
 *   which would produce false failures on tap-target assertions.
 *   Once a seeded storageState is available (see playwright.config.ts note
 *   "Auth'd flows belong in later phases"), remove the test.skip() guards.
 */

import { test, expect, type Page } from "@playwright/test";

const MIN_TOUCH_PX = 44;

/** Interactive selector covering native buttons, role-buttons, and link-buttons. */
const TAP_TARGET_SELECTOR =
  'button, a[role="button"], [role="button"]';

/**
 * Assert every visible tap-target on `page` is at least 44 × 44 px.
 * Logs each failing element with its selector description and measured size.
 */
async function assertTapTargets(page: Page, pageLabel: string): Promise<void> {
  const locators = await page.locator(TAP_TARGET_SELECTOR).all();

  const failures: string[] = [];

  for (const loc of locators) {
    // Skip elements that are hidden / off-screen (display:none, visibility:hidden, etc.)
    const isVisible = await loc.isVisible();
    if (!isVisible) continue;

    const box = await loc.boundingBox();
    // Zero-area box means the element is present in DOM but not painted.
    if (!box || box.width === 0 || box.height === 0) continue;

    const tooNarrow = box.width < MIN_TOUCH_PX;
    const tooShort = box.height < MIN_TOUCH_PX;

    if (tooNarrow || tooShort) {
      const text = (await loc.textContent())?.trim().slice(0, 40) ?? "(no text)";
      const tag = await loc.evaluate((el) => el.tagName.toLowerCase());
      const role = await loc.evaluate(
        (el) => el.getAttribute("role") ?? "",
      );
      const desc = `${tag}${role ? `[role=${role}]` : ""} "${text}" — ${Math.round(box.width)}×${Math.round(box.height)}px`;
      failures.push(desc);
    }
  }

  expect(
    failures,
    `[${pageLabel}] ${failures.length} tap-target(s) below 44 px:\n  ${failures.join("\n  ")}`,
  ).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// PUBLIC PAGES — active assertions
// ---------------------------------------------------------------------------

test.describe("tap-target audit — public pages", () => {
  test("/pricing — all interactive elements >= 44 x 44 px", async ({ page }) => {
    await page.goto("/pricing");
    await assertTapTargets(page, "/pricing");
  });

  test("/checkout — all interactive elements >= 44 x 44 px", async ({ page }) => {
    await page.goto("/checkout");
    // /checkout may redirect to /login if there is no cart; assert on whatever
    // page is actually rendered so we still audit the redirected UI.
    await assertTapTargets(page, "/checkout");
  });

  test("/cookies — all interactive elements >= 44 x 44 px", async ({ page }) => {
    await page.goto("/cookies");
    await assertTapTargets(page, "/cookies");
  });
});

// ---------------------------------------------------------------------------
// AUTH-GATED PAGES — skipped pending storageState fixture
// ---------------------------------------------------------------------------

test.describe("tap-target audit — auth-gated pages (skipped: no auth fixture)", () => {
  // Remove the test.skip() calls here once a seeded storageState is wired
  // into playwright.config.ts (artist + venue test accounts).

  test("/artist-portal — all interactive elements >= 44 x 44 px", async ({
    page,
  }) => {
    test.skip(
      true,
      "Needs authenticated storageState — redirects to /login without it",
    );
    await page.goto("/artist-portal");
    await assertTapTargets(page, "/artist-portal");
  });

  test("/artist-portal/portfolio — all interactive elements >= 44 x 44 px", async ({
    page,
  }) => {
    test.skip(
      true,
      "Needs authenticated storageState — redirects to /login without it",
    );
    await page.goto("/artist-portal/portfolio");
    await assertTapTargets(page, "/artist-portal/portfolio");
  });

  test("/artist-portal/placements — all interactive elements >= 44 x 44 px", async ({
    page,
  }) => {
    test.skip(
      true,
      "Needs authenticated storageState — redirects to /login without it",
    );
    await page.goto("/artist-portal/placements");
    await assertTapTargets(page, "/artist-portal/placements");
  });

  test("/venue-portal — all interactive elements >= 44 x 44 px", async ({
    page,
  }) => {
    test.skip(
      true,
      "Needs authenticated storageState — redirects to /login without it",
    );
    await page.goto("/venue-portal");
    await assertTapTargets(page, "/venue-portal");
  });

  test("/venue-portal/placements — all interactive elements >= 44 x 44 px", async ({
    page,
  }) => {
    test.skip(
      true,
      "Needs authenticated storageState — redirects to /login without it",
    );
    await page.goto("/venue-portal/placements");
    await assertTapTargets(page, "/venue-portal/placements");
  });
});
