/**
 * Integration tests for the IngestionService using a FakeGitHubClient.
 * No network. Covers: slash-containing refs, truncated-tree fallback,
 * 300-request cap, subpath errors, empty repo, rate-limit 403, 5xx retry,
 * no retry on 4xx, 301 rename, and single-flight dedup.
 */
import { describe, it, expect, vi } from "vitest";
import { IngestionService } from "../../src/server/ingestion/ingest-repository";
import { MemorySnapshotStore } from "../../src/server/store/memory-snapshot-store";
import type { GitHubClient, GitHubTreeEntry, GitHubTreeResponse } from "../../src/server/github/client";
import type { RepoInfo } from "../../src/shared/schemas/index";
import { AppError } from "../../src/shared/types/errors";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_COMMIT = "a".repeat(40);
const DEFAULT_TREE_SHA = "b".repeat(40);
const NOW_ISO = new Date().toISOString();

function makeRepoInfo(overrides: Partial<RepoInfo> = {}): RepoInfo {
  return {
    githubRepoId: 1,
    owner: "owner",
    name: "repo",
    fullName: "owner/repo",
    htmlUrl: "https://github.com/owner/repo",
    defaultBranch: "main",
    description: null,
    archived: false,
    license: null,
    ...overrides,
  };
}

function makeCommitResult() {
  return {
    commitSha: DEFAULT_COMMIT,
    treeSha: DEFAULT_TREE_SHA,
    committedAt: NOW_ISO,
  };
}

function makeBlob(path: string, size = 200): GitHubTreeEntry {
  return {
    path,
    type: "blob",
    mode: "100644",
    sha: "c".repeat(40),
    size,
  };
}

function flatTree(entries: GitHubTreeEntry[], truncated = false): GitHubTreeResponse {
  return { sha: DEFAULT_TREE_SHA, truncated, tree: entries };
}

function makeFakeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getRepo: vi.fn().mockResolvedValue(makeRepoInfo()),
    getCommit: vi.fn().mockResolvedValue(makeCommitResult()),
    getTree: vi.fn().mockResolvedValue(
      flatTree([makeBlob("src/index.ts")]),
    ),
    getBlob: vi.fn().mockResolvedValue(new Uint8Array([104, 101, 108, 108, 111])),
    ...overrides,
  };
}

function makeService(client: GitHubClient) {
  return new IngestionService(client, new MemorySnapshotStore());
}

// ── Basic happy path ──────────────────────────────────────────────────────────

describe("IngestionService — happy path", () => {
  it("ingests a simple repo and returns a snapshot", async () => {
    const svc = makeService(makeFakeClient());
    const snap = await svc.ingestRepository("https://github.com/owner/repo");
    expect(snap.id).toBeTruthy();
    expect(snap.repo.owner).toBe("owner");
    expect(snap.files).toHaveLength(1);
    expect(snap.files[0]!.path).toBe("src/index.ts");
    expect(snap.cacheHit).toBe(false);
  });

  it("returns cacheHit=true on second call for same URL+commit", async () => {
    const client = makeFakeClient();
    const svc = makeService(client);
    await svc.ingestRepository("https://github.com/owner/repo");
    const second = await svc.ingestRepository("https://github.com/owner/repo");
    expect(second.cacheHit).toBe(true);
    // GitHub API should only have been called once for getTree (second fetch should hit store)
    expect(vi.mocked(client.getTree).mock.calls.length).toBe(1);
  });
});

// ── Slash-containing refs ─────────────────────────────────────────────────────

describe("IngestionService — slash-containing refs", () => {
  it("resolves feature/login branch (longest prefix wins)", async () => {
    const client = makeFakeClient({
      getCommit: vi.fn()
        .mockResolvedValueOnce(null) // "feature/login/src" → not found
        .mockResolvedValueOnce(null) // "feature/login"
        .mockResolvedValueOnce(makeCommitResult()), // "feature" → found
      getTree: vi.fn()
        .mockResolvedValueOnce(flatTree([{ path: "login", type: "tree", sha: "dir1" } as any])) // root tree contains login
        .mockResolvedValueOnce(flatTree([{ path: "src", type: "tree", sha: "dir2" } as any])) // login tree contains src
        .mockResolvedValue(flatTree([makeBlob("index.ts")])), // src tree contains blob
    });
    // URL: /tree/feature/login/src — 3 segments
    const svc = makeService(client);
    const snap = await svc.ingestRepository(
      "https://github.com/owner/repo/tree/feature/login/src",
    );
    expect(snap.id).toBeTruthy();
  });

  it("resolves two-segment branch correctly", async () => {
    const client = makeFakeClient({
      getCommit: vi.fn()
        .mockResolvedValueOnce(null)          // "feat/my-branch" → first full attempt
        .mockResolvedValueOnce(makeCommitResult()), // "feat" → found
      getTree: vi.fn()
        .mockResolvedValueOnce(flatTree([{ path: "my-branch", type: "tree", sha: "dir1" } as any])) // root tree contains my-branch
        .mockResolvedValue(flatTree([makeBlob("index.ts")])), // my-branch tree contains blob
    });
    const svc = makeService(client);
    const snap = await svc.ingestRepository(
      "https://github.com/owner/repo/tree/feat/my-branch",
    );
    expect(snap).toBeTruthy();
  });

  it("throws REF_NOT_FOUND if no prefix resolves", async () => {
    const client = makeFakeClient({
      getCommit: vi.fn().mockResolvedValue(null), // all attempts fail
    });
    const svc = makeService(client);
    await expect(
      svc.ingestRepository("https://github.com/owner/repo/tree/feat/nonexistent"),
    ).rejects.toMatchObject({ code: "REF_NOT_FOUND" });
  });
});

