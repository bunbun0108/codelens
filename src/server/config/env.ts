import { z } from "zod";

// ── Schema ────────────────────────────────────────────────────────────────────

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  GITHUB_TOKEN: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SNAPSHOT_STORE_MAX: z.coerce.number().int().min(1).default(50),
  BLOB_CACHE_MAX_MB: z.coerce.number().int().min(1).default(100),
  CODELENS_FAKE_GITHUB: z
    .string()
    .optional()
    .transform((v) => v === "1"),
});

export type Env = z.infer<typeof EnvSchema>;

// ── Build-phase detection ──────────────────────────────────────────────────────
// NEXT_PHASE is set to "phase-production-build" during `next build`.
// We must NOT call process.exit() during the build phase.
const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";

// ── Lazy singleton ─────────────────────────────────────────────────────────────

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    // During build, print a warning but don't crash the build worker
    const msg =
      "❌  Invalid environment configuration:\n" +
      JSON.stringify(parsed.error.flatten().fieldErrors, null, 2);
    if (IS_BUILD_PHASE) {
      console.warn(msg);
      // Return a safe default to let the build finish
      _env = EnvSchema.parse({});
      return _env;
    }
    console.error(msg);
    process.exit(1);
  }

  const data = parsed.data;

  // Production guard: GITHUB_TOKEN is required at runtime only (not during `next build`)
  if (data.NODE_ENV === "production" && !data.GITHUB_TOKEN && !IS_BUILD_PHASE) {
    console.error(
      "❌  GITHUB_TOKEN is required in production. " +
        "Set a fine-grained PAT with public repository read-only scope.",
    );
    process.exit(1);
  }

  // Dev warning: unauthenticated mode is heavily rate-limited
  if (data.NODE_ENV !== "production" && !data.GITHUB_TOKEN && !IS_BUILD_PHASE) {
    console.warn(
      "⚠️  GITHUB_TOKEN is not set. Unauthenticated GitHub API allows only 60 req/hr. " +
        "Set GITHUB_TOKEN in .env.local for development.",
    );
  }

  _env = data;
  return _env;
}

// Lazy proxy — property access triggers getEnv() at the call site, not at import time
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return getEnv()[prop as keyof Env];
  },
});
