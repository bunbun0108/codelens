import type { SnapshotStore } from "./snapshot-store";
import type { Snapshot } from "../../shared/schemas/index";

interface LRUEntry {
  snapshot: Snapshot;
  createdAt: number;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * In-memory LRU snapshot store.
 * Max capacity: configurable (default 50).
 * TTL: 24 hours per snapshot.
 *
 * Implements the SnapshotStore contract. Only wired in server/container.ts.
 */
export class MemorySnapshotStore implements SnapshotStore {
  /** Insertion-order map acts as the LRU tracker (most recently put/accessed = most recent) */
  private readonly cache = new Map<string, LRUEntry>();
  private readonly max: number;

  constructor(max = 50) {
    this.max = max;
  }

  async get(id: string): Promise<Snapshot | null> {
    const entry = this.cache.get(id);
    if (!entry) return null;

    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(id);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(id);
    this.cache.set(id, entry);

    return entry.snapshot;
  }

  async put(snapshot: Snapshot): Promise<void> {
    // Remove existing entry to re-insert at end
    this.cache.delete(snapshot.id);

    // Evict oldest if at capacity
    if (this.cache.size >= this.max) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    const now = Date.now();
    this.cache.set(snapshot.id, {
      snapshot,
      createdAt: now,
      expiresAt: now + TTL_MS,
    });
  }

  async has(id: string): Promise<boolean> {
    const snapshot = await this.get(id);
    return snapshot !== null;
  }

  /** For testing: returns current cache size */
  get size(): number {
    return this.cache.size;
  }
}
