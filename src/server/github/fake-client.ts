/**
 * FakeGitHubClient
 *
 * A fully in-process implementation of GitHubClient that returns a
 * fixed, deterministic fixture repository. Enabled exclusively when
 * the environment variable CODELENS_FAKE_GITHUB=1 is set.
 *
 * Rules:
 *  - NEVER loaded in production (container.ts enforces this).
 *  - No network calls; all data is hard-coded below.
 *  - The fixture repo is "fake-owner/fake-repo" with branch "main".
 *  - Eight files across three directories, all small ASCII content.
 *
 * Adding a file: add an entry to FAKE_BLOBS and FAKE_TREE_ENTRIES.
 */

import type { GitHubClient, GitHubTreeResponse } from "./client";
import type { RepoInfo } from "../../shared/schemas/index";

// ── Fixture data ──────────────────────────────────────────────────────────────

const FAKE_OWNER = "fake-owner";
const FAKE_REPO = "fake-repo";
const FAKE_BRANCH = "main";
const FAKE_COMMIT_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FAKE_TREE_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FAKE_COMMITTED_AT = "2024-01-01T00:00:00Z";

/**
 * Map from blobSha → raw UTF-8 content.
 * Blob SHAs here are fake; they just need to be unique 40-char hex strings.
 */
const FAKE_BLOBS: Record<string, string> = {
  ["c001" + "0".repeat(36)]: "# fake-repo\n\nA fixture repository for E2E tests.\n",
  ["c002" + "0".repeat(36)]: '{"name":"fake-repo","version":"1.0.0"}\n',
  ["c003" + "0".repeat(36)]: "export function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n",
  ["c004" + "0".repeat(36)]: 'import { greet } from "./greet";\nconsole.log(greet("world"));\n',
  ["c005" + "0".repeat(36)]: "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
  ["c006" + "0".repeat(36)]: 'import { add } from "../utils/math";\nconsole.log(add(1, 2));\n',
  ["c007" + "0".repeat(36)]: "# Contributing\n\nPlease read the README first.\n",
  ["c008" + "0".repeat(36)]: "MIT License\n\nCopyright (c) 2024 fake-owner\n",
};

const FAKE_TREE_ENTRIES = [
  { path: "README.md",            sha: "c001" + "0".repeat(36), size: 46,  type: "blob" as const },
  { path: "package.json",         sha: "c002" + "0".repeat(36), size: 38,  type: "blob" as const },
  { path: "src/greet.ts",         sha: "c003" + "0".repeat(36), size: 70,  type: "blob" as const },
  { path: "src/index.ts",         sha: "c004" + "0".repeat(36), size: 64,  type: "blob" as const },
  { path: "utils/math.ts",        sha: "c005" + "0".repeat(36), size: 63,  type: "blob" as const },
  { path: "utils/consumer.ts",    sha: "c006" + "0".repeat(36), size: 58,  type: "blob" as const },
  { path: "CONTRIBUTING.md",      sha: "c007" + "0".repeat(36), size: 46,  type: "blob" as const },
  { path: "LICENSE",              sha: "c008" + "0".repeat(36), size: 44,  type: "blob" as const },
];

// ── Implementation ────────────────────────────────────────────────────────────

export class FakeGitHubClient implements GitHubClient {
  getRepo(owner: string, repo: string): Promise<RepoInfo> {
    this.assertOwnerRepo(owner, repo);
    const repoInfo: RepoInfo = {
      githubRepoId: 9999999,
      owner: FAKE_OWNER,
      name: FAKE_REPO,
      fullName: `${FAKE_OWNER}/${FAKE_REPO}`,
      htmlUrl: `https://github.com/${FAKE_OWNER}/${FAKE_REPO}`,
      defaultBranch: FAKE_BRANCH,
      description: "Fixture repository for E2E tests",
      archived: false,
      license: null,
    };
    return Promise.resolve(repoInfo);
  }

  getCommit(
    owner: string,
    repo: string,
    _ref: string,
  ): Promise<{ commitSha: string; treeSha: string; committedAt: string } | null> {
    this.assertOwnerRepo(owner, repo);
    return Promise.resolve({
      commitSha: FAKE_COMMIT_SHA,
      treeSha: FAKE_TREE_SHA,
      committedAt: FAKE_COMMITTED_AT,
    });
  }

  getTree(
    owner: string,
    repo: string,
    _treeSha: string,
    _recursive: boolean,
  ): Promise<GitHubTreeResponse> {
    this.assertOwnerRepo(owner, repo);
    const response: GitHubTreeResponse = {
      sha: FAKE_TREE_SHA,
      truncated: false,
      tree: FAKE_TREE_ENTRIES.map((e) => ({
        path: e.path,
        type: e.type,
        sha: e.sha,
        size: e.size,
        mode: "100644",
      })),
    };
    return Promise.resolve(response);
  }

  getBlob(owner: string, repo: string, blobSha: string): Promise<Uint8Array> {
    this.assertOwnerRepo(owner, repo);
    const content = FAKE_BLOBS[blobSha];
    if (content === undefined) {
      return Promise.reject(new Error(`FakeGitHubClient: unknown blobSha ${blobSha}`));
    }
    return Promise.resolve(new TextEncoder().encode(content));
  }

  private assertOwnerRepo(owner: string, repo: string): void {
    if (
      owner.toLowerCase() !== FAKE_OWNER ||
      repo.toLowerCase() !== FAKE_REPO
    ) {
      throw new Error(
        `FakeGitHubClient: only serves ${FAKE_OWNER}/${FAKE_REPO}, ` +
          `got ${owner}/${repo}`,
      );
    }
  }
}

/** The URL that exercises this fake client end-to-end. */
export const FAKE_REPO_URL =
  `https://github.com/${FAKE_OWNER}/${FAKE_REPO}/tree/${FAKE_BRANCH}`;
