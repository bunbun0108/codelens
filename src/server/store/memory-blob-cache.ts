import type { BlobCache } from "./blob-cache";

interface BlobEntry {
  bytes: Uint8Array;
  size: number;
}

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * In-memory byte-capped LRU blob cache.
 * Evicts least-recently-used entries when the byte cap is exceeded.
 * Blob SHAs are content-addressed and immutable — entries never expire.
 *
 * Implements the BlobCache contract. Only wired in server/container.ts.
 */
export class MemoryBlobCache implements BlobCache {
  private readonly cache = new Map<string, BlobEntry>();
  private usedBytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  async get(blobSha: string): Promise<Uint8Array | null> {
    const entry = this.cache.get(blobSha);
    if (!entry) return null;

    // Move to end (most recently used)
    this.cache.delete(blobSha);
    this.cache.set(blobSha, entry);

    return entry.bytes;
  }

  async set(blobSha: string, bytes: Uint8Array): Promise<void> {
    // Skip caching if a single blob is larger than the cap
    if (bytes.byteLength > this.maxBytes) return;

    // If already cached, update
    const existing = this.cache.get(blobSha);
    if (existing) {
      this.usedBytes -= existing.size;
      this.cache.delete(blobSha);
    }

    // Evict LRU entries until there's room
    while (this.usedBytes + bytes.byteLength > this.maxBytes && this.cache.size > 0) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      const oldEntry = this.cache.get(oldest);
      this.cache.delete(oldest);
      if (oldEntry) {
        this.usedBytes -= oldEntry.size;
      }
    }

    this.cache.set(blobSha, { bytes, size: bytes.byteLength });
    this.usedBytes += bytes.byteLength;
  }

  /** For testing: current used bytes */
  get currentBytes(): number {
    return this.usedBytes;
  }

  /** For testing: current entry count */
  get size(): number {
    return this.cache.size;
  }
}
