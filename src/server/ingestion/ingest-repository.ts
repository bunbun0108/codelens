import type { GitHubClient } from "../github/client";
import type { SnapshotStore } from "../store/snapshot-store";
import { parseGitHubUrl } from "../../shared/github-url";
import { normalizeSubpath, splitSubpath } from "../../shared/subpath";
import { computeSnapshotId } from "../../shared/snapshot-id";
import { filterEntry } from "../../shared/filter-engine";
import { DEFAULT_FILTER_CONFIG } from "../../shared/config/filter.default";
import { detectLanguage } from "../../shared/languages";
import type { Snapshot, FileEntry, ExclusionReason, IngestStats } from "../../shared/schemas/index";
import { AppError } from "../../shared/types/errors";
import { resolveRef } from "./ref-resolution";
import { resolveSubpathTreeSha, fetchFullTree } from "./tree-walk";

// Single-flight deduplication map: candidateSnapshotId -> Promise<Snapshot>
const ingestInFlight = new Map<string, Promise<Snapshot>>();

export class IngestionService {
  constructor(
    private readonly githubClient: GitHubClient,
    private readonly snapshotStore: SnapshotStore,
  ) {}

  async ingestRepository(url: string): Promise<Snapshot> {
    // 1. Parse URL (pure, no network)
    const parsedUrl = parseGitHubUrl(url);
    const { owner, repo, treeSegments } = parsedUrl;

    // We do a pre-flight repo check to get canonical names and default branch
    // This allows us to resolve the ref if none was provided in the URL
    const repoInfo = await this.githubClient.getRepo(owner, repo);

    // If no ref was provided, use the default branch
    const effectiveTreeSegments = treeSegments.length > 0 ? treeSegments : [repoInfo.defaultBranch];

    // 2. Resolve Ref (network)
    const resolved = await resolveRef(this.githubClient, repoInfo.owner, repoInfo.name, effectiveTreeSegments);
    const { commitSha, treeSha: rootTreeSha, resolvedRefName, subpathSegments, committedAt } = resolved;

    // Determine RefKind
    let refKind: "default" | "branch" | "tag" | "sha" = "branch";
    if (resolvedRefName === repoInfo.defaultBranch) {
      refKind = "default";
    } else if (/^[0-9a-f]{40}$/i.test(resolvedRefName)) {
      refKind = "sha";
    }
    // (We don't currently distinguish branch vs tag here since the GitHub commits endpoint accepts both interchangeably.
    // If we wanted to, we'd need to hit /git/refs to be sure. Defaulting to branch is fine for the spec.)

    // Normalize subpath
    const subpath = normalizeSubpath(subpathSegments);

    // 3. Compute deterministic Snapshot ID
    const snapshotId = computeSnapshotId(
      repoInfo.owner,
      repoInfo.name,
      commitSha,
      subpath,
      DEFAULT_FILTER_CONFIG.version,
    );

    // 4. Single-flight dedup
    const existingPromise = ingestInFlight.get(snapshotId);
    if (existingPromise) {
      return existingPromise.then((s) => ({ ...s, cacheHit: true }));
    }

    const promise = this.doIngest(snapshotId, repoInfo, commitSha, rootTreeSha, resolvedRefName, refKind, committedAt, subpath)
      .finally(() => ingestInFlight.delete(snapshotId));

    ingestInFlight.set(snapshotId, promise);
    return promise;
  }

  private async doIngest(
    snapshotId: string,
    repoInfo: any, // Typed via RepoInfo in real implementation
    commitSha: string,
    rootTreeSha: string,
    resolvedRefName: string,
    refKind: "default" | "branch" | "tag" | "sha",
    committedAt: string,
    subpath: string,
  ): Promise<Snapshot> {
    // 5. Check SnapshotStore (Cache)
    const cached = await this.snapshotStore.get(snapshotId);
    if (cached) {
      return { ...cached, cacheHit: true };
    }

    // 6. Resolve subpath to target tree SHA
    let targetTreeSha = rootTreeSha;
    const splitPath = splitSubpath(subpath);
    if (splitPath.length > 0) {
      targetTreeSha = await resolveSubpathTreeSha(this.githubClient, repoInfo.owner, repoInfo.name, rootTreeSha, splitPath);
    }

    // 7. Fetch Full Tree
    const treeResult = await fetchFullTree(
      this.githubClient,
      repoInfo.owner,
      repoInfo.name,
      targetTreeSha,
      DEFAULT_FILTER_CONFIG,
      subpath // base path for making entries repo-root-relative
    );

    // 8. Apply Filters
    const files: FileEntry[] = [];
    const stats: IngestStats = {
      entriesScanned: treeResult.entries.length,
      filesIncluded: 0,
      bytesIncluded: 0,
      excludedByReason: {} as Record<ExclusionReason, number>,
      usedTruncationFallback: treeResult.usedTruncationFallback,
    };

    // Initialize exclusion counters
    const reasons: ExclusionReason[] = [
      "ignored_directory", "ignored_filename", "lockfile", "binary_extension",
      "not_allowlisted", "too_large", "secret_risk", "generated_or_minified",
      "symlink", "submodule"
    ];
    for (const r of reasons) {
      stats.excludedByReason[r] = 0;
    }

    for (const entry of treeResult.entries) {
      if (!entry.path) continue; // Should have been filtered in tree walk, but just in case
      
      const filterResult = filterEntry(entry as any, DEFAULT_FILTER_CONFIG);
      
      if (!filterResult.included) {
        stats.excludedByReason[filterResult.reason as ExclusionReason]++;
        continue;
      }

      // We only include blobs, which must have a SHA and size
      if (!entry.sha || entry.size === undefined) {
        continue;
      }

      // Check global limits
      if (stats.filesIncluded + 1 > DEFAULT_FILTER_CONFIG.maxIncludedFiles) {
        throw new AppError("REPO_TOO_LARGE", `Repository exceeds maximum file count limit (${DEFAULT_FILTER_CONFIG.maxIncludedFiles}). Try using a subpath.`);
      }
      if (stats.bytesIncluded + entry.size > DEFAULT_FILTER_CONFIG.maxIncludedBytes) {
        throw new AppError("REPO_TOO_LARGE", `Repository exceeds maximum byte limit (${(DEFAULT_FILTER_CONFIG.maxIncludedBytes / 1024 / 1024).toFixed(1)}MB). Try using a subpath.`);
      }

      const name = entry.path.split("/").pop() ?? entry.path;
      
      files.push({
        path: entry.path, // This is repo-root-relative because of the basePath in fetchFullTree
        name,
        blobSha: entry.sha,
        size: entry.size,
        language: detectLanguage(entry.path),
        kind: "source", // simplistic mapping for M1
      });

      stats.filesIncluded++;
      stats.bytesIncluded += entry.size;
    }

    // Sort files by path (flat list)
    files.sort((a, b) => a.path.localeCompare(b.path));

    // 9. Build and Store Snapshot
    const snapshot: Snapshot = {
      id: snapshotId,
      schemaVersion: 1,
      repo: repoInfo,
      source: {
        requestedRef: null, // We didn't keep the exact user input ref string
        resolvedRefName,
        refKind,
        commitSha,
        treeSha: rootTreeSha,
        committedAt,
        subpath,
      },
      filterConfigVersion: DEFAULT_FILTER_CONFIG.version,
      stats,
      files,
      createdAt: new Date().toISOString(),
      cacheHit: false, // For the stored version
    };

    await this.snapshotStore.put(snapshot);

    return { ...snapshot, cacheHit: false };
  }
}
