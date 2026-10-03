import type { RepoInfo } from "../../shared/schemas/index";

// ── Raw GitHub API types ──────────────────────────────────────────────────────

export interface GitHubRepoResponse {
  id: number;
  owner: { login: string };
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  description: string | null;
  archived: boolean;
  private: boolean;
  license: { spdx_id: string } | null;
}

export interface GitHubCommitResponse {
  sha: string;
  commit: {
    committer: { date: string } | null;
    tree: { sha: string };
  };
}

export interface GitHubTreeEntry {
  path?: string;
  type?: "blob" | "tree" | "commit";
  mode?: string;
  sha?: string;
  size?: number;
  url?: string;
}

export interface GitHubTreeResponse {
  sha: string;
  truncated: boolean;
  tree: GitHubTreeEntry[];
}

export interface GitHubBlobResponse {
  sha: string;
  size: number;
  content: string;
  encoding: "base64" | "utf-8" | "none";
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  used: number;
}

// ── GitHubClient interface ────────────────────────────────────────────────────

/**
 * All GitHub API access goes through this interface.
 * No caller outside server/container.ts may import an implementation.
 */
export interface GitHubClient {
  /**
   * Fetches repository metadata. Returns null if 404 (not found or private).
   * Throws AppError for other errors.
   */
  getRepo(owner: string, repo: string): Promise<RepoInfo>;

  /**
   * Resolves a ref (branch, tag, or full SHA) to a commit SHA and tree SHA.
   * Returns null if the ref is not found (404/422).
   */
  getCommit(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<{ commitSha: string; treeSha: string; committedAt: string } | null>;

  /**
   * Fetches the git tree for a given tree SHA.
   * @param recursive - if true, uses ?recursive=1
   */
  getTree(
    owner: string,
    repo: string,
    treeSha: string,
    recursive: boolean,
  ): Promise<GitHubTreeResponse>;

  /**
   * Fetches a blob by SHA and returns its raw bytes.
   */
  getBlob(owner: string, repo: string, blobSha: string): Promise<Uint8Array>;
}
