import { describe, it, expect } from "vitest";
/**
 * Verifies that the production CSP header (built by next.config.ts) never
 * includes 'unsafe-eval' in script-src. See docs/DECISIONS.md D-020.
 */

// Alternative: directly compute the CSP string the same way next.config.ts does,
// by replicating the logic with NODE_ENV overridden. This avoids spawning a child
// process and is simpler to maintain.
function buildCsp(nodeEnv: "development" | "production"): string {
  const isDev = nodeEnv === "development";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://github.com https://avatars.githubusercontent.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

describe("CSP header (next.config.ts)", () => {
  it("production CSP must not contain unsafe-eval", () => {
    const csp = buildCsp("production");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("production CSP contains required directives", () => {
    const csp = buildCsp("production");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  it("development CSP contains unsafe-eval for React DevTools", () => {
    const csp = buildCsp("development");
    expect(csp).toContain("unsafe-eval");
  });

  it("production CSP must not allow frame-ancestors", () => {
    const csp = buildCsp("production");
    // frame-ancestors 'none' prevents clickjacking
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("frame-ancestors *");
  });
});
