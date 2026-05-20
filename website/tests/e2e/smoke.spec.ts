// Phase 1 smoke. Quickest protection against "did we just break every
// page?". Auth'd flows belong in later phases — these tests hit public
// routes only.

import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("homepage renders with the Wallplace wordmark", async ({ page }) => {
    await page.goto("/");
    // Wordmark appears in both header and hero.
    await expect(page.getByRole("heading", { name: /wallplace/i }).first()).toBeVisible();
    // Call-to-action buttons present.
    await expect(page.getByRole("link", { name: /discover art/i }).first()).toBeVisible();
  });

  test("/browse loads with at least one artist card", async ({ page }) => {
    await page.goto("/browse");
    // The discipline nav is always present on /browse.
    await expect(page.getByRole("button", { name: "Photography", exact: true })).toBeVisible();
    // And at least one artist name from the seed data.
    await expect(page.getByText(/Maya Chen/i).first()).toBeVisible();
  });

  test("/browse?view=gallery renders the masonry columns", async ({ page }) => {
    await page.goto("/browse?view=gallery");
    // Discipline nav still present.
    await expect(page.getByRole("button", { name: "Photography", exact: true })).toBeVisible();
    // At least one work title from the seed data.
    await expect(page.getByText(/Last Light on Mare Street/i).first()).toBeVisible();
  });

  test("/email-preview lists the template library", async ({ page }) => {
    await page.goto("/email-preview");
    // The header row states the count. Pinning to a specific number
    // breaks every time a template is added/removed; assert the
    // shape ("N templates · …") instead.
    await expect(page.getByText(/\d+ templates/i)).toBeVisible();
  });

  test("/email-preview/customer_order_receipt renders the template", async ({ page }) => {
    await page.goto("/email-preview/customer_order_receipt");
    await expect(page.getByRole("heading", { name: /order receipt/i })).toBeVisible();
    // Rendered email sits inside an iframe — that iframe should exist.
    await expect(page.locator("iframe")).toBeVisible();
  });

  test("/login renders the form", async ({ page }) => {
    await page.goto("/login");
    // Form fields use placeholder text, not <label for=>, so look by placeholder.
    await expect(page.getByPlaceholder(/you@example/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("/apply renders the application form", async ({ page }) => {
    await page.goto("/apply");
    // Application form has a distinctive heading and at least one text input.
    await expect(page.getByRole("heading", { name: /apply/i }).first()).toBeVisible();
    await expect(page.locator("input[type=text], input[type=email]").first()).toBeVisible();
  });

  test("security headers are present on the homepage", async ({ page }) => {
    const res = await page.request.get("/");
    const headers = res.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toContain("strict-origin");
    // HSTS comes through on https only, which local dev isn't — so check
    // the report-only CSP instead (always sent regardless of scheme).
    expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
  });
});
