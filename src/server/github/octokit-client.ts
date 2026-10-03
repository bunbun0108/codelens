import { Octokit } from "@octokit/core";
import { retry } from "@octokit/plugin-retry";
import type { GitHubClient, GitHubTreeResponse } from "./client";
import type { RepoInfo } from "../../shared/schemas/index";
import { AppError } from "../../shared/types/errors";
import { mapGitHubError } from "./errors";

const GITHUB_API_VERSION = "2022-11-28";
const TIMEOUT_MS = 10_000;
const RetryableOctokit = Octokit.plugin(retry);

/**
 * Octokit-backed implementation of GitHubClient.
 * This is the only file in the project that imports @octokit/core.
 */
export class OctokitGitHubClient implements GitHubClient {
  private readonly octokit: InstanceType<typeof RetryableOctokit>;

  constructor(token?: string) {
    this.octokit = new RetryableOctokit({
      auth: token,
      userAgent: "codelens-ai/m1",
      headers: {
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      request: {
        timeout: TIMEOUT_MS,
        // Only retry network errors and 5xx; never retry 4xx
        retries: 2,
        retryAfter: 1,
        doNotRetry: ["400", "401", "403", "404", "409", "410", "415", "422", "451"],
      },
    });
  }

  async getRepo(owner: string, repo: string): Promise<RepoInfo> {
    try {
      const response = await this.octokit.request("GET /repos/{owner}/{repo}", {
        owner,
        repo,
      });

      const data = response.data;

      // Reject private repos
      if (data.private) {
        throw new AppError(
          "REPO_NOT_FOUND",
          "Repository not found or not public.",
          false,
        );
      }

      return {
        githubRepoId: Number(data.id),
        owner: data.owner.login,
        name: data.name,
        fullName: data.full_name,
        htmlUrl: data.html_url,
        defaultBranch: data.default_branch,
        description: data.description ?? null,
        archived: data.archived ?? false,
        license: data.license?.spdx_id ?? null,
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const httpErr = err as { status?: number; message?: string; response?: { headers?: Record<string, string> } };
      if (httpErr.status) {
        const reset = httpErr.response?.headers?.["x-ratelimit-reset"]
          ? parseInt(httpErr.response.headers["x-ratelimit-reset"] ?? "0", 10)
          : undefined;
        const remaining = httpErr.response?.headers?.["x-ratelimit-remaining"];
        const isRateLimited = remaining === "0";
        throw mapGitHubError(httpErr.status, httpErr.message ?? "", isRateLimited ? reset : undefined);
      }
      if ((err as { name?: string }).name === "AbortError" || (err as { code?: string }).code === "ECONNABORTED") {
        throw new AppError("UPSTREAM_TIMEOUT", "GitHub API request timed out.", true);
      }
      throw new AppError("UPSTREAM_ERROR", "Failed to reach GitHub API.", true);
    }
  }

  async getCommit(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<{ commitSha: string; treeSha: string; committedAt: string } | null> {
    try {
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/commits/{ref}",
        { owner, repo, ref },
      );
      const data = response.data;
      return {
        commitSha: data.sha,
        treeSha: data.commit.tree.sha,
        committedAt: data.commit.committer?.date ?? data.commit.author?.date ?? new Date().toISOString(),
      };
    } catch (err: unknown) {
      const httpErr = err as { status?: number };
      if (httpErr.status === 404 || httpErr.status === 422) return null;
      if (err instanceof AppError) throw err;
      const errWithHeaders = err as { response?: { headers?: Record<string, string> }; message?: string; name?: string; code?: string };
      if (httpErr.status) {
        const reset = errWithHeaders.response?.headers?.["x-ratelimit-reset"]
          ? parseInt(errWithHeaders.response.headers["x-ratelimit-reset"] ?? "0", 10)
          : undefined;
        const remaining = errWithHeaders.response?.headers?.["x-ratelimit-remaining"];
        throw mapGitHubError(httpErr.status, errWithHeaders.message ?? "", remaining === "0" ? reset : undefined);
      }
      if (errWithHeaders.name === "AbortError" || errWithHeaders.code === "ECONNABORTED") {
        throw new AppError("UPSTREAM_TIMEOUT", "GitHub API request timed out.", true);
      }
      throw new AppError("UPSTREAM_ERROR", "Failed to reach GitHub API.", true);
    }
  }

  async getTree(
    owner: string,
    repo: string,
    treeSha: string,
    recursive: boolean,
  ): Promise<GitHubTreeResponse> {
    try {
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
        {
          owner,
          repo,
          tree_sha: treeSha,
          ...(recursive ? { recursive: "1" } : {}),
        },
      );
      const data = response.data;
      return {
        sha: data.sha,
        truncated: data.truncated ?? false,
        tree: (data.tree ?? []).map((e: any) => {
          const entry: any = {
            path: (e.path as string) ?? "",
            type: (e.type as "blob" | "tree" | "commit") ?? "blob",
            mode: (e.mode as string) ?? "",
            sha: (e.sha as string) ?? "",
          };
          if (e.size !== undefined) entry.size = e.size as number;
          return entry;
        }),
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const httpErr = err as { status?: number; message?: string; response?: { headers?: Record<string, string> }; name?: string; code?: string };
      if (httpErr.status === 409) {
        throw new AppError("REPO_EMPTY", "This repository is empty.", false);
      }
      if (httpErr.status) {
        const reset = httpErr.response?.headers?.["x-ratelimit-reset"]
          ? parseInt(httpErr.response.headers["x-ratelimit-reset"] ?? "0", 10)
          : undefined;
        const remaining = httpErr.response?.headers?.["x-ratelimit-remaining"];
        throw mapGitHubError(httpErr.status, httpErr.message ?? "", remaining === "0" ? reset : undefined);
      }
      if (httpErr.name === "AbortError" || httpErr.code === "ECONNABORTED") {
        throw new AppError("UPSTREAM_TIMEOUT", "GitHub API request timed out.", true);
      }
      throw new AppError("UPSTREAM_ERROR", "Failed to reach GitHub API.", true);
    }
  }

  async getBlob(owner: string, repo: string, blobSha: string): Promise<Uint8Array> {
    try {
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
        {
          owner,
          repo,
          file_sha: blobSha,
          headers: { accept: "application/vnd.github.raw+json" },
        },
      );
      // With raw accept header, response.data is the raw bytes
      const data = response.data;
      if (data instanceof Uint8Array) return data;
      if (typeof data === "string") return new TextEncoder().encode(data);
      // Base64-encoded fallback
      if (typeof data === "object" && (data as Record<string, unknown>)["content"]) {
        const content = (data as Record<string, unknown>)["content"] as string;
        const encoding = (data as Record<string, unknown>)["encoding"] as string;
        if (encoding === "base64") {
          const binary = atob(content.replace(/\n/g, ""));
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          return bytes;
        }
      }
      throw new AppError("UPSTREAM_ERROR", "Unexpected blob response format.", false);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const httpErr = err as { status?: number; message?: string; response?: { headers?: Record<string, string> }; name?: string; code?: string };
      if (httpErr.status) {
        const reset = httpErr.response?.headers?.["x-ratelimit-reset"]
          ? parseInt(httpErr.response.headers["x-ratelimit-reset"] ?? "0", 10)
          : undefined;
        const remaining = httpErr.response?.headers?.["x-ratelimit-remaining"];
        throw mapGitHubError(httpErr.status, httpErr.message ?? "", remaining === "0" ? reset : undefined);
      }
      if (httpErr.name === "AbortError" || httpErr.code === "ECONNABORTED") {
        throw new AppError("UPSTREAM_TIMEOUT", "GitHub API request timed out.", true);
      }
      throw new AppError("UPSTREAM_ERROR", "Failed to fetch blob from GitHub.", true);
    }
  }
}
