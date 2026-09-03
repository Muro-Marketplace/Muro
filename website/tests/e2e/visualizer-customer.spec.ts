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

// "Southwark Geometry" is one of James Okafor's STATIC seed works. It used
// to be a Maya Chen work, but owner decision 3 (2026-08-28) deleted her
// static entry when she became a real DB row (the demo account), and these
// tests run against placeholder Supabase where only the static list exists.
// The slug is derived from the title via src/lib/slugify.ts: lower-case,
// hyphens.
const ARTIST_SLUG = "james-okafor";
const WORK_SLUG = "southwark-geometry";
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

    // The locked artwork auto-spawns, so the Preview action is offered
    // straight away. It is a capture of the editor itself, no sign-in
    // or quota involved, and there is no Render button any more.
    await expect(dialog.getByRole("button", { name: /^preview$/i }).first())
      .toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByRole("button", { name: /^render$/i })).toHaveCount(0);
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
