import { describe, it, expect, vi } from "vitest";
import { M1ContentProvider } from "../../src/server/ingestion/content-provider";
import type { GitHubClient } from "../../src/server/github/client";
import type { BlobCache } from "../../src/server/store/blob-cache";
import type { Snapshot } from "../../src/shared/schemas/index";
import { MAX_FILE_BYTES } from "../../src/shared/config/filter.default";
import { AppError } from "../../src/shared/types/errors";

function makeSnapshot(files: Snapshot["files"] = []): Snapshot {
  return {
    id: "test-snap",
    schemaVersion: 1,
    repo: {
      githubRepoId: 123,
      owner: "test-owner",
      name: "test-repo",
      fullName: "test-owner/test-repo",
      htmlUrl: "https://github.com/test-owner/test-repo",
      defaultBranch: "main",
      description: null,
      archived: false,
      license: null,
    },
    source: {
      requestedRef: null,
      resolvedRefName: "main",
      refKind: "default",
      commitSha: "a".repeat(40),
      treeSha: "b".repeat(40),
      committedAt: new Date().toISOString(),
      subpath: "",
    },
    filterConfigVersion: "v1",
    stats: {
      entriesScanned: 1,
      filesIncluded: files.length,
      bytesIncluded: files.reduce((acc, f) => acc + f.size, 0),
      excludedByReason: {
        ignored_directory: 0,
        ignored_filename: 0,
        lockfile: 0,
        binary_extension: 0,
        not_allowlisted: 0,
        too_large: 0,
        secret_risk: 0,
        generated_or_minified: 0,
        symlink: 0,
        submodule: 0,
      },
      usedTruncationFallback: false,
    },
    files,
    createdAt: new Date().toISOString(),
    cacheHit: false,
  };
}

describe("M1ContentProvider", () => {
  const mockGithubClient: GitHubClient = {
    getRepo: vi.fn(),
    getCommit: vi.fn(),
    getTree: vi.fn(),
    getBlob: vi.fn(),
  };

  const mockBlobCache: BlobCache = {
    get: vi.fn(),
    set: vi.fn(),
  };

  it("throws FILE_NOT_FOUND when path is not in snapshot", async () => {
    const provider = new M1ContentProvider(mockGithubClient, mockBlobCache);
    const snapshot = makeSnapshot([]);

    await expect(provider.getFileContent(snapshot, "nonexistent.ts")).rejects.toThrow(
      new AppError("FILE_NOT_FOUND", 'File "nonexistent.ts" not found in this snapshot.', false),
    );
  });

  it("throws FILE_TOO_LARGE before fetching when entry.size exceeds MAX_FILE_BYTES", async () => {
    const provider = new M1ContentProvider(mockGithubClient, mockBlobCache);
    const snapshot = makeSnapshot([
      {
        path: "huge.ts",
        name: "huge.ts",
        blobSha: "c".repeat(40),
        size: MAX_FILE_BYTES + 1,
        language: "TypeScript",
        kind: "source",
      },
    ]);

    await expect(provider.getFileContent(snapshot, "huge.ts")).rejects.toThrow(
      new AppError("FILE_TOO_LARGE", 'File "huge.ts" exceeds maximum file size limit.', false),
    );
    expect(mockBlobCache.get).not.toHaveBeenCalled();
    expect(mockGithubClient.getBlob).not.toHaveBeenCalled();
  });

  it("throws FILE_TOO_LARGE when downloaded blob bytes exceed MAX_FILE_BYTES", async () => {
    const provider = new M1ContentProvider(mockGithubClient, mockBlobCache);
    const snapshot = makeSnapshot([
      {
        path: "spoofed.ts",
        name: "spoofed.ts",
        blobSha: "d".repeat(40),
        size: 100, // Manifest claimed 100 bytes
        language: "TypeScript",
        kind: "source",
      },
    ]);

    vi.mocked(mockBlobCache.get).mockResolvedValueOnce(null);
    vi.mocked(mockGithubClient.getBlob).mockResolvedValueOnce(new Uint8Array(MAX_FILE_BYTES + 10));

    await expect(provider.getFileContent(snapshot, "spoofed.ts")).rejects.toThrow(
      new AppError("FILE_TOO_LARGE", 'File "spoofed.ts" exceeds maximum file size limit.', false),
    );
  });

  it("throws FILE_NOT_TEXT when blob contains a NUL byte within the first 8 KB", async () => {
    const provider = new M1ContentProvider(mockGithubClient, mockBlobCache);
    const snapshot = makeSnapshot([
      {
        path: "binary.bin",
        name: "binary.bin",
        blobSha: "e".repeat(40),
        size: 10,
        language: null,
        kind: "other",
      },
    ]);

    const binaryData = new Uint8Array([0x68, 0x65, 0x6c, 0x00, 0x6f]); // 'hel\0o'
    vi.mocked(mockBlobCache.get).mockResolvedValueOnce(binaryData);

    await expect(provider.getFileContent(snapshot, "binary.bin")).rejects.toThrow(
      new AppError("FILE_NOT_TEXT", "File appears to be binary (contains NUL bytes)."),
    );
  });

  it("throws FILE_NOT_TEXT when blob contains invalid UTF-8 sequences", async () => {
    const provider = new M1ContentProvider(mockGithubClient, mockBlobCache);
    const snapshot = makeSnapshot([
      {
        path: "invalid-utf8.txt",
        name: "invalid-utf8.txt",
        blobSha: "f".repeat(40),
        size: 4,
        language: "Text",
        kind: "docs",
      },
    ]);

    // Invalid UTF-8 sequence without NUL byte
    const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0xff, 0xfa]);
    vi.mocked(mockBlobCache.get).mockResolvedValueOnce(invalidUtf8);

    await expect(provider.getFileContent(snapshot, "invalid-utf8.txt")).rejects.toThrow(
      new AppError("FILE_NOT_TEXT", "File is not valid UTF-8 text."),
    );
  });

  it("successfully returns FileContent and uses cache", async () => {
    const provider = new M1ContentProvider(mockGithubClient, mockBlobCache);
    const snapshot = makeSnapshot([
      {
        path: "src/valid.ts",
        name: "valid.ts",
        blobSha: "1".repeat(40),
        size: 18,
        language: "TypeScript",
        kind: "source",
      },
    ]);

    const code = "console.log('hi');\n";
    const utf8Bytes = new TextEncoder().encode(code);
    vi.mocked(mockBlobCache.get).mockResolvedValueOnce(utf8Bytes);

    const result = await provider.getFileContent(snapshot, "src/valid.ts");
    expect(result).toEqual({
      snapshotId: "test-snap",
      path: "src/valid.ts",
      blobSha: "1".repeat(40),
      size: utf8Bytes.byteLength,
      language: "TypeScript",
      lineCount: 1,
      content: code,
    });
  });
});
