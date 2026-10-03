/**
 * Contract test suite run against BOTH MemorySnapshotStore and MemoryBlobCache.
 * Tests: basic get/put, LRU eviction, TTL expiry (snapshot store only).
 */
import { describe, it, expect, vi } from "vitest";
import { MemorySnapshotStore } from "../../src/server/store/memory-snapshot-store";
import { MemoryBlobCache } from "../../src/server/store/memory-blob-cache";
import type { Snapshot } from "../../src/shared/schemas/index";

// ── Snapshot fixture ──────────────────────────────────────────────────────────

function makeSnapshot(id: string): Snapshot {
  return {
    id,
    schemaVersion: 1,
    repo: {
      githubRepoId: 1,
      owner: "owner",
      name: "repo",
      fullName: "owner/repo",
      htmlUrl: "https://github.com/owner/repo",
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
      entriesScanned: 10,
      filesIncluded: 2,
      bytesIncluded: 200,
      excludedByReason: {
        ignored_directory: 0,
        ignored_filename: 0,
        lockfile: 1,
        binary_extension: 2,
        not_allowlisted: 3,
        too_large: 0,
        secret_risk: 0,
        generated_or_minified: 1,
        symlink: 0,
        submodule: 1,
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
    createdAt: new Date().toISOString(),
    cacheHit: false,
  };
}

// ── SnapshotStore contract ────────────────────────────────────────────────────

describe("MemorySnapshotStore — contract", () => {
  it("returns null for missing id", async () => {
    const store = new MemorySnapshotStore();
    expect(await store.get("nonexistent")).toBeNull();
  });

  it("stores and retrieves a snapshot", async () => {
    const store = new MemorySnapshotStore();
    const snap = makeSnapshot("snap-1");
    await store.put(snap);
    const retrieved = await store.get("snap-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe("snap-1");
  });

  it("has() returns false for missing, true after put", async () => {
    const store = new MemorySnapshotStore();
    expect(await store.has("x")).toBe(false);
    await store.put(makeSnapshot("x"));
    expect(await store.has("x")).toBe(true);
  });

  it("overwrites on duplicate put", async () => {
    const store = new MemorySnapshotStore();
    const a = makeSnapshot("dup");
    const b = { ...makeSnapshot("dup"), filterConfigVersion: "v2" };
    await store.put(a);
    await store.put(b);
    const r = await store.get("dup");
    expect(r!.filterConfigVersion).toBe("v2");
  });

  it("LRU eviction: evicts oldest when at capacity", async () => {
    const store = new MemorySnapshotStore(3); // max 3
    await store.put(makeSnapshot("a"));
    await store.put(makeSnapshot("b"));
    await store.put(makeSnapshot("c"));
    expect(store.size).toBe(3);

    // Access "a" to move it to MRU position
    await store.get("a");

    // Adding "d" should evict "b" (LRU)
    await store.put(makeSnapshot("d"));
    expect(store.size).toBe(3);
    expect(await store.get("b")).toBeNull(); // evicted
    expect(await store.get("a")).not.toBeNull(); // still present (was accessed)
    expect(await store.get("c")).not.toBeNull();
    expect(await store.get("d")).not.toBeNull();
  });

  it("TTL: returns null after expiry", async () => {
    vi.useFakeTimers();
    const store = new MemorySnapshotStore();
    await store.put(makeSnapshot("ttl-snap"));

    // Advance time past 24h TTL
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    expect(await store.get("ttl-snap")).toBeNull();
    vi.useRealTimers();
  });

  it("TTL: returns value before expiry", async () => {
    vi.useFakeTimers();
    const store = new MemorySnapshotStore();
    await store.put(makeSnapshot("alive"));

    vi.advanceTimersByTime(23 * 60 * 60 * 1000); // 23h — still valid
    expect(await store.get("alive")).not.toBeNull();
    vi.useRealTimers();
  });
});

// ── BlobCache contract ────────────────────────────────────────────────────────

function makeBlob(sizeBytes: number): Uint8Array {
  return new Uint8Array(sizeBytes).fill(0x42);
}

describe("MemoryBlobCache — contract", () => {
  it("returns null for missing sha", async () => {
    const cache = new MemoryBlobCache();
    expect(await cache.get("missing")).toBeNull();
  });

  it("stores and retrieves bytes", async () => {
    const cache = new MemoryBlobCache();
    const bytes = makeBlob(10);
    await cache.set("sha1", bytes);
    const retrieved = await cache.get("sha1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.byteLength).toBe(10);
  });

  it("updating an existing sha replaces bytes", async () => {
    const cache = new MemoryBlobCache();
    await cache.set("sha1", makeBlob(10));
    await cache.set("sha1", makeBlob(20));
    const r = await cache.get("sha1");
    expect(r!.byteLength).toBe(20);
    // Byte accounting should reflect the updated size
    expect(cache.currentBytes).toBe(20);
  });

  it("LRU eviction: evicts oldest when byte cap exceeded", async () => {
    const maxBytes = 100;
    const cache = new MemoryBlobCache(maxBytes);

    await cache.set("a", makeBlob(40));
    await cache.set("b", makeBlob(40));
    expect(cache.currentBytes).toBe(80);

    // Access "a" to make it MRU
    await cache.get("a");

    // Adding 40 bytes → total 120 → must evict "b" (LRU) to fit
    await cache.set("c", makeBlob(40));
    expect(await cache.get("b")).toBeNull();
    expect(await cache.get("a")).not.toBeNull();
    expect(await cache.get("c")).not.toBeNull();
    expect(cache.currentBytes).toBeLessThanOrEqual(maxBytes);
  });

  it("skips caching if a single blob exceeds the cap", async () => {
    const cache = new MemoryBlobCache(50);
    await cache.set("huge", makeBlob(51));
    expect(await cache.get("huge")).toBeNull();
    expect(cache.currentBytes).toBe(0);
  });

  it("can evict multiple entries to fit a new one", async () => {
    const cache = new MemoryBlobCache(100);
    await cache.set("a", makeBlob(40));
    await cache.set("b", makeBlob(40));
    // Adding 80 bytes: needs to evict both "a" and "b"
    await cache.set("c", makeBlob(80));
    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("b")).toBeNull();
    expect(await cache.get("c")).not.toBeNull();
  });

  it("tracks currentBytes accurately across operations", async () => {
    const cache = new MemoryBlobCache();
    await cache.set("x", makeBlob(200));
    expect(cache.currentBytes).toBe(200);
    await cache.set("y", makeBlob(300));
    expect(cache.currentBytes).toBe(500);
    // Update x with smaller blob
    await cache.set("x", makeBlob(50));
    expect(cache.currentBytes).toBe(350);
  });
});
