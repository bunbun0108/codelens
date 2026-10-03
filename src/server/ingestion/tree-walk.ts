import type { GitHubClient, GitHubTreeEntry } from "../github/client";
import { AppError } from "../../shared/types/errors";
import { isIgnoredDirectory } from "../../shared/filter-engine";
import type { FilterConfig } from "../../shared/filter-engine";

const MAX_BFS_REQUESTS = 300;
const BFS_CONCURRENCY = 6;

/**
 * Resolves a subpath to its specific subtree SHA by walking down from the root tree.
 * Non-recursive walk.
 */
export async function resolveSubpathTreeSha(
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  rootTreeSha: string,
  subpathSegments: string[],
): Promise<string> {
  let currentTreeSha = rootTreeSha;

  for (const segment of subpathSegments) {
    const response = await githubClient.getTree(owner, repo, currentTreeSha, false);
    const entry = response.tree.find((e) => e.path === segment);

    if (!entry) {
      throw new AppError("SUBPATH_NOT_FOUND", `Subpath segment "${segment}" not found.`);
    }
    if (entry.type !== "tree" || !entry.sha) {
      throw new AppError("SUBPATH_NOT_DIRECTORY", `Subpath segment "${segment}" is not a directory.`);
    }

    currentTreeSha = entry.sha;
  }

  return currentTreeSha;
}

export interface TreeWalkResult {
  entries: GitHubTreeEntry[];
  usedTruncationFallback: boolean;
}

/**
 * Fetches the full tree for a given tree SHA.
 * First tries recursive=1. If truncated, falls back to non-recursive BFS.
 */
export async function fetchFullTree(
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  targetTreeSha: string,
  filterConfig: FilterConfig,
  basePath: string = "",
): Promise<TreeWalkResult> {
  const recursiveResponse = await githubClient.getTree(owner, repo, targetTreeSha, true);

  if (!recursiveResponse.truncated) {
    // Add the basePath to all entries to make them root-relative
    const entries = recursiveResponse.tree.map(e => ({
      ...e,
      path: basePath ? `${basePath}/${e.path}` : e.path
    }));
    return { entries: entries as any, usedTruncationFallback: false };
  }

  // Truncation fallback: BFS
  // We need to fetch the root non-recursively, then fan out to subdirectories
  // using a bounded concurrency pool.

  const allEntries: GitHubTreeEntry[] = [];
  const queue: { sha: string; pathPrefix: string }[] = [{ sha: targetTreeSha, pathPrefix: basePath }];
  let requestsMade = 0;

  while (queue.length > 0) {
    // Take up to BFS_CONCURRENCY items from the queue
    const batch = queue.splice(0, BFS_CONCURRENCY);

    if (requestsMade + batch.length > MAX_BFS_REQUESTS) {
      throw new AppError(
        "REPO_TOO_LARGE",
        `Repository is too large. Exceeded maximum of ${MAX_BFS_REQUESTS} tree requests. Try using a /tree/ URL to explore a specific subdirectory.`,
        false,
      );
    }

    requestsMade += batch.length;

    // Fetch batch concurrently
    const responses = await Promise.all(
      batch.map(async (item) => {
        const resp = await githubClient.getTree(owner, repo, item.sha, false);
        return { prefix: item.pathPrefix, tree: resp.tree };
      }),
    );

    for (const res of responses) {
      for (const entry of res.tree) {
        if (!entry.path) continue;
        
        const fullPath = res.prefix ? `${res.prefix}/${entry.path}` : entry.path;
        
        // Add to collected entries with the full path
        allEntries.push({ ...entry, path: fullPath });

        // If it's a directory, decide if we should queue it
        if (entry.type === "tree" && entry.sha) {
          // Check if it's an ignored directory (we prune the search here)
          if (!isIgnoredDirectory(entry.path, filterConfig)) {
            queue.push({ sha: entry.sha, pathPrefix: fullPath });
          }
        }
      }
    }
  }

  return { entries: allEntries, usedTruncationFallback: true };
}
