import { z } from "zod";

// ── Exclusion reasons ─────────────────────────────────────────────────────────

export const ExclusionReasonSchema = z.enum([
  "ignored_directory",
  "ignored_filename",
  "lockfile",
  "binary_extension",
  "not_allowlisted",
  "too_large",
  "secret_risk",
  "generated_or_minified",
  "symlink",
  "submodule",
]);
export type ExclusionReason = z.infer<typeof ExclusionReasonSchema>;

// ── ParsedGitHubUrl ───────────────────────────────────────────────────────────

export const ParsedGitHubUrlSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  /** Raw segments after /tree/, unresolved because branch names may contain slashes */
  treeSegments: z.array(z.string()),
});
export type ParsedGitHubUrl = z.infer<typeof ParsedGitHubUrlSchema>;

// ── RepoInfo ──────────────────────────────────────────────────────────────────

export const RepoInfoSchema = z.object({
  githubRepoId: z.number(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  htmlUrl: z.string(),
  defaultBranch: z.string(),
  description: z.string().nullable(),
  archived: z.boolean(),
  license: z.string().nullable(),
});
export type RepoInfo = z.infer<typeof RepoInfoSchema>;

// ── SnapshotSource ────────────────────────────────────────────────────────────

export const RefKindSchema = z.enum(["default", "branch", "tag", "sha"]);
export type RefKind = z.infer<typeof RefKindSchema>;

export const SnapshotSourceSchema = z.object({
  requestedRef: z.string().nullable(),
  resolvedRefName: z.string(),
  refKind: RefKindSchema,
  /** 40-char lowercase hex commit SHA */
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
  treeSha: z.string().regex(/^[0-9a-f]{40}$/),
  committedAt: z.string().datetime(),
  /** Empty string for root; no leading/trailing slashes */
  subpath: z.string(),
});
export type SnapshotSource = z.infer<typeof SnapshotSourceSchema>;

// ── FileEntry ─────────────────────────────────────────────────────────────────

export const FileKindSchema = z.enum(["source", "config", "docs", "schema", "other"]);
export type FileKind = z.infer<typeof FileKindSchema>;

export const FileEntrySchema = z.object({
  /** Repo-root-relative canonical path */
  path: z.string(),
  name: z.string(),
  blobSha: z.string(),
  size: z.number(),
  language: z.string().nullable(),
  kind: FileKindSchema,
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

// ── IngestStats ───────────────────────────────────────────────────────────────

export const IngestStatsSchema = z.object({
  entriesScanned: z.number(),
  filesIncluded: z.number(),
  bytesIncluded: z.number(),
  excludedByReason: z.record(ExclusionReasonSchema, z.number()),
  usedTruncationFallback: z.boolean(),
});
export type IngestStats = z.infer<typeof IngestStatsSchema>;

// ── Snapshot ──────────────────────────────────────────────────────────────────

export const SnapshotSchema = z.object({
  id: z.string(),
  schemaVersion: z.literal(1),
  repo: RepoInfoSchema,
  source: SnapshotSourceSchema,
  filterConfigVersion: z.string(),
  stats: IngestStatsSchema,
  /** Flat list, sorted by path */
  files: z.array(FileEntrySchema),
  createdAt: z.string().datetime(),
  cacheHit: z.boolean(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

// ── FileContent ───────────────────────────────────────────────────────────────

export const FileContentSchema = z.object({
  snapshotId: z.string(),
  path: z.string(),
  blobSha: z.string(),
  size: z.number(),
  language: z.string().nullable(),
  lineCount: z.number(),
  content: z.string(),
});
export type FileContent = z.infer<typeof FileContentSchema>;

// ── Tree node (client-side, derived by buildTree) ─────────────────────────────

export interface TreeDirectory {
  kind: "directory";
  name: string;
  path: string;
  children: TreeNode[];
}

export interface TreeFile {
  kind: "file";
  name: string;
  path: string;
  entry: FileEntry;
}

export type TreeNode = TreeDirectory | TreeFile;

// ── API request/response schemas ──────────────────────────────────────────────

export const IngestRequestSchema = z.object({
  url: z.string(),
});

export const IngestResponseSchema = z.object({
  snapshot: SnapshotSchema,
});

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  requestId: z.string(),
});

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});
