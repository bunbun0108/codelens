import { test, expect } from "@playwright/test";
import { FAKE_REPO_URL } from "../../src/server/github/fake-client";

/**
 * E2E spec — CodeLens M1.
 *
 * All three tests are fully deterministic:
 *
 *  1. "home page" — purely static DOM check.
 *  2. "bad URL" — parseGitHubUrl rejects a non-GitHub host entirely on the
 *     client before any server call.
 *  3. "explore flow" — Server runs with CODELENS_FAKE_GITHUB=1, routing all
 *     GitHub API calls to an in-memory fixture. No network calls are made.
 *     No GITHUB_TOKEN is required.
 */

test.describe("CodeLens E2E", () => {
  // ── 1. Static home page ───────────────────────────────────────────────────
  test("home page renders URL input", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    const input = page.locator('input[type="url"]');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute(
      "placeholder",
      /https:\/\/github\.com/i
    );
  });

  // ── 2. Bad URL — client-only, no server call ──────────────────────────────
  test("bad URL shows client-side error without hitting server", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('input[type="url"]')).toBeVisible();

    // Syntactically valid https:// URL but non-GitHub host →
    // parseGitHubUrl throws INVALID_URL before any server call.
    await page.locator('input[type="url"]').fill("https://gitlab.com/some/repo");
    await expect(page.getByRole("button", { name: /Explore/i })).toBeEnabled();
    await page.getByRole("button", { name: /Explore/i }).click();

    // React sets error state → <p> with "github.com" text
    await expect(
      page.locator("p").filter({ hasText: /github\.com/i }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  // ── 3. Full explore flow ──────────────────────────────────────────────────
  test("explore flow: URL → tree appears → click file → content renders", async ({
    page,
  }) => {
    // Navigate to home and submit the fake repo URL
    await page.goto("/");
    const input = page.locator('input[type="url"]');
    await expect(input).toBeVisible();
    await input.fill(FAKE_REPO_URL);
    await page.getByRole("button", { name: /Explore/i }).click();

    // Tree must contain files from the fake repo.
    // "greet.ts" appears in fake-repo/src/greet.ts.
    const fileEntry = page
      .locator("button")
      .filter({ hasText: /greet\.ts/i })
      .first();
    await expect(fileEntry).toBeVisible({ timeout: 20_000 });

    // Click the file
    await fileEntry.click();

    // The FileViewer renders the fake content
    await expect(
      page.getByText("Hello, ${name}")
    ).toBeVisible({ timeout: 10_000 });
  });
});
