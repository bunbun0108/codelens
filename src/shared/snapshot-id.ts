import { createHash } from "crypto";

/**
 * Computes a deterministic snapshot ID.
 *
 * Formula: first 16 hex chars of sha256(lower(owner)/lower(repo)@commitSha:subpath:filterConfigVersion)
 */
export function computeSnapshotId(
  owner: string,
  repo: string,
  commitSha: string,
  subpath: string,
  filterConfigVersion: string,
): string {
  const input = `${owner.toLowerCase()}/${repo.toLowerCase()}@${commitSha}:${subpath}:${filterConfigVersion}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
