import { AppError } from "./types/errors";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_URL_LENGTH = 2048;
const OWNER_MAX = 39;
const REPO_MAX = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Valid GitHub owner name: 1–39 alphanum/hyphen, no leading/trailing/consecutive hyphens */
function isValidOwner(owner: string): boolean {
  if (owner.length === 0 || owner.length > OWNER_MAX) return false;
  if (!/^[a-zA-Z0-9-]+$/.test(owner)) return false;
  if (owner.startsWith("-") || owner.endsWith("-")) return false;
  if (owner.includes("--")) return false;
  return true;
}

/** Valid GitHub repo name: 1–100 chars, [A-Za-z0-9._-], not "." or ".." */
function isValidRepo(repo: string): boolean {
  if (repo.length === 0 || repo.length > REPO_MAX) return false;
  if (repo === "." || repo === "..") return false;
  if (!/^[A-Za-z0-9._-]+$/.test(repo)) return false;
  return true;
}

/** Has control characters (including NUL) */
function hasControlChars(str: string): boolean {
  return /[\x00-\x1f\x7f]/.test(str);
}

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  /** Raw segments after /tree/, unresolved because branch names may contain slashes */
  treeSegments: string[];
}

/**
 * Parses a GitHub URL into its components. Pure function — no network calls.
 *
 * Accepts:
 * - https://github.com/{owner}/{repo}
 * - https://github.com/{owner}/{repo}/tree/{ref-and-path…}
 * - www.github.com (normalized)
 * - scheme-less github.com/o/r (normalized to https)
 * - http:// (normalized to https)
 * - Optional .git suffix, trailing slash, query string, fragment (all stripped)
 *
 * Rejects:
 * - Other hosts → INVALID_URL
 * - /blob/, /pull/, /issues/, /commit/ paths → UNSUPPORTED_URL_FORM
 * - Input over 2048 chars → INVALID_URL
 * - Empty input, control characters → INVALID_URL
 */
export function parseGitHubUrl(input: string): ParsedGitHubUrl {
  if (!input || input.length === 0) {
    throw new AppError("INVALID_URL", "URL cannot be empty.");
  }

  if (hasControlChars(input)) {
    throw new AppError("INVALID_URL", "URL contains invalid characters.");
  }

  if (input.length > MAX_URL_LENGTH) {
    throw new AppError(
      "INVALID_URL",
      `URL exceeds maximum length of ${MAX_URL_LENGTH} characters.`,
    );
  }

  // Normalize: add https:// if scheme-less
  let normalized = input.trim();
  if (/^(www\.)?github\.com/i.test(normalized)) {
    normalized = "https://" + normalized;
  }

  // Normalize http → https
  normalized = normalized.replace(/^http:\/\//i, "https://");

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new AppError("INVALID_URL", "Could not parse URL. Please paste a GitHub repository URL.");
  }

  // Must be github.com
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "github.com") {
    throw new AppError(
      "INVALID_URL",
      "Only github.com URLs are supported. Please paste a public GitHub repository URL.",
    );
  }

  // Must be https (after normalization)
  if (url.protocol !== "https:") {
    throw new AppError("INVALID_URL", "Only https:// URLs are supported.");
  }

  // Parse pathname: strip leading slash, remove .git suffix, remove trailing slash
  let pathname = url.pathname;
  if (pathname.startsWith("/")) pathname = pathname.slice(1);
  pathname = pathname.replace(/\/+$/, ""); // strip trailing slashes first
  pathname = pathname.replace(/\.git$/, ""); // then strip .git suffix

  const segments = pathname.split("/").filter(Boolean);

  if (segments.length < 2) {
    throw new AppError(
      "UNSUPPORTED_URL_FORM",
      "Please paste a repository URL like https://github.com/owner/repo.",
    );
  }

  const ownerRaw = segments[0]!;
  const repoRaw = segments[1]!;

  // Reject known non-repo paths
  const thirdSegment = segments[2];
  const UNSUPPORTED_PATHS = new Set(["blob", "pull", "pulls", "issues", "commit", "commits", "releases", "actions", "settings", "wiki", "discussions"]);
  if (thirdSegment && UNSUPPORTED_PATHS.has(thirdSegment.toLowerCase())) {
    throw new AppError(
      "UNSUPPORTED_URL_FORM",
      `The URL path "/${thirdSegment}/…" is not supported. Please paste the repository URL (https://github.com/owner/repo) or a /tree/ URL.`,
    );
  }

  // Validate owner and repo
  if (!isValidOwner(ownerRaw)) {
    throw new AppError("INVALID_URL", `Invalid GitHub owner name: "${ownerRaw}".`);
  }
  if (!isValidRepo(repoRaw)) {
    throw new AppError("INVALID_URL", `Invalid GitHub repository name: "${repoRaw}".`);
  }

  // Extract tree segments
  let treeSegments: string[] = [];
  if (thirdSegment === "tree" && segments.length > 3) {
    treeSegments = segments.slice(3);
  } else if (thirdSegment && thirdSegment !== "tree") {
    // Something unexpected in position 3 that's not a known bad path and not "tree"
    // Treat as UNSUPPORTED_URL_FORM
    throw new AppError(
      "UNSUPPORTED_URL_FORM",
      `Unrecognized URL form. Please paste the repository URL or a /tree/ URL.`,
    );
  }

  return {
    owner: ownerRaw,
    repo: repoRaw,
    treeSegments,
  };
}
