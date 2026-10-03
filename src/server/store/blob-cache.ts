/**
 * Caches raw blob bytes by their SHA.
 * Blobs are content-addressed and immutable, so entries never expire — only evicted by byte cap.
 * Implementations: MemoryBlobCache (M1), RedisBlobCache (future).
 * Wired only in server/container.ts.
 */
export interface BlobCache {
  get(blobSha: string): Promise<Uint8Array | null>;
  set(blobSha: string, bytes: Uint8Array): Promise<void>;
}
