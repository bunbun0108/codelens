import { test, expect } from "@playwright/test";

/**
 * Live Smoke Test — CodeLens
 *
 * This test hits the real GitHub API. It is excluded from the default
 * test run (via grepInvert: /@live/ in playwright.config.ts) and should
 * only be run when GITHUB_TOKEN is present and live network testing
 * is explicitly desired.
 *
 * Run with: pnpm test:e2e -g "@live"
 */

test.describe("Live CodeLens E2E @live", () => {
  test("live explore flow against real repo", async ({ page }) => {
    // Navigate to home and submit a real URL
    await page.goto("/");
    const input = page.locator('input[type="url"]');
    await expect(input).toBeVisible();
    await input.fill(
      "https://github.com/prisma/prisma-examples/tree/latest/orm/nextjs"
    );
    await page.getByRole("button", { name: /Explore/i }).click();

    // Wait for the tree to render a real file
    const fileEntry = page
      .locator("button")
      .filter({ hasText: /README\.md/i })
      .first();
    await expect(fileEntry).toBeVisible({ timeout: 30_000 });

    // Click it and wait for content
    await fileEntry.click();
    await expect(
      page.getByText("prisma-examples")
    ).toBeVisible({ timeout: 10_000 });
  });
});
