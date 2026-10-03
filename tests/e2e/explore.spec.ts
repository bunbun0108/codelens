import { test, expect, request as playwrightRequest } from "@playwright/test";

/**
 * E2E spec — CodeLens M1.
 *
 * All three tests are deterministic in CI:
 *
 *  1. "home page" — purely static DOM check.
 *  2. "bad URL" — parseGitHubUrl rejects a non-GitHub host entirely on the
 *     client before any server call.
 *  3. "explore flow" — seeding strategy:
 *       a. POST /api/ingest via Playwright's request fixture (not the browser).
 *          This is the ONE live GitHub call that happens in test setup.
 *          prisma/prisma-examples/tree/latest/orm/nextjs is tiny (18 files,
 *          ~19 KB) and stable.
 *       b. Navigate to /r/prisma/prisma-examples with the same URL param.
 *          The Next.js server component calls ingestRepository() which returns
 *          the already-cached snapshot (cacheHit: true) — zero GitHub calls.
 *       c. The client-side blob fetch (GET /api/snapshots/:id/file) is
 *          intercepted by page.route() so the file content is deterministic.
 *
 *     Net result: one real GitHub call (step a) happens before browser
 *     navigation; all subsequent rendering is against in-memory data + mocks.
 *     GITHUB_TOKEN must be set in the environment (CI: repository secret).
 */

// Subpath URL used for the explore-flow test
const TREE_URL =
  "https://github.com/prisma/prisma-examples/tree/latest/orm/nextjs";

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
    baseURL,
  }) => {
    // Step a: Seed in-memory snapshot via API — one live GitHub call.
    // Subsequent page load hits cacheHit=true (no second GitHub call).
    const apiContext = await playwrightRequest.newContext({
      // baseURL is always defined when configured in playwright.config.ts
      baseURL: baseURL!,
    });
    const seedResp = await apiContext.post("/api/ingest", {
      data: { url: TREE_URL },
      timeout: 60_000,
    });
    if (!seedResp.ok()) {
      const body = await seedResp.text();
      throw new Error(`Seed ingest failed (${seedResp.status()}): ${body}`);
    }
    const seedData = await seedResp.json();
    const snapshotId: string = seedData.snapshot.id;
    await apiContext.dispose();

    // Step b: Intercept client-side blob fetch — deterministic content.
    await page.route(`**/api/snapshots/${snapshotId}/file*`, async (route) => {
      const url = new URL(route.request().url());
      const pathParam = url.searchParams.get("path") ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          snapshotId,
          path: pathParam,
          blobSha: "mocked000",
          size: 27,
          language: "typescript",
          lineCount: 1,
          content: "// mocked: hello from e2e",
        }),
      });
    });

    // Step c: Navigate to the explorer page.
    // The server component calls ingestRepository() → returns cached snapshot.
    await page.goto(
      `/r/prisma/prisma-examples?url=${encodeURIComponent(TREE_URL)}`,
      { timeout: 30_000 }
    );

    // Tree must contain files from subpath orm/nextjs (paths are repo-root-relative).
    // "page.tsx" appears in orm/nextjs/app/page.tsx — visible as "page.tsx" in tree.
    const fileEntry = page
      .locator("button")
      .filter({ hasText: /page\.tsx/i })
      .first();
    await expect(fileEntry).toBeVisible({ timeout: 20_000 });

    // Click the file
    await fileEntry.click();

    // The FileViewer calls GET /api/snapshots/:id/file — intercepted above.
    await expect(
      page.getByText("// mocked: hello from e2e")
    ).toBeVisible({ timeout: 10_000 });
  });
});
