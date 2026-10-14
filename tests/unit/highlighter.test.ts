import { describe, it, expect } from "vitest";
import { highlightCode, HIGHLIGHT_MAX_LINES, HIGHLIGHT_MAX_BYTES } from "../../src/lib/highlighter";

describe("dual-theme syntax highlighting", () => {
  it("generates tokens containing both light and dark theme colors via htmlStyle", async () => {
    const code = "const meaning = 42;";
    const tokens = await highlightCode(code, "typescript");

    expect(tokens).not.toBeNull();
    expect(tokens!.length).toBeGreaterThan(0);

    const firstLine = tokens![0]!;
    expect(firstLine.length).toBeGreaterThan(0);

    // Find the 'const' keyword token
    const constToken = firstLine.find((t) => t.content === "const");
    expect(constToken).toBeDefined();

    // Shiki dual-theme outputs htmlStyle with default (light) color and --shiki-dark variable
    expect(constToken?.htmlStyle).toBeDefined();
    const style = constToken!.htmlStyle as Record<string, string>;

    // Light theme color (from github-light)
    expect(style.color).toBeDefined();
    expect(style.color).toMatch(/^#[0-9a-fA-F]{6}$/);

    // Dark theme CSS variable (from github-dark)
    expect(style["--shiki-dark"]).toBeDefined();
    expect(style["--shiki-dark"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("handles empty / unsupported language gracefully", async () => {
    const res = await highlightCode("plain text", null);
    expect(res).toBeNull();
  });

  it("skips highlighting when exceeding HIGHLIGHT_MAX_BYTES threshold", async () => {
    const largeCode = "a".repeat(HIGHLIGHT_MAX_BYTES + 1);
    const res = await highlightCode(largeCode, "typescript");
    expect(res).toBeNull();
  });

  it("preserves HIGHLIGHT_MAX_LINES and HIGHLIGHT_MAX_BYTES constants", () => {
    expect(HIGHLIGHT_MAX_LINES).toBe(1500);
    expect(HIGHLIGHT_MAX_BYTES).toBe(100 * 1024);
  });
});
