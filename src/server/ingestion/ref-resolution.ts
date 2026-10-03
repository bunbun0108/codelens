import type { GitHubClient } from "../github/client";
import { AppError } from "../../shared/types/errors";

/**
 * Resolves a ref (which might contain slashes like feature/login/src) to a commit SHA.
 * Uses a longest-prefix disambiguation strategy.
 */
export async function resolveRef(
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  treeSegments: string[],
): Promise<{
  commitSha: string;
  treeSha: string;
  resolvedRefName: string;
  subpathSegments: string[];
  committedAt: string;
}> {
  // If no segments, we just want the default branch (which we shouldn't hit this function for, but just in case)
  if (treeSegments.length === 0) {
    throw new AppError("REF_NOT_FOUND", "No ref provided.", false);
  }

  // 1. If it looks like a short SHA (less than 40 hex chars, purely hex), reject it per spec §7
  const firstSegment = treeSegments[0]!;
  if (/^[0-9a-f]{7,39}$/i.test(firstSegment)) {
    throw new AppError(
      "REF_NOT_FOUND",
      `The ref "${firstSegment}" looks like a short SHA. Please use the full 40-character commit SHA.`,
      false,
    );
  }

  // 2. Try longest prefix first
  // E.g. for /tree/feature/login/src/utils
  // Try:
  // "feature/login/src/utils"
  // "feature/login/src"
  // "feature/login"
  // "feature"

  // Cap at 8 attempts per spec
  const maxAttempts = Math.min(treeSegments.length, 8);
  const attemptedRefs: string[] = [];

  for (let i = maxAttempts; i > 0; i--) {
    const candidateRef = treeSegments.slice(0, i).join("/");
    attemptedRefs.push(candidateRef);

    const commitResult = await githubClient.getCommit(owner, repo, candidateRef);

    if (commitResult !== null) {
      // Found it!
      return {
        commitSha: commitResult.commitSha,
        treeSha: commitResult.treeSha,
        resolvedRefName: candidateRef,
        subpathSegments: treeSegments.slice(i), // The rest is the subpath
        committedAt: commitResult.committedAt,
      };
    }
  }

  // If we get here, none of the prefixes resolved.
  throw new AppError(
    "REF_NOT_FOUND",
    `Could not resolve ref. Attempted: ${attemptedRefs.map((r) => `"${r}"`).join(", ")}`,
    false,
  );
}
