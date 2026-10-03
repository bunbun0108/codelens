import { z } from "zod";
import { ExclusionReasonSchema } from "./schemas/index";

// ── Filter config schema ──────────────────────────────────────────────────────

export const FilterConfigSchema = z.object({
  version: z.string(),
  ignoredDirectories: z.array(z.string()),
  secretRiskPatterns: z.array(z.string()),
  lockfiles: z.array(z.string()),
  generatedOrMinifiedPatterns: z.array(z.string()),
  binaryExtensions: z.array(z.string()),
  allowedExtensions: z.array(z.string()),
  allowedFilenames: z.array(z.string()),
  maxFileSizeBytes: z.number(),
  maxIncludedFiles: z.number(),
  maxIncludedBytes: z.number(),
});

export type FilterConfig = z.infer<typeof FilterConfigSchema>;
export type ExclusionReason = z.infer<typeof ExclusionReasonSchema>;

// ── Raw tree entry (from GitHub API) ─────────────────────────────────────────

export interface RawTreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  mode: string;
  sha: string;
  size?: number;
}

// ── Filter result ─────────────────────────────────────────────────────────────

export type FilterResult =
  | { included: true }
  | { included: false; reason: ExclusionReason };

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Evaluates a single tree entry against the filter config.
 * First match wins; reason is recorded.
 *
 * Paths must be **relative to the ingestion root** (repo-root or subpath root).
 * The caller is responsible for making paths relative before calling.
 */
export function filterEntry(
  entry: RawTreeEntry,
  config: FilterConfig,
): FilterResult {
  const { path, type, mode } = entry;

  // 1. Structural: only blobs are candidates
  if (type === "commit") return { included: false, reason: "submodule" };
  if (mode === "120000") return { included: false, reason: "symlink" };
  if (type !== "blob") return { included: false, reason: "ignored_directory" };

  // Extract name (last segment) and path segments
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? "";

  // 2. Ignored directory segments (check all directory segments in the path)
  const dirSegments = segments.slice(0, -1);
  for (const seg of dirSegments) {
    if (config.ignoredDirectories.includes(seg)) {
      return { included: false, reason: "ignored_directory" };
    }
  }

  // 3. Secret risk filenames/patterns
  if (matchesSecretRisk(name, config.secretRiskPatterns)) {
    return { included: false, reason: "secret_risk" };
  }

  // 4. Lockfiles
  if (config.lockfiles.includes(name)) {
    return { included: false, reason: "lockfile" };
  }

  // 5. Generated/minified patterns
  if (matchesGlobPatterns(name, config.generatedOrMinifiedPatterns)) {
    return { included: false, reason: "generated_or_minified" };
  }

  // 6. Binary/media extensions (including SVG)
  const ext = getExtension(name);
  if (ext && config.binaryExtensions.includes(ext)) {
    return { included: false, reason: "binary_extension" };
  }

  // 7. Allowlist check
  const isAllowed =
    (ext && config.allowedExtensions.includes(ext)) ||
    matchesAllowedFilename(name, config.allowedFilenames);

  if (!isAllowed) {
    return { included: false, reason: "not_allowlisted" };
  }

  // 8. Size check (done here for entries with known size from the tree response)
  if (entry.size !== undefined && entry.size > config.maxFileSizeBytes) {
    return { included: false, reason: "too_large" };
  }

  return { included: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExtension(name: string): string | null {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return null; // no extension, or leading dot only
  return name.slice(idx).toLowerCase();
}

/**
 * Checks secret risk patterns.
 * Patterns: exact names like ".env", or wildcard like ".env.*", "*.pem"
 */
function matchesSecretRisk(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchGlob(name, pattern)) return true;
  }
  return false;
}

/**
 * Checks if a filename matches any of a list of glob patterns.
 * Supports simple * wildcard (not path separators).
 */
function matchesGlobPatterns(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchGlob(name, pattern)) return true;
  }
  return false;
}

/**
 * Checks if a filename matches an allowed filename pattern.
 * Supports * wildcard in filename patterns like "Dockerfile*", "docker-compose*.yml"
 */
function matchesAllowedFilename(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchGlob(name, pattern)) return true;
  }
  return false;
}

/**
 * Simple glob matcher supporting * wildcard (matches any char sequence except /).
 * Case-sensitive for paths, case-insensitive not needed here (paths are case-sensitive).
 */
function matchGlob(name: string, pattern: string): boolean {
  // Escape special regex chars except *
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\*/g, "[^/]*") + "$";
  try {
    return new RegExp(regexStr).test(name);
  } catch {
    return false;
  }
}

// ── Directory pruning (for BFS fallback) ─────────────────────────────────────

/**
 * Returns true if this directory segment name should be pruned during BFS.
 * Used to skip fetching trees for ignored directories.
 */
export function isIgnoredDirectory(name: string, config: FilterConfig): boolean {
  return config.ignoredDirectories.includes(name);
}
