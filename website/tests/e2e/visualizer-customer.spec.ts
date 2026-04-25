// Wall Visualiser — customer "View on a wall" happy-path.
//
// Tests the public (no-auth) entry point on an artwork detail page:
//   1. Navigate to a known seed artwork.
//   2. Click "View on your wall".
//   3. Verify the new react-konva sheet opens (flag on by default in
//      dev — these tests run in dev mode).
//   4. Verify the canvas renders and the locked artwork auto-spawns.
//   5. Close, verify the sheet unmounts.
//
// Auth'd flows (venue MyWalls editor, render persistence) need a
// seeded test user — they live in a future spec once we have a
// fixture strategy.

import { test, expect } from "@playwright/test";

// "Last Light on Mare Street" is one of Maya Chen's seed works — used
// elsewhere in smoke. The slug is derived from the title via
// src/lib/slugify.ts: lower-case, hyphens.
const ARTIST_SLUG = "maya-chen";
const WORK_SLUG = "last-light-on-mare-street";
const ARTWORK_PATH = `/browse/${ARTIST_SLUG}/${WORK_SLUG}`;

test.describe("wall visualiser — customer artwork sheet", () => {
  test("View on your wall opens the new react-konva sheet", async ({
    page,
  }) => {
    await page.goto(ARTWORK_PATH);

    // Trigger the modal. The button copy comes from ArtworkImageViewer.
    await page.getByRole("button", { name: /view on your wall/i }).click();

    // The new sheet uses role=dialog with aria-label "View {title} on a wall".
    const dialog = page.getByRole("dialog", { name: /view .+ on a wall/i });
    await expect(dialog).toBeVisible();

    // Konva renders to a <canvas> element. There should be at least one
    // inside the sheet. We give it a generous timeout because Konva is
    // dynamic-imported on first open.
    await expect(dialog.locator("canvas").first()).toBeVisible({
      timeout: 10_000,
    });

    // Quota chip is self-fetching — it might fall back to "Sign in to
    // generate renders" for unauth'd users, or to a guest message.
    // Either way, *something* informative should be visible in the
    // top-right corner.
    await expect(dialog.getByText(/sign in|daily renders|quota/i).first())
      .toBeVisible({ timeout: 5_000 });
  });

  test("Esc closes the sheet", async ({ page }) => {
    await page.goto(ARTWORK_PATH);
    await page.getByRole("button", { name: /view on your wall/i }).click();

    const dialog = page.getByRole("dialog", { name: /view .+ on a wall/i });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("Frame style buttons are interactive on a selected item", async ({
    page,
  }) => {
    await page.goto(ARTWORK_PATH);
    await page.getByRole("button", { name: /view on your wall/i }).click();

    const dialog = page.getByRole("dialog", { name: /view .+ on a wall/i });
    await expect(dialog).toBeVisible();

    // The auto-spawned item is selected by default → ItemToolbar shows
    // the frame-style segmented buttons. Each style label is a button.
    const classicWoodBtn = dialog.getByRole("button", {
      name: /classic wood/i,
    });
    await expect(classicWoodBtn).toBeVisible({ timeout: 10_000 });

    // Clicking should not throw / blank the canvas.
    await classicWoodBtn.click();
    await expect(dialog.locator("canvas").first()).toBeVisible();
  });
});
