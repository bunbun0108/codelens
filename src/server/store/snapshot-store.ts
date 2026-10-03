import type { Snapshot } from "../../shared/schemas/index";

/**
 * Stores and retrieves immutable snapshots.
 * Implementations: MemorySnapshotStore (M1), PostgresSnapshotStore (future).
 * Wired only in server/container.ts.
 */
export interface SnapshotStore {
  get(id: string): Promise<Snapshot | null>;
  put(snapshot: Snapshot): Promise<void>;
  has(id: string): Promise<boolean>;
}