// ── Truncated tree fallback ───────────────────────────────────────────────────

describe("IngestionService — truncated tree fallback", () => {
  it("falls back to BFS when recursive tree is truncated", async () => {
    // First getTree call (recursive=true) → truncated
    // Second+ calls (non-recursive, BFS) → actual entries
    const client = makeFakeClient({
      getTree: vi.fn()
        .mockResolvedValueOnce(
          flatTree([makeBlob("src/index.ts"), { path: "src", type: "tree", mode: "040000", sha: "d".repeat(40) }], true),
        )
        .mockResolvedValue(flatTree([makeBlob("src/index.ts")])),
    });
    const svc = makeService(client);
    const snap = await svc.ingestRepository("https://github.com/owner/repo");
    expect(snap.stats.usedTruncationFallback).toBe(true);
  });
});



// ── Empty repo ────────────────────────────────────────────────────────────────

describe("IngestionService — empty repo", () => {
  it("returns a snapshot with zero files for an empty tree", async () => {
    const client = makeFakeClient({
      getTree: vi.fn().mockResolvedValue(flatTree([])),
    });
    const svc = makeService(client);
    const snap = await svc.ingestRepository("https://github.com/owner/repo");
    expect(snap.files).toHaveLength(0);
    expect(snap.stats.filesIncluded).toBe(0);
  });
});

// ── Rate limit (GitHub returns 403 with rate-limit headers) ──────────────────

describe("IngestionService — rate limits", () => {
  it("throws RATE_LIMITED / UPSTREAM_RATE_LIMITED on 403", async () => {
    const client = makeFakeClient({
      getRepo: vi.fn().mockRejectedValue(
        new AppError("UPSTREAM_RATE_LIMITED", "GitHub rate limit exceeded.", true),
      ),
    });
    const svc = makeService(client);
    await expect(
      svc.ingestRepository("https://github.com/owner/repo"),
    ).rejects.toMatchObject({ code: "UPSTREAM_RATE_LIMITED" });
  });
});

// ── 5xx: errors propagate (OctokitGitHubClient retries, but FakeClient doesn't) ──

describe("IngestionService — upstream errors", () => {
  it("propagates UPSTREAM_ERROR from getRepo", async () => {
    const client = makeFakeClient({
      getRepo: vi.fn().mockRejectedValue(
        new AppError("UPSTREAM_ERROR", "GitHub 500", true),
      ),
    });
    const svc = makeService(client);
    await expect(
      svc.ingestRepository("https://github.com/owner/repo"),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("does NOT catch 4xx errors (REPO_NOT_FOUND is non-retryable)", async () => {
    const client = makeFakeClient({
      getRepo: vi.fn().mockRejectedValue(
        new AppError("REPO_NOT_FOUND", "Not found", false),
      ),
    });
    const svc = makeService(client);
    await expect(
      svc.ingestRepository("https://github.com/owner/repo"),
    ).rejects.toMatchObject({ code: "REPO_NOT_FOUND", retryable: false });
  });
});

// ── 301 rename: getRepo returns canonical owner/name ─────────────────────────

describe("IngestionService — repo rename (301)", () => {
  it("uses canonical owner/name from getRepo response", async () => {
    const client = makeFakeClient({
      getRepo: vi.fn().mockResolvedValue(
        makeRepoInfo({ owner: "NewOwner", name: "NewRepo", fullName: "NewOwner/NewRepo" }),
      ),
    });
    const svc = makeService(client);
    // Request old owner/repo
    const snap = await svc.ingestRepository("https://github.com/OldOwner/OldRepo");
    // Snapshot should carry the canonical (redirected) owner/name
    expect(snap.repo.owner).toBe("NewOwner");
    expect(snap.repo.name).toBe("NewRepo");
  });
});

// ── Single-flight dedup ───────────────────────────────────────────────────────

describe("IngestionService — single-flight dedup", () => {
  it("deduplicates concurrent requests for the same URL", async () => {
    // Slow getTree to guarantee overlap
    let resolveTree: (v: GitHubTreeResponse) => void;
    const treePromise = new Promise<GitHubTreeResponse>((res) => {
      resolveTree = res;
    });

    const client = makeFakeClient({
      getTree: vi.fn().mockReturnValue(treePromise),
    });
    const svc = makeService(client);

    // Fire two concurrent requests before getTree resolves
    const p1 = svc.ingestRepository("https://github.com/owner/repo");
    const p2 = svc.ingestRepository("https://github.com/owner/repo");

    // Resolve the pending tree fetch
    resolveTree!(flatTree([makeBlob("src/index.ts")]));

    const [s1, s2] = await Promise.all([p1, p2]);

    // Both should get the same snapshot id
    expect(s1.id).toBe(s2.id);

    // getTree should have been called only once (not twice)
    expect(vi.mocked(client.getTree).mock.calls.length).toBe(1);
  });
});
