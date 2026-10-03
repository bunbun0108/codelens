import { env } from "./config/env";
import { OctokitGitHubClient } from "./github/octokit-client";
import { MemorySnapshotStore } from "./store/memory-snapshot-store";
import { MemoryBlobCache } from "./store/memory-blob-cache";
import { IngestionService } from "./ingestion/ingest-repository";
import { M1ContentProvider } from "./ingestion/content-provider";

/**
 * Composition Root (M1)
 *
 * This is the ONLY file that instantiates concrete implementations.
 * To swap stores later (e.g., to Postgres/Redis), change the instantiations here.
 */

// 1. Core clients
const githubClient = new OctokitGitHubClient(env.GITHUB_TOKEN);

// 2. Stores (Singletons per process)
// Note: Documented single-instance constraint in ARCHITECTURE.md
const snapshotStore = new MemorySnapshotStore(env.SNAPSHOT_STORE_MAX);
const blobCache = new MemoryBlobCache(env.BLOB_CACHE_MAX_MB * 1024 * 1024);

// 3. Services
export const ingestionService = new IngestionService(githubClient, snapshotStore);
export const contentProvider = new M1ContentProvider(githubClient, blobCache);

// Expose stores for route handlers (e.g., fetching a snapshot by ID)
export { snapshotStore };
