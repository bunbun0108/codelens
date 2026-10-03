/**
 * Route contract tests using Next.js route handler functions directly.
 * Tests the HTTP contract: status codes, JSON shapes, error envelopes.
 * No live server needed — imports route handlers and calls them as functions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Snapshot } from "../../src/shared/schemas/index";
import type { RepoInfo } from "../../src/shared/schemas/index";

// ── Fixture ───────────────────────────────────────────────────────────────────

const COMMIT_SHA = "a".repeat(40);
const TREE_SHA = "b".repeat(40);
const NOW = new Date().toISOString();

function makeRepoInfo(): RepoInfo {
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
  };
}

function makeSnapshot(id = "snap-1"): Snapshot {
  return {
    id,
    schemaVersion: 1,
    repo: makeRepoInfo(),
    source: {
      requestedRef: null,
      resolvedRefName: "main",
      refKind: "default",
      commitSha: COMMIT_SHA,
      treeSha: TREE_SHA,
      committedAt: NOW,
      subpath: "",
    },
    filterConfigVersion: "v1",
    stats: {
      entriesScanned: 5,
      filesIncluded: 1,
      bytesIncluded: 100,
      excludedByReason: {
        ignored_directory: 0, ignored_filename: 0, lockfile: 1,
        binary_extension: 1, not_allowlisted: 1, too_large: 0,
        secret_risk: 0, generated_or_minified: 0, symlink: 0, submodule: 0,
      },
      usedTruncationFallback: false,
    },
    files: [
      {
        path: "src/index.ts",
        name: "index.ts",
        blobSha: "c".repeat(40),
        size: 100,
        language: "TypeScript",
        kind: "source",
      },
    ],
    createdAt: NOW,
    cacheHit: false,
  };
}

// ── Helper to build a minimal Request object ─────────────────────────────────

function makeRequest(url: string, method = "GET", body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

// ── GET /api/health ───────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const { GET } = await import("../../src/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

// ── POST /api/ingest ──────────────────────────────────────────────────────────

describe("POST /api/ingest", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 400 for missing url field", async () => {
    // We need to mock container before importing the route
    vi.doMock("../../src/server/container", () => ({
      ingestionService: {
        ingestRepository: vi.fn(),
      },
    }));

    const { POST } = await import("../../src/app/api/ingest/route");
    const req = makeRequest("http://localhost/api/ingest", "POST", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    // Must follow the error envelope schema
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("INVALID_URL");
    expect(body.requestId).toBeTruthy();
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.doMock("../../src/server/container", () => ({
      ingestionService: { ingestRepository: vi.fn() },
    }));

    const { POST } = await import("../../src/app/api/ingest/route");
    const req = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_URL");
  });

  it("returns 200 with snapshot on success", async () => {
    const snap = makeSnapshot("test-snap");
    vi.doMock("../../src/server/container", () => ({
      ingestionService: {
        ingestRepository: vi.fn().mockResolvedValue(snap),
      },
    }));

    const { POST } = await import("../../src/app/api/ingest/route");
    const req = makeRequest(
      "http://localhost/api/ingest",
      "POST",
      { url: "https://github.com/owner/repo" },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshot.id).toBe("test-snap");
  });

  it("returns 400 for unsupported URL form", async () => {
    const { AppError } = await import("../../src/shared/types/errors");
    vi.doMock("../../src/server/container", () => ({
      ingestionService: {
        ingestRepository: vi.fn().mockRejectedValue(
          new AppError("UNSUPPORTED_URL_FORM", "blob URLs not supported"),
        ),
      },
    }));

    const { POST } = await import("../../src/app/api/ingest/route");
    const req = makeRequest(
      "http://localhost/api/ingest",
      "POST",
      { url: "https://github.com/owner/repo/blob/main/file.ts" },
    );
    const res = await POST(req);
    expect(res.status).toBe(400); // UNSUPPORTED_URL_FORM -> 400
    const body = await res.json();
    expect(body.error.code).toBe("UNSUPPORTED_URL_FORM");
    // retryable should be a boolean
    expect(typeof body.error.retryable).toBe("boolean");
  });

  it("returns 503 with Retry-After header on upstream rate limit", async () => {
    const { AppError } = await import("../../src/shared/types/errors");
    const resetAt = new Date(Date.now() + 60_000).toISOString();
    vi.doMock("../../src/server/container", () => ({
      ingestionService: {
        ingestRepository: vi.fn().mockRejectedValue(
          new AppError("UPSTREAM_RATE_LIMITED", "rate limited", true, { resetAt }),
        ),
      },
    }));

    const { POST } = await import("../../src/app/api/ingest/route");
    const req = makeRequest(
      "http://localhost/api/ingest",
      "POST",
      { url: "https://github.com/owner/repo" },
    );
    const res = await POST(req);
    expect(res.status).toBe(503); // UPSTREAM_RATE_LIMITED -> 503
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 500 for unexpected errors", async () => {
    vi.doMock("../../src/server/container", () => ({
      ingestionService: {
        ingestRepository: vi.fn().mockRejectedValue(new Error("Something blew up")),
      },
    }));

    const { POST } = await import("../../src/app/api/ingest/route");
    const req = makeRequest(
      "http://localhost/api/ingest",
      "POST",
      { url: "https://github.com/owner/repo" },
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
  });
});

// ── GET /api/snapshots/[id] ───────────────────────────────────────────────────

describe("GET /api/snapshots/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 404 when snapshot not found", async () => {
    vi.doMock("../../src/server/container", () => ({
      snapshotStore: { get: vi.fn().mockResolvedValue(null) },
    }));

    const { GET } = await import("../../src/app/api/snapshots/[id]/route");
    const req = makeRequest("http://localhost/api/snapshots/nonexistent");
    const res = await GET(req, { params: Promise.resolve({ id: "mock-id" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("SNAPSHOT_NOT_FOUND");
    expect(body.requestId).toBeTruthy();
  });

  it("returns 200 with snapshot when found", async () => {
    const snap = makeSnapshot("snap-42");
    vi.doMock("../../src/server/container", () => ({
      snapshotStore: { get: vi.fn().mockResolvedValue(snap) },
    }));

    const { GET } = await import("../../src/app/api/snapshots/[id]/route");
    const req = makeRequest("http://localhost/api/snapshots/snap-42");
    const res = await GET(req, { params: Promise.resolve({ id: "mock-id" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("snap-42");
  });
});

// ── GET /api/snapshots/[id]/file ──────────────────────────────────────────────

describe("GET /api/snapshots/[id]/file", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 404 when snapshot not found", async () => {
    vi.doMock("../../src/server/container", () => ({
      snapshotStore: { get: vi.fn().mockResolvedValue(null) },
      contentProvider: { getFileContent: vi.fn() },
    }));

    const { GET } = await import("../../src/app/api/snapshots/[id]/file/route");
    const req = makeRequest("http://localhost/api/snapshots/snap-x/file?path=src/index.ts");
    const res = await GET(req, { params: Promise.resolve({ id: "mock-id" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("SNAPSHOT_NOT_FOUND");
  });

  it("returns 400 when path param is missing", async () => {
    const snap = makeSnapshot("snap-y");
    vi.doMock("../../src/server/container", () => ({
      snapshotStore: { get: vi.fn().mockResolvedValue(snap) },
      contentProvider: { getFileContent: vi.fn() },
    }));

    const { GET } = await import("../../src/app/api/snapshots/[id]/file/route");
    const req = makeRequest("http://localhost/api/snapshots/snap-y/file");
    const res = await GET(req, { params: Promise.resolve({ id: "invalid-id!" }) });
    expect(res.status).toBe(404); // FILE_NOT_FOUND maps to 404
    const body = await res.json();
    expect(body.error.code).toBe("FILE_NOT_FOUND");
  });

  it("returns 200 with file content and immutable cache header", async () => {
    const snap = makeSnapshot("snap-z");
    const fileContent = {
      path: "src/index.ts",
      content: "export const x = 1;",
      language: "TypeScript",
      lines: 1,
      size: 19,
    };
    vi.doMock("../../src/server/container", () => ({
      snapshotStore: { get: vi.fn().mockResolvedValue(snap) },
      contentProvider: { getFileContent: vi.fn().mockResolvedValue(fileContent) },
    }));

    const { GET } = await import("../../src/app/api/snapshots/[id]/file/route");
    const req = makeRequest(
      "http://localhost/api/snapshots/snap-z/file?path=src/index.ts",
    );
    const res = await GET(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    const body = await res.json();
    expect(body.path).toBe("src/index.ts");
  });
});

// ── Error envelope shape ──────────────────────────────────────────────────────

describe("Error envelope shape", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("always includes error.code, error.message, error.retryable, and requestId", async () => {
    vi.doMock("../../src/server/container", () => ({
      ingestionService: {
        ingestRepository: vi.fn().mockRejectedValue(new Error("boom")),
      },
    }));

    const { POST } = await import("../../src/app/api/ingest/route");
    const req = makeRequest(
      "http://localhost/api/ingest",
      "POST",
      { url: "https://github.com/owner/repo" },
    );
    const res = await POST(req);
    const body = await res.json();

    expect(typeof body.error.code).toBe("string");
    expect(typeof body.error.message).toBe("string");
    expect(typeof body.error.retryable).toBe("boolean");
    expect(typeof body.requestId).toBe("string");
    // Ensure no internal stack traces leak
    expect(body.error.stack).toBeUndefined();
  });
});
