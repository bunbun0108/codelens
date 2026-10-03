import { AppError } from "../../shared/types/errors";

/**
 * Maps GitHub API HTTP errors to typed AppErrors per spec §5.
 */
export function mapGitHubError(
  status: number,
  message: string,
  rateLimitReset?: number,
): AppError {
  // 301 is handled inline (trust canonical full_name), not as an error

  if (status === 404) {
    return new AppError(
      "REPO_NOT_FOUND",
      "Repository not found or not public.",
      false,
    );
  }

  if (status === 409) {
    return new AppError(
      "REPO_EMPTY",
      "This repository is empty.",
      false,
    );
  }

  if (status === 422) {
    return new AppError(
      "REF_NOT_FOUND",
      "The requested ref was not found.",
      false,
    );
  }

  if (status === 451) {
    return new AppError(
      "REPO_UNAVAILABLE",
      "This repository is not available due to legal restrictions.",
      false,
    );
  }

  if (status === 403 || status === 429) {
    if (rateLimitReset !== undefined) {
      return new AppError(
        "UPSTREAM_RATE_LIMITED",
        "GitHub API rate limit exceeded. Please try again later.",
        true,
        { resetAt: new Date(rateLimitReset * 1000).toISOString() },
      );
    }
    // Other 403 = access error (e.g., private repo)
    return new AppError(
      "REPO_NOT_FOUND",
      "Repository not found or not public.",
      false,
    );
  }

  if (status >= 500) {
    return new AppError(
      "UPSTREAM_ERROR",
      `GitHub API returned an error (${status}). Please try again.`,
      true,
      { originalMessage: message },
    );
  }

  return new AppError(
    "UPSTREAM_ERROR",
    `Unexpected GitHub API response (${status}).`,
    false,
    { originalMessage: message },
  );
}
