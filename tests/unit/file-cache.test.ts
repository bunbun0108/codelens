import { describe, it, expect, beforeEach } from "vitest";
import { getCachedFile, setCachedFile, clearFileCache, MAX_CACHE_ENTRIES } from "../../src/lib/file-cache";
import type { FileContent } from "../../src/shared/schemas/index";

function makeContent(path: string): FileContent {
  return {
    snapshotId: "snap-1",
    path,
    blobSha: "a".repeat(40),
    size: 10,
    language: "TypeScript",
    lineCount: 1,
    content: "code",
  };
}

describe("file-cache", () => {
  beforeEach(() => {
    clearFileCache();
  });

  it("stores and retrieves cached files", () => {
    const file = makeContent("index.ts");
    setCachedFile("snap-1", "index.ts", file);
    expect(getCachedFile("snap-1", "index.ts")).toEqual(file);
    expect(getCachedFile("snap-1", "other.ts")).toBeUndefined();
  });

  it("evicts oldest entries when reaching MAX_CACHE_ENTRIES", () => {
    for (let i = 0; i < MAX_CACHE_ENTRIES; i++) {
      setCachedFile("snap-1", `file-${i}.ts`, makeContent(`file-${i}.ts`));
    }

    // Access file-0 so file-1 becomes the oldest
    getCachedFile("snap-1", "file-0.ts");

    // Add 51st item
    setCachedFile("snap-1", "file-new.ts", makeContent("file-new.ts"));

    // file-1 should be evicted, file-0 preserved
    expect(getCachedFile("snap-1", "file-1.ts")).toBeUndefined();
    expect(getCachedFile("snap-1", "file-0.ts")).toBeDefined();
    expect(getCachedFile("snap-1", "file-new.ts")).toBeDefined();
  });
});
