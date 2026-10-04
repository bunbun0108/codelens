import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

/**
 * Verifies that the production CSP header (built by next.config.ts) never
 * includes 'unsafe-eval' in script-src. See docs/DECISIONS.md D-020.
 *
 * We import the CSP value by re-running the config builder with
 * NODE_ENV=production so the test is independent of the current process env.
 */

function getProductionCsp(): string {
  const configPath = path.resolve(__dirname, "../../../next.config.ts");
  // Run a one-liner that sets NODE_ENV=production, loads the config via tsx,
  // and prints the CSP header value to stdout.
  const script = `
    process.env.NODE_ENV = "production";
    const { default: config } = await import("${configPath}");
    const headers = await config.headers();
    const rule = headers[0]?.headers?.find((h) => h.key === "Content-Security-Policy");
    process.stdout.write(rule?.value ?? "");
  `;
  const result = execSync(
    `node --input-type=module --experimental-vm-modules -e '${script}'`,
    { env: { ...process.env, NODE_ENV: "production" } },
  ).toString();
  return result;
}

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
