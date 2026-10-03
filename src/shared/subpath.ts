import { AppError } from "./types/errors";

const MAX_DEPTH = 20;
const MAX_LENGTH = 1024;

/**
 * Normalizes a subpath from URL segments.
 *
 * - Strips leading/trailing slashes
 * - Percent-decodes once
 * - Rejects empty segments, ".", "..", backslashes, NUL, control characters
 * - Enforces max depth (20) and max length (1024)
 * - Returns "" for an empty/root subpath
 */
export function normalizeSubpath(segments: string[]): string {
  if (segments.length === 0) return "";

  // Join and decode
  const joined = segments.join("/");

  let decoded: string;
  try {
    decoded = decodeURIComponent(joined);
  } catch {
    throw new AppError("INVALID_SUBPATH", "Subpath contains invalid percent-encoding.");
  }

  // Reject backslashes and NUL
  if (decoded.includes("\\") || decoded.includes("\x00")) {
    throw new AppError("INVALID_SUBPATH", "Subpath contains invalid characters.");
  }

  // Reject control characters
  if (/[\x01-\x1f\x7f]/.test(decoded)) {
    throw new AppError("INVALID_SUBPATH", "Subpath contains control characters.");
  }

  if (decoded.length > MAX_LENGTH) {
    throw new AppError(
      "INVALID_SUBPATH",
      `Subpath exceeds maximum length of ${MAX_LENGTH} characters.`,
    );
  }

  // Split into segments and validate each
  const parts = decoded.split("/").filter(Boolean);

  if (parts.length > MAX_DEPTH) {
    throw new AppError(
      "INVALID_SUBPATH",
      `Subpath exceeds maximum depth of ${MAX_DEPTH} segments.`,
    );
  }

  for (const part of parts) {
    if (part === "." || part === "..") {
      throw new AppError(
        "INVALID_SUBPATH",
        `Subpath contains invalid segment "${part}". Path traversal is not allowed.`,
      );
    }
    if (part.length === 0) {
      throw new AppError("INVALID_SUBPATH", "Subpath contains empty segments.");
    }
  }

  return parts.join("/");
}

/**
 * Splits a normalized subpath into its directory segments.
 * Returns [] for the root (empty string).
 */
export function splitSubpath(subpath: string): string[] {
  if (!subpath) return [];
  return subpath.split("/");
}
