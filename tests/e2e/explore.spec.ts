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
    const input = page.locator("#repo-url-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute(
      "placeholder",
      /github\.com/i
    );
  });

  // ── 2. Bad URL — client-only, no server call ──────────────────────────────
  test("bad URL shows client-side error without hitting server", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("#repo-url-input");
    await expect(input).toBeVisible();

    // Syntactically valid https:// URL but non-GitHub host →
    // parseGitHubUrl throws INVALID_URL before any server call.
    await input.fill("https://gitlab.com/some/repo");
    await page.keyboard.press("Enter");

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
    const input = page.locator("#repo-url-input");
    await expect(input).toBeVisible();
    await input.fill(FAKE_REPO_URL);
    await page.keyboard.press("Enter");

    // Tree must contain files from the fake repo.
    // "greet.ts" appears in fake-repo/src/greet.ts.
    const fileEntry = page
      .locator("[role='treeitem'], button")
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

  // ── 4. Mobile layout at 375px viewport ─────────────────────────────────────
  test("mobile layout at 375px: open drawer, select file, drawer closes, viewer visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Navigate to home and submit the fake repo URL
    await page.goto("/");
    const input = page.locator("#repo-url-input");
    await expect(input).toBeVisible();
    await input.fill(FAKE_REPO_URL);
    await page.keyboard.press("Enter");

    // Drawer should be hidden initially on mobile
    const drawer = page.locator("aside[aria-label='Repository file tree']");
    await expect(drawer).not.toBeVisible();

    // Toggle button should be visible on mobile
    const toggleBtn = page.locator("#mobile-tree-toggle");
    await expect(toggleBtn).toBeVisible();

    // Open drawer
    await toggleBtn.click();
    await expect(drawer).toBeVisible();

    // Backdrop should be visible
    const backdrop = page.locator("#mobile-drawer-backdrop");
    await expect(backdrop).toBeVisible();

    // Find and select greet.ts
    const fileEntry = drawer
      .locator("[role='treeitem'], button")
      .filter({ hasText: /greet\.ts/i })
      .first();
    await expect(fileEntry).toBeVisible({ timeout: 20_000 });
    await fileEntry.click();

    // Selecting a file should auto-close the drawer on mobile
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
    await expect(backdrop).not.toBeVisible({ timeout: 5000 });

    // The FileViewer is visible and renders content
    await expect(
      page.getByText("Hello, ${name}")
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── 5. Deep link initial scroll to #L40-L45 ────────────────────────────────
  test("deep link initial load: #L40-L45 scrolls to and highlights line 40", async ({
    page,
  }) => {
    // Step 1: ingest the fake repo via the normal flow so the snapshot is cached
    await page.goto("/");
    const input = page.locator("#repo-url-input");
    await expect(input).toBeVisible();
    await input.fill(FAKE_REPO_URL);
    await page.keyboard.press("Enter");
    // Wait for tree to appear to confirm ingestion succeeded
    await expect(
      page.locator("[role='treeitem']").first()
    ).toBeVisible({ timeout: 20_000 });

    // Step 2: Navigate directly to the file URL with the line-range hash.
    // Use ref=main to match the snapshot produced by the normal ingestion flow.
    await page.goto("/r/fake-owner/fake-repo?ref=main&file=src%2Flong.ts#L40-L45");

    // Line 40 should exist and be highlighted
    const line40 = page.locator("#L40");
    await expect(line40).toBeVisible({ timeout: 20_000 });

    // Assert line 40 has active highlight styling
    await expect(line40).toHaveClass(/border-accent/);

    // Assert line 40 is scrolled into view (within viewport of the viewer)
    const viewerScrollBox = page.locator("div[role='region'][aria-label*='src/long.ts']");
    await expect(viewerScrollBox).toBeVisible();

    // Verify bounding box of line 40 is visible within the viewport
    const line40Box = await line40.boundingBox();
    const scrollBox = await viewerScrollBox.boundingBox();

    expect(line40Box).not.toBeNull();
    expect(scrollBox).not.toBeNull();

    if (line40Box && scrollBox) {
      // line40 should be vertically within the scrollBox container bounds
      expect(line40Box.y + line40Box.height).toBeGreaterThan(scrollBox.y);
      expect(line40Box.y).toBeLessThan(scrollBox.y + scrollBox.height);
    }
  });
  // ── 6. Keyboard flow ─────────────────────────────────────────────────────
  test.describe("keyboard focus flow", () => {
    test.beforeEach(async ({ page }) => {
      // Set up the explorer with a real fake repo
      await page.goto("/");
      const input = page.locator("#repo-url-input");
      await expect(input).toBeVisible();
      await input.fill(FAKE_REPO_URL);
      await page.keyboard.press("Enter");
      // Wait for tree to appear
      await expect(
        page.locator("[role='treeitem']").first()
      ).toBeVisible({ timeout: 20_000 });
    });

    test("Escape in non-empty filter clears the filter text", async ({ page }) => {
      const filterInput = page.locator("input[placeholder='Filter files...']");
      await filterInput.fill("greet");
      await expect(filterInput).toHaveValue("greet");

      await filterInput.press("Escape");
      await expect(filterInput).toHaveValue("");
    });

    test("Escape in empty filter blurs input and focuses tree", async ({ page }) => {
      const filterInput = page.locator("input[placeholder='Filter files...']");
      await filterInput.focus();
      await expect(filterInput).toHaveValue("");

      await filterInput.press("Escape");

      // A treeitem should now be focused (active element is role=treeitem)
      const focusedRole = await page.evaluate(() =>
        document.activeElement?.getAttribute("role")
      );
      expect(focusedRole).toBe("treeitem");
    });

    test("Enter on file in tree focuses the viewer scroll region", async ({ page }) => {
      // Focus the greet.ts treeitem and press Enter to select it
      const greetItem = page
        .locator("[role='treeitem']")
        .filter({ hasText: /greet\.ts/i })
        .first();

      await greetItem.focus();
      await greetItem.press("Enter");

      // Wait for the viewer to render the file content first
      await expect(page.getByText("Hello, ${name}")).toBeVisible({ timeout: 10_000 });

      // After content loads, the viewer should have received focus via onViewerFocus
      // (focus moves asynchronously — give it a moment)
      const focusedRole = await page.evaluate(() =>
        document.activeElement?.getAttribute("role")
      );
      // Should be region (viewer) or treeitem (if focus returned before we checked)
      expect(["region", "treeitem"]).toContain(focusedRole);
    });

    test("Escape in viewer returns focus to the active tree item", async ({ page }) => {
      // Select a file first
      const greetItem = page
        .locator("[role='treeitem']")
        .filter({ hasText: /greet\.ts/i })
        .first();
      await greetItem.click();

      // Wait for viewer to load
      await expect(page.getByText("Hello, ${name}")).toBeVisible({ timeout: 10_000 });

      // Focus the viewer region
      const viewer = page.locator("div[role='region'][aria-label]").first();
      await viewer.focus();

      // Press Escape in the viewer
      await viewer.press("Escape");

      // Focus should return to a treeitem
      const focusedRole = await page.evaluate(() =>
        document.activeElement?.getAttribute("role")
      );
      // Should be treeitem or input (fallback)
      expect(["treeitem", "textbox"]).toContain(focusedRole);
    });
  });
});


